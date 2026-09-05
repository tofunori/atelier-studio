import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string, options: {runScripts: string}) => {window: Window & typeof globalThis} };
import { describe, it, expect } from 'vitest';
const html = readFileSync('rust/crates/atelier-runtime/src/widget_presentation.html', 'utf8');
const script = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))[1][1];
async function fixture() {
  const dom = new JSDOM('<label for="temp">Température</label><input id="temp" type="range" min="-2" max="4" step="0.1" value="1.5"><input id="opacity" aria-label="Opacité" type="range" value="70"><fieldset disabled><input id="locked" type="range"></fieldset>', { runScripts: 'outside-only' });
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await Promise.resolve();
  return dom;
}
describe('widget numeric controls', () => {
  it('preserves input/change calculation handlers, bounds, step and programmatic restore', async () => {
    const dom = await fixture(); const {document, Event} = dom.window;
    const range = document.querySelector<HTMLInputElement>('#temp')!;
    const number = range.nextElementSibling as HTMLInputElement;
    const calls: string[] = [];
    range.addEventListener('input',()=>calls.push('input:'+range.value));
    range.addEventListener('change',()=>calls.push('change:'+range.value));
    number.value='2.5'; number.dispatchEvent(new Event('input'));
    expect(range.value).toBe('2.5');
    number.value='10'; number.dispatchEvent(new Event('change'));
    expect(range.value).toBe('4');
    expect(calls).toEqual(['input:2.5','input:4','change:4']);
    range.value='-1.2'; expect(number.value).toBe('-1.2');
    expect(number.getAttribute('aria-label')).toBe('Température');
    expect(range.classList.contains('atelier-range-hidden')).toBe(true);
    expect(document.querySelector('#opacity')!.classList.contains('atelier-range-hidden')).toBe(false);
    dom.window.close();
  });
  it('keeps partial numeric edits and forwards only original range events', async () => {
    const dom=await fixture();const {document,Event}=dom.window;
    const range=document.querySelector<HTMLInputElement>('#temp')!;
    range.min='10';range.max='100';range.value='30';
    await new Promise(resolve=>setTimeout(resolve,0));
    const number=range.nextElementSibling as HTMLInputElement;
    const targets: EventTarget[]=[];
    document.addEventListener('input',e=>targets.push(e.target!));
    number.focus();number.value='5';number.dispatchEvent(new Event('input',{bubbles:true}));
    expect(number.value).toBe('5');expect(range.value).toBe('30');expect(targets).toEqual([]);
    number.value='50';number.dispatchEvent(new Event('input',{bubbles:true}));
    expect(number.value).toBe('50');expect(range.value).toBe('50');expect(targets).toEqual([range]);
    dom.window.close();
  });
  it('scrubs by pointer with step snapping and commits once on release', async () => {
    const dom=await fixture();const {document,MouseEvent}=dom.window;
    const range=document.querySelector<HTMLInputElement>('#temp')!;
    const number=range.nextElementSibling as HTMLInputElement;
    number.setPointerCapture=()=>{};
    let commits=0;range.addEventListener('change',()=>commits++);
    number.dispatchEvent(new MouseEvent('pointerdown',{clientX:100,button:0}));
    number.dispatchEvent(new MouseEvent('pointermove',{clientX:140}));
    expect(range.value).toBe('2.5');expect(number.value).toBe('2.5');
    number.dispatchEvent(new MouseEvent('pointermove',{clientX:1000}));
    expect(range.value).toBe('4');
    number.dispatchEvent(new MouseEvent('pointerup'));
    expect(commits).toBe(1);
    dom.window.close();
  });
  it('honors disabled fieldsets and adapts to dynamic ranges and bounds', async () => {
    const dom=await fixture();const {document,Event}=dom.window;
    const locked=document.querySelector<HTMLInputElement>('#locked')!;
    expect((locked.nextElementSibling as HTMLInputElement).disabled).toBe(true);
    const next=document.createElement('input');next.type='range';next.min='0';next.max='1';next.step='any';document.body.append(next);
    await new Promise(resolve=>setTimeout(resolve,0));
    const number=next.nextElementSibling as HTMLInputElement;
    expect(number.className).toBe('atelier-number');
    number.value='.1234';number.dispatchEvent(new Event('input'));expect(next.value).toBe('0.1234');
    next.max='100'; await new Promise(resolve=>setTimeout(resolve,0));
    expect(number.max).toBe('100');expect(next.classList.contains('atelier-range-hidden')).toBe(false);
    next.remove();await new Promise(resolve=>setTimeout(resolve,0));expect(number.isConnected).toBe(false);
    dom.window.close();
  });
});
