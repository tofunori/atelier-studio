import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {ChildProcess, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
let root: string,child: ChildProcess,origin: string;
test.beforeAll(async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'atelier-figure-versions-'));
  fs.writeFileSync(path.join(root,'figures_data.json'),JSON.stringify({files:[]}));
  const socket=net.createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));
  const port=(socket.address() as import("node:net").AddressInfo).port;await new Promise(r=>socket.close(r));origin='http://127.0.0.1:'+port;
  child=spawn(path.join(repo,'rust/target/debug/atelier-gallery-server'),['--root',root,'--port',String(port),'--no-watch'],{
    env:{...process.env,ATELIER_ASSETS_DIR:path.join(repo,'gallery/assets'),ATELIER_STUDIO:'1'},stdio:'ignore'});
  await expect.poll(async()=>{try{return (await fetch(origin+'/ping')).status;}catch{return 0;}}).toBe(200);
});
test.afterAll(async()=>{if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}if(root)fs.rmSync(root,{recursive:true,force:true});});

test('responsive toolbar keeps real actions reachable and fullscreen icons after round trips',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:800});
  await page.goto(origin+'/?embedded=atelier');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d');x.fillStyle='#bce5bc';x.fillRect(0,0,800,500);return c.toDataURL().split(',')[1];});
  fs.writeFileSync(path.join(root,'toolbar.png'),Buffer.from(png,'base64'));
  await page.evaluate(async()=>{lbList=([{rel:'toolbar.png',name:'toolbar.png',ext:'png'}] as unknown as typeof lbList);await lbShow(0);await lbVersionReady;});
  await expect(page.locator('#lb')).toHaveClass(/responsive-viewer/);
  for(const width of [240,280,360,490,600,760,960,1120]){
    await page.locator('#lb').evaluate((el,w)=>el.style.setProperty('--lb-width',w+'px'),width);
    await expect.poll(()=>page.locator('#lbHead').evaluate(el=>{
      const bounds=el.getBoundingClientRect();
      return el.scrollWidth<=el.clientWidth && [...el.querySelectorAll(':scope > button, :scope > details > summary')].filter(b=>b.getBoundingClientRect().width).every(b=>{const r=b.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right;});
    })).toBe(true);
    await expect(page.locator('#lbFs')).toBeVisible();
    await expect(page.locator('#lbClose')).toBeVisible();
  }
  await page.locator('#lb').evaluate(el=>el.style.setProperty('--lb-width','240px'));
  await page.locator('#lbMore summary').click();
  expect(await page.locator('#lbMore>div').evaluate(el=>{const r=el.getBoundingClientRect(),p=document.getElementById('lb').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right;})).toBe(true);
  await page.locator('#lbOverflowZoom').click();
  await expect(page.locator('#lbFit')).toBeVisible();
  await page.locator('#lbZoom200').click();
  await expect(page.locator('#lbZoomLabel')).toHaveText(/200/);
  expect(await page.locator('#lbWrap').evaluate(el=>(el as HTMLElement).offsetWidth)).toBeCloseTo(1600,0);
  await page.locator('#lbAnnot').click();
  await expect(page.locator('#annotBar')).toBeVisible();
  expect(await page.locator('#annotBar').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.locator('#lbAnnot').click();
  await expect(page.locator('#annotBar')).toBeHidden();
  for(let i=0;i<2;i++){
    await page.locator('#lbFs').click();
    await expect(page.locator('#lb')).toHaveClass(/\bfs\b/);
    await expect(page.locator('#lbFs svg')).toBeVisible();
    // The embedded full-screen iframe sits below the native macOS titlebar.
    // Its toolbar must remain visible after the inactivity pulse disappears,
    // and content must start to the right of the traffic lights.
    await page.locator('#lb').evaluate(el=>el.classList.remove('fs-ui'));
    await expect(page.locator('#lbHead')).toBeVisible();
    expect(await page.locator('#lbHead').evaluate(el=>{
      const first=el.querySelector(':scope > button');
      return first.getBoundingClientRect().left-el.getBoundingClientRect().left;
    })).toBeGreaterThanOrEqual(104);
    await page.setViewportSize({width:280,height:700});
    await expect(page.locator('#lbHead')).toBeVisible();
    expect(await page.locator('#lbHead').evaluate(el=>{
      const bounds=el.getBoundingClientRect();
      return bounds.top>=40&&el.scrollWidth<=el.clientWidth;
    })).toBe(true);
    await page.locator('#lb').evaluate(el=>el.classList.add('annot'));
    expect(await page.locator('#annotBar').evaluate(el=>{
      const palette=el.getBoundingClientRect(),head=document.getElementById('lbHead').getBoundingClientRect();
      return palette.top>=head.bottom+8;
    })).toBe(true);
    await page.locator('#lb').evaluate(el=>el.classList.remove('annot'));
    await page.setViewportSize({width:1280,height:800});
    await page.locator('#lbFs').click();
    await expect(page.locator('#lb')).not.toHaveClass(/\bfs\b/);
    await expect(page.locator('#lbFs svg')).toBeVisible();
  }
  await page.locator('#lbMore summary').click();
  await page.locator('#lbOverflowInfo').click();
  await expect(page.locator('#lbSheet')).toBeVisible();
  expect(errors).toEqual([]);
});

const ver=(page)=>page.locator('#lbHistBtn .lbh-v');
const tile=(page,version: number)=>page.locator('#lbStrip .lbs-tile[data-version="'+version+'"]');
test('open figure updates from disk, keeps immutable versions and version-specific annotations',async({page,request},testInfo)=>{
  await page.goto(origin);
  const png=async(color: string)=>Buffer.from(await page.evaluate(color=>{const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,800,500);return c.toDataURL('image/png').split(',')[1];},color),'base64');
  const first=await png('#bcdfeb'),second=await png('#e8caaa'),third=await png('#bce5bc');
  const file=path.join(root,'figure.png');fs.writeFileSync(file,first);
  await page.evaluate(async()=>{lbList=([{rel:'figure.png',name:'figure.png',ext:'png'}] as unknown as typeof lbList);await lbShow(0);await lbVersionReady;});
  await expect(ver(page)).toHaveText('v1');
  // One version only: the band waits for a second one.
  await expect(page.locator('#lbStrip')).toBeHidden();
  await page.evaluate(()=>lbSetZoom(1.5));
  // No rescan, gallery refresh or explicit polling call: the open viewer follows disk changes.
  fs.writeFileSync(file,second);
  await expect(ver(page)).toHaveText('v2',{timeout:8000});
  await expect(page.locator('#lbStrip')).toBeVisible();
  await expect(page.locator('#lbStrip .lbs-tile')).toHaveCount(2);
  // A version that arrives never shows the notes by itself.
  await expect(page.locator('#lbTabVersions')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#annotPanel')).toBeHidden();
  expect(await page.evaluate(()=>lbZoomLevel)).toBe(1.5);
  expect(Buffer.from(await (await request.get(origin+'/figure-version?path=figure.png&version=1')).body())).toEqual(first);
  const hash=await page.evaluate(()=>lbHistory.rows[0].hash);
  expect(Buffer.from(await (await request.get(origin+'/figure-version?hash='+hash)).body())).toEqual(first);
  await tile(page,1).click();
  await expect(ver(page)).toHaveText('v1');
  const attached=await page.evaluate(async()=>{const send=postChatPayload;let payload;postChatPayload=async (value)=>{payload=value;};try{await lbAttachDisplayed();return payload;}finally{postChatPayload=send;}});
  expect(attached.text).toContain('Version affichée : v1');
  expect(attached.path).not.toBe('figure.png');
  const attachedColor=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=1;c.height=1;const x=c.getContext('2d');x.drawImage(image,0,0);return [...x.getImageData(0,0,1,1).data];},attached.previewUrl);
  expect(attachedColor).toEqual([188,223,235,255]);
  await page.evaluate(async()=>{await annotToggle();annotStrokes.push({id:'test-note',tool:'rect',x1:40,y1:40,x2:180,y2:100,n:1,note:'Ancienne version'});annotRemember();annotRedraw();});
  fs.writeFileSync(file,third);
  await expect.poll(()=>page.evaluate(()=>lbHistory.rows.at(-1)?.version),{timeout:8000}).toBe(3);
  await expect(ver(page)).toHaveText('v1');
  await tile(page,3).click();
  await expect(ver(page)).toHaveText('v3');
  expect(await page.evaluate(()=>annotStrokes.length)).toBe(0);
  // ← → walk the versions while the band has the focus.
  await tile(page,3).focus();
  await page.keyboard.press('ArrowLeft');await expect(ver(page)).toHaveText('v2');
  await page.keyboard.press('ArrowLeft');await expect(ver(page)).toHaveText('v1');
  await expect(tile(page,1)).toBeFocused();
  expect(await page.evaluate(()=>annotStrokes[0].note)).toBe('Ancienne version');
  await page.keyboard.press('End');await expect(ver(page)).toHaveText('v3');
  // An unsent annotation pauses automatic switching; sending/clearing resumes it.
  await page.evaluate(()=>{annotStrokes.push({id:'pending',tool:'rect',x1:40,y1:40,x2:180,y2:100,n:1,note:'En cours'});annotRemember();annotRedraw();});
  fs.writeFileSync(file,second);
  await expect.poll(()=>page.evaluate(()=>lbHistory.rows.at(-1)?.version),{timeout:8000}).toBe(4);
  await expect(ver(page)).toHaveText('v3');
  await page.evaluate(()=>{annotStrokes=[];annotRemember();});
  await expect(ver(page)).toHaveText('v4',{timeout:8000});
  await page.evaluate(()=>annotToggle());
  // Interrupted saves never replace the last valid image.
  fs.writeFileSync(file,first.subarray(0,20));
  await page.evaluate(()=>lbVersionsPoll());
  await expect(ver(page)).toHaveText('v4');
  await page.evaluate(()=>{annotBusy=true;return lbVersionNavigate(-1);});
  expect(await page.evaluate(()=>lbHistory.follow)).toBe(true);
  await page.evaluate(()=>annotBusy=false);
  fs.writeFileSync(file,second);
  // Compare: A = an older version, B = the latest, slider then side by side.
  await page.locator('#lbCompareBtn').click();
  await expect(page.locator('#lbCompare')).toBeVisible();
  await expect(page.locator('#lbViewport')).toBeHidden();
  await expect(page.locator('#lbCmpB')).toContainText('B · v4');
  await expect(page.locator('#lbCmpA')).toContainText('A · v3');
  await tile(page,1).click();
  await expect(page.locator('#lbCmpA')).toContainText('A · v1');
  await expect(tile(page,1).locator('.lbs-mk')).toHaveText('A');
  await expect(tile(page,4).locator('.lbs-mk')).toHaveText('B');
  const split=page.locator('#lbCompare .lbc-split');
  await expect.poll(()=>split.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(100);
  const box=await split.boundingBox();
  await page.mouse.move(box.x+box.width*.25,box.y+box.height/2);await page.mouse.down();await page.mouse.up();
  await expect(split.locator('.lbc-handle')).toHaveAttribute('aria-valuenow','25');
  // Left of the handle shows A (first colour), right shows B (second colour).
  await page.locator('#lbCompare .lbc-seg button[data-mode="side"]').click();
  await expect(page.locator('#lbCompare .lbc-side figure')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lbCompare')).toBeHidden();
  await expect(page.locator('#lb')).toHaveClass(/\bshow\b/);
  await page.reload();
  await page.evaluate(async()=>{lbList=([{rel:'figure.png',name:'figure.png',ext:'png'}] as unknown as typeof lbList);await lbShow(0);await lbVersionReady;});
  await expect(ver(page)).toHaveText('v4');
  // The band can be closed and stays closed.
  await page.locator('#lbHistBtn').click();
  await expect(page.locator('#lbStrip')).toBeHidden();
  await page.locator('#lbHistBtn').click();
  await expect(page.locator('#lbStrip')).toBeVisible();
  await page.setViewportSize({width:734,height:797});
  expect(await page.locator('#lbHead').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('figure-versions.png')});
  const post=(paths: string[],from: string)=>request.post(origin+'/figure-history',{headers:{Origin:from},data:{paths}});
  expect((await post(['figure.png'],'https://untrusted.example')).status()).toBe(403);
  expect((await post(['/etc/passwd'],origin)).status()).toBe(409);
});

test('versions written while the viewer is closed are kept, copies share the history',async({page,request})=>{
  await page.goto(origin);
  const png=async(color: string)=>Buffer.from(await page.evaluate(color=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,400,300);return c.toDataURL('image/png').split(',')[1];},color),'base64');
  const colors=['#bcdfeb','#e8caaa','#bce5bc'];
  fs.mkdirSync(path.join(root,'manuscrit'),{recursive:true});
  const lead=path.join(root,'plot.png'),copy=path.join(root,'manuscrit','plot.png');
  const rescan=async()=>expect((await request.post(origin+'/rescan',{headers:{Origin:origin}})).ok()).toBe(true);
  const stored=()=>page.evaluate(async()=>(await (await fetch('/figure-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:['plot.png']})})).json()).versions.length);
  for(const [i,color] of colors.entries()){
    fs.writeFileSync(lead,await png(color));
    if(i===0)fs.copyFileSync(lead,copy);
    await rescan();
    // capture runs after the rebuild, off the request path
    // (only the stored-image route is read here: asking for the history would capture)
    await expect.poll(async()=>(await request.get(origin+'/figure-version?path=plot.png&version='+(i+1))).status(),{timeout:8000}).toBe(200);
    await page.waitForTimeout(50);
  }
  expect(await stored()).toBe(3);
  await page.evaluate(async()=>{lbList=([{rel:'plot.png',name:'plot.png',ext:'png',folder:'.'},{rel:'manuscrit/plot.png',name:'plot.png',ext:'png',folder:'manuscrit'}] as unknown as typeof lbList);figureGroups.set('plot.png',lbList);figureGroups.set('manuscrit/plot.png',lbList);await lbShow(0);await lbVersionReady;});
  await expect(page.locator('#lbStrip .lbs-tile')).toHaveCount(3);
  await expect(page.locator('#lbStrip .lbs-tile').nth(0).locator('.lbs-n')).toHaveText('copie du manuscrit');
  await expect(page.locator('#lbVersionsN')).toHaveText('3');
});

// 2026-11-16 : chaque figure enregistrée depuis le chat est une copie neuve
// (images-generees/<nom>-<hachage>.png). La suivante écrasait la précédente
// dans la visionneuse (une seule version, notes de v1 introuvables) : elles
// s'empilent maintenant en v1, v2…, même enregistrées visionneuse ouverte.
test('figures saved from the chat stack as versions of one figure',async({page})=>{
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/?embedded=atelier');
  const png=async(color: string)=>Buffer.from(await page.evaluate(color=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,400,300);return c.toDataURL('image/png').split(',')[1];},color),'base64');
  const chat=path.join(root,'images-generees');fs.mkdirSync(chat,{recursive:true});
  const first='images-generees/fig_tests_droite_courbe-f5616df8.png',second='images-generees/fig_tests_droite_courbe-b5b5ca0d.png';
  fs.writeFileSync(path.join(root,first),await png('#f2d6c4'));
  fs.writeFileSync(path.join(chat,'fig_autre-0123abcd.png'),await png('#c4d6f2'));
  const open=(rel: string)=>page.evaluate(async rel=>{lbList=([{rel,name:rel.split('/').pop(),ext:'png',folder:'images-generees'}] as unknown as typeof lbList);await lbShow(0);await lbVersionReady;},rel);
  await open(first);
  await expect(ver(page)).toHaveText('v1');
  // Le chat refait la figure pendant que la visionneuse est ouverte : v2 arrive.
  await page.waitForTimeout(20);
  fs.writeFileSync(path.join(root,second),await png('#d6f2c4'));
  await expect(ver(page)).toHaveText('v2',{timeout:8000});
  await expect(page.locator('#lbStrip .lbs-tile')).toHaveCount(2);
  await expect(tile(page,2).locator('.lbs-n')).toHaveText('actuelle');
  // Un instantané du chat n'est jamais une « copie en retard ».
  await expect(tile(page,1).locator('.lbs-n')).toHaveText('');
  // Ouverte depuis le message d'origine, l'ancienne figure montre sa version.
  await open(first);
  await expect(ver(page)).toHaveText('v1');
  await expect(page.locator('#lbStrip .lbs-tile')).toHaveCount(2);
  await page.waitForTimeout(3000);
  await expect(ver(page)).toHaveText('v1');
  await open(second);
  await expect(ver(page)).toHaveText('v2');
  expect(errors).toEqual([]);
});

test('top-bar Gallery icon closes the open figure and returns to the grid',async({page})=>{
  await page.goto(origin+'/?embedded=atelier');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#bce5bc';x.fillRect(0,0,400,300);return c.toDataURL().split(',')[1];});
  fs.writeFileSync(path.join(root,'grid.png'),Buffer.from(png,'base64'));
  await page.evaluate(async()=>{lbList=([{rel:'grid.png',name:'grid.png',ext:'png'}] as unknown as typeof lbList);await lbShow(0);await lbVersionReady;});
  await expect(page.locator('#lb')).toHaveClass(/\bshow\b/);
  // Seule la fenêtre hôte commande le retour : un message d'ailleurs est ignoré.
  await page.evaluate(()=>{const f=document.createElement('iframe');document.body.append(f);window.dispatchEvent(new MessageEvent('message',{data:{type:'atelier-gallery-grid'},source:f.contentWindow}));});
  await page.waitForTimeout(100);
  await expect(page.locator('#lb')).toHaveClass(/\bshow\b/);
  await page.evaluate(()=>window.postMessage({type:'atelier-gallery-grid'},'*'));
  await expect(page.locator('#lb')).not.toHaveClass(/\bshow\b/);
});

// Lot 3 puis variante A (2026-11-16) : les notes d'une figure sont gardées par
// le serveur avec la version où elles ont été posées ; une fois envoyées, elles
// quittent la figure et vivent dans « Envoyées » ; la version suivante arrive propre.
test('figure notes stay with their version, leave the figure once sent and live in the sent list',async({page})=>{
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:800});
  await page.goto(origin+'/?embedded=atelier');
  const picture=(w: number,h: number,color: string)=>page.evaluate(([w,h,color])=>{const c=document.createElement('canvas');c.width=w as number;c.height=h as number;const x=c.getContext('2d');x.fillStyle=color as string;x.fillRect(0,0,c.width,c.height);return c.toDataURL().split(',')[1];},[w,h,color]);
  const first=Buffer.from(await picture(800,500,'#dbe7f0'),'base64'),second=Buffer.from(await picture(1000,625,'#e9e2d0'),'base64');
  const file=path.join(root,'durable.png');fs.writeFileSync(file,first);
  const show=async()=>{await page.evaluate(async()=>{lbList=([{rel:'durable.png',name:'durable.png',ext:'png'}] as unknown as typeof lbList);await lbShow(0);await lbVersionReady;});await expect(ver(page)).toHaveText(/v\d/);};
  // What the server keeps, version by version: « n:status:text ».
  const kept=()=>page.evaluate(async()=>{const r=await fetch('/figure-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:['durable.png']})});return (await r.json()).versions.map((v: any)=>(v.notes||[]).map((n: any)=>n.n+':'+n.status+':'+n.text));});
  const saves: any[]=[];
  await page.route('**/save',async route=>{saves.push(route.request().postDataJSON());await route.fulfill({json:{path:'.fig_thumbs/annotation-previews/durable_annot.png'}});});
  const at=async(x: number,y: number)=>{const r=await page.locator('#annotCv').boundingBox();return [r.x+x*r.width,r.y+y*r.height] as const;};
  const drag=async(x1: number,y1: number,x2: number,y2: number)=>{const a=await at(x1,y1),b=await at(x2,y2);await page.mouse.move(a[0],a[1]);await page.mouse.down();await page.mouse.move(b[0],b[1],{steps:5});await page.mouse.up();};
  const note=page.locator('#annotNote textarea'),own=page.locator('#annotItems .annot-row');
  await show();

  // Two notes on v1: the server has them a moment later, still to send.
  await page.locator('#lbAnnot').click();await page.waitForFunction(()=>lb().classList.contains('annot'));
  await drag(.1,.1,.6,.2);await note.fill('Titre trop long');await note.press('Enter');
  await page.keyboard.press('p');{const p=await at(.25,.7);await page.mouse.click(p[0],p[1]);}await note.fill('Unité manquante');await note.press('Enter');
  await expect.poll(kept).toEqual([['1:draft:Titre trop long','2:draft:Unité manquante']]);
  const drawn=await page.evaluate(()=>annotStrokes.map(s=>[s.tool,s.x1/800,s.y1/500,s.x2/800,s.y2/500]));

  // A reload loses nothing: same notes, same places, read-only until « Annoter ».
  await page.goto(origin+'/?embedded=atelier');await show();
  await expect(page.locator('#lbNotesN')).toHaveText('2');
  expect(await page.evaluate(()=>annotPanelOpen)).toBe(false);
  {const back=await page.evaluate(()=>annotStrokes.map(s=>[s.tool,s.x1/800,s.y1/500,s.x2/800,s.y2/500]));
  expect(back.map(s=>s[0])).toEqual(['rect','point']);
  back.forEach((s,i)=>s.slice(1).forEach((v,j)=>expect(Math.abs((v as number)-(drawn[i][j+1] as number))).toBeLessThan(.001)));}
  // The band is back on « Versions », with the count on the « Notes » tab; changing
  // tab never moves the figure.
  await expect(page.locator('#lbTabVersions')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#lbStripRow')).toBeVisible();await expect(page.locator('#annotPanel')).toBeHidden();
  const figure=()=>page.evaluate(()=>{const r=document.getElementById('lbWrap').getBoundingClientRect(),b=document.getElementById('lbStrip').getBoundingClientRect();return[r.left,r.top,r.width,r.height,b.top,b.height].map(Math.round);});
  const placed=await figure();
  await page.locator('#lbTabNotes').click();await page.waitForFunction(()=>annotPanelOpen);
  await expect(page.locator('#lbTabNotes')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#annotPanel')).toBeVisible();await expect(page.locator('#lbStripRow')).toBeHidden();
  expect(await figure()).toEqual(placed);
  await page.locator('#lbTabVersions').click();await expect(page.locator('#lbStripRow')).toBeVisible();
  expect(await page.evaluate(()=>annotPanelOpen)).toBe(false);expect(await figure()).toEqual(placed);
  await page.locator('#lbTabNotes').click();await page.waitForFunction(()=>annotPanelOpen);
  await expect(own).toHaveText(['1Titre trop long','2Unité manquante']);

  // Variant A (Thierry 2026-11-16): sent notes leave the figure. The server keeps
  // them « sent » with v1, and « Envoyées 2 » lists them.
  const sentBtn=page.locator('#annotSentBtn'),sentRows=page.locator('#annotSentItems .annot-row');
  await expect(sentBtn).toBeHidden();
  await page.locator('#lbAnnot').click();await page.waitForFunction(()=>lb().classList.contains('annot'));
  await page.locator('#annotSendAll').click();
  await page.waitForFunction(()=>!annotBusy&&annotStrokes.length===0);
  expect(saves).toHaveLength(1);expect(saves[0].notes.map((n: any)=>n.text)).toEqual(['Titre trop long','Unité manquante']);
  await expect.poll(kept).toEqual([['1:sent:Titre trop long','2:sent:Unité manquante']]);
  await expect(own).toHaveCount(0);await expect(page.locator('#lbNotesN')).toHaveText('');
  await expect(sentBtn).toBeVisible();await expect(sentBtn).toHaveText('Envoyées2');await expect(sentBtn).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#annotSendAll')).toBeDisabled();
  await expect(tile(page,1).locator('.lbs-notes')).toHaveText('2 notes envoyées');
  const ink=()=>page.locator('#annotCv').evaluate((c: HTMLCanvasElement)=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>40)n++;return n;});
  expect(await ink()).toBe(0);

  // v2 arrives (another pixel size): the viewer leaves the drawing mode and v2 is clean.
  fs.writeFileSync(file,second);
  await expect(ver(page)).toHaveText('v2',{timeout:8000});
  expect(await page.evaluate(()=>[lb().classList.contains('annot'),annotPanelOpen,annotStrokes.length,annotPeek])).toEqual([false,true,0,null]);
  // The tab chosen before v2 is kept (« Notes »), and « Versions » counts the new one.
  await expect(page.locator('#lbTabNotes')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#lbVersionsN')).toHaveText('2');
  await expect(page.locator('#lbNotesN')).toHaveText('');
  await expect(page.locator('#annotEmpty')).toBeVisible();
  await expect(tile(page,2).locator('.lbs-n')).toHaveText('actuelle');
  expect(await ink()).toBe(0);

  // « Envoyées » lists them, version first; a row shows its mark on v2, at the same place, until clicked again.
  await sentBtn.click();await expect(sentBtn).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#annotSent')).toBeVisible();await expect(page.locator('#annotItems')).toBeHidden();await expect(page.locator('#annotEmpty')).toBeHidden();
  await expect(sentRows).toHaveText(['1v1Titre trop long','2v1Unité manquante']);
  await sentRows.nth(0).click();await expect(sentRows.nth(0)).toHaveAttribute('aria-pressed','true');
  expect(await ink()).toBeGreaterThan(200);
  {const peek=await page.evaluate(()=>{const s=annotPeekStroke();return[s.x1/1000,s.y1/625,s.x2/1000,s.y2/625];});
  peek.forEach((v,j)=>expect(Math.abs(v-(drawn[0][j+1] as number))).toBeLessThan(.001));}
  await sentRows.nth(0).click();await expect(sentRows.nth(0)).toHaveAttribute('aria-pressed','false');
  expect(await ink()).toBe(0);
  // Rows are read-only: no drawing mode, no note opened.
  expect(await page.evaluate(()=>[lb().classList.contains('annot'),annotEditing])).toEqual([false,null]);

  // The bin removes one note, at the server too; « Tout effacer » asks a second click.
  await page.locator('#annotSentItems .annot-item').nth(1).hover();
  await page.locator('#annotSentItems .annot-trash').nth(1).click();
  await expect(sentRows).toHaveText(['1v1Titre trop long']);
  await expect.poll(kept).toEqual([['1:sent:Titre trop long'],[]]);
  await expect(tile(page,1).locator('.lbs-notes')).toHaveText('1 note envoyée');
  await page.locator('#annotSentClear').click();await expect(page.locator('#annotSentClear')).toHaveText('Effacer la note');
  await expect.poll(kept).toEqual([['1:sent:Titre trop long'],[]]);
  await page.locator('#annotSentClear').click();
  await expect.poll(kept).toEqual([[],[]]);
  await expect(sentBtn).toBeHidden();await expect(page.locator('#annotSent')).toBeHidden();await expect(page.locator('#annotEmpty')).toBeVisible();
  await expect(tile(page,1).locator('.lbs-notes')).toBeHidden();

  // Back on v1: nothing left on it either.
  await page.locator('#lbTabVersions').click();await tile(page,1).click();await expect(ver(page)).toHaveText('v1');
  await page.locator('#lbTabNotes').click();await page.waitForFunction(()=>annotPanelOpen);
  expect(await page.evaluate(()=>annotStrokes.length)).toBe(0);
  await page.locator('#lbAnnot').click();await page.waitForFunction(()=>lb().classList.contains('annot'));

  // The only tab change nobody clicked: tracing a mark shows « Notes », to write its note at once.
  await page.locator('#lbTabVersions').click();await expect(page.locator('#lbStripRow')).toBeVisible();
  expect(await page.evaluate(()=>lb().classList.contains('annot'))).toBe(true);
  await page.keyboard.press('r');await drag(.6,.5,.9,.8);
  await expect(page.locator('#lbTabNotes')).toHaveAttribute('aria-selected','true');
  await expect(note).toBeFocused();await note.fill('Échelle à revoir');await note.press('Enter');
  await expect(page.locator('#lbNotesN')).toHaveText('1');
  // The arrows move between the two tabs, never between figures.
  await page.keyboard.press('Escape');await page.keyboard.press('a');await page.waitForFunction(()=>!lb().classList.contains('annot'));
  await page.locator('#lbTabNotes').focus();await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#lbTabVersions')).toBeFocused();await expect(page.locator('#lbTabVersions')).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#lbTabNotes')).toBeFocused();await expect(page.locator('#annotPanel')).toBeVisible();
  await expect(ver(page)).toHaveText('v1');
  // The « vN » button of the bar closes the whole band and brings it back on « Versions ».
  await page.locator('#lbHistBtn').click();await expect(page.locator('#lbStrip')).toBeHidden();
  expect(await page.evaluate(()=>annotPanelOpen)).toBe(false);
  await page.locator('#lbHistBtn').click();await expect(page.locator('#lbStripRow')).toBeVisible();
  await expect(page.locator('#lbNotesN')).toHaveText('1');
  expect(errors).toEqual([]);
});

// Bande repliée (Thierry 2026-11-16) : à 12 versions, la bande ne défile plus de
// côté ; les plus anciennes se rangent dans une pile, et un clic sur la pile
// ouvre au-dessus de la bande la grille de toutes les versions. Échap, un clic
// ailleurs ou un choix la referment ; rien ne s'ouvre seul.
test('many versions fold the oldest into a pile that opens a grid of every version',async({page,request})=>{
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:800});
  await page.goto(origin+'/?embedded=atelier');
  const png=async(color: string)=>Buffer.from(await page.evaluate(color=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,400,300);return c.toDataURL('image/png').split(',')[1];},color),'base64');
  const lead=path.join(root,'many.png');
  for(let i=0;i<12;i++){
    fs.writeFileSync(lead,await png('hsl('+(i*30)+',55%,80%)'));
    expect((await request.post(origin+'/rescan',{headers:{Origin:origin}})).ok()).toBe(true);
    await expect.poll(async()=>(await request.get(origin+'/figure-version?path=many.png&version='+(i+1))).status(),{timeout:8000}).toBe(200);
  }
  await page.evaluate(async()=>{lbList=([{rel:'many.png',name:'many.png',ext:'png',folder:'.'}] as unknown as typeof lbList);await lbShow(0);await lbVersionReady;});
  await expect(ver(page)).toHaveText('v12');
  await expect(page.locator('#lbVersionsN')).toHaveText('12');
  const pile=page.locator('#lbStripRow .lbs-pile'),grid=page.locator('#lbVersGrid'),shown=page.locator('#lbStripRow .lbs-tile:not(.lbs-pile)');
  // The latest versions that fit, the rest in the pile: no sideways scrolling.
  await expect(pile).toBeVisible();
  const kept=await shown.count(),folded=12-kept;
  expect(kept).toBeGreaterThan(2);expect(folded).toBeGreaterThan(1);
  await expect(pile.locator('.lbs-more')).toHaveText('+'+folded);
  await expect(pile.locator('.lbs-l b')).toHaveText('v1 – v'+folded);
  await expect(shown.last().locator('.lbs-l b')).toHaveText('v12');
  expect(await page.locator('#lbStripRow').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await expect(grid).toBeHidden();
  // A click on the pile opens the grid above the band, newest first; the figure does not move.
  const figure=()=>page.evaluate(()=>{const r=document.getElementById('lbWrap').getBoundingClientRect();return[r.left,r.top,r.width,r.height].map(Math.round);});
  const placed=await figure();
  await pile.click();await expect(grid).toBeVisible();await expect(pile).toHaveAttribute('aria-expanded','true');
  await expect(grid.locator('.lbs-tile')).toHaveCount(12);
  await expect(grid.locator('.lbs-tile').first().locator('.lbs-l b')).toHaveText('v12');
  await expect(grid.locator('.lbs-tile').first().locator('.lbs-n')).toHaveText('actuelle');
  await expect(grid.locator('.lbs-tile.sel .lbs-l b')).toHaveText('v12');
  await expect.poll(()=>page.evaluate(()=>{const g=document.getElementById('lbVersGrid').getBoundingClientRect(),b=document.getElementById('lbStrip').getBoundingClientRect();return g.bottom<=b.top+.5&&g.height>0;})).toBe(true);
  expect(await figure()).toEqual(placed);
  // Escape closes the grid, not the viewer.
  await page.keyboard.press('Escape');await expect(grid).toBeHidden();
  await expect(page.locator('#lb')).toHaveClass(/\bshow\b/);await expect(pile).toHaveAttribute('aria-expanded','false');
  // A click elsewhere closes it too.
  await pile.click();await expect(grid).toBeVisible();
  await page.locator('#lbViewport').click({position:{x:20,y:20}});await expect(grid).toBeHidden();
  await expect(page.locator('#lb')).toHaveClass(/\bshow\b/);
  // Picking an old version shows it; it takes the pile's place, with the count of the others.
  await pile.click();await grid.locator('.lbs-tile[data-version="2"]').click();
  await expect(grid).toBeHidden();await expect(ver(page)).toHaveText('v2');
  await expect(pile).toHaveClass(/\bsel\b/);
  await expect(pile.locator('.lbs-l b')).toHaveText('v2');
  await expect(pile.locator('.lbs-n')).toHaveText('+'+(folded-1)+' plus anciennes');
  // A latest version in the band brings the pile back to its range.
  await shown.last().click();await expect(ver(page)).toHaveText('v12');
  await expect(pile.locator('.lbs-l b')).toHaveText('v1 – v'+folded);await expect(pile).not.toHaveClass(/\bsel\b/);
  // A wide viewer shows every version again.
  await page.setViewportSize({width:2200,height:800});
  await expect(pile).toHaveCount(0);await expect(shown).toHaveCount(12);
  expect(errors).toEqual([]);
});
