// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Analytics } from '../src/core/Analytics';
import { ExperienceLoader } from '../src/experiences/runtime/ExperienceLoader';
import { segmentDeliveryFixture } from '../../Loopz-Backend/tests/segmentDeliveryFixture';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<body></body>',{url:'http://localhost:3000/'});
for(const k of ['window','document','location','history','localStorage','sessionStorage','navigator','HTMLElement','Element','Node','Event','MouseEvent','CustomEvent','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,k,{configurable:true,value:(dom.window as any)[k]});
Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:(fn:any)=>setTimeout(()=>fn(0),1)});
Object.defineProperty(globalThis,'cancelAnimationFrame',{configurable:true,value:clearTimeout});
let f:Awaited<ReturnType<typeof segmentDeliveryFixture>>;
let sdk:Analytics|undefined;
let loader:ExperienceLoader|undefined;
let logs:any[]=[];let failNextIdentify=false;
const settle=()=>new Promise(r=>setTimeout(r,60));
beforeEach(()=>{localStorage.clear();sessionStorage.clear();document.body.innerHTML='<button id="target">Target</button>';logs=[];});
afterEach(async()=>{sdk?.destroy();loader?.destroy();sdk=undefined;loader=undefined;vi.unstubAllGlobals();if(f){await f.app.close();f.cleanup();}fs.mkdirSync('../evidence',{recursive:true});fs.appendFileSync('../evidence/sdk-requests.jsonl',logs.map(x=>JSON.stringify(x)).join('\n')+'\n');});
async function setup(withChecklist=false,targetingPatch:any={}){
 f=await segmentDeliveryFixture(new URL(location.href).host);await f.widget(undefined,'modal','widget',targetingPatch);if(withChecklist)await f.widget(undefined,'checklist','checklist');
 vi.stubGlobal('fetch',async(input:any,opts:any={})=>{
  const u=new URL(String(input)); const method=opts.method??'GET';
  const payload=opts.body?JSON.parse(opts.body):undefined;
  if(failNextIdentify&&u.pathname.endsWith('/events')&&payload?.events?.some((e:any)=>e.type==='identify')){failNextIdentify=false;logs.push({method,path:u.pathname,status:503,reason:'synthetic_retry'});return {ok:false,status:503,json:async()=>({error:'retry'}),text:async()=>'synthetic_retry'};}
  const r=await f.app.inject({method,url:u.pathname+u.search,payload,headers:opts.headers});
  let body:any;try{body=r.json();}catch{body=r.body;}
  logs.push({method,path:u.pathname,query:Object.fromEntries(u.searchParams),status:r.statusCode,response:body});
  return {ok:r.statusCode>=200&&r.statusCode<300,status:r.statusCode,json:async()=>body,text:async()=>r.body};
 });
 sdk=new Analytics({experiences:{createLoader:(base,site,session)=>loader=new ExperienceLoader(base,site,session)}});
 sdk.init({siteId:f.site.siteId,endpoint:'http://api.audit',experiences:{enabled:true},queue:{maxWaitMs:20,maxBatchSize:100,retryBaseDelayMs:20,maxRetries:2}});
 await vi.waitFor(()=>expect(loader).toBeTruthy());await settle();
 expect(document.querySelector('[data-movcues-experience]')).toBeNull();
}
describe('real backend + Analytics + automatic loader + DOM',()=>{
 it('renders a page-load segment modal after identify in the same session with no checklist',async()=>{
  await setup();sdk!.identify('test-user-1',{plan:'pro'});
  await vi.waitFor(async()=>expect((await f.members()).total).toBe(1),{timeout:3000});
  const session=(sdk as any).session;
  const control=await f.manifest(session.getAnonymousId(),'test-user-1');
  expect(control.hasChecklists).toBe(false);expect(control.experiences).toHaveLength(1);
  await vi.waitFor(()=>expect(document.querySelector('[data-movcues-experience]')).not.toBeNull(),{timeout:800});
 });
 it('does not render for a free-plan non-member',async()=>{
  await setup();sdk!.identify('free-user',{plan:'free'});await settle();
  expect((await f.members()).total).toBe(0);expect(document.querySelector('[data-movcues-experience]')).toBeNull();
 });
 it('can render a member from the automatic initial page-load manifest',async()=>{
  await setup();const session=(sdk as any).session;await f.identify(session.getAnonymousId(),'user');
  sdk!.destroy();sdk=undefined;session.identify('user');
  loader=new ExperienceLoader('http://api.audit',f.site.siteId,session);await loader.evaluate();
  expect(document.querySelector('[data-movcues-experience]')).not.toBeNull();
 });
 it.each(['immediate','delayed','repeated'])('refreshes delivery after %s identify',async(mode)=>{
  await setup();if(mode==='delayed')await settle();
  sdk!.identify('test-user-1',{plan:'pro'});if(mode==='repeated')sdk!.identify('test-user-1',{plan:'pro'});
  await vi.waitFor(async()=>expect((await f.members()).total).toBe(1));
  await vi.waitFor(()=>expect(document.querySelector('[data-movcues-experience]')).not.toBeNull(),{timeout:500});
 });
 it('re-evaluates a behavioral audience after its triggering event is ingested',async()=>{
  await setup();await f.request('PATCH',f.root+'/segments/'+f.pro.id,{definition:{logic:'and',conditions:[{type:'event',eventName:'setup',operator:'performed'}]}});
  sdk!.event('setup');await vi.waitFor(async()=>expect((await f.members()).total).toBe(1));
  const session=(sdk as any).session;expect((await f.manifest(session.getAnonymousId())).experiences).toHaveLength(1);
  await vi.waitFor(()=>expect(document.querySelector('[data-movcues-experience]')).not.toBeNull(),{timeout:500});
 });

 it('refreshes the same targeted modal when a published checklist exists',async()=>{
  await setup(true);sdk!.identify('test-user-1',{plan:'pro'});
  await vi.waitFor(()=>expect(document.querySelector('[data-movcues-experience]')).not.toBeNull(),{timeout:1500});
  expect((await f.members()).total).toBe(1);
 });
 it('refreshes after identify ingestion fails once then succeeds on retry',async()=>{
  await setup();failNextIdentify=true;sdk!.identify('test-user-1',{plan:'pro'});
  await vi.waitFor(async()=>expect((await f.members()).total).toBe(1),{timeout:2500});
  expect(logs.some(x=>x.status===503)).toBe(true);
  await vi.waitFor(()=>expect(document.querySelector('[data-movcues-experience]')).not.toBeNull(),{timeout:500});
 });

 it('removes the previous member widget on reset',async()=>{
  await setup(true);sdk!.identify('test-user-1',{plan:'pro'});
  await vi.waitFor(()=>expect(document.querySelector('[data-movcues-experience]')).not.toBeNull());
  sdk!.reset();await settle();
  expect(document.querySelector('[data-movcues-experience]')).toBeNull();
 });

 it('delivers a custom-event-triggered behavioral segment only after that event commits',async()=>{
  await setup(false,{trigger:{type:'custom_event',eventName:'setup'}});
  await f.request('PATCH',f.root+'/segments/'+f.pro.id,{definition:{logic:'and',conditions:[{type:'event',eventName:'setup',operator:'performed'}]}});
  sdk!.event('setup');await vi.waitFor(()=>expect(document.querySelector('[data-movcues-experience]')).not.toBeNull());
  await vi.waitFor(()=>expect(logs.filter(x=>x.path?.endsWith('/experience-events')&&x.status===201)).toHaveLength(1));
  expect((await f.members()).total).toBe(1);expect(logs.filter(x=>x.method==='GET'&&x.path.endsWith('/experiences')).length).toBeLessThan(9);
 });

});
