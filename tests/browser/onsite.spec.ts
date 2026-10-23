import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";

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

async function startController(page: import('@playwright/test').Page, options: { width?: number; widgetType?: string; delay?: boolean; guide?: boolean; missing?: boolean; failSave?: boolean } = {}) {
  const definition = {
    content: { heading: 'Welcome', body: 'Edit this message', primaryAction: { label: 'Continue', type: 'dismiss' } },
    design: { width: 'md', theme: { background: '#fff', foreground: '#111', primary: '#2563eb', borderRadius: 'md' } },
    behavior: { dismissible: true, autoDismissMs: 500, placement: 'bottom', alignment: 'center', offset: 8 },
    target: { primarySelector: '#anchor', fallbackSelectors: [], reliability: 'reliable' },
    targeting: { pageRules: [], audience: { type: 'all' }, trigger: { type: 'page_load' }, frequency: { mode: 'once' }, priority: 0 },
    builder: { version: 1, projectData: {}, css: '.movcues-widget{padding:10px;max-width:100%}', html: '<section class="movcues-widget"><h2 data-movcues-content="heading">Welcome</h2><div data-movcues-content="body">Edit this message</div><button data-movcues-action-id="primary">Continue</button></section>' },
  };
  if (options.missing) definition.target.primarySelector = '#delayed-anchor';
  let savedDefinition: any = options.guide ? { design: definition.design, targeting: definition.targeting, steps: [
    { id: 'first', pattern: 'modal', label: 'First', content: { ...definition.content, primaryAction: { label: 'Continue', type: 'next_step' } }, builder: definition.builder, behavior: { dismissible: true }, advance: { type: 'button' } },
    { id: 'second', pattern: 'modal', label: 'Second', content: { ...definition.content, heading: 'Second', primaryAction: { label: 'Continue', type: 'next_step' } }, builder: { ...definition.builder, html: definition.builder.html.replace('Welcome</h2>', 'Second</h2>') }, behavior: { dismissible: true }, advance: { type: 'button' } },
  ] } : definition;
  let revision = 1; let release: (() => void) | undefined; let saves = 0;
  await page.route('**/public/experience-editor/**', async route => {
    if (route.request().url().endsWith('/exchange')) return route.fulfill({ json: { sessionId:'session',accessToken:'never-export-this-token',expiresAt:new Date(Date.now()+60000).toISOString() } });
    if (route.request().method() === 'PATCH') {
      saves++; const incoming = route.request().postDataJSON();
      if (options.failSave && saves === 1) return route.fulfill({status:503,json:{error:'temporarily_unavailable'}});
      if (options.delay && saves === 1) await new Promise<void>(resolve => { release = resolve; });
      if (incoming.revision !== revision) return route.fulfill({status:409,json:{error:'draft_conflict',currentRevision:revision}});
      savedDefinition = incoming.definition; revision++; return route.fulfill({ json: { version: { id:'version',revision,versionNumber:1,definition:incoming.definition } } });
    }
    return route.fulfill({ json: { experience: {id:'browser-exp',name:'Browser authoring',kind:options.guide ? 'guide' : 'widget',widgetType:options.guide ? null : options.widgetType ?? 'modal',builderMode:'onsite'},version:{id:'version',revision,versionNumber:1,definition:savedDefinition} } });
  });
  if (options.width) await page.setViewportSize({width:options.width,height:640});
  await page.evaluate(async () => { const f=(window as any).fixture;f.editor.destroy();document.querySelector("[data-fixture-toolbar]")?.remove();f.controller=new f.Controller(location.origin);await f.controller.start('one-time-launch'); });
  return { release:()=>release?.(), getSaves:()=>saves, advanceRevision:()=>revision++ };
}

test('slow save, newer edits, mode change and repeated close preserve the newest content', async ({page}) => {
  const network=await startController(page,{delay:true});
  expect(await page.locator("[data-movcues-experience]").evaluate(node => document.body.contains(node))).toBe(true);
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
  await expect(page.locator('[data-editor-toolbar]')).toHaveCount(0);
  await expect(page.locator('[data-movcues-editor]:not([data-fixture-toolbar])')).toHaveCount(0);
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
  await page.locator('[data-backdrop]').check();
  await expect(page.locator('[data-movcues-experience] [data-movcues-target-backdrop]')).toHaveCount(4);
  const spotlight=await page.evaluate(()=>{
    const target=document.querySelector('#anchor')!;const rect=target.getBoundingClientRect();
    const host=document.querySelector<HTMLElement>('[data-movcues-experience]')!;const root=host.shadowRoot!;
    const highlight=root.querySelector<HTMLElement>('[data-movcues-target-highlight]')!;
    const top=root.querySelector<HTMLElement>('[data-movcues-target-backdrop="top"]')!;
    return{target:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},highlight:{left:parseFloat(highlight.style.left),top:parseFloat(highlight.style.top),width:parseFloat(highlight.style.width),height:parseFloat(highlight.style.height)},background:top.style.background,hit:document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)?.id};
  });
  for (const key of ["left", "top", "width", "height"] as const) expect(spotlight.highlight[key]).toBeCloseTo(spotlight.target[key], 3);expect(spotlight.background).toContain('0.45');expect(spotlight.hit).toBe('anchor');
  const lockedScrollY=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,250);await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(lockedScrollY);
  await page.locator('[data-backdrop]').uncheck();await expect(page.locator('[data-movcues-experience] [data-movcues-target-backdrop]')).toHaveCount(0);
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

test('insertion controls cannot intercept double-clicks on overflowing heading text', async ({ page }) => {
  await startController(page);
  const heading = page.locator('[data-movcues-experience] h2');
  await expect(page.locator('[data-movcues-composition-toolbar]')).toHaveCount(1);
  await heading.evaluate(element => {
    const cell = element.closest<HTMLElement>('[data-movcues-node-id]')!;
    cell.style.flex = '0 0 14px'; cell.style.height = '14px'; cell.style.minHeight = '0';
  });
  await heading.click();
  const text = await heading.boundingBox();
  const below = page.locator('[data-movcues-insert-edge=bottom]');
  await expect.poll(async () => (await below.boundingBox())!.y).toBeGreaterThanOrEqual(text!.y + text!.height);
  await heading.dblclick();
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  await heading.press('ControlOrMeta+a'); await heading.pressSequentially('Still editing text');
  await expect(heading).toHaveText('Still editing text');
  await expect(page.locator('[data-movcues-block-palette]')).toBeHidden();
});

test('adding from a selected block inserts a new block instead of replacing it',async({page})=>{
  await startController(page);const heading=page.locator('[data-movcues-experience] h2');await heading.click();
  await page.locator('[data-command=add]').click();await page.locator('[data-insert-block=image]').click();
  await expect(page.locator('[data-movcues-experience] h2')).toHaveCount(1);await expect(page.locator('[data-movcues-image-placeholder]')).toHaveCount(1);
});

async function insertEmptyImage(page: import('@playwright/test').Page) {
  await page.locator('[data-movcues-experience] h2').click();
  await page.locator('[data-movcues-insert-edge=left]').click(); await page.locator('[data-insert-block=image]').click();
  return page.locator('[data-movcues-image-placeholder]');
}

async function localPng(page: import('@playwright/test').Page) {
  return page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 240; const context = canvas.getContext('2d')!; context.fillStyle = '#2563eb'; context.fillRect(0, 0, 400, 240); return canvas.toDataURL('image/png'); });
}

test('image placeholder opens a file picker and the image persists through undo, reload and preview', async ({ page }) => {
  await startController(page); const placeholder = await insertEmptyImage(page); await expect(placeholder).toContainText('Drop an image or click to browse');
  expect((await placeholder.boundingBox())!.height).toBeGreaterThanOrEqual(100);
  await page.screenshot({ path: test.info().outputPath('image-placeholder.png') });
  await page.locator('[data-v2-image-alt]').fill('Feature preview'); await page.locator('[data-v2-image-alt]').press('Tab');
  const png = await localPng(page); const picker = page.waitForEvent('filechooser'); await placeholder.click();
  await (await picker).setFiles({ name: 'preview.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  const image = page.locator('[data-movcues-experience] img'); await expect(image).toBeVisible();
  const src = await image.getAttribute('src'); expect(src).toMatch(/^data:image\/webp;base64,/); expect(src!.length).toBeLessThanOrEqual(65536);
  await expect(image).toHaveAttribute('alt', 'Feature preview'); await expect(placeholder).toHaveCount(0);
  await expect(page.locator('[data-v2-image-src]')).toHaveValue(''); await expect(page.locator('[data-choose-image]')).toHaveText('Replace image');
  await page.locator('[data-global-undo]').click(); await expect(placeholder).toBeVisible();
  await page.locator('[data-global-redo]').click(); await expect(image).toHaveAttribute('src', src!);
  await expect(page.locator('[data-save-state]')).toHaveText('Draft saved');
  await page.evaluate(async () => { const f = (window as any).fixture; f.controller.destroy(); f.controller = new f.Controller(location.origin); await f.controller.start('reload-image'); });
  await expect(image).toHaveAttribute('src', src!); await expect(image).toHaveAttribute('alt', 'Feature preview');
  await page.locator('[data-mode=preview]').click(); await expect(image).toHaveAttribute('src', src!);
  await expect(page.locator('[data-movcues-image-placeholder],[data-movcues-image-file]')).toHaveCount(0);
});

test('dropping a local image onto the placeholder imports it and rejects unsupported files safely', async ({ page }) => {
  await startController(page); const placeholder = await insertEmptyImage(page);
  await placeholder.evaluate(node => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['bad'], 'document.txt', { type: 'text/plain' }));
    node.dispatchEvent(new DragEvent('drop', { bubbles: true, composed: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.locator('[data-content-error]')).toContainText('PNG, JPG or WebP'); await expect(placeholder).toBeVisible();
  const png = await localPng(page);
  await placeholder.evaluate((node, source) => {
    const bytes = Uint8Array.from(atob(source.split(',')[1]), char => char.charCodeAt(0)); const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    node.dispatchEvent(new DragEvent('dragover', { bubbles: true, composed: true, cancelable: true, dataTransfer: transfer }));
    if (!node.hasAttribute('data-movcues-image-drop')) throw new Error('Missing drop feedback');
    node.dispatchEvent(new DragEvent('drop', { bubbles: true, composed: true, cancelable: true, dataTransfer: transfer }));
  }, png);
  const image = page.locator('[data-movcues-experience] img'); await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^data:image\/webp;base64,/); await expect(page.locator('[data-content-error]')).toBeHidden();
});

test('edge insertion makes a local column, resizes, undoes and reloads the same layout', async ({ page }) => {
  const network = await startController(page); const widget = page.locator('[data-movcues-experience] .movcues-widget');
  await widget.locator('h2').click();
  await expect(page.locator('[data-movcues-insert-edge]')).toHaveCount(4);
  await page.getByRole('button', { name: 'Add to the left', exact: true }).click();
  await page.locator('[data-insert-block=text]').click();
  const headingCell = widget.locator('h2').locator('..');
  const row = headingCell.locator('..');
  await expect(row).toHaveCSS('flex-direction', 'row');
  await expect(row.locator(':scope > .movcues-cell')).toHaveCount(2);
  const inserted = row.locator('.movcues-text'); await expect(inserted).toBeVisible();
  const originalBody = widget.getByText('Edit this message', { exact: true });
  const [rowBox, bodyBox] = await Promise.all([row.boundingBox(), originalBody.boundingBox()]);
  expect(bodyBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height);
  await page.screenshot({ path: test.info().outputPath('directional-insertion.png') });
  await page.locator('[data-global-undo]').click(); await expect(widget.locator('.movcues-text')).toHaveCount(1);
  await page.locator('[data-global-redo]').click(); await expect(widget.locator('.movcues-text')).toHaveCount(2);
  const handle = page.locator('[data-movcues-resize-handle=row]'); await handle.focus(); await handle.press('ArrowRight');
  const structure = await row.getAttribute('data-movcues-node-id');
  await expect.poll(network.getSaves).toBeGreaterThan(0); await expect(page.locator('[data-save-state]')).toHaveText('Draft saved');
  await page.evaluate(async () => { const f = (window as any).fixture; f.controller.destroy(); f.controller = new f.Controller(location.origin); await f.controller.start('reload'); });
  await expect(widget.locator(`[data-movcues-node-id="${structure}"]`)).toHaveCSS('flex-direction', 'row');
  await expect(widget.locator('.movcues-text')).toHaveCount(2);
});

test('edge chooser cancels from keyboard and the small toolbar stays outside an interior selection', async ({ page }) => {
  await startController(page); const widget = page.locator('[data-movcues-experience] .movcues-widget'); await widget.locator('h2').click();
  const add = page.getByRole('button', { name: 'Add to the right', exact: true });
  await add.focus(); await add.press('Enter'); await expect(page.locator('[data-movcues-block-palette]')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('[data-movcues-block-palette]')).toBeHidden(); await expect(add).toBeFocused();
  const [bar, box] = await Promise.all([page.locator('[data-movcues-composition-toolbar]').boundingBox(), widget.boundingBox()]);
  expect(bar!.width).toBeLessThanOrEqual(250);
  expect(bar!.y >= box!.y + box!.height || bar!.y + bar!.height <= box!.y || bar!.x >= box!.x + box!.width || bar!.x + bar!.width <= box!.x).toBe(true);
});

for (const width of [320, 360, 390]) test(`directional insertion stays usable at ${width}px`, async ({ page }) => {
  await startController(page, { width }); await page.locator('[data-minimize]').click();
  const widget = page.locator('[data-movcues-experience] .movcues-widget'); await widget.locator('h2').click();
  await page.getByRole('button', { name: 'Add to the right', exact: true }).click(); await page.locator('[data-insert-block=icon]').click();
  await expect(widget.locator('.movcues-icon')).toBeVisible();
  expect(await widget.evaluate((element: HTMLElement) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  const bar = await page.locator('[data-movcues-composition-toolbar]').boundingBox();
  expect(bar!.x).toBeGreaterThanOrEqual(0); expect(bar!.x + bar!.width).toBeLessThanOrEqual(width);
  for (const button of await page.locator('[data-movcues-insert-edge]').all()) await expect(button).toBeInViewport();
});

test('delete removes the selected block immediately and the editor remains interactive',async({page})=>{
  await startController(page);const heading=page.locator('[data-movcues-experience] h2');await heading.click();
  await expect(page.locator('[data-command=delete]')).toBeEnabled();await page.locator('[data-command=delete]').click();
  await expect(heading).toHaveCount(0);const body=page.locator('[data-movcues-experience] [data-movcues-content=body]');await body.click();
  await expect(page.locator('[data-inspector=block]')).toBeVisible();
});

test('structured editor keeps one compact toolbar outside a banner widget and clear of the inspector',async({page})=>{
  await startController(page,{widgetType:'banner'});
  const toolbar=page.locator('[data-movcues-composition-toolbar]');const widget=page.locator('[data-movcues-experience] .movcues-widget');const inspector=page.locator('[data-movcues-editor] aside');
  await expect(toolbar).toBeVisible();await expect(page.locator('[data-movcues-breadcrumb]')).toHaveCount(0);
  const [toolbarBox,widgetBox,inspectorBox]=await Promise.all([toolbar.boundingBox(),widget.boundingBox(),inspector.boundingBox()]);
  expect(toolbarBox!.y).toBeGreaterThanOrEqual(widgetBox!.y+widgetBox!.height-1);
  expect(toolbarBox!.x+toolbarBox!.width).toBeLessThanOrEqual(inspectorBox!.x+1);
});

test('nested cell insertion and one-transaction pointer resize stay within the widget',async({page})=>{
  await startController(page);const heading=page.locator('[data-movcues-experience] h2');await heading.click();await page.locator('[data-command=columns]').click();
  await page.locator('[data-command=add]').click();await page.locator('[data-insert-block=image]').click();await heading.click();
  const handle=page.locator('[data-movcues-resize-handle=row]');await expect(handle).toBeVisible();const box=await handle.boundingBox();await page.mouse.move(box!.x+14,box!.y+14);await page.mouse.down();await page.mouse.move(box!.x+45,box!.y+14,{steps:6});await page.mouse.up();
  const sizing=await page.locator('[data-cell-size]').inputValue();expect(sizing).toBe('flexible');const overflow=await page.locator('[data-movcues-experience] .movcues-widget').evaluate((node:HTMLElement)=>node.scrollWidth-node.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
});

for(const width of [320,360,390])test(`structured rows stack without horizontal overflow at ${width}px`,async({page})=>{
  await startController(page,{width});await page.locator('[data-minimize]').click();await page.locator('[data-movcues-experience] h2').click();await page.locator('[data-command=columns]').click();
  const layout=page.locator('[data-movcues-experience] .movcues-widget');const overflow=await layout.evaluate((node:HTMLElement)=>node.scrollWidth-node.clientWidth);expect(overflow).toBeLessThanOrEqual(1);await expect(page.locator('[data-movcues-experience] .movcues-button')).toBeVisible();
});

 test('long content validates before save without truncating the visible text',async({page})=>{
  const body=page.locator('#authoring [data-movcues-content=body]');await body.dblclick();await body.press('ControlOrMeta+a');await body.pressSequentially('x'.repeat(2001));
  const state=await page.evaluate(()=>{const f=(window as any).fixture;f.editor.flush();return{body:f.content.body,errors:f.editor.getValidation(),html:f.builder.html};});
  expect(state.body.length).toBe(2001);expect(state.errors.join(' ')).toContain('2000');expect(state.html).toContain('x'.repeat(2001));
});

test('structured formatting preserves a partial selection and the live text node', async ({ page }) => {
  await startController(page); const heading = page.locator('[data-movcues-experience] h2'); await heading.dblclick();
  await heading.press('Home'); await heading.press('ControlOrMeta+a'); await heading.press('ArrowLeft');
  await heading.press('Shift+ArrowRight'); await heading.press('Shift+ArrowRight'); await heading.press('Shift+ArrowRight');
  await heading.evaluate(node => { (window as any).originalHeading = node; });
  await page.locator('[data-v2-format=strong]').click(); await expect(heading.locator('strong')).toHaveText('Wel');
  expect(await heading.evaluate(node => node === (window as any).originalHeading)).toBe(true);
  await expect(heading).toBeFocused(); await page.locator('[data-global-undo]').click(); await expect(heading.locator('strong')).toHaveCount(0);
});

test('immediate keyboard undo captures typing before its history debounce', async ({ page }) => {
  await startController(page); const heading = page.locator('[data-movcues-experience] h2'); await heading.dblclick(); await heading.press('ControlOrMeta+a'); await heading.pressSequentially('Immediate change');
  await heading.press('ControlOrMeta+z'); await expect(heading).toHaveText('Welcome'); await page.locator('[data-global-redo]').click(); await expect(heading).toHaveText('Immediate change');
});

test('empty cells, cross-parent drag movement, keyboard movement and persistence preserve IDs', async ({ page }) => {
  await startController(page); const widget = page.locator('[data-movcues-experience] .movcues-widget');
  await widget.locator('h2').click(); const headingId = await widget.locator('h2').getAttribute('data-movcues-block-id');
  await page.locator('[data-command=columns]').click(); const empty = page.locator('[data-movcues-empty-cell]'); await expect(empty).toBeVisible();
  await empty.click(); await page.locator('[data-insert-block=icon]').click();
  const source = widget.locator('h2').locator('..');
  const id = await source.getAttribute('data-movcues-node-id'); const target = widget.locator('[data-movcues-content=body]').locator('..');
  await widget.locator('h2').click(); await page.locator('[data-command=move]').dragTo(target, { targetPosition: { x: 20, y: 20 } });
  await expect(widget.locator(`h2[data-movcues-block-id="${headingId}"]`)).toBeVisible();
  expect(await widget.locator(`h2[data-movcues-block-id="${headingId}"]`).locator('..').getAttribute('data-movcues-node-id')).toBe(id);
  await page.locator('[data-global-undo]').click(); await expect(widget.locator('[data-movcues-content=body]').locator('..').locator('..').locator(':scope > [data-movcues-node-id]')).toHaveCount(3);
  await page.locator('[data-global-redo]').click();
  await page.locator('[data-command=move]').focus(); await page.locator('[data-command=move]').press('Enter');
  for (let index = 0; index < 70; index++) {
    if (await target.evaluate(node => (node.getRootNode() as ShadowRoot).activeElement === node)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused(); await page.keyboard.press('Enter'); await expect(page.locator('[data-command=move]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-save-state]')).toHaveText('Draft saved');
  await page.evaluate(async () => { const f=(window as any).fixture; f.controller.destroy(); f.controller=new f.Controller(location.origin); await f.controller.start('reopen'); });
  await expect(widget.locator(`h2[data-movcues-block-id="${headingId}"]`)).toBeVisible();
});

test('Guide step dock supports add, edit, preview next/back and save/reopen', async ({ page }) => {
  await startController(page, { guide: true });
  await page.locator('[data-select-step]').click(); await page.locator('[data-add-step=modal]').click();
  await expect(page.locator('[data-step]')).toHaveCount(3); await expect(page.locator('[data-step="1"]')).toHaveClass(/active/);
  const heading = page.locator('[data-movcues-experience] h2'); await heading.dblclick(); await heading.press('ControlOrMeta+a'); await heading.pressSequentially('Added step');
  await page.locator('[data-movcues-insert-edge=right]').click(); await page.locator('[data-insert-block=button]').click();
  await page.locator('[data-button-label]').fill('Go back'); await page.locator('[data-button-label]').press('Tab'); await page.locator('[data-button-action]').selectOption('previous_step');
  await page.locator('[data-step="0"]').click(); await expect(heading).toHaveText('Welcome');
  await page.locator('[data-mode=preview]').click(); await page.locator('[data-movcues-experience] .movcues-button').click(); await expect(heading).toHaveText('Added step');
  await page.locator('[data-movcues-experience]').getByRole('button', { name: 'Go back', exact: true }).click(); await expect(heading).toHaveText('Welcome');
  await page.locator('[data-mode=design]').click(); await expect(page.locator('[data-save-state]')).toHaveText('Draft saved');
  await page.evaluate(async () => { const f=(window as any).fixture; f.controller.destroy(); f.controller=new f.Controller(location.origin); await f.controller.start('reopen-guide'); });
  await expect(page.locator('[data-step]')).toHaveCount(3); await page.locator('[data-step="1"]').click(); await expect(heading).toHaveText('Added step');
});

test('failed save preserves content, recovers on retry, and saves only the recovered revision', async ({ page }) => {
  const network = await startController(page, { failSave: true }); const heading = page.locator('[data-movcues-experience] h2');
  await heading.dblclick(); await heading.press('ControlOrMeta+a'); await heading.pressSequentially('Recover this');
  await expect(page.locator('[data-save-state]')).toHaveText('Save failed'); await expect(heading).toHaveText('Recover this');
  await page.locator('[data-retry-save]').click(); await expect(page.locator('[data-save-state]')).toHaveText('Draft saved'); expect(network.getSaves()).toBe(2);
});

test('an asynchronously inserted target mounts without a new editor session', async ({ page }) => {
  await startController(page, { widgetType: 'anchored_card', missing: true });
  await expect(page.locator('[data-movcues-experience]')).toHaveCount(0);
  await page.evaluate(() => { const target = document.createElement('button'); target.id = 'delayed-anchor'; target.textContent = 'Dynamic target'; document.body.prepend(target); });
  await expect(page.locator('[data-movcues-experience] h2')).toBeVisible();
  await page.locator('[data-mode=navigate]').click(); await expect(page.locator('[data-movcues-experience]')).toHaveCount(0);
});

test('backdrop restores scroll styles when hidden, dismissed or closed and keeps target and shadow inputs interactive', async ({ page }) => {
  await startController(page, { widgetType: 'anchored_card' });
  await page.evaluate(() => { document.documentElement.style.setProperty('overflow', 'clip'); document.body.style.setProperty('overflow', 'auto', 'important'); (window as any).targetClicks = 0; document.querySelector('#anchor')!.addEventListener('click', () => (window as any).targetClicks++); });
  await page.locator('[data-backdrop]').check(); await page.locator('#anchor').click(); expect(await page.evaluate(() => (window as any).targetClicks)).toBe(1);
  expect(await page.locator('[data-offset]').evaluate(node => { const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true, cancelable: true }); node.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  await page.evaluate(() => { (document.querySelector('#anchor') as HTMLElement).hidden = true; });
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('auto');
  await expect(page.locator('[data-movcues-target-highlight]')).toBeHidden();
  await page.evaluate(() => { (document.querySelector('#anchor') as HTMLElement).hidden = false; });
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.locator('[data-close-backdrop]').check(); await page.locator('[data-mode=preview]').click();
  await page.locator('[data-movcues-target-backdrop=bottom]').click({ position: { x: 10, y: 400 } });
  await expect(page.locator('[data-movcues-target-backdrop]')).toHaveCount(0);
  expect(await page.evaluate(() => [document.documentElement.style.overflow, document.body.style.overflow, document.body.style.getPropertyPriority('overflow')])).toEqual(['clip', 'auto', 'important']);
  await page.locator('[data-close]').click(); await expect(page.locator('[data-editor-toolbar]')).toHaveCount(0);
});

test('compiled visitor content dispatches independent button actions once without authoring controls', async ({ page }) => {
  await page.evaluate(() => {
    const f = (window as any).fixture; f.editor.destroy(); document.querySelector('[data-fixture-toolbar]')?.remove();
    const doc = f.createOnsiteDocument(true); const buttons = f.listBlocks(doc.root).filter((block: any) => block.type === 'button'); buttons[0].label = 'Next step';
    const tracked = f.createBlock('button', true); tracked.label = 'Track it'; tracked.action = { id: tracked.action.id, type: 'track_event', eventName: 'feature_clicked' }; doc.root.children.push(f.emptyCell(tracked));
    const dismiss = f.createBlock('button', true); dismiss.label = 'Dismiss it'; dismiss.action = { id: dismiss.action.id, type: 'dismiss' }; doc.root.children.push(f.emptyCell(dismiss));
    const builder = { version: 1, projectData: {}, html: '', css: '' }; const compiled = f.applyOnsiteDocument(builder, doc, 'modal');
    f.runtime = new f.ExperienceRenderer(); f.actions = []; f.advances = 0;
    f.runtime.render({ id: 'published-fixture', versionId: 'published-version', kind: 'guide', widgetType: null, priority: 0, definition: { steps: [{ id: 'one', pattern: 'modal', content: compiled.content, builder, behavior: { dismissible: true }, advance: { type: 'button' } }], design: { width: 'md', theme: { background: '#fff', foreground: '#111', primary: '#2563eb', borderRadius: 'md' } }, targeting: {} } }, { onVisible() {}, onDismiss() {}, onComplete() {}, onAction(action: any) { f.actions.push(action); }, onGuideAdvance() { f.advances++; } });
  });
  const runtime = page.locator('[data-movcues-experience=published-fixture]');
  await runtime.getByRole('button', { name: 'Track it', exact: true }).click(); await runtime.getByRole('button', { name: 'Next step', exact: true }).click();
  expect(await page.evaluate(() => { const f=(window as any).fixture; return { actions: f.actions.map((a: any) => a.type), advances: f.advances }; })).toEqual({ actions: ['track_event', 'next_step'], advances: 1 });
  await expect(page.locator('[data-movcues-composition-toolbar],[data-movcues-insert-edge],[data-editor-toolbar]')).toHaveCount(0);
  await runtime.getByRole('button', { name: 'Dismiss it', exact: true }).click(); await expect(runtime).toHaveCount(0);
});

for (const width of [320, 360, 390]) test(`floating controls and Guide dock remain usable without inspector overlap at ${width}px`, async ({ page }) => {
  await startController(page, { width, guide: true });
  const widget = page.locator('[data-movcues-experience] .movcues-widget'); await widget.locator('h2').click();
  const toolbar = page.locator('[data-movcues-composition-toolbar]'); const inspector = page.locator('[data-movcues-editor] aside');
  const a = (await toolbar.boundingBox())!; const b = (await inspector.boundingBox())!;
  expect(a.x).toBeGreaterThanOrEqual(0); expect(a.x+a.width).toBeLessThanOrEqual(width);
  expect(a.y+a.height <= b.y || a.y >= b.y+b.height || a.x+a.width <= b.x || a.x >= b.x+b.width).toBe(true);
  await page.locator('[data-movcues-insert-edge=left]').click(); await expect(page.locator('[data-insert-block=icon]')).toBeInViewport();
  await page.locator('[data-insert-block=icon]').click(); await expect(widget.locator('.movcues-icon')).toBeVisible();
  await expect(page.locator('[data-step="1"]')).toBeInViewport();
  await page.locator('[data-step="1"]').click(); await expect(widget.locator('h2')).toHaveText('Second');
  if (width === 320) await page.screenshot({ path: test.info().outputPath('mobile-editor.png') });
});

test('a dragged floating toolbar is clamped after the viewport shrinks', async ({ page }) => {
  await startController(page); const header = page.locator('[data-drag-handle] .header-copy'); const rect = (await header.boundingBox())!;
  await page.mouse.move(rect.x+15, rect.y+8); await page.mouse.down(); await page.mouse.move(rect.x+400, rect.y+150, { steps: 8 }); await page.mouse.up();
  await page.setViewportSize({ width: 320, height: 300 }); await expect(page.locator('[data-close]')).toBeInViewport(); await expect(page.locator('[data-minimize]')).toBeInViewport();
});
