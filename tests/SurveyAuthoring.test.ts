import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnsiteCompositionEditor } from '../src/experiences/editor/OnsiteCompositionEditor';
import { duplicateSurveyStep, newSurveyQuestion, newSurveyStep } from '../src/experiences/editor/SurveyEditing';
import { listBlocks, onsiteDocumentFromBuilder, validateOnsiteSurveyDocument } from '../src/experiences/onsite/OnsiteDocument';
import { answersOnSurveyPath, nextSurveyStep, surveyBranchErrors, surveyPath } from '../src/experiences/survey/SurveyLogic';
import { QUESTION_TYPES } from '../src/experiences/survey/SurveyMarkup';
import type { SurveyConfig } from '../src/experiences/types';

describe('Survey cell authoring', () => {
  let root: ShadowRoot, editor: OnsiteCompositionEditor, survey: SurveyConfig;
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; }); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const host = document.createElement('div'); document.body.append(host); root = host.attachShadow({mode:'open'});
    root.innerHTML = '<style data-movcues-builder-style></style><div data-movcues-builder-surface></div>';
    survey = {allowBack:true,showProgress:true,submitLabel:'Send',steps:[newSurveyStep('Send'),newSurveyStep('Send')]};
    const step=survey.steps[0];
    editor=new OnsiteCompositionEditor(root,step.builder!,step.content,'survey',false,{onChange:vi.fn(),onValidation:vi.fn(),onSelectionChange:vi.fn()},{config:survey,step});editor.start();
  });
  afterEach(()=>{editor.destroy();document.body.replaceChildren();vi.unstubAllGlobals();});
  it('inserts all six types, saves references only and restores canonical questions with undo/redo',()=>{
    QUESTION_TYPES.forEach(type=>expect(editor.insertQuestion(type)).toBe(true));
    const step=survey.steps[0];expect(step.questions.map(q=>q.type)).toEqual(QUESTION_TYPES);
    expect(validateOnsiteSurveyDocument(editor.getDocument(),{questions:step.questions})).toEqual([]);
    const final=JSON.stringify(step.questions);editor.undo();expect(step.questions).toHaveLength(5);editor.redo();expect(JSON.stringify(step.questions)).toBe(final);
    expect(listBlocks(editor.getDocument().root).filter(b=>b.type==='question')).toHaveLength(6);
    expect(editor.flush()).toBe(true);expect(root.querySelector<HTMLInputElement>('[data-movcues-question-input]')!.readOnly).toBe(true);expect(step.builder!.html).toContain('data-movcues-question-id');
    expect(JSON.stringify(onsiteDocumentFromBuilder(step.builder))).not.toContain('Your question');
  });
  it('duplicates atomically with fresh IDs and deletes canonical questions and branch rules together',()=>{
    editor.insertQuestion('single_choice');const original=survey.steps[0].questions[0];
    expect(editor.updateBranching({rules:[{questionId:original.id,operator:'equals',value:original.type==='single_choice'?original.options[0].id:'',nextStepId:survey.steps[1].id}]})).toBe(true);
    const block=editor.getSelectedBlock()!;editor.duplicate();const copy=survey.steps[0].questions[1];expect(copy.id).not.toBe(original.id);
    if(copy.type==='single_choice'&&original.type==='single_choice')expect(copy.options.map(o=>o.id)).not.toEqual(original.options.map(o=>o.id));
    expect(listBlocks(editor.getDocument().root).filter(b=>b.type==='question').map(b=>b.id)).toContain(block.id);editor.undo();expect(survey.steps[0].questions).toHaveLength(1);editor.redo();expect(survey.steps[0].questions).toHaveLength(2);
    editor.remove();expect(survey.steps[0].questions).toHaveLength(1);root.querySelector<HTMLElement>('[data-movcues-question-id="'+original.id+'"]')!.click();editor.remove();expect(survey.steps[0].questions).toHaveLength(0);expect(survey.steps[0].branching?.rules).toEqual([]);
    editor.undo();expect(survey.steps[0].questions).toHaveLength(1);expect(survey.steps[0].branching?.rules).toHaveLength(1);
  });
  it('preserves question and option IDs through cosmetic edits and nested layout changes',()=>{
    editor.insertQuestion('multiple_choice');const q=survey.steps[0].questions[0],before=JSON.stringify(q);
    editor.updateBlock({color:'#334455',fontSize:18});editor.updateCell({padding:{top:12,right:12,bottom:12,left:12}});editor.split('row');
    expect(JSON.stringify(survey.steps[0].questions[0])).toBe(before);expect(editor.flush()).toBe(true);
    const cloned=duplicateSurveyStep(survey.steps[0],'Send');expect(cloned.id).not.toBe(survey.steps[0].id);expect(cloned.questions[0].id).not.toBe(q.id);
    expect(validateOnsiteSurveyDocument(onsiteDocumentFromBuilder(cloned.builder)!,{questions:cloned.questions})).toEqual([]);
  });
  it('rejects backward rules, restores rules through undo and removes invalid rules after type changes',()=>{
    editor.insertQuestion('single_choice');const q=editor.getSelectedQuestion()!;
    expect(editor.updateBranching({rules:[{questionId:q.id,operator:'answered',nextStepId:survey.steps[0].id}]})).toBe(false);
    expect(editor.updateBranching({rules:[{questionId:q.id,operator:'equals',value:q.type==='single_choice'?q.options[0].id:'',nextStepId:'submit'}]})).toBe(true);
    editor.undo();expect(survey.steps[0].branching).toBeUndefined();editor.redo();expect(survey.steps[0].branching?.rules).toHaveLength(1);
    editor.updateQuestion({...newSurveyQuestion('rating'),id:q.id});expect(survey.steps[0].branching?.rules).toEqual([]);
  });
});

describe('Survey permitted path',()=>{
  const config=():SurveyConfig=>({allowBack:true,showProgress:true,submitLabel:'Send',steps:[
    {id:'first',content:{heading:'First',body:''},questions:[{id:'choice',type:'single_choice',label:'Choose',required:true,options:[{id:'skip',label:'Skip'},{id:'full',label:'Full'}]}],branching:{rules:[{questionId:'choice',operator:'equals',value:'skip',nextStepId:'last'}]}},
    {id:'middle',content:{heading:'Middle',body:''},questions:[{id:'required',type:'short_text',label:'Required',required:true}]},
    {id:'last',content:{heading:'Last',body:''},questions:[]}
  ]});
  it('derives forward paths and prunes stale skipped answers',()=>{const c=config();expect(surveyBranchErrors(c)).toEqual([]);expect(surveyPath(c,{choice:'skip'})).toEqual([0,2]);expect(surveyPath(c,{choice:'full'})).toEqual([0,1,2]);expect(answersOnSurveyPath(c,{choice:'skip',required:'stale'})).toEqual({choice:'skip'});});
  it.each(['includes','gte','lte','not_equals','answered'] as const)('supports typed %s conditions',operator=>{const c=config();c.steps[0].questions=[operator==='includes'?{id:'q',type:'multiple_choice',label:'Q',options:[{id:'a',label:'A'}]}:{id:'q',type:'rating',label:'Q',min:1,max:5}];const value=operator==='includes'?'a':3;c.steps[0].branching={rules:[{questionId:'q',operator,...(operator==='answered'?{}:{value}),nextStepId:'submit'}]};expect(surveyBranchErrors(c)).toEqual([]);expect(nextSurveyStep(c,0,{q:operator==='includes'?['a']:operator==='not_equals'?4:3})).toBeNull();});
  it('rejects backward, foreign question and invalid option rules',()=>{const c=config();c.steps[0].branching!.rules[0].nextStepId='first';expect(surveyBranchErrors(c).length).toBeGreaterThan(0);c.steps[0].branching!.rules[0].nextStepId='last';c.steps[0].branching!.rules[0].value='missing';expect(surveyBranchErrors(c).length).toBeGreaterThan(0);});
});
