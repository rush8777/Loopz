import {test,expect,type Page} from '@playwright/test';
const api='http://127.0.0.1:4310',host='http://127.0.0.1:4179';
const widget=(page:Page)=>page.locator('[data-movcues-experience]');
const saved=(page:Page)=>expect(page.locator('[data-save-state]')).toHaveText('Draft saved');
async function change(page:Page,selector:string,value:string){await page.locator(selector).fill(value);await page.locator(selector).press('Tab');}

test('real on-site Survey authoring → branching → safe preview → reviewed publish → stored response and results',async({page,context,request,browser})=>{
 test.setTimeout(150000);
 const email=`survey-${Date.now()}@example.test`,password='correct-horse-battery-staple';
 const account=await(await request.post(`${api}/auth/signup`,{data:{email,password}})).json();const headers={authorization:`Bearer ${account.accessToken}`};
 const setup=await(await request.post(`${api}/auth/onboarding`,{headers,data:{workspaceName:'Survey QA',siteName:'Isolated host',domain:host}})).json();await request.post(`${api}/auth/onboarding/skip`,{headers});
 const endpoint=`${api}/orgs/${setup.organization.id}/sites/${setup.site.id}/experiences`,hostUrl=`${host}/tests/integration/host.html?site=${setup.site.siteId}`;
 await page.goto('/login');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/analytics$/);
 await page.goto('/experiences/surveys');await page.getByRole('button',{name:'Create survey',exact:true}).first().click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Name',{exact:true}).fill('Phase 9 Survey');await dialog.getByRole('button',{name:/On-site Visual Builder/}).click();await dialog.getByLabel('Page URL').fill(hostUrl);
 const popup=context.waitForEvent('page');await dialog.getByRole('button',{name:'Create & open on site',exact:true}).click();const editor=await popup;editor.on('pageerror',error=>console.log('EDITOR ERROR',error.message));editor.on('response',async r=>{if(r.status()>=400)console.log('EDITOR HTTP',r.status(),await r.text());});await expect(editor.locator('[data-editor-toolbar]')).toBeVisible();
 const id=page.url().match(/experiences\/([^/]+)\/edit/)![1];
 await widget(editor).locator('[data-movcues-question-id]').first().click();await editor.locator('[data-survey-question-type]').selectOption('single_choice');await change(editor,'[data-survey-question-label]','Choose your path');
 // Existing nested cells, with the canonical question outside the layout document.
 await editor.locator('[data-command=columns]').click();await editor.locator('[data-movcues-empty-cell]').click();await editor.locator('[data-insert-question=short_text]').click();await change(editor,'[data-survey-question-label]','Optional note');
 await editor.locator('[data-step="1"]').click();await widget(editor).locator('h2').click();await editor.locator('[data-command=add]').click();await editor.locator('[data-insert-question=short_text]').click();await change(editor,'[data-survey-question-label]','Required on the full path');await editor.locator('[data-survey-question-required]').check();
 await editor.locator('[data-survey-add-step]').click();await editor.locator('[data-select-step]').click();await change(editor,'[data-survey-step-heading]','Final feedback');
 await widget(editor).locator('h2').click();await editor.locator('[data-command=add]').click();await editor.locator('[data-insert-question=short_text]').click();await change(editor,'[data-survey-question-label]','Final answer');await editor.locator('[data-survey-question-required]').check();
 await editor.locator('[data-step="0"]').click();await editor.locator('[data-select-step]').click();await editor.locator('[data-survey-branch-section] summary').click();await editor.locator('[data-survey-add-rule]').click();
 const finalId=(await editor.locator('[data-rule-next] option').nth(1).getAttribute('value'))!;
 await editor.locator('[data-rule-next]').selectOption(finalId);await saved(editor);
 const persisted=await(await request.get(`${endpoint}/${id}`,{headers})).json(),definition=persisted.draftVersion.definition,survey=definition.survey;
 expect(survey.steps).toHaveLength(3);expect(survey.steps.every((s:any)=>s.builder.projectData.movcues.onsiteDocument.schemaVersion===3)).toBe(true);
 const choice=survey.steps[0].questions[0],final=survey.steps[2].questions[0];expect(survey.steps[0].branching.rules[0].nextStepId).toBe(finalId);
 const before=await(await request.get(`${api}/__test__/analytics/${id}`)).json();expect(before.responses).toHaveLength(0);
 await editor.reload();await expect(editor.locator('[data-step]')).toHaveCount(3);await editor.locator('[data-mode=preview]').click();
 await widget(editor).locator(`[data-movcues-option-id="${choice.options[0].id}"]`).click();await widget(editor).locator('[data-movcues-survey-action=next]').click();await expect(widget(editor).locator('h2')).toHaveText('Final feedback');
 await widget(editor).locator('[data-movcues-question-input]').fill('Preview only');await widget(editor).locator('[data-movcues-survey-action=submit]').click();await expect(editor.locator('[data-preview-limit]')).toContainText('Preview complete');
 expect(await(await request.get(`${api}/__test__/analytics/${id}`)).json()).toEqual(before);
 await editor.setViewportSize({width:360,height:780});await editor.locator('[data-mode=design]').click();await expect(editor.locator('[data-survey-add-step]')).toBeInViewport();await editor.setViewportSize({width:1280,height:900});await editor.locator('[data-close]').click();
 await page.reload();await page.getByRole('button',{name:'Review & publish',exact:true}).click();for(let i=0;i<5;i++)await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('checkbox',{name:/I intend to show/}).check();await page.getByRole('button',{name:'Publish now',exact:true}).click();await expect(page.getByRole('heading',{name:'Published',exact:true})).toBeVisible();
 const vc=await browser.newContext(),visitor=await vc.newPage();await visitor.goto(hostUrl);await expect(widget(visitor)).toBeVisible();await widget(visitor).locator(`[data-movcues-option-id="${choice.options[0].id}"]`).click();await widget(visitor).locator('[data-movcues-survey-action=next]').click();await expect(widget(visitor).locator('h2')).toHaveText('Final feedback');
 await visitor.reload();await expect(widget(visitor).locator('h2')).toHaveText('Final feedback');await widget(visitor).locator('[data-movcues-question-input]').fill('Real feedback');await widget(visitor).locator('[data-movcues-survey-action=submit]').dblclick();await expect(widget(visitor)).toHaveCount(0);
 await expect.poll(async()=>{const a=await(await request.get(`${api}/__test__/analytics/${id}`)).json();return a.responses.filter((r:any)=>r.submittedAt).length;}).toBe(1);
 const state=await(await request.get(`${api}/__test__/analytics/${id}`)).json();expect(state.responses).toHaveLength(1);expect(state.responses[0].answers).toEqual({[choice.id]:choice.options[0].id,[final.id]:'Real feedback'});expect(state.events.filter((e:any)=>e.eventType==='survey_submitted')).toHaveLength(1);expect(state.events.filter((e:any)=>e.eventType==='survey_started')).toHaveLength(1);
 await page.goto(`/experiences/${id}/results/responses`);await page.getByRole('button',{name:/View response from/}).first().click();await expect(page.getByText('Real feedback',{exact:true}).first()).toBeVisible();await vc.close();
});
