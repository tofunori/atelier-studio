import { test } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

test('figure annotation tools, saved comments, empty cancellation, session state and single send',async({page},testInfo)=>{
await page.setViewportSize({width:1100,height:850});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let saves=[];let releaseSave;
let html=fs.readFileSync(new URL('../../assets/gallery_template.html',import.meta.url),'utf8').replaceAll('__DATA__','[]').replaceAll('__FOLDERS__','[]').replaceAll('__FAVS__','[]');
await page.route('http://localhost/**',async route=>{const url=new URL(route.request().url());if(url.pathname==='/save'){saves.push(JSON.parse(route.request().postData()));await new Promise(r=>releaseSave=r);return route.fulfill({contentType:'application/json',body:'{"ok":true}'});}if(url.pathname.endsWith('.png'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/></svg>'});if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});if(url.pathname.includes('figure_annotation_geometry'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(new URL('../../assets/figure_annotation_geometry.js',import.meta.url),'utf8')});return route.fulfill({contentType:'application/json',body:'{}'});});
await page.route('**/gallery_viewer_toolbar.*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(new URL('../../assets/'+name,import.meta.url),'utf8')});});
await page.goto('http://localhost/');await page.evaluate(async()=>{lbList=[{rel:'one.png',name:'one.png',ext:'png'},{rel:'two.png',name:'two.png',ext:'png'}];await lbShow(0);let img=document.getElementById('lbImg');img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/></svg>');await img.decode();await annotToggle();});
assert.equal(await page.locator('#annotBar').isVisible(),true);
// Fullscreen permits shrinking below fit, then zooming back in or resetting.
await page.evaluate(()=>{lb().classList.add('fs','fs-ui');lbSetZoom(1);});
const fitWidth=await page.locator('#lbWrap').evaluate(el=>el.getBoundingClientRect().width);
await page.locator('#lbZoomMenu summary').click();
await page.locator('#lbZoomOut').click();
assert.ok(await page.locator('#lbWrap').evaluate(el=>el.getBoundingClientRect().width)<fitWidth);
await page.locator('#lbZoomIn').click();
assert.ok(Math.abs(await page.locator('#lbWrap').evaluate(el=>el.getBoundingClientRect().width)-fitWidth)<2);
await page.evaluate(()=>lbSetZoom(.01));assert.equal(await page.evaluate(()=>lbZoomLevel),.25);
await page.locator('#lbFit').click();assert.equal(await page.evaluate(()=>lbZoomLevel),1);
await page.evaluate(()=>{lb().classList.remove('fs');lbSetZoom(1);});
await page.locator('#lbZoomMenu summary').click();
const box=await page.locator('#annotCv').boundingBox();const drag=async(x1,y1,x2,y2)=>{await page.mouse.move(box.x+x1,box.y+y1);await page.mouse.down();await page.mouse.move(box.x+x2,box.y+y2,{steps:4});await page.mouse.up();};
await drag(120,120,250,210);await page.locator('#annotNote textarea').fill('Premier commentaire');await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes.length),1);assert.equal(await page.locator('#annotNote').isVisible(),false);
await page.locator('#annotShapes summary').click();await page.locator('[data-tool="arrow"]').click();await drag(420,320,320,320);await page.locator('#annotNote textarea').fill('Flèche gauche');await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes[1].tool),'arrow');
await page.locator('#lbMore summary').click();await page.locator('#annotPillN').click();assert.equal(await page.locator('#annotItems button').count(),2);await page.locator('#annotItems button').first().click();assert.equal(await page.locator('#annotNote textarea').inputValue(),'Premier commentaire');await page.locator('.annot-close').click();
await page.locator('#annotUndo').click();await page.locator('#annotRedo').click();assert.equal(await page.evaluate(()=>annotStrokes.length),2);
await page.evaluate(async()=>{await annotGuard();lb().classList.remove('annot');lbIdx=1;await annotToggle();});assert.equal(await page.evaluate(()=>annotStrokes.length),0);await page.evaluate(async()=>{await annotGuard();lb().classList.remove('annot');lbIdx=0;await annotToggle();});assert.equal(await page.evaluate(()=>annotStrokes.length),2);

await page.evaluate(()=>annotAskNote(annotStrokes[0],300,250));await page.locator('#annotNote textarea').fill('Premier commentaire');await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes[0].note),'Premier commentaire');
await page.locator('#annotShapes summary').click();await page.locator('[data-tool="rect"]').click();await drag(450,430,540,510);await page.locator('#annotNote textarea').fill('');await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes.length),2);
await page.mouse.move(box.x+450,box.y+430);await page.mouse.down();await page.mouse.move(box.x+510,box.y+490);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>annotCur===null&&annotDrag===null),true);
await page.evaluate(()=>annotAskNote(annotStrokes[0],300,250));await page.screenshot({path:testInfo.outputPath('annotations.png')});
await page.locator('.annot-send').click();await page.waitForFunction(()=>annotBusy);assert.equal(await page.locator('#annotPillSend').isDisabled(),true);assert.equal(await page.evaluate(()=>annotGuard()),false);assert.equal(saves.length,1);assert.equal(saves[0].notes.length,1);assert.equal(saves[0].direct,true);releaseSave();await page.waitForFunction(()=>!annotBusy);assert.equal(await page.evaluate(()=>annotStrokes.length),1);
await page.evaluate(()=>annotAskNote(annotStrokes[0],300,250));await page.locator('.annot-draft').click();await page.waitForFunction(()=>annotBusy);assert.equal(saves.length,2);assert.equal(saves[1].direct,false);releaseSave();await page.waitForFunction(()=>!annotBusy);
await page.locator('[data-tool="pan"]').click();await page.evaluate(()=>lbSetZoom(.25));
const smallBefore=await page.locator('#lbWrap').boundingBox(),stageBox=await page.locator('#lbViewport').boundingBox();
await page.mouse.move(stageBox.x+12,stageBox.y+12);await page.mouse.down();await page.mouse.move(stageBox.x+92,stageBox.y+72,{steps:4});await page.mouse.up();
const smallAfter=await page.locator('#lbWrap').boundingBox();assert.ok(smallAfter.x-smallBefore.x>70);assert.ok(smallAfter.y-smallBefore.y>50);
await page.evaluate(()=>lbSetZoom(2));const scrollBefore=await page.locator('#lbViewport').evaluate(el=>el.scrollLeft);
const largeBox=await page.locator('#lbViewport').boundingBox();await page.mouse.move(largeBox.x+180,largeBox.y+160);await page.mouse.down();await page.mouse.move(largeBox.x+230,largeBox.y+180,{steps:4});await page.mouse.up();assert.ok(await page.locator('#lbViewport').evaluate(el=>el.scrollLeft)<scrollBefore);
await page.locator('#lbZoomMenu summary').click();await page.locator('#lbFit').click();assert.equal(await page.locator('#lbWrap').evaluate(el=>el.style.transform),'');
await page.locator('#lbMore summary').click();await page.locator('[data-backdrop="#252b30"]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('atelier.figureBackdrop')),'#252b30');assert.equal(await page.locator('#lb').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(37, 43, 48)');await page.locator('[data-backdrop="atelier"]').click();assert.equal(await page.locator('#lb').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor));await page.locator('#lbMore summary').click();assert.equal((await page.locator('#lbAdd').textContent()).trim(),'Joindre');
await page.setViewportSize({width:734,height:797});await page.waitForTimeout(100);assert.equal(await page.locator('#lbCap b').textContent(),'one.png');assert.ok(await page.locator('#lbHead').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:testInfo.outputPath('compact-viewer.png')});
assert.deepEqual(errors,[]);
});
