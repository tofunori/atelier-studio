import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../../assets/pdf_viewer.html', import.meta.url), 'utf8');
const sharedUI = fs.readFileSync(new URL('../../assets/annotation_ui.bundle.js', import.meta.url), 'utf8');
const menuCode = html.slice(html.indexOf('let annotationEditor = null;'), html.indexOf('// mode Studio :'));
const saveCode = html.slice(html.indexOf('function saveAnnots(){'), html.indexOf('function drawAnnots'));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function menu(saved = true, initialNote = "") {
  const dom = new JSDOM('<div id="annotPop"></div><button id="outside">Outside</button>', {runScripts:'outside-only'});
  const win = dom.window;
  vm.runInContext(sharedUI, dom.getInternalVMContext());
  const writes = [], sends = [];
  Object.assign(win, {
    annotPop: win.document.getElementById('annotPop'), HL_COLORS: ['rgba(255,213,74,.40)'],
    saveAnnots: async () => { writes.push(JSON.parse(JSON.stringify(win.annotation))); return saved; },
    drawAnnots: () => {}, sendAnnot: async a => { sends.push(JSON.parse(JSON.stringify(a))); return true; },
    copyWithCitation: () => {}, annPane: {refresh(){}},
  });
  vm.runInContext(html.slice(html.indexOf('async function removeAnnot(a)'), html.indexOf('/** Envoi au chat')), dom.getInternalVMContext());
  vm.runInContext(menuCode, dom.getInternalVMContext());
  win.annotation = {id:'test',page:3,text:'Selected passage',note:initialNote};
  win.PDF_ANNOTS = [win.annotation];
  win.annotMenu(win.annotation,10,10);
  return {win, writes, sends, root:win.annotPop, close:()=>win.close()};
}

test('validating a multiline note saves and automatically attaches it', async () => {
  const m=menu();
  m.root.querySelector('textarea').value='First thought\nSecond thought';
  m.root.querySelector('.send2').click(); await tick();
  assert.equal(m.writes[0].note,'First thought\nSecond thought');
  assert.equal(m.sends.length,1);
  assert.equal(m.root.style.display,'none');m.close();
});

test('add to chat saves the current draft before sending exact text, page and note', async () => {
  const m=menu();
  m.root.querySelector('textarea').value='Why this threshold?';
  m.root.querySelector('.send2').click();
  assert.equal(m.sends.length,0); await tick();
  assert.deepEqual(m.sends[0],{id:'test',page:3,text:'Selected passage',note:'Why this threshold?'});
  m.close();
});

test('failed persistence keeps the note visible and prevents chat attachment', async () => {
  const m=menu(false);
  m.root.querySelector('textarea').value='Keep this draft';
  m.root.querySelector('.send2').click(); await tick();
  assert.equal(m.sends.length,0);
  assert.equal(m.root.querySelector('textarea').value,'Keep this draft');
  assert.equal(m.root.style.display,'block');
  assert.match(m.root.querySelector('[role=status]').textContent,/Échec/);m.close();
});

test('clicking away attaches the note; Shift+Enter is available for multiline input', async () => {
  const m=menu();
  const input=m.root.querySelector('textarea');input.value='Draft';
  input.dispatchEvent(new m.win.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));
  assert.equal(m.writes.length,0);
  m.win.document.getElementById('outside').click();await tick();
  assert.equal(m.writes[0].note,'Draft');assert.equal(m.sends.length,1);m.close();
});

test('annotation writes are serialized snapshots, HTTP errors are not success', async () => {
  const calls=[];let release;
  const context=vm.createContext({
    ANNOTS_LOADED:true,ANNOT_SAVE:Promise.resolve(true),PDF_ANNOTS:[{note:'first'}],rel:'paper.pdf',
    annPane:{refresh(){}},document:{getElementById:()=>({textContent:''})},
    fetch:async (_url,init)=>{calls.push(JSON.parse(init.body));if(calls.length===1)await new Promise(r=>{release=r;});return {ok:calls.length===1,status:500,json:async()=>({ok:true})};},
  });
  vm.runInContext(saveCode,context);
  const first=context.saveAnnots();await tick();context.PDF_ANNOTS[0].note='second';
  const second=context.saveAnnots();assert.equal(calls.length,1);release();
  assert.equal(await first,true);assert.equal(await second,false);
  assert.equal(calls[0].annots[0].note,'first');assert.equal(calls[1].annots[0].note,'second');
});

 test('an existing saved note can be explicitly added again, including after a prior failure', async () => {
  const m=menu(true, 'Previously saved');
  m.root.querySelector('.send2').click();await tick();
  assert.equal(m.sends.at(-1).note,'Previously saved');m.close();
 });

test('a comment draws a number and neutral underlines without a colored passage', () => {
 const dom=new JSDOM('<div id="page"></div>',{runScripts:'outside-only'});
 const win=dom.window;
 win.PDF_ANNOTS=[{id:'n1',page:1,kind:'comment',number:7,rects:[[.2,.3,.4,.02]],note:'A question'}];
 let opened=null;win.annotMenu=a=>{opened=a.id;};
 vm.runInContext(html.slice(html.indexOf('function drawAnnots('),html.indexOf('const HL_COLORS =')),dom.getInternalVMContext());
 const page=win.document.getElementById('page');
 page.getBoundingClientRect=()=>({left:0,top:0,width:600,height:1000});win.drawAnnots(page,1);
 assert.equal(page.querySelectorAll('.pdfhl').length,0);
 assert.equal(page.querySelectorAll('.pdfcomment-line').length,1);
 assert.equal(page.querySelector('.pdfcomment-line').style.top,'32%');
 assert.equal(page.querySelector('.pdfcomment-line').style.width,'40%');
 const marker=page.querySelector('.pdfcomment');assert.equal(marker.textContent,'7');
 assert.equal(marker.style.left,'95px');marker.click();assert.equal(opened,'n1');
 win.drawAnnots(page,1);assert.equal(page.querySelectorAll('.pdfcomment').length,1);
 assert.equal(page.querySelectorAll('.pdfcomment-line').length,1);
 win.PDF_ANNOTS.push({...win.PDF_ANNOTS[0],id:'n2',number:8});win.drawAnnots(page,1);
 const markers=[...page.querySelectorAll('.pdfcomment')];
 assert.ok(parseFloat(markers[1].style.top)-parseFloat(markers[0].style.top)>=22);win.close();
});

test('deleting a note persists removal without attaching its draft to chat', async () => {
 const m=menu(true,'Saved note');
 m.root.querySelector('textarea').value='Unsent draft';
 m.root.querySelector('.delete-note').click();await tick();
 assert.equal(m.win.PDF_ANNOTS.length,0);
 assert.equal(m.sends.length,0);
 assert.equal(m.root.style.display,'none');m.close();
});

test('failed deletion restores the annotation and keeps the draft available for retry', async () => {
 const m=menu(false,'Saved note');
 m.root.querySelector('textarea').value='Keep draft';
 m.root.querySelector('.delete-note').click();await tick();
 assert.equal(m.win.PDF_ANNOTS.length,1);
 assert.equal(m.root.querySelector('textarea').value,'Keep draft');
 assert.equal(m.root.querySelector('.delete-note').disabled,false);
 assert.equal(m.root.style.display,'block');
 assert.equal(m.sends.length,0);m.close();
});

test('color selection marks text directly; only Annoter opens the editor', () => {
 const dom=new JSDOM('<div class="pg" data-page="1"><span>Passage</span></div>',{runScripts:'outside-only'});
 const win=dom.window, page=win.document.querySelector('.pg'), span=page.querySelector('span');
 page.getBoundingClientRect=()=>({left:0,top:0,width:600,height:1000});
 const opened=[];
 Object.assign(win,{ANNOTS_LOADED:true,PDF_ANNOTS:[],HL_COLORS:['yellow'],
   selectionModel:()=>({spans:[span],segments:[{index:0,text:'Passage'}]}),
   selectionClientRects:()=>[{span,rect:{left:100,top:200,width:150,height:20}}],
   drawAnnots(){},saveAnnots(){},clearHl(){},selHide(){},annotMenu:a=>opened.push(a.kind)});
 vm.runInContext(html.slice(html.indexOf('function addHighlightFromSel('),html.indexOf('// Barre d\'annotation à la sélection')),dom.getInternalVMContext());
 win.addHighlightFromSel('hl','yellow');
 assert.equal(win.PDF_ANNOTS.length,1);assert.deepEqual(opened,[]);
 win.addHighlightFromSel('comment','yellow');
 assert.deepEqual(opened,['comment']);win.close();
});

test('PDF selection offers Quick Ask and Annoter, with source page and no redundant chat capsule', () => {
 const dom=new JSDOM('<div id="selPill"><textarea></textarea><button id="go">Add to chat</button></div><div id="tgMenu"></div>',{runScripts:'outside-only'});
 const win=dom.window, sent=[];let options, hidden=false;
 vm.runInContext(sharedUI,dom.getInternalVMContext());
 Object.assign(win,{rel:'paper.pdf',selPage:3,hlText:()=> 'Selected passage',
   __atelierPost:payload=>sent.push(payload),SelPill:{attach:opts=>{options=opts;return{hide(){hidden=true;}};}}});
 vm.runInContext(html.slice(html.indexOf('const selPill = document.getElementById'),html.indexOf('function selPillShow(')),dom.getInternalVMContext());
 const go=win.document.getElementById('go');options.embedExtras(go);
 assert.equal(go.style.display,'none');
 const ask=[...win.document.querySelectorAll('button')].find(button=>button.textContent.includes('Quick Ask'));
 ask.click();
 assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'atelier-quick-ask',text:'Selected passage',path:'paper.pdf',page:'3'}]);
 assert.equal(hidden,true);win.close();
});

test('shared color capsules are opaque and only invoke highlighting',()=>{
 const dom=new JSDOM('<div id="actions"></div>',{runScripts:'outside-only'}),win=dom.window,calls=[];
 vm.runInContext(sharedUI,dom.getInternalVMContext());
 win.AtelierAnnotationUI.createSelectionActions(win.document.getElementById('actions'),{onColor:(name,color)=>calls.push([name,color]),onAnnotate:()=>calls.push('note'),onAsk:()=>calls.push('ask')});
 const swatches=[...win.document.querySelectorAll('.atelier-swatch')];
 assert.equal(swatches.length,4);
 for(const swatch of swatches){assert.match(swatch.style.getPropertyValue('--annotation-color'),/,1\)$/);swatch.click();}
 assert.deepEqual(calls.map(c=>c[0]),['amber','green','blue','red']);
 assert.equal(win.document.querySelector('textarea'),null);dom.window.close();
});
