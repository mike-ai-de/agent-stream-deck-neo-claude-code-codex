// Builds the native read-only sampler used by the cockpit (macOS only). Other platforms skip it.
import {execFileSync} from "node:child_process";import {mkdirSync} from "node:fs";
if(process.platform!=="darwin"){console.log("osca-sensors: skipped (macOS only)");process.exit(0);}
mkdirSync("dist/bin",{recursive:true});
execFileSync("xcrun",["swiftc","-O","native/osca-sensors.swift","-o","dist/bin/osca-sensors"],{stdio:"inherit"});
console.log("osca-sensors: dist/bin/osca-sensors");
