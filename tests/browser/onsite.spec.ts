import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/tests/browser/fixture.html"); await page.waitForFunction(() => !!(window as any).fixture); });

test("native caret, word selection, keyboard formatting, links and undo", async ({ page }) => {
  const heading = page.locator("#authoring h2"); await heading.dblclick();
  await heading.press("ControlOrMeta+a"); await heading.pressSequentially("Updated welcome");
  await heading.click({ position: { x: 8, y: 8 } }); await expect(heading).toHaveAttribute("contenteditable", "true");
  await heading.pressSequentially("X"); await expect(heading).toContainText("X");
  expect((await heading.textContent())!.length).toBe("Updated welcome".length+1);
  await heading.press("ControlOrMeta+a"); await heading.pressSequentially("Updated welcome");
  await heading.dblclick(); await expect(heading).toHaveAttribute("contenteditable", "true");
  await heading.press("ControlOrMeta+a"); await heading.press("Shift+ArrowLeft"); await heading.press("ControlOrMeta+a");
  await page.locator("#bold").focus(); await page.locator("#bold").press("Enter"); await expect(heading.locator("strong")).toHaveText("Updated welcome");
  await heading.press("ControlOrMeta+a"); await page.locator("#url").focus(); await page.locator("#link").focus(); await page.locator("#link").press("Space");
  await expect(heading.locator("a")).toHaveAttribute("href", "/docs");
  await page.locator("#undo").click(); await expect(heading.locator("a")).toHaveCount(0);
  await page.locator("#redo").click(); await expect(heading.locator("a")).toHaveCount(1);
});

test("mouse drag selection and composition preserve the editable node", async ({ page }) => {
  const heading = page.locator("#authoring h2"); await heading.dblclick(); const rect = await heading.boundingBox();
  await page.mouse.move(rect!.x+3,rect!.y+8); await page.mouse.down(); await page.mouse.move(rect!.x+70,rect!.y+8,{steps:8}); await page.mouse.up();
  await expect(heading).toHaveAttribute("contenteditable", "true");
  expect(await page.evaluate(() => { const root=(window as any).fixture.root; return (root.getSelection?.() ?? window.getSelection())?.toString().length ?? 0; })).toBeGreaterThan(0);
  await page.evaluate(() => {
    const f=(window as any).fixture;const h=f.root.querySelector('h2');
    h.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})); h.textContent='日本語';h.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
    if(f.editor.flush())throw new Error('Partial composition flushed');
    h.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));if(f.content.heading!=='日本語')throw new Error('Composition lost');
    if(h!==f.root.querySelector('h2'))throw new Error('Editable node remounted');
  });
});

for (const width of [320,360,390]) test(`mobile viewport ${width}px, image undo and cleanup`, async ({ page }) => {
  await page.setViewportSize({width,height:640});
  await page.locator("#authoring img").click();
  await page.evaluate(() => { const f=(window as any).fixture;f.editor.updateImage('/replacement.png','Replacement');f.editor.undo();if(f.root.querySelector('img').getAttribute('src')!=='/image.png')throw new Error('Image undo lost'); });
  await expect(page.locator("#authoring img")).toHaveAttribute("alt","Image");
  await page.evaluate(() => { const f=(window as any).fixture; for(let i=0;i<20;i++){f.editor.destroy();f.editor.start();}f.editor.destroy();if(f.root.querySelector('[data-movcues-authoring-outline]'))throw new Error('Leaked overlay'); });
});

async function startController(page: import('@playwright/test').Page, options: { width?: number; widgetType?: string; delay?: boolean } = {}) {
  const definition = {
    content: { heading: 'Welcome', body: 'Edit this message', primaryAction: { label: 'Continue', type: 'dismiss' } },
    design: { width: 'md', theme: { background: '#fff', foreground: '#111', primary: '#2563eb', borderRadius: 'md' } },
    behavior: { dismissible: true, autoDismissMs: 500, placement: 'bottom', alignment: 'center', offset: 8 },
    target: { primarySelector: '#anchor', fallbackSelectors: [], reliability: 'reliable' },
    targeting: { pageRules: [], audience: { type: 'all' }, trigger: { type: 'page_load' }, frequency: { mode: 'once' }, priority: 0 },
    builder: { version: 1, projectData: {}, css: '.movcues-widget{padding:10px;max-width:100%}', html: '<section class="movcues-widget"><h2 data-movcues-content="heading">Welcome</h2><div data-movcues-content="body">Edit this message</div><button data-movcues-action-id="primary">Continue</button></section>' },
  };
  let revision = 1; let release: (() => void) | undefined; let saves = 0;
  await page.route('**/public/experience-editor/**', async route => {
    if (route.request().url().endsWith('/exchange')) return route.fulfill({ json: { sessionId:'session',accessToken:'never-export-this-token',expiresAt:new Date(Date.now()+60000).toISOString() } });
    if (route.request().method() === 'PATCH') {
      saves++; const incoming = route.request().postDataJSON();
      if (options.delay && saves === 1) await new Promise<void>(resolve => { release = resolve; });
      if (incoming.revision !== revision) return route.fulfill({status:409,json:{error:'draft_conflict',currentRevision:revision}});
      revision++; return route.fulfill({ json: { version: { id:'version',revision,versionNumber:1,definition:incoming.definition } } });
    }
    return route.fulfill({ json: { experience: {id:'browser-exp',name:'Browser authoring',kind:'widget',widgetType:options.widgetType ?? 'modal',builderMode:'onsite'},version:{id:'version',revision,versionNumber:1,definition} } });
  });
  if (options.width) await page.setViewportSize({width:options.width,height:640});
  await page.evaluate(async () => { const f=(window as any).fixture;f.editor.destroy();document.querySelector("[data-fixture-toolbar]")?.remove();f.controller=new f.Controller(location.origin);await f.controller.start('one-time-launch'); });
  return { release:()=>release?.(), getSaves:()=>saves, advanceRevision:()=>revision++ };
}

test('slow save, newer edits, mode change and repeated close preserve the newest content', async ({page}) => {
  const network=await startController(page,{delay:true});
  const heading=page.locator('[data-movcues-experience] h2');await heading.dblclick();await heading.press('ControlOrMeta+a');await heading.pressSequentially('First change');
  await expect.poll(network.getSaves).toBe(1);await heading.press('ControlOrMeta+a');await heading.pressSequentially('Newer change');
  await page.locator('[data-mode=navigate]').click();await page.locator('[data-close]').click();
  await expect(page.locator('[data-movcues-editor]')).toBeVisible();network.release();
  await expect.poll(network.getSaves).toBe(2);await expect(page.locator('[data-movcues-editor]')).toHaveCount(0);
});

test('conflict preserves a token-free export until explicit reload',async({page})=>{
  const network=await startController(page);network.advanceRevision();
  const heading=page.locator('[data-movcues-experience] h2');await heading.dblclick();await heading.press('ControlOrMeta+a');await heading.pressSequentially('Unsaved conflict text');
  await expect(page.locator('[data-save-state]')).toHaveText('Conflict · reload required');
  await page.locator('[data-export-draft]').click();const data=await page.locator('[data-recovery-export]').inputValue();
  expect(data).toContain('Unsaved conflict text');expect(data).not.toContain('never-export-this-token');
  await page.reload(); // deliberate user decision: this does not silently restore a website-storage draft
  await expect(page.locator('[data-movcues-editor]')).toHaveCount(0);
});

for(const width of [320,360,390])test(`editor controls stay reachable at ${width}px and a shrinking viewport`,async({page})=>{
  await startController(page,{width,widgetType:'toast'});
  const panel=page.locator('[data-movcues-editor] aside');const box=await panel.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
  await page.setViewportSize({width,height:300});await expect(page.locator('[data-close]')).toBeInViewport();await expect(page.locator('[data-minimize]')).toBeInViewport();
  await page.locator('[data-minimize]').click();await expect(panel).toHaveClass(/minimized/);
});

test('anchored authoring survives scroll with the production renderer and sticky header',async({page})=>{
  await startController(page,{widgetType:'anchored_card'});
  await expect(page.locator('[data-movcues-experience] [data-movcues-builder-surface]')).toBeVisible();
  const heading=page.locator('[data-movcues-experience] h2');await heading.dblclick();await heading.press('ControlOrMeta+a');await heading.pressSequentially('Anchored edit');
  await page.mouse.wheel(0,250);await page.mouse.wheel(0,-250);
  await expect(heading).toHaveAttribute('contenteditable','true');await expect(heading).toHaveText('Anchored edit');
});

test('contextual inspector follows block, cell and step selection',async({page})=>{
  await startController(page);const heading=page.locator('[data-movcues-experience] h2');await heading.click();
  await expect(page.locator('[data-composition-inspector]')).toBeVisible();await expect(page.locator('[data-inspector=block]')).toBeVisible();await expect(page.locator('[data-block="heading,text"]')).toBeVisible();
  await page.locator('[data-command=parent]').click();await expect(page.locator('[data-inspector=cell]')).toBeVisible();await expect(page.locator('[data-inspector=block]')).toBeHidden();
  await page.locator('[data-select-step]').click();await expect(page.locator('[data-inspector=step]')).toBeVisible();
});

test('nested cell insertion and one-transaction pointer resize stay within the widget',async({page})=>{
  await startController(page);const heading=page.locator('[data-movcues-experience] h2');await heading.click();await page.locator('[data-command=columns]').click();
  await page.locator('[data-command=add]').click();await page.locator('[data-insert-block=image]').click();await heading.click();
  const handle=page.locator('[data-movcues-resize-handle=row]');await expect(handle).toBeVisible();const box=await handle.boundingBox();await page.mouse.move(box!.x+14,box!.y+14);await page.mouse.down();await page.mouse.move(box!.x+45,box!.y+14,{steps:6});await page.mouse.up();
  const sizing=await page.locator('[data-cell-size]').inputValue();expect(sizing).toBe('flexible');const overflow=await page.locator('[data-movcues-experience] .movcues-widget').evaluate((node:HTMLElement)=>node.scrollWidth-node.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
});

for(const width of [320,360,390])test(`structured rows stack without horizontal overflow at ${width}px`,async({page})=>{
  await startController(page,{width});await page.locator('[data-movcues-experience] h2').click();await page.locator('[data-command=columns]').click();
  const layout=page.locator('[data-movcues-experience] .movcues-widget');const overflow=await layout.evaluate((node:HTMLElement)=>node.scrollWidth-node.clientWidth);expect(overflow).toBeLessThanOrEqual(1);await expect(page.locator('[data-movcues-experience] .movcues-button')).toBeVisible();
});

 test('long content validates before save without truncating the visible text',async({page})=>{
  const body=page.locator('#authoring [data-movcues-content=body]');await body.dblclick();await body.fill('x'.repeat(2001));
  const state=await page.evaluate(()=>{const f=(window as any).fixture;f.editor.flush();return{body:f.content.body,errors:f.editor.getValidation(),html:f.builder.html};});
  expect(state.body.length).toBe(2001);expect(state.errors.join(' ')).toContain('2000');expect(state.html).toContain('x'.repeat(2001));
});
