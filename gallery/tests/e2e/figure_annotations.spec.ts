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
assert.equal(await page.locator('#annotNote').isVisible(),true);await page.locator('#annotNote textarea').press('Enter');assert.equal(await page.evaluate(()=>annotStrokes.length),0);
await page.evaluate(()=>{lb().classList.remove('fs');lbSetZoom(1);});
await page.locator('#lbZoomMenu summary').click();
const box=await page.locator('#annotCv').boundingBox();const drag=async(x1: number,y1: number,x2: number,y2: number)=>{await page.mouse.move(box.x+x1,box.y+y1);await page.mouse.down();await page.mouse.move(box.x+x2,box.y+y2,{steps:4});await page.mouse.up();};
await drag(120,120,250,210);await page.locator('#annotNote textarea').fill('Premier commentaire');await page.locator('#annotNote textarea').press('Enter');assert.equal(await page.evaluate(()=>annotStrokes.length),1);assert.equal(await page.locator('#annotNote').isVisible(),false);
await page.locator('[data-tool="arrow"]').click();await drag(420,320,320,320);await page.locator('#annotNote textarea').fill('Flèche gauche');await page.locator('#annotNote textarea').press('Enter');assert.equal(await page.evaluate(()=>annotStrokes[1].tool),'arrow');
// The Notes panel lists both marks; a row opens its note in place.
assert.equal(await page.locator('#lbNotesN').textContent(),'2');assert.equal(await page.locator('#annotItems .annot-row').count(),2);await page.locator('#annotItems .annot-row').first().click();assert.equal(await page.locator('#annotNote textarea').inputValue(),'Premier commentaire');await page.locator('#annotNote textarea').press('Enter');
await page.locator('#annotUndo').click();await page.locator('#annotRedo').click();assert.equal(await page.evaluate(()=>annotStrokes.length),2);
await page.evaluate(async()=>{await annotGuard();lb().classList.remove('annot');lbIdx=1;await annotToggle();});assert.equal(await page.evaluate(()=>annotStrokes.length),0);await page.evaluate(async()=>{await annotGuard();lb().classList.remove('annot');lbIdx=0;await annotToggle();});assert.equal(await page.evaluate(()=>annotStrokes.length),2);

await page.evaluate(()=>annotAskNote(annotStrokes[0]));await page.locator('#annotNote textarea').fill('Premier commentaire');await page.locator('#annotNote textarea').press('Enter');assert.equal(await page.evaluate(()=>annotStrokes[0].note),'Premier commentaire');
await page.locator('[data-tool="rect"]').click();await drag(450,430,540,510);await page.locator('#annotNote textarea').fill('');await page.locator('#annotNote textarea').press('Enter');assert.equal(await page.evaluate(()=>annotStrokes.length),2);
await page.mouse.move(box.x+450,box.y+430);await page.mouse.down();await page.mouse.move(box.x+510,box.y+490);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>annotCur===null&&annotDrag===null),true);
await page.evaluate(()=>annotAskNote(annotStrokes[0]));await page.screenshot({path:testInfo.outputPath('annotations.png')});
await page.locator('.annot-send').click();await page.waitForFunction(()=>annotBusy);assert.equal(await page.locator('#annotSendAll').isDisabled(),true);assert.equal(await page.evaluate(()=>annotGuard()),false);assert.equal(saves.length,1);assert.equal(saves[0].notes.length,1);assert.equal(saves[0].direct,true);releaseSave();await page.waitForFunction(()=>!annotBusy);
// A sent note stays on its version, marked sent; the others are still to send.
assert.deepEqual(await page.evaluate(()=>annotStrokes.map(s=>s.status||'draft')),['sent','draft']);
// The draft action lives in the send menu and carries every note still to send.
await page.locator('#annotSendMore').click();await page.locator('#annotSendMenu [data-send="draft"]').click();await page.waitForFunction(()=>annotBusy);assert.equal(saves.length,2);assert.equal(saves[1].direct,false);releaseSave();await page.waitForFunction(()=>!annotBusy);
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
// The note is written in the « Notes » tab of the bottom band, under the figure, never over it.
assert.equal(await page.evaluate(()=>{const note=document.getElementById('annotNote').getBoundingClientRect(),panel=document.getElementById('annotPanel').getBoundingClientRect(),stage=document.getElementById('lbViewport').getBoundingClientRect();return note.width>0&&note.left>=panel.left&&note.right<=panel.right&&panel.top>=stage.bottom-.5;}),true);
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
await page.locator('#annotSendAll').click();await page.waitForFunction(()=>!annotBusy&&annotStrokes.every(s=>s.status==='sent'));
assert.equal(saves.length,1);
assert.ok(await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-194)<=6&&Math.abs(d[i+1]-86)<=6&&Math.abs(d[i+2]-12)<=6)ink++;return ink;},saves[0].dataURL)>100);

// Sending keeps the mode; A leaves it and releases the button. The notes stay readable in the band.
assert.equal(await page.evaluate(()=>lb().classList.contains('annot')),true);
await page.keyboard.press('a');await page.waitForFunction(()=>!lb().classList.contains('annot'));
assert.equal(await page.locator('#annotPanel').isVisible(),true);
assert.equal(await page.locator('#lbAnnot').getAttribute('aria-pressed'),'false');
assert.deepEqual(errors,[]);
});

// Bande du bas à deux onglets (Thierry 2026-11-16) : les notes vivent dans
// l'onglet « Notes », sous la figure, jamais à côté ; note écrite dans sa rangée,
// compteur sur l'onglet, « Envoyer au chat ⌘↵ » à droite des onglets, position
// et recadrage de chaque note dans l'envoi.
test('the notes tab lists marks under the figure, edits in place and sends positions with crops',async({page})=>{
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
const place=async(x: number,y: number)=>{const r=await page.locator('#annotCv').boundingBox();return{x:r.x+x*r.width,y:r.y+y*r.height};};
const drag=async(x1: number,y1: number,x2: number,y2: number)=>{const a=await place(x1,y1),b=await place(x2,y2);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();};
const note=page.locator('#annotNote textarea'),rows=page.locator('#annotItems .annot-row');

// Nothing at first: no band, no panel, no count, no « Notes » button in the bar.
assert.equal(await page.locator('#lbStrip').isVisible(),false);
assert.equal(await page.locator('#annotPanel').isVisible(),false);
assert.equal(await page.locator('#lbNotes').count(),0);
assert.equal(await page.locator('#lbNotesN').textContent(),'');

// Annotating shows the band under the figure, on « Notes » (this figure has no other version,
// so there is no « Versions » tab); the send button is there, neutral, waiting for a note.
await page.keyboard.press('a');await page.waitForFunction(()=>lb().classList.contains('annot'));
assert.equal(await page.locator('#annotPanel').isVisible(),true);
assert.equal(await page.locator('#lbTabNotes').getAttribute('aria-selected'),'true');
assert.equal(await page.locator('#lbTabVersions').isVisible(),false);
assert.equal(await page.locator('#annotEmpty').isVisible(),true);
assert.equal(await page.locator('#annotSendAll').isVisible(),true);assert.equal(await page.locator('#annotSendAll').isDisabled(),true);
// Under the figure, full width, 160 px: the figure keeps the whole width of the viewer.
const under=()=>page.evaluate(()=>{const band=document.getElementById('lbStrip').getBoundingClientRect(),panel=document.getElementById('annotPanel').getBoundingClientRect(),stage=document.getElementById('lbViewport').getBoundingClientRect(),image=document.getElementById('lbWrap').getBoundingClientRect();return Math.round(band.height)===160&&band.width>=innerWidth-1&&stage.width>=innerWidth-1&&panel.top>=stage.bottom-.5&&image.bottom<=band.top+.5;});
assert.equal(await under(),true);
// Neutral: the send button and the selected tab carry the text colour, never the accent.
await page.waitForFunction(()=>{const text=getComputedStyle(lb()).color;return getComputedStyle(document.getElementById('lbTabNotes')).color===text&&getComputedStyle(document.getElementById('annotSendAll')).color===text;},null,{timeout:2000});

// A box: its note opens in the panel, at its place in the list.
await drag(.2,.2,.5,.6);
assert.equal(await note.isVisible(),true);
assert.equal(await page.evaluate(()=>document.getElementById('annotNote').parentElement.id),'annotItems');
await note.fill('Axe y en log');await note.press('Enter');
assert.equal(await page.locator('#annotNote').isVisible(),false);
assert.deepEqual(await rows.allTextContents(),['1Axe y en log']);
assert.equal(await page.locator('#lbNotesN').textContent(),'1');
assert.equal(await page.locator('#annotEmpty').isVisible(),false);
assert.equal(await page.locator('#annotSendAll').isDisabled(),false);

// A point, then a click elsewhere saves the open note.
await page.keyboard.press('p');{const at=await place(.75,.25);await page.mouse.click(at.x,at.y);}
await note.fill('Point aberrant');await page.locator('#annotPanel').click({position:{x:400,y:104}});
assert.equal(await page.locator('#annotNote').isVisible(),false);
assert.deepEqual(await rows.allTextContents(),['1Axe y en log','2Point aberrant']);
assert.equal(await page.locator('#lbNotesN').textContent(),'2');

// A row opens its note where the row was; the mark is selected on the figure.
await rows.first().click();
assert.equal(await page.evaluate(()=>[...document.getElementById('annotItems').children].indexOf(document.getElementById('annotNote'))),0);
assert.equal(await note.inputValue(),'Axe y en log');
assert.equal(await page.evaluate(()=>annotSelected===annotStrokes[0]&&annotEditing===annotStrokes[0]),true);
await note.fill('Axe y en log, base 10');await note.press('Escape');
assert.equal(await page.evaluate(()=>annotStrokes[0].note),'Axe y en log, base 10');
assert.equal(await page.evaluate(()=>lb().classList.contains('annot')),true);

// Row and mark answer each other: hovering one points at the other.
await rows.nth(1).hover();
assert.equal(await page.evaluate(()=>annotHover===annotStrokes[1]),true);
await page.keyboard.press('r');{const edge=await place(.2,.4);await page.mouse.move(edge.x,edge.y);}
await page.waitForFunction(()=>document.querySelectorAll('#annotItems .annot-row')[0].classList.contains('hot'));

// ⌘↵ sends every note with its position (fractions of the image) and a crop of its zone.
// The status line is a 2.4 s transient: what it said, and when, is recorded, never raced against its timer.
await page.evaluate(()=>{const line=document.getElementById('annotPanelStatus'),said: [string,number][]=[];(window as any).annotSaid=said;new MutationObserver(()=>said.push([line.textContent,performance.now()])).observe(line,{childList:true,characterData:true,subtree:true});});
await page.keyboard.press('Control+Enter');
await page.waitForFunction(()=>!annotBusy&&annotStrokes.length===2&&annotStrokes.every(s=>s.status==='sent'));
assert.equal(saves.length,1);assert.equal(saves[0].direct,true);
assert.deepEqual(saves[0].notes.map((n: any)=>[n.n,n.text,n.kind]),[[1,'Axe y en log, base 10','box'],[2,'Point aberrant','point']]);
{const near=(a: number,b: number)=>Math.abs(a-b)<=.01,[box,point]=saves[0].notes;
assert.ok(near(box.x,.2)&&near(box.y,.2)&&near(box.w,.3)&&near(box.h,.4),JSON.stringify(box,['x','y','w','h']));
assert.ok(near(point.x,.75)&&near(point.y,.25)&&point.w===0&&point.h===0,JSON.stringify(point,['x','y','w','h']));}
for(const sent of saves[0].notes){
  const crop=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-194)<=6&&Math.abs(d[i+1]-86)<=6&&Math.abs(d[i+2]-12)<=6)ink++;return{w:image.width,h:image.height,ink};},sent.crop);
  assert.ok(crop.ink>20&&Math.max(crop.w,crop.h)<=800&&Math.min(crop.w,crop.h)>=40,JSON.stringify(crop));
}
// The outcome is said beside the button, never by rewriting it.
assert.deepEqual(await page.evaluate(()=>(window as any).annotSaid.map((s: [string,number])=>s[0]).filter(Boolean)),['Collé dans Claude']);
assert.equal(await page.locator('#annotSendAll .lbl').textContent(),'Envoyer au chat');
// Sent notes stay on the version, each with its « réglée » box; nothing is left to send.
assert.equal(await page.locator('#lbNotesN').textContent(),'2');
assert.equal(await page.locator('#annotItems .annot-check:visible').count(),2);
assert.equal(await page.locator('#annotSendAll').isDisabled(),true);
assert.equal(await page.evaluate(()=>lb().classList.contains('annot')),true);

// The menu holds the secondary sends; Escape closes it without leaving the mode.
await drag(.1,.1,.3,.3);await note.fill('Légende à déplacer');await note.press('Enter');
await page.locator('#annotSendMore').click();
assert.equal(await page.locator('#annotSendMenu').isVisible(),true);
await page.keyboard.press('Escape');
assert.equal(await page.locator('#annotSendMenu').isVisible(),false);assert.equal(await page.evaluate(()=>lb().classList.contains('annot')),true);
// Outside the app the menu also picks the target session; the choice opens above the button.
await page.locator('#annotSendMore').click();await page.locator('#annotTarget').click();
assert.equal(await page.locator('#annotSendMenu').isVisible(),false);
await page.locator('#tgMenu .it').first().waitFor();
assert.equal((await page.locator('#tgMenu .it .t').first().textContent()).trim(),'Session du projet (auto)');
assert.equal(await page.evaluate(()=>{const menu=document.getElementById('tgMenu').getBoundingClientRect(),more=document.getElementById('annotSendMore').getBoundingClientRect();return menu.width>0&&menu.bottom<=more.top&&menu.right<=innerWidth;}),true);
await page.locator('#tgMenu .it').first().click();assert.equal(await page.locator('#tgMenu').isVisible(),false);
await page.locator('#annotSendMore').click();await page.locator('#annotSendMenu [data-send="draft"]').click();
await page.waitForFunction(()=>!annotBusy&&annotStrokes.length===3&&annotStrokes.every(s=>s.status==='sent'));
// Only the note still to send leaves: the two sent ones are not sent twice.
assert.equal(saves.length,2);assert.equal(saves[1].direct,false);assert.deepEqual(saves[1].notes.map((n: any)=>n.text),['Légende à déplacer']);
// The outcome of this second send stays its full time: the timer armed by the first send never wipes it.
await page.waitForFunction(()=>{const said=(window as any).annotSaid;return said.filter((s: [string,number])=>s[0]).length===2&&!said.at(-1)[0];},null,{timeout:8000});
{const said: [string,number][]=await page.evaluate(()=>(window as any).annotSaid),last=said.map(s=>!!s[0]).lastIndexOf(true);
assert.ok(said[last+1][1]-said[last][1]>=2300,JSON.stringify(said));}

// Leaving the mode changes nothing below: the tab stays under the figure and the marks are
// read-only; a row re-enters the mode on its note.
await drag(.6,.6,.8,.8);await note.fill('Reste à faire');await note.press('Enter');
await page.keyboard.press('Escape');await page.keyboard.press('a');await page.waitForFunction(()=>!lb().classList.contains('annot'));
assert.equal(await page.locator('#annotPanel').isVisible(),true);
assert.equal(await page.locator('#lbTabNotes').getAttribute('aria-selected'),'true');
assert.equal(await page.locator('#lbNotesN').textContent(),'4');
assert.equal(await under(),true);
assert.equal(await page.evaluate(()=>lb().classList.contains('annot')),false);
assert.deepEqual(await page.locator('#annotCv').evaluate(el=>[getComputedStyle(el).display,getComputedStyle(el).pointerEvents]),['block','none']);
assert.deepEqual(await rows.allTextContents(),['1Axe y en log, base 10','2Point aberrant','3Légende à déplacer','4Reste à faire']);
await rows.last().click();await page.waitForFunction(()=>lb().classList.contains('annot')&&annotEditing===annotStrokes[3]);
assert.equal(await note.inputValue(),'Reste à faire');await note.press('Enter');

// Narrow viewer: same band under the figure, which keeps the full width.
await page.setViewportSize({width:700,height:850});await page.waitForTimeout(150);
assert.equal(await page.evaluate(()=>{const panel=document.getElementById('annotPanel').getBoundingClientRect(),stage=document.getElementById('lbViewport').getBoundingClientRect();return panel.top>=stage.bottom-.5&&panel.height>0&&stage.height>200;}),true);
assert.ok(await page.locator('#lbHead').evaluate(el=>el.scrollWidth<=el.clientWidth));
assert.deepEqual(errors,[]);
});
