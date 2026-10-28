import {describe,it,expect,vi,afterEach} from "vitest";import fs from "node:fs/promises";
const fake=vi.hoisted(()=>({dir:`/tmp/osca-neo-hid-${process.pid}`,handlers:{} as Record<string,(arg:any)=>void>,writes:[] as Array<{key:number;size:number}>,closed:0}));
vi.mock("@elgato-stream-deck/node",()=>({DeviceModelId:{NEO:"neo"},listStreamDecks:async()=>[{model:"neo",path:"fake-hid"}],openStreamDeck:async()=>({on:(event:string,cb:(v:any)=>void)=>{fake.handlers[event]=cb;},setBrightness:async()=>{},fillKeyColor:async()=>{},fillKeyBuffer:async(key:number,b:Buffer)=>{fake.writes.push({key,size:b.length});},fillLcd:async(_n:number,b:Buffer)=>{fake.writes.push({key:8,size:b.length});},close:async()=>{fake.closed++;}})}));
vi.mock("../src/osca/config.js",async importOriginal=>{const m=await importOriginal<typeof import("../src/osca/config.js")>();return {...m,home:fake.dir,load:()=>({config:{...m.defaults,port:0},file:"test-config",hash:"test-config-hash"})};});
import {OscaNeo} from "../src/osca/app.js";import {OscaDashboard} from "../src/osca/dashboard.js";import {Actions} from "../src/osca/actions.js";
let app:OscaNeo|undefined;
afterEach(async()=>{await app?.stop();app=undefined;vi.restoreAllMocks();await fs.rm(fake.dir,{recursive:true,force:true});fake.writes=[];fake.handlers={};});
describe("integrated Neo HID page controller",()=>{
 it("writes every key and LCD for all three pages, wraps both ways and dispatches visible-page actions",async()=>{
  vi.spyOn(OscaDashboard.prototype,"tick").mockImplementation(function(this:OscaDashboard){return this.snapshot();});const perform=vi.spyOn(Actions.prototype,"perform").mockResolvedValue();
  app=new OscaNeo();vi.spyOn(app as any,"startServers").mockResolvedValue(undefined);await app.start();const hashes=[app.status().hardware.keyAndLcdHashes];expect(app.status().hardware.visiblePage).toBe(0);expect(fake.writes.slice(-9).map(x=>x.key)).toEqual([0,1,2,3,4,5,6,7,8]);
  await app.press(9);expect(app.status().hardware.visiblePage).toBe(1);hashes.push(app.status().hardware.keyAndLcdHashes);await app.press(0);expect(perform).toHaveBeenLastCalledWith(expect.objectContaining({type:"open",target:"http://127.0.0.1:0/#cpu"}),expect.anything());
  await app.press(9);expect(app.status().hardware.visiblePage).toBe(2);hashes.push(app.status().hardware.keyAndLcdHashes);await app.press(5);expect(perform).toHaveBeenLastCalledWith({type:"stop"},expect.anything());
  await app.press(9);expect(app.status().hardware.visiblePage).toBe(0);await app.press(8);expect(app.status().hardware.visiblePage).toBe(2);await app.press(8);expect(app.status().hardware.visiblePage).toBe(1);await app.press(8);expect(app.status().hardware.visiblePage).toBe(0);
  expect(new Set(hashes.map(x=>x.join())).size).toBe(3);expect(fake.writes.every(w=>w.size===(w.key===8?248*58:96*96)*4)).toBe(true);
 });
 it("actual down/up wiring prevents holding one key from confirming twice",async()=>{
  vi.spyOn(OscaDashboard.prototype,"tick").mockImplementation(function(this:OscaDashboard){return this.snapshot();});app=new OscaNeo();vi.spyOn(app as any,"startServers").mockResolvedValue(undefined);await app.start();const press=vi.spyOn(app,"press").mockResolvedValue();
  fake.handlers.down({index:5});fake.handlers.down({index:5});expect(press).toHaveBeenCalledTimes(1);fake.handlers.up({index:5});fake.handlers.down({index:5});expect(press).toHaveBeenCalledTimes(2);
 });
});
