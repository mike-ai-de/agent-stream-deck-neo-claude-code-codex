import { describe,it,expect } from "vitest";
import vm from "node:vm";
import { cockpitHtml } from "../src/osca/cockpit-page.js";
import { cockpitFrame } from "../src/osca/cockpit.js";

// Runs the real cockpit client script against a minimal fake DOM: catches runtime errors and name collisions
// (e.g. a variable overwriting a function) that type checks cannot see.
function fakeDom(){
 const elements=new Map<string,any>();const handlers:Record<string,()=>void>={};
 const ctx2d:any=new Proxy(function(){},{get:(_t,k)=>k==="getImageData"?()=>({data:[]}):k==="measureText"?()=>({width:10}):k==="createLinearGradient"?()=>({addColorStop(){}}):()=>{},set:()=>true});
 const el=(id:string):any=>{if(elements.has(id))return elements.get(id);const e:any={id,textContent:"",innerHTML:"",className:"",hidden:false,style:{},width:0,height:0,offsetWidth:300,offsetHeight:200,firstChild:{style:{}},
  attrs:{} as Record<string,string>,children:[] as any[],
  getAttribute(n:string){return this.attrs[n]??null;},setAttribute(n:string,v:string){this.attrs[n]=v;},appendChild(c:any){this.children.push(c);return c;},
  querySelector(){return el(id+"-child");},querySelectorAll(){return [];},getBoundingClientRect(){return {width:300,height:200,left:0,top:0,right:300,bottom:200};},
  getContext(){return ctx2d;},classList:{toggle(){},add(){},remove(){}},addEventListener(){},set onclick(f:()=>void){handlers[id]=f;}};elements.set(id,e);return e;};
 const rangeButtons=["live","1h","24h","7d","30d"].map(r=>{const b=el("rng-"+r);b.attrs["data-r"]=r;return b;});
 const totalButtons=["h1","h24","month","year","total"].map(t=>{const b=el("trng-"+t);b.attrs["data-t"]=t;return b;});
 const document:any={getElementById:el,createElement:(t:string)=>el("new-"+t+Math.random()),addEventListener(){},visibilityState:"visible",documentElement:el("html"),
  querySelector:(s:string)=>el(s),querySelectorAll:(s:string)=>s==="#rng button"?rangeButtons:s==="#trng button"?totalButtons:[]};
 return {document,handlers};
}

describe("cockpit client script",()=>{
 it("runs, draws, applies live data and switches all ranges without errors or overwritten functions",async()=>{
  const html=cockpitHtml("n");const script=html.split('<script nonce="n">')[1].split("</script>")[0];
  const {document,handlers}=fakeDom();const raf:((t:number)=>void)[]=[];const fetched:string[]=[];const errors:unknown[]=[];
  const history={ok:true,range:"1h",step:15000,from:0,peak:{out:18.3,in:612},points:[[1,10,99,15,60,0],[2,12,98,16,61,0],[3,null,null,null,null,null],[4,11,97,0,62,540]]};
  const sandbox:any={document,console,Math,Date,JSON,Number,String,Array,Object,isNaN,
   window:{devicePixelRatio:2,innerWidth:393,innerHeight:852,addEventListener(){},EventSource:undefined},navigator:{},performance:{now:()=>Date.now()},
   requestAnimationFrame:(f:(t:number)=>void)=>{raf.push(f);},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},
   fetch:(u:string)=>{fetched.push(u);return Promise.resolve({ok:true,json:()=>Promise.resolve(u.includes("/history")?history:{ok:false})});}};
  sandbox.window.window=sandbox.window;vm.createContext(sandbox);
  const fnNames=[...script.matchAll(/^function ([A-Za-z_$][\w$]*)\(/gm)].map(m=>m[1]);expect(fnNames.length).toBeGreaterThan(10);
  vm.runInContext(script,sandbox);
  for(const n of fnNames)expect(typeof sandbox[n],`function ${n} overwritten`).toBe("function");
  const frame=cockpitFrame({sensors:{t:Date.now(),cpu:12,cores:[10,20,30],gpu:99,temp:{max:66,avg:60,hottest:70,sensors:60},thermal:"fair",swap:0,pressure:1},llm:{phase:"reading",tps:null,lastTps:15,prefillTps:480,progress:0.4},orca:null,status:null,
   tokens:{init:"2026-10-25",at:Date.now(),ranges:{h1:{requests:1,inNew:1,inTotal:2,out:3},h24:{requests:1,inNew:1,inTotal:2,out:3},month:{requests:1,inNew:1,inTotal:2,out:3},year:{requests:1,inNew:1,inTotal:2,out:3},total:{requests:5496,inNew:41012027,inTotal:250782518,out:7151608}},perDay:{inNew:1,out:1}}});
  const run=(n:number)=>{for(let i=0;i<n;i++){const f=raf.shift();if(!f)break;try{f(Date.now()+i*300);}catch(e){errors.push(e);}}};
  sandbox.apply(frame);run(8);
  for(const r of ["1h","24h","7d","30d","live"]){try{handlers["rng-"+r]();}catch(e){errors.push(e);}await new Promise(res=>setImmediate(res));run(3);}
  for(const t of ["h1","h24","month","year","total"]){try{handlers["trng-"+t]();}catch(e){errors.push(e);}}
  expect(errors).toEqual([]);
  expect(fetched.filter(u=>u.includes("/api/cockpit/history")).map(u=>u.split("=")[1])).toEqual(["1h","24h","7d","30d"]);
  expect(document.getElementById("pkR").textContent).toBe("PEAK T/S · LAST MINUTE");
  expect(document.getElementById("oIn").attrs["data-n"]).toBe("10");
 });
});
