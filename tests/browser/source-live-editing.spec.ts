import { test, expect } from "@playwright/test";
import fixture from "../fixtures/source-editability.json" with { type: "json" };

test("AI redesign → live edits → save/reopen → second AI redesign retains live editing and history", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/tests/browser/fixture.html"); await page.waitForFunction(() => Boolean((window as any).fixture));
  let definition = await page.evaluate(() => {
    const f = (window as any).fixture, builder = { version: 1, html: "", css: "", projectData: {} };
    const compiled = f.applyOnsiteDocument(builder, f.createOnsiteDocument(), "modal");
    return { builder, content: compiled.content, design: { width: "md", theme: { background: "#fff", foreground: "#111827", primary: "#2563eb", borderRadius: "md" } }, behavior: { dismissible: true }, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 } };
  });
  let revision = 1, saves = 0, turn = 0;
  let latestSource: { html: string; css: string } | undefined;
  await page.route("**/public/experience-editor/**", async route => {
    if (route.request().url().endsWith("/exchange")) return route.fulfill({ json: { sessionId: "source_session", accessToken: "test_token", expiresAt: new Date(Date.now() + 600_000).toISOString() } });
    if (route.request().url().endsWith("/ai/chat")) {
      const body = route.request().postDataJSON(); latestSource = body.context.source; turn++;
      const find = (cell: any, type: string): any => cell.block?.type === type ? cell.block : cell.children?.map((child: any) => find(child, type)).find(Boolean);
      const heading = find(body.context.document.root, "heading"), text = find(body.context.document.root, "text");
      const html = turn === 1 ? fixture.html.replaceAll("title_block", heading.id).replaceAll("body_block", text.id) : body.context.source.html.replace("Manual welcome", "AI refined welcome");
      return route.fulfill({ json: { conversationId: "source_conversation", revision: body.revision, markdown: "Redesign ready", proposal: { summary: "A full source design", operations: [{ type: "replace_markup", html, css: turn === 1 ? fixture.css : body.context.source.css, actionBindings: turn === 1 ? fixture.actionBindings : body.context.source.actionBindings }] } } });
    }
    if (route.request().method() === "PATCH") { definition = route.request().postDataJSON().definition; revision++; saves++; return route.fulfill({ json: { version: { id: "source_version", revision, versionNumber: 1, definition } } }); }
    return route.fulfill({ json: { experience: { id: "source_exp", name: "Source workflow", kind: "widget", widgetType: "modal", builderMode: "onsite" }, version: { id: "source_version", revision, versionNumber: 1, definition } } });
  });
  const start = async () => page.evaluate(async () => { const f = (window as any).fixture; f.editor.destroy(); document.querySelector("[data-fixture-toolbar]")?.remove(); f.controller?.destroy(); f.controller = new f.Controller(location.origin); await f.controller.start("source_launch"); });
  const editor = page.locator("[data-movcues-editor]");
  const widget = page.locator('[data-movcues-experience="source_exp"]');
  const requestAi = async (prompt: string, preview = false) => {
    await editor.locator('[data-inspector-tab="ai"]').click(); await editor.locator("[data-ai-prompt]").fill(prompt); await editor.locator("[data-ai-send]").click();
    await expect(editor.locator("[data-ai-proposal]")).toBeVisible();
    if (preview) { await editor.locator("[data-ai-preview]").click(); await expect(editor.locator('[data-mode="preview"]')).toHaveClass(/active/); }
    await editor.locator("[data-ai-apply]").click(); await expect(editor.locator('[data-mode="design"]')).toHaveClass(/active/);
    await editor.locator('[data-inspector-tab="properties"]').click();
  };
  await start();
  await widget.locator("h2").dblclick(); await widget.locator("h2").press("ControlOrMeta+a"); await widget.locator("h2").pressSequentially("Before AI");
  await requestAi("Create a richer onboarding modal", true);
  await expect(widget.locator(".hero-title")).toBeVisible();
  await widget.locator(".hero-title").dblclick(); await widget.locator(".hero-title").press("ControlOrMeta+a"); await widget.locator(".hero-title").pressSequentially("Manual welcome");
  await widget.locator(".hero-title").press("Enter"); await widget.locator(".hero-title").pressSequentially("Second line"); await expect(widget.locator(".hero-title br")).toHaveCount(1);
  await editor.locator("[data-block-font-size]").fill("40"); await editor.locator("[data-block-font-size]").dispatchEvent("change");
  await expect(widget.locator(".hero-title")).toHaveCSS("font-size", "40px");
  await widget.locator('[data-command="parent"]').click();
  await editor.locator("[data-cell-size]").selectOption("fixed"); await editor.locator("[data-cell-fixed]").fill("350"); await editor.locator("[data-cell-fixed]").dispatchEvent("change");
  await expect(widget.locator(".hero")).toHaveCSS("width", "350px");
  await widget.locator(".hero-title").click(); await widget.locator('[data-command="move-down"]').click();
  await widget.locator('[data-command="add"]').click(); await widget.locator('[data-insert-block="image"]').click();
  await editor.locator("[data-v2-image-src]").fill("https://example.com/welcome.png"); await editor.locator("[data-v2-image-src]").dispatchEvent("change");
  await expect(widget.locator("img")).toHaveAttribute("src", "https://example.com/welcome.png");
  await expect.poll(() => definition.builder.html).toContain("welcome.png");
  await expect.poll(() => saves).toBeGreaterThan(0);
  await start(); await widget.locator(".hero-title").click();
  await expect(editor.locator("[data-block-font-size]")).toHaveValue("40"); await expect(widget.locator("img")).toHaveAttribute("src", "https://example.com/welcome.png");
  await requestAi("Refine the welcome copy");
  expect(latestSource?.html).toContain("Manual welcome"); expect(latestSource?.css).toContain("40px");
  await expect(widget.locator(".hero-title")).toContainText("AI refined welcome");
  await widget.locator(".hero-title").click(); await editor.locator("[data-block-font-size]").fill("44"); await editor.locator("[data-block-font-size]").dispatchEvent("change");
  await expect(widget.locator(".hero-title")).toHaveCSS("font-size", "44px");
  await editor.locator("[data-global-undo]").click(); await expect(widget.locator(".hero-title")).toHaveCSS("font-size", "40px");
  await editor.locator("[data-global-undo]").click(); await expect(widget.locator(".hero-title")).toContainText("Manual welcome");
  await editor.locator("[data-global-redo]").click(); await expect(widget.locator(".hero-title")).toContainText("AI refined welcome");
  expect(definition.builder.projectData.movcues.authoringSurface).toBe("source");
});
