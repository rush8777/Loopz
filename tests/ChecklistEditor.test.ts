import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import fixture from './fixtures/checklist-v4.json';
import {EditorModeController} from '../src/experiences/editor/EditorModeController';
import {applyOnsiteDocument,type OnsiteDocument} from '../src/experiences/onsite/OnsiteDocument';
import type {EditorChecklistDefinition,WidgetBuilderState} from '../src/experiences/types';

describe('on-site Checklist editor integration',()=>{
 let controller:EditorModeController,definition:EditorChecklistDefinition,revision:number,fail:boolean,requests:Array<{url:string;body?:any}>;
 beforeEach(()=>{
  document.body.replaceChildren();history.replaceState({},'','/?movcues_editor_token=one-time');revision=1;fail=false;requests=[];
  const f=structuredClone(fixture);const builder:WidgetBuilderState={version:1,projectData:{},html:'',css:''};definition={...f.definition,targeting:{pageRules:[],audience:{type:'all'},priority:0},builder} as EditorChecklistDefinition;applyOnsiteDocument(builder,f.document as OnsiteDocument,'checklist',undefined,definition);
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{fn(0);return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({url,body});const response=(data:any,status=200)=>({ok:status<400,status,json:async()=>data});if(url.endsWith('/exchange'))return response({sessionId:'editor_checklist',accessToken:'access',expiresAt:new Date(Date.now()+600_000).toISOString()});if(init?.method==='PATCH'){if(fail)return response({error:'save_failed'},500);definition=structuredClone(body.definition);return response({version:{id:'version',versionNumber:1,revision:++revision,definition}});}return response({experience:{id:'checklist_edit',name:'Checklist',kind:'checklist',widgetType:null,builderMode:'onsite'},version:{id:'version',versionNumber:1,revision,definition:structuredClone(definition)},references:{guides:[{id:'guide_one',name:'Product tour',status:'published'}],segments:[{id:'segment_one',name:'Activated'}]}}); }));
  controller=new EditorModeController('https://api.unit.test');
 });
 afterEach(()=>{controller.destroy();document.body.replaceChildren();vi.unstubAllGlobals();});
 const ui=()=>document.querySelector<HTMLElement>('[data-movcues-editor]')!.shadowRoot!;
 const view=()=>document.querySelector<HTMLElement>('[data-movcues-checklist]')!.shadowRoot!;
 const change=(selector:string,value:string)=>{const input=ui().querySelector<HTMLInputElement>(selector)!;input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
 const click=(selector:string)=>ui().querySelector<HTMLButtonElement>(selector)!.click();
 it('opens the shared editor, configures canonical tasks with site pickers, switches visual states and saves atomically',async()=>{
  expect(await controller.start('one-time')).toBe(true);expect(location.search).not.toContain('token');expect(ui().querySelector('[data-checklist-view]')).not.toBeNull();
  view().querySelector<HTMLElement>('[data-movcues-checklist-item-id="item_one"]')!.click();change('[data-checklist-task-title]','Launch a tour');change('[data-checklist-action]','launch_guide');change('[data-checklist-condition]','guide_completed');expect(ui().querySelector<HTMLSelectElement>('[data-checklist-action-guide]')!.selectedOptions[0].textContent).toBe('Product tour');
  await vi.waitFor(()=>expect(requests.some(r=>r.body?.definition?.items[0].title==='Launch a tour')).toBe(true));const saved=requests.filter(r=>r.body?.definition).at(-1)!.body.definition;expect(saved.items[0]).toMatchObject({action:{type:'launch_guide',experienceId:'guide_one'},completion:{type:'guide_completed',experienceId:'guide_one'}});expect(saved.builder.html).toContain('Launch a tour');expect(saved).not.toHaveProperty('content');
  change('[data-checklist-view]','launcher');expect(view().querySelector('[data-movcues-checklist-view="launcher"]')!.classList.contains('is-active')).toBe(true);change('[data-checklist-view]','completion');expect(view().querySelector('[data-movcues-checklist-view="completion"]')!.classList.contains('is-active')).toBe(true);
  change('[data-checklist-view]','expanded');click('[data-checklist-add]');expect(view().querySelectorAll('[data-movcues-checklist-item-id]')).toHaveLength(4);
 });
 it('isolates sequential preview progress and blocks real actions, navigation and analytics',async()=>{
  await controller.start('one-time');const before=requests.length;click('[data-mode=preview]');expect(view().querySelector('[data-movcues-checklist-item-id="item_two"]')!.getAttribute('aria-disabled')).toBe('true');
  view().querySelector<HTMLElement>('[data-movcues-checklist-item-id="item_two"]')!.click();expect(view().querySelector('[data-movcues-checklist-item-id="item_two"]')!.getAttribute('data-state')).toBe('locked');
  for(const id of ['one','two','three'])view().querySelector<HTMLElement>(`[data-movcues-checklist-item-id="item_${id}"]`)!.click();expect(view().querySelector('[data-movcues-checklist-view="completion"]')!.classList.contains('is-active')).toBe(true);expect(requests).toHaveLength(before);expect(requests.some(r=>/experience-events|\/actions|\/refresh|\/launch/.test(r.url))).toBe(false);click('[data-checklist-reset]');expect(view().querySelector('[data-movcues-checklist-item-id="item_one"]')!.getAttribute('data-state')).toBe('available');
 });
 it('retains canonical edits through a failed save and retries without losing the cell model',async()=>{
  await controller.start('one-time');fail=true;view().querySelector<HTMLElement>('[data-movcues-checklist-item-id="item_one"]')!.click();change('[data-checklist-task-title]','Keep my task');await vi.waitFor(()=>expect(ui().querySelector('[data-save-state]')!.textContent).toBe('Save failed'));expect(view().textContent).toContain('Keep my task');fail=false;click('[data-retry-save]');await vi.waitFor(()=>expect(ui().querySelector('[data-save-state]')!.textContent).toBe('Draft saved'));expect(definition.items[0].title).toBe('Keep my task');expect(definition.builder.html).toContain('Keep my task');
 });
});
