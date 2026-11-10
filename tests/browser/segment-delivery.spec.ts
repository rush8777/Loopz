import { test, expect, type Page } from '@playwright/test';
import { segmentDeliveryFixture } from '../../../Loopz-Backend/tests/segmentDeliveryFixture';
import path from 'node:path';
import fs from 'node:fs';
let f:Awaited<ReturnType<typeof segmentDeliveryFixture>>;
let logs:any[]=[];
test.afterEach(async()=>{expect(logs.filter(l=>l.path.endsWith('/events')).every(l=>l.status===200)).toBe(true);if(f){await f.app.close();f.cleanup();}fs.mkdirSync('../evidence',{recursive:true});fs.appendFileSync('../evidence/browser-requests.jsonl',JSON.stringify({test:test.info().title,requests:logs})+'\n');await test.info().attach('sanitized-api-log',{body:JSON.stringify(logs,null,2),contentType:'application/json'});});
async function setup(page:Page,seed:boolean|'alias'=false,queued=false,widgetType='modal'){
 logs=[];f=await segmentDeliveryFixture('127.0.0.1:4179');await f.widget(widgetType==='survey'?{type:'all'}:undefined,widgetType);
 await page.route('http://api.audit/**',async route=>{
  const req=route.request();const u=new URL(req.url());
  const r=await f.app.inject({method:req.method() as any,url:u.pathname+u.search,payload:req.postDataJSON()??undefined,headers:{'content-type':'application/json'}});
  let body:any;try{body=r.json();}catch{body=r.body;}
  logs.push({method:req.method(),path:u.pathname,query:Object.fromEntries(u.searchParams),status:r.statusCode,response:body});
  await route.fulfill({status:r.statusCode,contentType:'application/json',body:r.body});
 });
 await page.goto('/');if(queued)await page.evaluate(siteId=>{(window as any).analytics={q:[['init',{siteId,endpoint:'http://api.audit',experiences:{enabled:true},queue:{maxWaitMs:30}}],['identify','test-user-1',{plan:'pro'}]]};},f.site.siteId);await page.addScriptTag({path:path.resolve('dist/sdk-experiences.js')});await page.addScriptTag({path:path.resolve('dist/sdk.js')});
 if(seed){await f.identify('audit-anon','test-user-1');await page.evaluate(aliasOnly=>{localStorage.setItem('__aa_anon_id__','audit-anon');if(!aliasOnly)sessionStorage.setItem('__aa_identified_user__','test-user-1');},seed==='alias');}
 if(!queued)await page.evaluate(siteId=>(window as any).analytics.init({siteId,endpoint:'http://api.audit',experiences:{enabled:true},queue:{maxWaitMs:30}}),f.site.siteId);
 await expect.poll(()=>logs.filter(l=>l.path.endsWith('/experiences')).length).toBeGreaterThan(0);
}
test('published segment modal appears automatically after identify without checklists',async({page})=>{
 await setup(page);await page.evaluate(()=>(window as any).analytics.identify('test-user-1',{plan:'pro'}));
 await expect.poll(async()=>(await f.members()).total).toBe(1);
 await expect(page.locator('[data-movcues-experience]')).toHaveCount(1,{timeout:1500});await expect(page.locator('[data-movcues-experience] .modal')).toBeVisible();await expect.poll(()=>logs.some(l=>l.path.endsWith('/experience-events')&&l.status===201)).toBe(true);
});
test('existing member renders on initial load and records an impression',async({page})=>{
 await setup(page,true);await expect(page.locator('[data-movcues-experience]')).toHaveCount(1);await expect(page.locator('[data-movcues-experience] .modal')).toBeVisible();
 await expect.poll(()=>logs.some(l=>l.path.endsWith('/experience-events')&&l.status===201)).toBe(true);
});
test('a non-member remains excluded after identify',async({page})=>{
 await setup(page);await page.evaluate(()=>(window as any).analytics.identify('free-user',{plan:'free'}));
 await expect.poll(()=>logs.filter(l=>l.path.endsWith('/events')).length).toBeGreaterThan(0);
 await expect(page.locator('[data-movcues-experience]')).toHaveCount(0);expect((await f.members()).total).toBe(0);
});
test('automatic delivery continues across SPA navigation without reload',async({page})=>{
 await setup(page);await page.evaluate(()=>(window as any).analytics.identify('test-user-1',{plan:'pro'}));
 await expect.poll(async()=>(await f.members()).total).toBe(1);
 await expect(page.locator('[data-movcues-experience] .modal')).toBeVisible();
 await page.evaluate(()=>history.pushState({},'','/next'));
 await expect.poll(()=>logs.some(l=>l.path.endsWith('/experiences')&&l.query.url.endsWith('/next'))).toBe(true);
 await expect(page.locator('[data-movcues-experience]')).toHaveCount(1);await expect(page.locator('[data-movcues-experience] .modal')).toBeVisible();
});

test('queued identify before SDK initialization delivers automatically',async({page})=>{
 await setup(page,false,true);await expect.poll(async()=>(await f.members()).total).toBe(1);
 await expect(page.locator('[data-movcues-experience]')).toHaveCount(1,{timeout:1500});await expect(page.locator('[data-movcues-experience] .modal')).toBeVisible();await expect.poll(()=>logs.some(l=>l.path.endsWith('/experience-events')&&l.status===201)).toBe(true);
});

test('known alias restores delivery in a new session without an external ID',async({page})=>{
 await setup(page,'alias');await expect(page.locator('[data-movcues-experience] .modal')).toBeVisible();
});
test('reset removes the previous user presentation and rotates its alias',async({page})=>{
 await setup(page,true);await expect(page.locator('[data-movcues-experience] .modal')).toBeVisible();
 const old=await page.evaluate(()=>localStorage.getItem('__aa_anon_id__'));
 await page.evaluate(()=>(window as any).analytics.reset());await expect(page.locator('[data-movcues-experience]')).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('__aa_anon_id__'))).not.toBe(old);
 await expect.poll(()=>logs.some(l=>l.path.endsWith('/experiences')&&l.query.anonymousId!==old&&l.response.experiences.length===0)).toBe(true);
});
test('switching to a free account cannot retain a pro-account widget',async({page})=>{
 await setup(page,true);await expect(page.locator('[data-movcues-experience] .modal')).toBeVisible();
 await page.evaluate(()=>(window as any).analytics.identify('free-user',{plan:'free'}));await expect(page.locator('[data-movcues-experience]')).toHaveCount(0);
 await expect.poll(()=>logs.some(l=>l.path.endsWith('/experiences')&&l.query.trackedUserId==='free-user'&&l.response.experiences.length===0)).toBe(true);
});

test('anonymous survey answers survive first identification and can be submitted',async({page})=>{
 await setup(page,false,false,'survey');const host=page.locator('[data-movcues-experience]');await expect(host.locator('.modal')).toBeVisible();
 await expect.poll(()=>logs.some(l=>l.path.endsWith('/survey-responses')&&l.status===201)).toBe(true);
 await host.getByRole('button',{name:'4',exact:true}).click();await host.locator('[data-movcues-survey-action=next]').click();
 await expect(host).toContainText('Anything else to share?');
 await page.evaluate(()=>(window as any).analytics.identify('test-user-1',{plan:'pro'}));
 await expect.poll(()=>logs.some(l=>l.path.endsWith('/experiences')&&l.query.trackedUserId==='test-user-1')).toBe(true);
 await expect(page.locator('[data-movcues-experience]')).toContainText('Anything else to share?');
 await page.locator('[data-movcues-survey-action=submit]').click();
 await expect.poll(()=>logs.some(l=>l.method==='PATCH'&&l.path.includes('/survey-responses/')&&l.status===204)).toBe(true);
 await expect(page.locator('[data-movcues-experience]')).toHaveCount(0);
});
