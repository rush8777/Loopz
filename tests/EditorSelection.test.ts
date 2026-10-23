import { afterEach, describe, expect, it, vi } from 'vitest';
import { editorRange, setEditorRange } from '../src/experiences/editor/EditorSelection';
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
describe('native shadow selection boundaries', () => {
  it('uses composed text boundaries when the ordinary range is rescoped to a host', () => {
    const host=document.createElement('div'); document.body.append(host); const root=host.attachShadow({mode:'open'}); root.innerHTML='<p>Welcome</p>'; const text=root.querySelector('p')!.firstChild!;
    const ordinary=document.createRange(); ordinary.selectNode(host);
    const getComposedRanges=vi.fn(() => [{startContainer:text,startOffset:0,endContainer:text,endOffset:3}]);
    Object.defineProperty(root,'getSelection',{value:()=>({rangeCount:0,getRangeAt:()=>ordinary,getComposedRanges})});
    expect(editorRange(root)?.toString()).toBe('Wel'); expect(getComposedRanges).toHaveBeenCalledWith({shadowRoots:[root]});
  });
  it('falls back to the existing range when the browser lacks composed selection', () => {
    const host=document.createElement('div'); document.body.append(host); const root=host.attachShadow({mode:'open'});root.innerHTML='<p>Text</p>';const range=document.createRange();range.selectNodeContents(root.querySelector('p')!);
    Object.defineProperty(root,'getSelection',{value:()=>({rangeCount:1,getRangeAt:()=>range})}); expect(editorRange(root)).toBe(range);
  });
  it('sets shadow selection boundaries without relying on addRange', () => {
    const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'open'});root.innerHTML='<p>Text</p>';const text=root.querySelector('p')!.firstChild!;const range=document.createRange();range.setStart(text,0);range.setEnd(text,2);
    const setBaseAndExtent=vi.fn();const addRange=vi.fn();Object.defineProperty(root,'getSelection',{value:()=>({setBaseAndExtent,addRange})});
    setEditorRange(root,range);expect(setBaseAndExtent).toHaveBeenCalledWith(text,0,text,2);expect(addRange).not.toHaveBeenCalled();
  });

});
