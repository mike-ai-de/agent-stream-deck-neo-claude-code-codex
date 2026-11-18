import { describe,it,expect } from "vitest";
import { History,measurements } from "../src/osca/history.js";
import { OscaDashboard } from "../src/osca/dashboard.js";
import { defaults } from "../src/osca/config.js";
import { reading } from "../src/osca/model.js";
import { createMobileServer } from "../src/osca/mobile.js";

describe("Neo history",()=>{
 it("keeps tile histories separate and does not invent unavailable values",()=>{
  const h=new History(":memory:"),s=new OscaDashboard(defaults).snapshot();
  s.cpu=reading(42,"test");
  expect(measurements(s,"gpu")).toEqual([]);
  h.record({snapshot:s},Date.now());
  expect((h.list("cpu",0)[0].points as any[])[0].value).toBe(42);
  h.remove("cpu");
  expect(h.list("cpu",0)).toHaveLength(0);
  expect(h.list("gpu",0)).toHaveLength(1);
  h.close();
 });
 it("deletes tile history older than the retention period",()=>{
  const h=new History(":memory:",30),s=new OscaDashboard(defaults).snapshot();s.cpu=reading(1,"test");const now=Date.now();
  h.record({snapshot:s},now-32*86400e3);h.record({snapshot:s},now-86400e3);expect(h.prune(now)).toBe(0);
  expect(h.list("cpu",0)).toHaveLength(1);h.close();
 });
 it("rejects cross-origin and unauthenticated deletion",async()=>{
  const h=new History(":memory:"),s=new OscaDashboard(defaults).snapshot();h.record({snapshot:s},Date.now());
  const options={port:0,upstream:"http://127.0.0.1:9463",history:h};const server=createMobileServer(options,async()=>({snapshot:s}));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
   const port=(server.address() as {port:number}).port,url=`http://127.0.0.1:${port}`;options.port=port;
   const bad=await fetch(url+"/api/history/cpu",{method:"DELETE",headers:{host:"127.0.0.1:9464",origin:"https://evil.example"}});
   expect(bad.status).toBe(403);expect(h.list("cpu",0)).toHaveLength(1);
   const response=await fetch(url);expect(response.status).toBe(200);const page=await response.text();
   const token=/deleteToken="([a-f0-9]+)"/.exec(page)?.[1];expect(token).toBeTruthy();
   const good=await fetch(url+"/api/history/cpu",{method:"DELETE",headers:{origin:url,"x-osca-token":token!}});
   expect(good.status).toBe(200);expect(h.list("cpu",0)).toHaveLength(0);expect(h.list("gpu",0)).toHaveLength(1);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));h.close();}
 });
});
