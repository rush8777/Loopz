import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExperienceLoader } from '../src/experiences/runtime/ExperienceLoader';
import { Analytics } from '../src/core/Analytics';
const exp=(id:string)=>({id,versionId:'v1',kind:'widget',widgetType:'modal',priority:1,definition:{content:{heading:id,body:'Synthetic audit'},design:{width:'md',theme:{background:'#fff',foreground:'#111',primary:'#2563eb',borderRadius:'md'}},behavior:{dismissible:true}}});
const response=(items:any[])=>({ok:true,json:async()=>({experiences:items,checklists:[],hasChecklists:false})});
let loader:ExperienceLoader;
let user:string|null='pro-user';
const session={getAnonymousId:()=> 'audit-anon',getSessionId:()=> 'audit-session',getPageViewId:()=> 'audit-page',getIdentifiedUserId:()=>user};
beforeEach(()=>{document.body.innerHTML='';localStorage.clear();sessionStorage.clear();history.replaceState({},'', '/');user='pro-user';});
afterEach(()=>{loader?.destroy();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('rejects an old manifest arriving after a later identity request',async()=>{
 let release!:(value:any)=>void;let n=0;
 vi.stubGlobal('fetch',vi.fn(async()=>++n===1?new Promise(r=>release=r):response([])));
 loader=new ExperienceLoader('http://api.audit','site',session);
 const old=loader.evaluate();user='free-user';await loader.evaluate();release(response([exp('old-member-widget')]));await old;
 expect(document.querySelector('[data-movcues-experience]')).toBeNull();
});
it('rejects an old-route manifest arriving after SPA navigation',async()=>{
 let release!:(value:any)=>void;let n=0;
 vi.stubGlobal('fetch',vi.fn(async()=>++n===1?new Promise(r=>release=r):response([])));
 loader=new ExperienceLoader('http://api.audit','site',session);
 const old=loader.evaluate();history.pushState({},'', '/new');loader.onRouteChange();await new Promise(r=>setTimeout(r,5));release(response([exp('old-route-widget')]));await old;
 expect(document.querySelector('[data-movcues-experience]')).toBeNull();
});
it('does not replay a previously queued candidate missing from a fresh manifest',async()=>{
 let n=0;vi.stubGlobal('fetch',vi.fn(async(_u:any,opts:any)=>opts?.method==='POST'?{ok:true,json:async()=>({impressionId:'imp'})}:response(++n===1?[exp('active')]:n===2?[exp('queued')]:[])));
 loader=new ExperienceLoader('http://api.audit','site',session);await loader.evaluate();await loader.evaluate();
 user='free-user';
 document.querySelector('[data-movcues-experience]')!.shadowRoot!.querySelector<HTMLElement>('.movcues-runtime-chrome')!.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
 await new Promise(r=>setTimeout(r,30));
 expect(document.querySelector('[data-movcues-experience]')).toBeNull();
});
it('drops a direct identify before initialization (characterization)',()=>{
 const analytics=new Analytics();analytics.identify('early-user',{plan:'pro'});
 expect(sessionStorage.getItem('__aa_identified_user__')).toBeNull();
});
it('rejects the stale identity response even when it arrives before the latest response',async()=>{
 const pending:Array<(value:any)=>void>=[];vi.stubGlobal('fetch',vi.fn(async()=>new Promise(r=>pending.push(r))));
 loader=new ExperienceLoader('http://api.audit','site',session);const a=loader.evaluate();user='free-user';const b=loader.evaluate();pending[0](response([exp('stale')]));await a;expect(document.querySelector('[data-movcues-experience]')).toBeNull();pending[1](response([]));await b;expect(document.querySelector('[data-movcues-experience]')).toBeNull();
});
it('allows the latest of repeated SPA navigations while rejecting earlier routes',async()=>{
 const pending:Array<(value:any)=>void>=[];vi.stubGlobal('fetch',vi.fn(async(_url:any,opts:any)=>opts?.method==='POST'?{ok:true,status:201,json:async()=>({impressionId:'imp'})}:new Promise(r=>pending.push(r))));
 loader=new ExperienceLoader('http://api.audit','site',session);const a=loader.evaluate();history.pushState({},'','/b');loader.onRouteChange();history.pushState({},'','/c');loader.onRouteChange();pending[2](response([exp('current-route')]));await vi.waitFor(()=>expect(document.querySelector<HTMLElement>('[data-movcues-experience]')?.dataset.movcuesExperience).toBe('current-route'));pending[1](response([exp('old-b')]));pending[0](response([exp('old-a')]));await a;expect(document.querySelector<HTMLElement>('[data-movcues-experience]')?.dataset.movcuesExperience).toBe('current-route');
});
