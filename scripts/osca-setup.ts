import fs from "node:fs/promises";import path from "node:path";import {home,defaults,load} from "../src/osca/config.js";
const file=path.join(home,"config.json");await fs.mkdir(home,{recursive:true,mode:0o700});
try{const handle=await fs.open(file,"wx",0o600);try{await handle.writeFile(JSON.stringify(defaults,null,2)+"\n");}finally{await handle.close();}console.log(`Created OSCA three-page configuration: ${file}`);}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;load();console.log("Existing OSCA configuration verified; not overwritten.");}
