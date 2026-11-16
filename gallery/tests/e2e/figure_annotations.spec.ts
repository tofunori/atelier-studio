import { test } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

test('figure annotation tools, saved comments, empty cancellation, session state and single send',async({page},testInfo)=>{
await page.setViewportSize({width:1100,height:850});
const errors: any[]=[];page.on('pageerror',e=>errors.push(e.message));
let saves=[];let releaseSave;
let html=fs.readFileSync(new URL('../../assets/gallery_template.html',import.meta.url),'utf8').replaceAll('__DATA__','[]').replaceAll('__FOLDERS__','[]').replaceAll('__FAVS__','[]');
await page.route('http://localhost/**',async route=>{const url=new URL(route.request().url());if(url.pathname==='/save'){saves.push(JSON.parse(route.request().postData()));await new Promise(r=>releaseSave=r);return route.fulfill({contentType:'application/json',body:'{"ok":true}'});}if(url.pathname.endsWith('.png'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/></svg>'});if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});if(url.pathname.includes('figure_annotation_geometry'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(new URL('../../assets/figure_annotation_geometry.js',import.meta.url),'utf8')});return route.fulfill({contentType:'application/json',body:'{}'});});
await page.route('**/gallery_viewer_toolbar.*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(new URL('../../assets/'+name,import.meta.url),'utf8')});});
await page.goto('http://localhost/');await page.evaluate(async()=>{lbList=([{rel:'one.png',name:'one.png',ext:'png'},{rel:'two.png',name:'two.png',ext:'png'}] as unknown as typeof lbList);await lbShow(0);let img=document.getElementById('lbImg');(img as HTMLImageElement).src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/></svg>');await (img as HTMLImageElement).decode();await annotToggle();});
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
// Fullscreen keeps the annotate button and the note; the bar stays while annotating.
await page.locator('#lbAnnot').click();assert.equal(await page.evaluate(()=>lb().classList.contains('annot')),false);
assert.equal(await page.locator('#lbAnnot').isVisible(),true);
await page.locator('#lbAnnot').click();assert.equal(await page.locator('#annotBar').isVisible(),true);
await page.evaluate(()=>lb().classList.remove('fs-ui'));assert.equal(await page.locator('#annotBar').isVisible(),true);
{const fsBox=await page.locator('#annotCv').boundingBox();await page.mouse.move(fsBox.x+80,fsBox.y+80);await page.mouse.down();await page.mouse.move(fsBox.x+180,fsBox.y+150,{steps:4});await page.mouse.up();}
assert.equal(await page.locator('#annotNote').isVisible(),true);await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes.length),0);
await page.evaluate(()=>{lb().classList.remove('fs');lbSetZoom(1);});
await page.locator('#lbZoomMenu summary').click();
const box=await page.locator('#annotCv').boundingBox();const drag=async(x1: number,y1: number,x2: number,y2: number)=>{await page.mouse.move(box.x+x1,box.y+y1);await page.mouse.down();await page.mouse.move(box.x+x2,box.y+y2,{steps:4});await page.mouse.up();};
await drag(120,120,250,210);await page.locator('#annotNote textarea').fill('Premier commentaire');await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes.length),1);assert.equal(await page.locator('#annotNote').isVisible(),false);
await page.locator('[data-tool="arrow"]').click();await drag(420,320,320,320);await page.locator('#annotNote textarea').fill('Flèche gauche');await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes[1].tool),'arrow');
await page.locator('#lbMore summary').click();await page.locator('#annotPillN').click();assert.equal(await page.locator('#annotItems button').count(),2);await page.locator('#annotItems button').first().click();assert.equal(await page.locator('#annotNote textarea').inputValue(),'Premier commentaire');await page.locator('.annot-close').click();
await page.locator('#annotUndo').click();await page.locator('#annotRedo').click();assert.equal(await page.evaluate(()=>annotStrokes.length),2);
await page.evaluate(async()=>{await annotGuard();lb().classList.remove('annot');lbIdx=1;await annotToggle();});assert.equal(await page.evaluate(()=>annotStrokes.length),0);await page.evaluate(async()=>{await annotGuard();lb().classList.remove('annot');lbIdx=0;await annotToggle();});assert.equal(await page.evaluate(()=>annotStrokes.length),2);

await page.evaluate(()=>annotAskNote(annotStrokes[0]));await page.locator('#annotNote textarea').fill('Premier commentaire');await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes[0].note),'Premier commentaire');
await page.locator('[data-tool="rect"]').click();await drag(450,430,540,510);await page.locator('#annotNote textarea').fill('');await page.locator('.annot-close').click();assert.equal(await page.evaluate(()=>annotStrokes.length),2);
await page.mouse.move(box.x+450,box.y+430);await page.mouse.down();await page.mouse.move(box.x+510,box.y+490);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>annotCur===null&&annotDrag===null),true);
await page.evaluate(()=>annotAskNote(annotStrokes[0]));await page.screenshot({path:testInfo.outputPath('annotations.png')});
await page.locator('.annot-send').click();await page.waitForFunction(()=>annotBusy);assert.equal(await page.locator('#annotPillSend').isDisabled(),true);assert.equal(await page.evaluate(()=>annotGuard()),false);assert.equal(saves.length,1);assert.equal(saves[0].notes.length,1);assert.equal(saves[0].direct,true);releaseSave();await page.waitForFunction(()=>!annotBusy);assert.equal(await page.evaluate(()=>annotStrokes.length),1);
await page.evaluate(()=>annotAskNote(annotStrokes[0]));await page.locator('.annot-draft').click();await page.waitForFunction(()=>annotBusy);assert.equal(saves.length,2);assert.equal(saves[1].direct,false);releaseSave();await page.waitForFunction(()=>!annotBusy);
await page.locator('[data-tool="pan"]').click();await page.evaluate(()=>lbSetZoom(.25));
const smallBefore=await page.locator('#lbWrap').boundingBox(),stageBox=await page.locator('#lbViewport').boundingBox();
await page.mouse.move(stageBox.x+12,stageBox.y+12);await page.mouse.down();await page.mouse.move(stageBox.x+92,stageBox.y+72,{steps:4});await page.mouse.up();
const smallAfter=await page.locator('#lbWrap').boundingBox();assert.ok(smallAfter.x-smallBefore.x>70);assert.ok(smallAfter.y-smallBefore.y>50);
// Zoom keeps the middle of the view in place: recentre before zooming in.
await page.evaluate(()=>{lbSetZoom(1);lbSetZoom(2);});const scrollBefore=await page.locator('#lbViewport').evaluate(el=>el.scrollLeft);
const largeBox=await page.locator('#lbViewport').boundingBox();await page.mouse.move(largeBox.x+180,largeBox.y+160);await page.mouse.down();await page.mouse.move(largeBox.x+230,largeBox.y+180,{steps:4});await page.mouse.up();assert.ok(await page.locator('#lbViewport').evaluate(el=>el.scrollLeft)<scrollBefore);
await page.locator('#lbZoomMenu summary').click();await page.locator('#lbFit').click();assert.equal(await page.locator('#lbWrap').evaluate(el=>el.style.transform),'');
await page.locator('#lbMore summary').click();await page.locator('[data-backdrop="#252b30"]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('atelier.figureBackdrop')),'#252b30');assert.equal(await page.locator('#lb').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(37, 43, 48)');await page.locator('[data-backdrop="atelier"]').click();assert.equal(await page.locator('#lb').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor));await page.locator('#lbMore summary').click();assert.equal((await page.locator('#lbAdd').textContent()).trim(),'Joindre');
await page.setViewportSize({width:734,height:797});await page.waitForTimeout(100);assert.equal(await page.locator('#lbCap b').textContent(),'one.png');assert.ok(await page.locator('#lbHead').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:testInfo.outputPath('compact-viewer.png')});
assert.deepEqual(errors,[]);
});

// Lot 1 (2026-11-16) : marques à taille constante, palette au-dessus de la
// figure, outil point, poignées, clavier, zoom ancré, états actifs neutres.
test('figure marks keep their on-screen size, tools and keys work, the palette stays off the figure',async({page})=>{
await page.setViewportSize({width:1100,height:850});
const errors: any[]=[];page.on('pageerror',e=>errors.push(e.message));
const saves: any[]=[];
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/></svg>';
const html=fs.readFileSync(new URL('../../assets/gallery_template.html',import.meta.url),'utf8').replaceAll('__DATA__','[]').replaceAll('__FOLDERS__','[]').replaceAll('__FAVS__','[]');
await page.route('http://localhost/**',async route=>{const url=new URL(route.request().url());if(url.pathname==='/save'){saves.push(JSON.parse(route.request().postData()));return route.fulfill({contentType:'application/json',body:'{"ok":true}'});}if(url.pathname.endsWith('.png'))return route.fulfill({contentType:'image/svg+xml',body:svg});if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});if(url.pathname.includes('figure_annotation_geometry'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(new URL('../../assets/figure_annotation_geometry.js',import.meta.url),'utf8')});return route.fulfill({contentType:'application/json',body:'{}'});});
await page.route('**/gallery_viewer_toolbar.*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(new URL('../../assets/'+name,import.meta.url),'utf8')});});
await page.goto('http://localhost/');
await page.evaluate(async source=>{lbList=([{rel:'one.png',name:'one.png',ext:'png'}] as unknown as typeof lbList);await lbShow(0);const img=document.getElementById('lbImg') as HTMLImageElement;img.src='data:image/svg+xml,'+encodeURIComponent(source);await img.decode();},svg);
await page.waitForFunction(()=>document.getElementById('lb').classList.contains('responsive-viewer'));

// A enters the mode; « Annoter » and the active tool are neutral, never the accent.
await page.keyboard.press('a');
await page.waitForFunction(()=>lb().classList.contains('annot'));
assert.equal(await page.locator('#lbAnnot').getAttribute('aria-pressed'),'true');
await page.waitForFunction(()=>{const c=(sel: string)=>getComputedStyle(document.querySelector(sel)).color,text=getComputedStyle(lb()).color;return c('#lbAnnot')===text&&c('#annotBar .sel')===text;},null,{timeout:2000});

// The palette has its own band: it never covers the figure, fitted or zoomed.
const clear=async()=>page.evaluate(()=>{const bar=document.getElementById('annotBar').getBoundingClientRect(),stage=document.getElementById('lbViewport').getBoundingClientRect();return bar.height>0&&bar.bottom<=stage.top;});
assert.equal(await clear(),true);
assert.equal(await page.locator('#annotDone').count(),0);
assert.deepEqual(await page.locator('#annotBar [data-tool]').evaluateAll(els=>els.map(el=>(el as HTMLElement).dataset.tool)),['rect','ellipse','arrow','point','pan']);

// P then one click: a point; Enter saves the note and keeps the mark selected.
const place=async(x: number,y: number)=>{const r=await page.locator('#annotCv').boundingBox();return{x:r.x+x*r.width,y:r.y+y*r.height};};
await page.keyboard.press('p');
assert.equal(await page.locator('[data-tool="point"]').getAttribute('aria-pressed'),'true');
{const at=await place(.5,.5);await page.mouse.click(at.x,at.y);}
await page.locator('#annotNote textarea').fill('Point à vérifier');
// The note sits beside the mark, never over it.
assert.equal(await page.evaluate(()=>{const note=document.getElementById('annotNote').getBoundingClientRect(),at=annotClient({x:annotStrokes[0].x1,y:annotStrokes[0].y1});return at.x>=note.left&&at.x<=note.right&&at.y>=note.top&&at.y<=note.bottom;}),false);
await page.keyboard.press('Enter');
assert.equal(await page.locator('#annotNote').isVisible(),false);
// WebKit rounds pointer coordinates to whole CSS pixels: allow one image pixel.
{const marks=await page.evaluate(()=>annotStrokes.map(s=>({tool:s.tool,note:s.note,x:s.x1,y:s.y1})));
assert.equal(marks.length,1);assert.equal(marks[0].tool,'point');assert.equal(marks[0].note,'Point à vérifier');
assert.ok(Math.abs(marks[0].x-400)<=1.5&&Math.abs(marks[0].y-300)<=1.5,JSON.stringify(marks[0]));}

// The badge keeps the same size on screen at any zoom, and stays sharp.
const badge=()=>page.evaluate(()=>{
  const c=cv(),ratio=c.width/c.getBoundingClientRect().width,k=c.width/800,at=annotBadge(annotStrokes[0],annotUnit());
  const row=c.getContext('2d').getImageData(0,Math.round(at.y*k),c.width,1).data;let first=-1,last=-1;
  for(let i=0;i<c.width;i++){const r=row[i*4],g=row[i*4+1],b=row[i*4+2],a=row[i*4+3];if(a>200&&r>150&&g<130&&b<80){if(first<0)first=i;last=i;}}
  return{width:(last-first+1)/ratio,ratio,backing:c.width,shown:c.getBoundingClientRect().width};
});
const fitted=await badge();
// 18 px of ink less the paper ring that overlaps its rim.
assert.ok(Math.abs(fitted.width-16.5)<=2,'badge '+fitted.width);
assert.ok(Math.abs(fitted.backing-fitted.shown*fitted.ratio)<=1);
await page.evaluate(()=>lbSetZoom(2));
const zoomed=await badge();
assert.ok(zoomed.shown>fitted.shown*1.9);
assert.ok(Math.abs(zoomed.width-fitted.width)<=1,'zoomed badge '+zoomed.width);
assert.equal(await clear(),true);

// Space held pans the view instead of drawing.
{const from=await page.locator('#lbViewport').boundingBox(),before=await page.locator('#lbViewport').evaluate(el=>el.scrollLeft);
await page.keyboard.down('Space');await page.mouse.move(from.x+300,from.y+300);await page.mouse.down();await page.mouse.move(from.x+240,from.y+280,{steps:4});await page.mouse.up();await page.keyboard.up('Space');
assert.ok(await page.locator('#lbViewport').evaluate(el=>el.scrollLeft)>before);assert.equal(await page.evaluate(()=>annotStrokes.length),1);}

// Pinch zoom keeps the point under the cursor where it is (once the figure
// overflows the view; a figure smaller than the view stays centred).
await page.evaluate(()=>{lbSetZoom(1);lbSetZoom(3);});
{const at=await place(.4,.45);await page.mouse.move(at.x,at.y);await page.keyboard.down('Control');for(let i=0;i<4;i++)await page.mouse.wheel(0,-100);await page.keyboard.up('Control');
const after=await place(.4,.45);assert.ok(await page.evaluate(()=>lbZoomLevel)>4);assert.ok(Math.abs(after.x-at.x)<=4&&Math.abs(after.y-at.y)<=4,JSON.stringify({at,after}));}
await page.evaluate(()=>lbSetZoom(1));

// R, a drag, Enter: a normalized box with handles; a handle moves only its own edges.
await page.keyboard.press('r');
{const a=await place(.7,.6),b=await place(.2,.2);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();}
await page.locator('#annotNote textarea').fill('Cadre');await page.keyboard.press('Enter');
const boxBefore=await page.evaluate(()=>({...annotStrokes[1]}));
assert.ok(boxBefore.x1<boxBefore.x2&&boxBefore.y1<boxBefore.y2);
{const corner=await page.evaluate(()=>annotClient({x:annotStrokes[1].x2,y:annotStrokes[1].y2}));await page.mouse.move(corner.x,corner.y);await page.mouse.down();await page.mouse.move(corner.x+40,corner.y+30,{steps:4});await page.mouse.up();}
const boxAfter=await page.evaluate(()=>({...annotStrokes[1]}));
assert.ok(boxAfter.x2>boxBefore.x2+20&&boxAfter.y2>boxBefore.y2+15);assert.equal(boxAfter.x1,boxBefore.x1);assert.equal(boxAfter.y1,boxBefore.y1);
assert.equal(await page.locator('#annotNote').isVisible(),false);

// Delete removes the selected mark, undo restores it; Escape deselects before leaving.
await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>annotStrokes.length),1);
await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>annotStrokes.length),2);
await page.evaluate(()=>{annotSelected=annotStrokes[0];annotRedraw();});
await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>annotSelected===null&&lb().classList.contains('annot')),true);

// The image sent to the agent carries the same ink marks.
await page.evaluate(()=>annotAskNote(annotStrokes[0]));await page.locator('.annot-draft').click();await page.waitForFunction(()=>!annotBusy);
assert.equal(saves.length,1);
assert.ok(await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-194)<=6&&Math.abs(d[i+1]-86)<=6&&Math.abs(d[i+2]-12)<=6)ink++;return ink;},saves[0].dataURL)>100);

// A leaves the mode and releases the button.
await page.keyboard.press('Escape');await page.keyboard.press('a');
assert.equal(await page.evaluate(()=>lb().classList.contains('annot')),false);
assert.equal(await page.locator('#lbAnnot').getAttribute('aria-pressed'),'false');
assert.deepEqual(errors,[]);
});
