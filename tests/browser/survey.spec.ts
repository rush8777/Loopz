import {test,expect} from '@playwright/test';
for(const legacy of [false,true])test(`${legacy?'GrapesJS-compatible':'version 3 cell'} Survey: all question controls, validation, failure retention and retry`,async({page})=>{
 await page.goto(`/tests/browser/survey.html${legacy?'?legacy':''}`);
 const question=(id:string)=>page.locator(`[data-movcues-question-id="${id}"]`),submit=page.locator('[data-movcues-survey-action=submit]');
 await submit.click();await expect(page.getByRole('alert')).toContainText('required');
 const option=question('q_single').getByRole('button',{name:'A',exact:true});const initial=await option.evaluate(node=>getComputedStyle(node).backgroundColor);await option.press('Enter');expect(await option.evaluate(node=>getComputedStyle(node).backgroundColor)).not.toBe(initial);await question('q_multiple').getByRole('button',{name:'D',exact:true}).click();
 const short=question('q_short').locator('input');await short.fill('Typed answer');await short.selectText();await expect(short).toBeFocused();await short.press('End');await short.pressSequentially('!');await expect(short).toHaveValue('Typed answer!');
 await question('q_long').locator('textarea').fill('Long answer');await question('q_rating').getByRole('button',{name:'4',exact:true}).click();await question('q_nps').getByRole('button',{name:'9',exact:true}).click();
 await submit.dblclick();await expect(page.getByRole('alert')).toContainText("Couldn't save");expect(await page.evaluate(()=>(window as any).surveyFixture.attempts)).toBe(1);await expect(short).toHaveValue('Typed answer!');
 await page.evaluate(()=>(window as any).surveyFixture.fail=false);await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(submit).toBeDisabled();await expect.poll(()=>page.evaluate(()=>(window as any).surveyFixture.submitted.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).surveyFixture.submitted[0])).toEqual({q_single:'option_a',q_multiple:['option_d'],q_short:'Typed answer!',q_long:'Long answer',q_rating:4,q_nps:9});
 await expect(question('q_short').locator('input')).toHaveAttribute('aria-required','true');
});
