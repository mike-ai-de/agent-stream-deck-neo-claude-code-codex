import os from "node:os";import path from "node:path";import fs from "node:fs";import { createHash } from "node:crypto";
import { HERMES_ROOT,PAGES,PAGE_NAMES } from "./model.js";
export interface Config {schema:3;brightness:number;port:number;hermesRoot:string;hermesDashboard:string;ollamaUrl:string;codexExecutable:string;claudeExecutable:string;pages:string[][];pageNames:string[]}
export const home=process.env.NEO_AGENT_DECK_HOME||path.join(os.homedir(),".neo-agent-deck");
export const defaults:Config={schema:3,brightness:70,port:9463,hermesRoot:HERMES_ROOT,hermesDashboard:"http://127.0.0.1:9119",ollamaUrl:"http://127.0.0.1:11434",codexExecutable:"/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",claudeExecutable:path.join(os.homedir(),".local/bin/claude"),pages:PAGES.map(x=>[...x]),pageNames:[...PAGE_NAMES]};
export function load():{config:Config;hash:string;file:string}{
  const file=path.join(home,"config.json");const raw=fs.readFileSync(file,"utf8");const d=JSON.parse(raw) as Config;
  if(d.schema!==3||JSON.stringify(d.pages)!==JSON.stringify(defaults.pages)||JSON.stringify(d.pageNames)!==JSON.stringify(defaults.pageNames))throw new Error("OSCA config requires all three approved 8-key pages");
  if(d.hermesRoot!==HERMES_ROOT)throw new Error("Unexpected Hermes installation");
  for(const url of [d.hermesDashboard,d.ollamaUrl]){const u=new URL(url);if(u.protocol!=="http:"||u.hostname!=="127.0.0.1"||u.username||u.password)throw new Error("Only credential-free loopback endpoints allowed");}
  if(!Number.isInteger(d.port)||d.port<1024||d.port>65535)throw new Error("Invalid local port");if(!Number.isFinite(d.brightness)||d.brightness<0||d.brightness>100)throw new Error("Invalid brightness");
  return {config:d,hash:createHash("sha256").update(raw).digest("hex"),file};
}
