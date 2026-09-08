import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../../assets/gallery_template.html',import.meta.url),'utf8');
test('gallery inline scripts remain valid JavaScript',()=>{
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
function fit(width,height,naturalWidth,naturalHeight,zoom=1,padding=0){
  const stage={clientWidth:width,clientHeight:height},wrap={style:{}},img={naturalWidth,naturalHeight};
  const nodes={lbViewport:stage,lbWrap:wrap,lbImg:img,lbFit:{setAttribute(){}}};
  const context={getComputedStyle:()=>({paddingLeft:'0px',paddingRight:'0px',paddingTop:padding+'px',paddingBottom:padding+'px'}),document:{getElementById:id=>nodes[id]},lb:()=>({classList:{contains:c=>c==='show'}}),lbZoomLevel:zoom};
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function lbFitImage(){'),html.indexOf('function lbSetZoom(value){')),context);
  context.lbFitImage();return {stage,wrap,context};
}
test('fits landscape, portrait and large scientific figures without cropping',()=>{
  for(const dims of [[800,600,6000,4000],[400,700,1200,3000],[1300,720,10000,10000]]){
    const {wrap}=fit(...dims),w=parseInt(wrap.style.width),h=parseInt(wrap.style.height);
    assert.ok(w<=dims[0]-11&&h<=dims[1]-11);
    assert.ok(Math.abs(w/h-dims[2]/dims[3])<.01);
  }
});
test('recomputes fit after a pane or fullscreen resize',()=>{
  const {stage,wrap,context}=fit(1300,800,4000,3000);
  stage.clientWidth=500;stage.clientHeight=350;context.lbFitImage();
  assert.ok(parseInt(wrap.style.width)<=488);assert.ok(parseInt(wrap.style.height)<=338);
});
test('only deliberate zoom can exceed the fitted viewport',()=>{
  const fitted=fit(800,600,4000,3000),zoomed=fit(800,600,4000,3000,2);
  assert.equal(parseInt(zoomed.wrap.style.height),2*parseInt(fitted.wrap.style.height));
});

test('annotation toolbar and footer space leave the entire portrait visible',()=>{
  const {wrap}=fit(500,600,1200,3000,1,40);
  assert.ok(parseFloat(wrap.style.height)+80<=588);
  assert.ok(Math.abs(parseFloat(wrap.style.width)/parseFloat(wrap.style.height)-.4)<.01);
});
