import {createMobileServer} from "../src/osca/mobile.js";
import {History} from "../src/osca/history.js";
import {fetchJson} from "../src/osca/io.js";
const port=Number(process.env.OSCA_MOBILE_PORT||9464);const upstream=process.env.OSCA_NEO_URL||"http://127.0.0.1:9463";
const history=new History(process.env.OSCA_NEO_HISTORY_DB||"/Volumes/OSCA-DATA/Projects/OSCA/Neo/data/history.sqlite");
let collecting=false;
async function collect(){if(collecting)return;collecting=true;try{history.record(await fetchJson(`${upstream}/api/status`,3000,4*1024*1024));}catch(e){console.warn("Historie: Messung nicht verfügbar",e instanceof Error?e.message:"unknown");}finally{collecting=false;}}
void collect();const historyTimer=setInterval(()=>void collect(),60000);
const server=createMobileServer({port,upstream,history});
server.listen(port,"127.0.0.1",()=>console.log(`OSCA Neo mobile: http://127.0.0.1:${port} (read-only, upstream ${upstream})`));
for(const sig of ["SIGTERM","SIGINT"] as const)process.on(sig,()=>{clearInterval(historyTimer);server.close(()=>{history.close();process.exit(0);});});
