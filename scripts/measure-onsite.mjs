import { createServer } from "vite";
import { JSDOM } from "jsdom";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual:true, url:"https://fixture.test" });
for(const name of ["window","document","Node","NodeFilter","Element","HTMLElement","HTMLImageElement","MouseEvent","InputEvent","CompositionEvent"]) globalThis[name]=dom.window[name];
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
const folder=await mkdtemp(path.join(os.tmpdir(),"onsite-perf-"));
const baseline=process.argv[2] ?? "origin/codex/onsite-builder-phases-0-2";
const source=execFileSync("git",["show",`${baseline}:src/experiences/editor/OnsiteContentEditor.ts`],{encoding:"utf8"});
await writeFile(path.join(folder,"baseline.ts"),source.replaceAll('"../runtime/BuilderContentContract"',JSON.stringify(path.resolve("src/experiences/runtime/BuilderContentContract.ts"))));
const server=await createServer({server:{middlewareMode:true},appType:"custom"});
try {
 const Old=(await server.ssrLoadModule(path.join(folder,"baseline.ts"))).OnsiteContentEditor;
 const New=(await server.ssrLoadModule("/src/experiences/editor/OnsiteContentEditor.ts")).OnsiteContentEditor;
 const rows=[];
 for(const [size,padding] of [["small",""],["large",'<span class="decorative">Decoration</span>'.repeat(1000)+'<span>'+('x'.repeat(120000))+'</span>']]) {
  for(const [version,Editor] of [["before",Old],["after",New]]) {
   const samples=[];
   for(let trial=0;trial<3;trial++) {
    const html=`<section class="movcues-widget"><h2 data-movcues-content="heading">Welcome</h2><div data-movcues-content="body">Text</div>${padding}</section>`;
    const host=document.createElement("div");document.body.append(host);const root=host.attachShadow({mode:"open"});root.innerHTML=`<div data-movcues-builder-surface>${html}</div>`;
    const builder={version:1,html,css:".movcues-widget{}",projectData:{}};const content={heading:"Welcome",body:"Text"};const editor=new Editor(root,builder,content,{onChange(){},onSelectionChange(){}});editor.start();
    const heading=root.querySelector("h2");heading.dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));
    const start=performance.now();
    for(let i=0;i<50;i++){heading.textContent=`Welcome ${i}`;heading.dispatchEvent(new InputEvent("input",{bubbles:true}));}
    samples.push((performance.now()-start)/50);editor.flush?.();
    if(heading!==root.querySelector("h2"))throw new Error("Input remounted editable node");
    editor.destroy();host.remove();
   }
   samples.sort((a,b)=>a-b);rows.push({size,version,medianMsPerInput:Number(samples[1].toFixed(3))});
  }
 }
 console.log(JSON.stringify({environment:"jsdom synthetic; 50 inputs x 3 trials; includes DOM dispatch; excludes final flush; not browser FPS",rows},null,2));
} finally { await server.close();await rm(folder,{recursive:true,force:true});dom.window.close(); }
