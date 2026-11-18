// osca-sensors: read-only fast system sampler for the OSCA cockpit.
// Prints one JSON object per line on stdout (default every 250 ms):
//   CPU load overall and per core, GPU device utilization, die temperatures,
//   macOS thermal state, swap usage and memory pressure level.
// Needs no administrator rights. It never writes anything except stdout.
import Foundation
import IOKit

let intervalMs = max(100, Int(CommandLine.arguments.dropFirst().first ?? "250") ?? 250)
let tempEvery = max(1, 1000 / intervalMs) // temperatures roughly once per second

// MARK: CPU (per-core tick deltas)
var previousTicks: [[UInt32]] = []
func sampleCpu() -> (total: Double, cores: [Double])? {
  var count: natural_t = 0
  var info: processor_info_array_t?
  var infoCount: mach_msg_type_number_t = 0
  guard host_processor_info(mach_host_self(), PROCESSOR_CPU_LOAD_INFO, &count, &info, &infoCount) == KERN_SUCCESS, let info else { return nil }
  defer { vm_deallocate(mach_task_self_, vm_address_t(bitPattern: info), vm_size_t(Int(infoCount) * MemoryLayout<integer_t>.stride)) }
  var ticks: [[UInt32]] = []
  for i in 0..<Int(count) {
    let base = Int(CPU_STATE_MAX) * i
    ticks.append((0..<Int(CPU_STATE_MAX)).map { UInt32(bitPattern: info[base + $0]) })
  }
  defer { previousTicks = ticks }
  guard previousTicks.count == ticks.count else { return nil }
  var cores: [Double] = []
  var busyAll = 0.0, totalAll = 0.0
  for (now, before) in zip(ticks, previousTicks) {
    let d = (0..<Int(CPU_STATE_MAX)).map { Double(now[$0] &- before[$0]) }
    let total = d.reduce(0, +)
    let idle = d[Int(CPU_STATE_IDLE)]
    cores.append(total > 0 ? (total - idle) / total * 100 : 0)
    busyAll += total - idle; totalAll += total
  }
  return (totalAll > 0 ? busyAll / totalAll * 100 : 0, cores)
}

// MARK: GPU (IOAccelerator PerformanceStatistics)
func sampleGpu() -> Double? {
  var iterator: io_iterator_t = 0
  guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOAccelerator"), &iterator) == KERN_SUCCESS else { return nil }
  defer { IOObjectRelease(iterator) }
  var best: Double?
  while case let entry = IOIteratorNext(iterator), entry != 0 {
    defer { IOObjectRelease(entry) }
    if let stats = IORegistryEntryCreateCFProperty(entry, "PerformanceStatistics" as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue() as? [String: Any],
       let v = (stats["Device Utilization %"] as? NSNumber)?.doubleValue, v >= 0, v <= 100 {
      best = max(best ?? 0, v)
    }
  }
  return best
}

// MARK: Temperatures (IOHIDEventSystem, same source as common menu bar tools)
typealias CreateFn = @convention(c) (CFAllocator?) -> Unmanaged<AnyObject>?
typealias SetMatchFn = @convention(c) (AnyObject, CFDictionary) -> Int32
typealias CopyServicesFn = @convention(c) (AnyObject) -> Unmanaged<CFArray>?
typealias CopyEventFn = @convention(c) (AnyObject, Int64, Int32, Int64) -> Unmanaged<AnyObject>?
typealias FloatFn = @convention(c) (AnyObject, Int32) -> Double
typealias PropertyFn = @convention(c) (AnyObject, CFString) -> Unmanaged<AnyObject>?
let iokit = dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", RTLD_NOW)
func symbol<T>(_ name: String) -> T? { guard let iokit, let p = dlsym(iokit, name) else { return nil }; return unsafeBitCast(p, to: T.self) }
let hidCreate: CreateFn? = symbol("IOHIDEventSystemClientCreate")
let hidMatch: SetMatchFn? = symbol("IOHIDEventSystemClientSetMatching")
let hidServices: CopyServicesFn? = symbol("IOHIDEventSystemClientCopyServices")
let hidEvent: CopyEventFn? = symbol("IOHIDServiceClientCopyEvent")
let hidFloat: FloatFn? = symbol("IOHIDEventGetFloatValue")
let hidProperty: PropertyFn? = symbol("IOHIDServiceClientCopyProperty")
let temperatureEvent: Int64 = 15
var hidClient: AnyObject?
var hidSensors: [(name: String, service: AnyObject)] = []
func setupTemperatures() {
  guard let hidCreate, let hidMatch, let hidServices, let hidProperty, let client = hidCreate(kCFAllocatorDefault)?.takeRetainedValue() else { return }
  _ = hidMatch(client, ["PrimaryUsagePage": 0xff00, "PrimaryUsage": 5] as CFDictionary)
  hidClient = client
  let services = (hidServices(client)?.takeRetainedValue() as? [AnyObject]) ?? []
  hidSensors = services.map { ((hidProperty($0, "Product" as CFString)?.takeRetainedValue() as? String) ?? "", $0) }
}
func sampleTemperatures() -> [String: Any]? {
  guard let hidEvent, let hidFloat, !hidSensors.isEmpty else { return nil }
  var die: [Double] = [], all: [Double] = []
  for sensor in hidSensors {
    guard let event = hidEvent(sensor.service, temperatureEvent, 0, 0)?.takeRetainedValue() else { continue }
    let value = hidFloat(event, Int32(temperatureEvent << 16))
    guard value > 0, value < 150 else { continue } // drop sentinel values such as -9201
    all.append(value)
    if sensor.name.hasPrefix("PMU tdie") { die.append(value) }
  }
  guard !all.isEmpty else { return nil }
  let chip = die.isEmpty ? all : die
  return ["max": round1(chip.max()!), "avg": round1(chip.reduce(0, +) / Double(chip.count)), "hottest": round1(all.max()!), "sensors": all.count]
}

// MARK: Memory
func swapBytes() -> Double? {
  var usage = xsw_usage(); var size = MemoryLayout<xsw_usage>.size
  return sysctlbyname("vm.swapusage", &usage, &size, nil, 0) == 0 ? Double(usage.xsu_used) : nil
}
func pressureLevel() -> Int? {
  var level: Int32 = 0; var size = MemoryLayout<Int32>.size
  return sysctlbyname("kern.memorystatus_vm_pressure_level", &level, &size, nil, 0) == 0 ? Int(level) : nil
}
func thermalState() -> String {
  switch ProcessInfo.processInfo.thermalState {
  case .nominal: return "nominal"
  case .fair: return "fair"
  case .serious: return "serious"
  case .critical: return "critical"
  @unknown default: return "unknown"
  }
}
func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }

// MARK: Loop
setupTemperatures()
setvbuf(stdout, nil, _IOLBF, 0)
signal(SIGPIPE, SIG_IGN)
_ = sampleCpu()
var tick = 0
var lastTemps: [String: Any]?
while true {
  usleep(useconds_t(intervalMs * 1000))
  if tick % tempEvery == 0 { lastTemps = sampleTemperatures() }
  tick += 1
  var frame: [String: Any] = ["t": Int(Date().timeIntervalSince1970 * 1000), "thermal": thermalState()]
  if let cpu = sampleCpu() { frame["cpu"] = round1(cpu.total); frame["cores"] = cpu.cores.map(round1) }
  if let gpu = sampleGpu() { frame["gpu"] = gpu }
  if let lastTemps { frame["temp"] = lastTemps }
  if let s = swapBytes() { frame["swap"] = s }
  if let p = pressureLevel() { frame["pressure"] = p }
  guard let data = try? JSONSerialization.data(withJSONObject: frame), let line = String(data: data, encoding: .utf8) else { continue }
  if fputs(line + "\n", stdout) < 0 { exit(0) } // reader gone
}
