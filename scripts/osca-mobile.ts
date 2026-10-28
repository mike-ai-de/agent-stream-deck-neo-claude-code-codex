import {createMobileServer} from "../src/osca/mobile.js";
const port=Number(process.env.OSCA_MOBILE_PORT||9464);const upstream=process.env.OSCA_NEO_URL||"http://127.0.0.1:9463";
const server=createMobileServer({port,upstream});
server.listen(port,"127.0.0.1",()=>console.log(`OSCA Neo mobile: http://127.0.0.1:${port} (read-only, upstream ${upstream})`));
for(const sig of ["SIGTERM","SIGINT"] as const)process.on(sig,()=>server.close(()=>process.exit(0)));
