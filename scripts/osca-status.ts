import {fetchJson} from "../src/osca/io.js";
try{const d=await fetchJson("http://127.0.0.1:9463/api/status",2000);console.log(JSON.stringify(d,null,2));}catch{console.error("OSCA Neo status UNAVAILABLE. This command does not start a competing HID process.");process.exitCode=1;}
