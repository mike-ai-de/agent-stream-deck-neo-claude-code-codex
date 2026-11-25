import { describe,it,expect } from "vitest";
import vm from "node:vm";
import { cockpitHtml } from "../src/osca/cockpit-page.js";
import { cockpitFrame,parseStrataMetrics } from "../src/osca/cockpit.js";

// Runs the real cockpit client script against a minimal fake DOM: catches runtime errors and name collisions
// (e.g. a variable overwriting a function) that type checks cannot see.
function fakeDom(){
 const elements=new Map<string,any>();const handlers:Record<string,()=>void>={};
 const ctx2d:any=new Proxy(function(){},{get:(_t,k)=>k==="getImageData"?()=>({data:[]}):k==="measureText"?()=>({width:10}):k==="createLinearGradient"?()=>({addColorStop(){}}):()=>{},set:()=>true});
 const el=(id:string):any=>{if(elements.has(id))return elements.get(id);let text="";const e:any={id,get textContent():string{return text+this.children.map((c:any)=>typeof c==="string"?c:c.textContent).join("");},set textContent(value:string){text=value;this.children=[];},innerHTML:"",className:"",hidden:false,style:{},width:0,height:0,offsetWidth:300,offsetHeight:200,firstChild:{style:{}},
  attrs:{} as Record<string,string>,children:[] as any[],
  getAttribute(n:string){return this.attrs[n]??null;},setAttribute(n:string,v:string){this.attrs[n]=v;},appendChild(c:any){this.children.push(c);return c;},append(...nodes:any[]){this.children.push(...nodes);},
  querySelector(selector:string){return el(id+"-"+selector);},querySelectorAll(){return [];},getBoundingClientRect(){return {width:300,height:200,left:0,top:0,right:300,bottom:200};},
  getContext(){return ctx2d;},classList:{toggle(){},add(){},remove(){}},addEventListener(){},set onclick(f:()=>void){handlers[id]=f;}};elements.set(id,e);return e;};
 const rangeButtons=["live","1h","24h","7d","30d"].map(r=>{const b=el("rng-"+r);b.attrs["data-r"]=r;return b;});
 const totalButtons=["h1","h24","month","year","total"].map(t=>{const b=el("trng-"+t);b.attrs["data-t"]=t;return b;});
 const document:any={getElementById:el,createElement:(t:string)=>el("new-"+t+Math.random()),addEventListener(name:string,callback:()=>void){handlers[name]=callback;},visibilityState:"visible",documentElement:el("html"),
  querySelector:(s:string)=>el(s),querySelectorAll:(s:string)=>s==="#rng button"?rangeButtons:s==="#trng button"?totalButtons:[]};
 return {document,handlers};
}

describe("cockpit client script",()=>{
 it("keeps the two instrument columns equal and stacks the three rate lines so busy engines cannot widen the page",()=>{
  const html=cockpitHtml("n");
  expect(html).toContain(".row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)");
  expect(html).toContain('<div class="sub rates"><b class="mono" id="strataRate">');
  expect(html).toContain(".sub.rates{flex-direction:column");
  expect(html).toContain(".deck{max-width:520px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}");
  expect(html).toMatch(/\.llm \.m\{flex:1;min-width:0;/);
 });
 it("runs, draws, applies live data and switches all ranges without errors or overwritten functions",async()=>{
  const html=cockpitHtml("n");const script=html.split('<script nonce="n">')[1].split("</script>")[0];
  const {document,handlers}=fakeDom();const raf:((t:number)=>void)[]=[];const fetched:string[]=[];const errors:unknown[]=[];
  let history={ok:true,range:"1h",step:15000,from:0,peak:{out:18.3,in:612},last:{out:15.2,in:540},points:[[1,10,99,15,60,0],[2,12,98,16,61,0],[3,null,null,null,null,null],[4,11,97,0,62,540]]};
  const sandbox:any={document,console,Math,Date,JSON,Number,String,Array,Object,isNaN,
   window:{devicePixelRatio:2,innerWidth:393,innerHeight:852,addEventListener(){},EventSource:undefined},navigator:{},performance:{now:()=>Date.now()},
   requestAnimationFrame:(f:(t:number)=>void)=>{raf.push(f);},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},
   fetch:(u:string)=>{fetched.push(u);return Promise.resolve({ok:true,json:()=>Promise.resolve(u.includes("/history")?history:{ok:false})});}};
  sandbox.window.window=sandbox.window;vm.createContext(sandbox);
  const fnNames=[...script.matchAll(/^function ([A-Za-z_$][\w$]*)\(/gm)].map(m=>m[1]);expect(fnNames.length).toBeGreaterThan(10);
  vm.runInContext(script,sandbox);
  for(const n of fnNames)expect(typeof sandbox[n],`function ${n} overwritten`).toBe("function");
  await new Promise(res=>setImmediate(res));
  expect(document.getElementById("tpsSub").textContent).toBe("LAST OUT 15.2");
  expect(document.getElementById("pre").textContent).toBe("LAST IN 540");
  expect(document.getElementById("pkOut").textContent).toBe("18.3");
  expect(document.getElementById("pkIn").textContent).toBe("612");
  expect(sandbox.series("cpu")).toEqual([10,12,null,11]);
  document.visibilityState="hidden";handlers.visibilitychange();
  history={...history,last:{out:21.8,in:780},points:[[5,22,91,21.8,64,780]]};
  document.visibilityState="visible";handlers.visibilitychange();
  await new Promise(res=>setImmediate(res));
  expect(sandbox.series("tps")).toEqual([21.8]);
  expect(document.getElementById("tpsSub").textContent).toBe("LAST OUT 21.8");
  let dial: any;
  const drawDial=sandbox.splitGauge;
  sandbox.splitGauge=(canvas:unknown,options:unknown)=>{dial=options;drawDial(canvas,options);};
  const frame=cockpitFrame({sensors:{t:Date.now(),cpu:12,cores:[10,20,30],gpu:99,temp:{max:66,avg:60,hottest:70,sensors:60},thermal:"fair",swap:0,pressure:1},llm:{phase:"reading",tps:null,lastTps:15,prefillTps:480,progress:0.4},orca:null,status:null,
   tokens:{init:"2026-10-25",at:Date.now(),ranges:{h1:{requests:1,inNew:1,inTotal:2,out:3},h24:{requests:1,inNew:1,inTotal:2,out:3},month:{requests:1,inNew:1,inTotal:2,out:3},year:{requests:1,inNew:1,inTotal:2,out:3},total:{requests:5496,inNew:41012027,inTotal:250782518,out:7151608}},perDay:{inNew:1,out:1}}});
  let frameTime=Date.now()+1800;
  const run=(n:number)=>{for(let i=0;i<n;i++){const f=raf.shift();if(!f)break;try{f(frameTime+=300);}catch(e){errors.push(e);}}};
  sandbox.apply({...frame,quota:{claude:{h5:{remaining:76,reset:null},d7:{remaining:30,reset:null}},codex:{h5:{remaining:49,reset:null},d7:{remaining:78,reset:null}}}});
  for(const [id,value] of [["f-c5","76%"],["f-c7","30%"],["f-x5","49%"],["f-x7","78%"]]){
   const row=document.getElementById(id);
   expect(row.querySelector(".v").textContent).toBe(value);
   expect(row.querySelector("i").style.width).toBe(value);
  }
  sandbox.apply(frame);run(8);
  expect(document.getElementById("strataRate").textContent).toBe("STRATA OFFLINE");
  expect(dial).toMatchObject({primary:"ollama",direction:"IN",text:"480"});
  sandbox.apply({...frame,strata:parseStrataMetrics({live:{state:"generating",tok_s:108}})});
  run(16);
  expect(document.getElementById("strataRate").textContent).toBe("STRATA OUT 108.0");
  expect(dial).toMatchObject({primary:"strata",direction:"OUT",text:"108.0",measured:true});
  expect(document.getElementById("llmM").textContent).toBe("STRATA · ACTIVE");
  expect(dial.ollama).toBeLessThan(0);
  expect(sandbox.anim.strataSplit).toBeGreaterThan(0.5);
  sandbox.apply({...frame,strata:parseStrataMetrics({live:{state:"reading",prefill_tok_s_mean:1629}})});
  run(16);
  expect(document.getElementById("strataRate").textContent).toBe("STRATA IN 1629");
  expect(dial).toMatchObject({primary:"strata",direction:"IN",text:"1629"});
  expect(dial.strata).toBeLessThan(-0.75);
  const idleOllama={...frame.llm,phase:"idle" as const};
  sandbox.apply({...frame,llm:idleOllama,strata:parseStrataMetrics({live:{state:"generating"}})});run(8);
  expect(dial).toMatchObject({primary:"strata",direction:"OUT",text:"—",measured:false});
  sandbox.apply({...frame,llm:idleOllama,strata:parseStrataMetrics({live:{state:"idle"}})});run(8);
  expect(dial).toMatchObject({direction:"",text:"IDLE"});
  sandbox.apply(frame);run(8);
  // LLM row: Inkling or Strata loaded counts as a loaded model even when Ollama holds none.
  const noOllama={...frame,llm:{...frame.llm,phase:"idle" as const,model:null,loaded:false,engines:[]}};
  sandbox.apply(noOllama);expect(document.getElementById("llmM").textContent).toBe("NO MODEL LOADED");
  const idleLlm={phase:"idle" as const,tps:null,lastTps:null,prefillTps:null,progress:null};
  const loadedInkling={...noOllama,inkling:idleLlm,llm:{...noOllama.llm,model:"inkling-2-mini",loaded:true,engines:[{kind:"inkling" as const,model:"inkling-2-mini"}]}};
  sandbox.apply(loadedInkling);expect(document.getElementById("llmM").textContent).toBe("LOADED · inkling-2-mini");
  expect(document.getElementById("llm").className).toBe("llm loaded");
  sandbox.apply({...loadedInkling,llm:{...loadedInkling.llm,engines:[{kind:"ollama" as const,model:"osca-qwen3.8:27b-q8-128k"},...loadedInkling.llm.engines]}});
  expect(document.getElementById("llmM").textContent).toBe("LOADED · osca-qwen3.8:27b-q8-128k · inkling-2-mini");
  expect(document.getElementById("llmM").children.filter((node:any)=>typeof node!=="string").map((node:any)=>node.style.color)).toEqual(["#3FD0F0","#5ED39A"]);
  sandbox.apply({...loadedInkling,inkling:{...idleLlm,phase:"writing" as const,tps:35}});run(4);
  expect(document.getElementById("llmM").textContent).toBe("INKLING · ACTIVE");
  expect(document.getElementById("llmP").textContent).toBe("WRITING");
  // Centre readout: follows the working engine; colour = engine; a held engine yields only after 3 s.
  const quiet={...frame,llm:{...frame.llm,phase:"idle" as const,tps:null,prefillTps:null},strata:null,inkling:null};
  sandbox.apply(quiet);run(8);expect(dial).toMatchObject({direction:"",text:"IDLE"});
  sandbox.apply({...quiet,inkling:{phase:"reading" as const,tps:null,lastTps:null,prefillTps:450,progress:null}});run(4);
  expect(dial).toMatchObject({primary:"inkling",direction:"IN",text:"450",measured:true});
  sandbox.apply({...quiet,inkling:{phase:"reading" as const,tps:null,lastTps:null,prefillTps:null,progress:null}});run(2);
  expect(dial).toMatchObject({primary:"inkling",direction:"IN",text:"—",measured:false});
  const busyBoth={...quiet,inkling:{phase:"writing" as const,tps:35,lastTps:null,prefillTps:null,progress:null},strata:{phase:"writing" as const,tps:90,lastTps:null,prefillTps:null,progress:null}};
  sandbox.apply(busyBoth);run(4);expect(dial).toMatchObject({primary:"inkling",direction:"OUT",text:"35.0"}); // held, 1.2 s
  run(12);expect(dial).toMatchObject({primary:"strata",direction:"OUT",text:"90.0"}); // after 3 s Strata takes over
  sandbox.apply({...busyBoth,strata:null});run(14);expect(dial).toMatchObject({primary:"inkling",direction:"OUT",text:"35.0"});
  sandbox.apply({...quiet,llm:{...quiet.llm,phase:"reading" as const,prefillTps:300}});run(14);
  expect(dial).toMatchObject({primary:"ollama",direction:"IN",text:"300"});
  sandbox.apply(quiet);run(2);expect(dial).toMatchObject({direction:"",text:"IDLE"});
  sandbox.apply(frame);run(8);
  for(const r of ["1h","24h","7d","30d","live"]){try{handlers["rng-"+r]();}catch(e){errors.push(e);}await new Promise(res=>setImmediate(res));run(3);}
  for(const t of ["h1","h24","month","year","total"]){try{handlers["trng-"+t]();}catch(e){errors.push(e);}}
  expect(errors).toEqual([]);
  expect(fetched.filter(u=>u.includes("/api/cockpit/history")).map(u=>u.split("=")[1])).toEqual(["1m","1m","1h","24h","7d","30d","1m"]);
  expect(document.getElementById("pkR").textContent).toBe("PEAK T/S · LAST MINUTE");
  expect(document.getElementById("oIn").attrs["data-n"]).toBe("10");
 });
});
