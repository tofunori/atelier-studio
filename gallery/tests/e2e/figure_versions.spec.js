import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
let root,child,origin;
test.beforeAll(async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'atelier-figure-versions-'));
  fs.writeFileSync(path.join(root,'figures_data.json'),JSON.stringify({files:[]}));
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
  const port=socket.address().port;await new Promise(r=>socket.close(r));origin='http://127.0.0.1:'+port;
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
  await page.evaluate(async()=>{lbList=[{rel:'toolbar.png',name:'toolbar.png',ext:'png'}];await lbShow(0);await lbVersionReady;});
  await expect(page.locator('#lb')).toHaveClass(/responsive-viewer/);
  for(const width of [240,280,360,490,600,760,960,1120]){
    await page.locator('#lb').evaluate((el,w)=>el.style.setProperty('--lb-width',w+'px'),width);
    await expect.poll(()=>page.locator('#lbHead').evaluate(el=>{
      const bounds=el.getBoundingClientRect();
      return el.scrollWidth<=el.clientWidth && [...el.querySelectorAll(':scope > button, :scope > #lbVersions > button, :scope > details > summary')].filter(b=>b.getBoundingClientRect().width).every(b=>{const r=b.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right;});
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
  expect(await page.locator('#lbWrap').evaluate(el=>el.offsetWidth)).toBeCloseTo(1600,0);
  await page.locator('#lbAnnot').click();
  await expect(page.locator('#annotBar')).toBeVisible();
  expect(await page.locator('#annotBar').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.locator('#annotDone').click();
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
      const first=el.querySelector(':scope > button, :scope > #lbVersions');
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

test('open figure updates from disk, keeps immutable versions and version-specific annotations',async({page,request},testInfo)=>{
  await page.goto(origin);
  const png=async(color)=>Buffer.from(await page.evaluate(color=>{const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,800,500);return c.toDataURL('image/png').split(',')[1];},color),'base64');
  const first=await png('#bcdfeb'),second=await png('#e8caaa'),third=await png('#bce5bc');
  const file=path.join(root,'figure.png');fs.writeFileSync(file,first);
  await page.evaluate(async()=>{lbList=[{rel:'figure.png',name:'figure.png',ext:'png'}];await lbShow(0);await lbVersionReady;});
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v1');
  await page.evaluate(()=>lbSetZoom(1.5));
  // No rescan, gallery refresh or explicit polling call: the open viewer follows disk changes.
  fs.writeFileSync(file,second);
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v2',{timeout:8000});
  expect(await page.evaluate(()=>lbZoomLevel)).toBe(1.5);
  expect(Buffer.from(await (await request.get(origin+'/figure-version?path=figure.png&version=1')).body())).toEqual(first);
  await page.locator('#lbVersionPrev').click();
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v1');
  const attached=await page.evaluate(async()=>{const send=postChatPayload;let payload;postChatPayload=async value=>{payload=value;};try{await lbAttachDisplayed();return payload;}finally{postChatPayload=send;}});
  expect(attached.text).toContain('Version affichée : v1');
  expect(attached.path).not.toBe('figure.png');
  const attachedColor=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=1;c.height=1;const x=c.getContext('2d');x.drawImage(image,0,0);return [...x.getImageData(0,0,1,1).data];},attached.previewUrl);
  expect(attachedColor).toEqual([188,223,235,255]);
  await page.evaluate(async()=>{await annotToggle();annotStrokes.push({id:'test-note',tool:'rect',x1:40,y1:40,x2:180,y2:100,n:1,note:'Ancienne version'});annotRemember();annotRedraw();});
  fs.writeFileSync(file,third);
  await expect.poll(()=>page.evaluate(()=>lbHistory.rows.at(-1)?.version),{timeout:8000}).toBe(3);
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v1');
  await page.locator('#lbVersionCurrent').click();
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v3');
  expect(await page.evaluate(()=>annotStrokes.length)).toBe(0);
  await page.locator('#lbVersionPrev').click();await expect(page.locator('#lbVersionCurrent')).toHaveText('v2');
  await page.locator('#lbVersionPrev').click();await expect(page.locator('#lbVersionCurrent')).toHaveText('v1');
  expect(await page.evaluate(()=>annotStrokes[0].note)).toBe('Ancienne version');
  await page.locator('#lbVersionCurrent').click();await expect(page.locator('#lbVersionCurrent')).toHaveText('v3');
  // An unsent annotation pauses automatic switching; sending/clearing resumes it.
  await page.evaluate(()=>{annotStrokes.push({id:'pending',tool:'rect',x1:40,y1:40,x2:180,y2:100,n:1,note:'En cours'});annotRemember();annotRedraw();});
  fs.writeFileSync(file,second);
  await expect.poll(()=>page.evaluate(()=>lbHistory.rows.at(-1)?.version),{timeout:8000}).toBe(4);
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v3');
  await page.evaluate(()=>{annotStrokes=[];annotRemember();});
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v4',{timeout:8000});
  // Interrupted saves never replace the last valid image.
  fs.writeFileSync(file,first.subarray(0,20));
  await page.evaluate(()=>lbVersionsPoll());
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v4');
  await page.evaluate(()=>{annotBusy=true;return lbVersionNavigate(-1);});
  expect(await page.evaluate(()=>lbHistory.follow)).toBe(true);
  await page.evaluate(()=>annotBusy=false);
  fs.writeFileSync(file,second);
  await page.reload();
  await page.evaluate(async()=>{lbList=[{rel:'figure.png',name:'figure.png',ext:'png'}];await lbShow(0);await lbVersionReady;});
  await expect(page.locator('#lbVersionCurrent')).toHaveText('v4');
  await page.setViewportSize({width:734,height:797});
  expect(await page.locator('#lbHead').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('figure-versions.png')});
  expect((await request.post(origin+'/figure-versions?path=figure.png',{headers:{Origin:'https://untrusted.example'}})).status()).toBe(403);
  expect((await request.post(origin+'/figure-versions?path='+encodeURIComponent('/etc/passwd'),{headers:{Origin:origin}})).status()).toBe(409);
});
