import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Batcher } from '../src/core/Batcher';
import { EventQueue } from '../src/core/EventQueue';
import { ExperienceLoader } from '../src/experiences/runtime/ExperienceLoader';
import { SessionManager } from '../src/core/SessionManager';
import { ExperienceStateStore } from '../src/experiences/runtime/ExperienceStateStore';
const exp=(id:string)=>({id,versionId:'v1',kind:'widget',widgetType:'modal',priority:id==='a'?2:1,definition:{content:{heading:id,body:'Audit'},design:{width:'md',theme:{background:'#fff',foreground:'#111',primary:'#2563eb',borderRadius:'md'}},behavior:{dismissible:true}}});
let loader:ExperienceLoader|undefined;let batcher:Batcher|undefined;
const session={getAnonymousId:()=> 'anon',getSessionId:()=> 'session',getPageViewId:()=> 'page',getIdentifiedUserId:()=> 'user'};
beforeEach(()=>{vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{fn(0);return 1;});document.body.innerHTML='';localStorage.clear();sessionStorage.clear();history.replaceState({},'', '/');});
afterEach(()=>{loader?.destroy();batcher?.stop();loader=undefined;batcher=undefined;vi.useRealTimers();vi.unstubAllGlobals();});
const host=()=>document.querySelector<HTMLElement>('[data-movcues-experience]');
const dismiss=()=>host()!.shadowRoot!.querySelector<HTMLElement>('.movcues-runtime-chrome')!.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
const events:any[]=[];
function api(manifest:(trigger:string|null)=>any[]){events.length=0;const fn=vi.fn(async(url:any,opts:any={})=>{if(opts.method==='POST'){events.push(JSON.parse(opts.body));return {ok:true,status:201,json:async()=>({impressionId:'imp'})};}return {ok:true,json:async()=>({experiences:manifest(new URL(url).searchParams.get('trigger')),checklists:[],hasChecklists:false})};});vi.stubGlobal('fetch',fn);return fn;}
it('notifies delivery only on acknowledgment and respects retry backoff',async()=>{
 vi.useFakeTimers();const queue=new EventQueue({maxQueueSize:10});const send=vi.fn().mockResolvedValueOnce({ok:false,retryable:true}).mockResolvedValue({ok:true,retryable:false});const accepted=vi.fn();
 batcher=new Batcher(queue,{send} as any,{maxBatchSize:10,maxQueueSize:10,maxWaitMs:1000,maxRetries:2,retryBaseDelayMs:100},undefined,accepted);batcher.start();
 batcher.enqueue({eventId:'identify',type:'identify'} as any);await batcher.flush();expect(accepted).not.toHaveBeenCalled();await batcher.flush();expect(send).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(99);expect(send).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1);expect(send).toHaveBeenCalledTimes(2);expect(accepted).toHaveBeenCalledTimes(1);
});
it('does not refresh dropped or retry-exhausted events',async()=>{
 const queue=new EventQueue({maxQueueSize:10});const accepted=vi.fn();batcher=new Batcher(queue,{send:async()=>({ok:false,retryable:false})} as any,{maxBatchSize:10,maxQueueSize:10,maxWaitMs:1000,maxRetries:0,retryBaseDelayMs:100},undefined,accepted);batcher.start();batcher.enqueue({eventId:'dropped'} as any);await batcher.flushAndWait();expect(accepted).not.toHaveBeenCalled();expect(queue.size()).toBe(0);
});
it('keeps a legitimate queued widget and records one shown impression per mount',async()=>{
 api(()=>[exp('a'),exp('b')]);loader=new ExperienceLoader('http://api.audit','site',session);await loader.evaluate();await loader.evaluate();expect(host()?.dataset.movcuesExperience).toBe('a');dismiss();await vi.waitFor(()=>expect(host()?.dataset.movcuesExperience).toBe('b'));await vi.waitFor(()=>{expect(events.filter(e=>e.event==='shown'&&e.experienceId==='a')).toHaveLength(1);expect(events.filter(e=>e.event==='shown'&&e.experienceId==='b')).toHaveLength(1);});
});
it('revalidates an eligible custom-event queue with its bounded original trigger',async()=>{
 const fetcher=api(trigger=>trigger==='upgrade'?[exp('b')]:[exp('a')]);loader=new ExperienceLoader('http://api.audit','site',session);await loader.evaluate();await loader.evaluate('upgrade');dismiss();await vi.waitFor(()=>expect(host()?.dataset.movcuesExperience).toBe('b'));expect(fetcher.mock.calls.filter(([u,o])=>!o?.method&&new URL(u).searchParams.get('trigger')==='upgrade')).toHaveLength(2);
});
it('does not display an event queue after membership is revoked',async()=>{
 let member=true;api(trigger=>trigger==='upgrade'?(member?[exp('b')]:[]):[exp('a')]);loader=new ExperienceLoader('http://api.audit','site',session);await loader.evaluate();await loader.evaluate('upgrade');member=false;dismiss();await vi.waitFor(()=>expect(host()).toBeNull());
});
it('does not reuse an event trigger after its lease expires',async()=>{
 vi.useFakeTimers();api(trigger=>trigger==='upgrade'?[exp('b')]:[exp('a')]);loader=new ExperienceLoader('http://api.audit','site',session);await loader.evaluate();await loader.evaluate('upgrade');await vi.advanceTimersByTimeAsync(30001);dismiss();await vi.runAllTimersAsync();expect(host()).toBeNull();
});
it('rotates anonymous and session identity on account switch, while retaining repeated identification',()=>{
 const manager=new SessionManager();manager.identify('a');const anon=manager.getAnonymousId(),sid=manager.getSessionId();manager.identify('a');expect(manager.getAnonymousId()).toBe(anon);manager.identify('b');expect(manager.getAnonymousId()).not.toBe(anon);expect(manager.getSessionId()).not.toBe(sid);manager.reset();expect(manager.getIdentifiedUserId()).toBeNull();
});
it('does not restore guide progress for another site or user',()=>{
 const a=new ExperienceStateStore(JSON.stringify(['site','a']));a.setGuideProgress({experienceId:'guide',versionId:'v1',currentStepId:'s',status:'active'});expect(new ExperienceStateStore(JSON.stringify(['site','b'])).getGuideProgress()).toBeNull();expect(new ExperienceStateStore(JSON.stringify(['other','a'])).getGuideProgress()).toBeNull();const b=new ExperienceStateStore(JSON.stringify(['site','b']));b.setGuideProgress({experienceId:'other',versionId:'v1',currentStepId:'b',status:'active'});expect(a.getGuideProgress()?.currentStepId).toBe('s');expect(b.getGuideProgress()?.currentStepId).toBe('b');
});
it('invalidates old callbacks and pending requests on reset',async()=>{
 const fetcher=api(()=>[exp('a')]);loader=new ExperienceLoader('http://api.audit','site',session);await loader.evaluate();const oldDismiss=host()!.shadowRoot!.querySelector<HTMLElement>('.movcues-runtime-chrome')!.shadowRoot!.querySelector<HTMLButtonElement>('button')!;const before=fetcher.mock.calls.length;loader.resetContext();oldDismiss.click();await Promise.resolve();expect(host()).toBeNull();expect(fetcher.mock.calls.length).toBe(before);
});
it('refreshes a successful identify destination despite another destination failing, without replaying it',async()=>{
 vi.useFakeTimers();const queue=new EventQueue({maxQueueSize:10});const send=vi.fn().mockResolvedValueOnce({ok:false,retryable:true,acknowledgedEventIds:['identify']}).mockResolvedValue({ok:true,retryable:false});const accepted=vi.fn();
 batcher=new Batcher(queue,{send} as any,{maxBatchSize:10,maxQueueSize:10,maxWaitMs:1000,maxRetries:2,retryBaseDelayMs:100},undefined,accepted);batcher.start();batcher.enqueue({eventId:'identify',type:'identify'} as any);batcher.enqueue({eventId:'other',type:'session_replay_event'} as any);await batcher.flush();
 expect(accepted.mock.calls[0][0].map((e:any)=>e.eventId)).toEqual(['identify']);await vi.advanceTimersByTimeAsync(100);expect(send.mock.calls[1][0].map((e:any)=>e.eventId)).toEqual(['other']);expect(accepted.mock.calls.flatMap(([items])=>items).filter((e:any)=>e.eventId==='identify')).toHaveLength(1);
});
it('resumes pending retries after stop/start without bypassing their deadline',async()=>{
 vi.useFakeTimers();const queue=new EventQueue({maxQueueSize:10});const send=vi.fn().mockResolvedValueOnce({ok:false,retryable:true}).mockResolvedValue({ok:true,retryable:false});const accepted=vi.fn();batcher=new Batcher(queue,{send} as any,{maxBatchSize:10,maxQueueSize:10,maxWaitMs:10,maxRetries:2,retryBaseDelayMs:100},undefined,accepted);batcher.start();batcher.enqueue({eventId:'retry'} as any);await batcher.flush();batcher.stop();batcher.start();await vi.advanceTimersByTimeAsync(99);expect(send).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1);expect(send).toHaveBeenCalledTimes(2);expect(accepted).toHaveBeenCalledTimes(1);
});
