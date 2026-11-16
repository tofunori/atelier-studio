import {test, expect, type Page} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {ChildProcess, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Curseur A/B de « Comparer » : le glissement ne fait bouger que des
// transform, la scène n'est jamais reconstruite pendant ou entre deux gestes,
// et le pointeur garde la poignée là où il l'a prise.
const repo=fileURLToPath(new URL('../../../',import.meta.url));
let root: string,child: ChildProcess,origin: string;
test.beforeAll(async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'atelier-figure-compare-'));
  fs.writeFileSync(path.join(root,'figures_data.json'),JSON.stringify({files:[]}));
  const socket=net.createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));
  const port=(socket.address() as import('node:net').AddressInfo).port;await new Promise(r=>socket.close(r));origin='http://127.0.0.1:'+port;
  child=spawn(path.join(repo,'rust/target/debug/atelier-gallery-server'),['--root',root,'--port',String(port),'--no-watch'],{
    env:{...process.env,ATELIER_ASSETS_DIR:path.join(repo,'gallery/assets'),ATELIER_STUDIO:'1'},stdio:'ignore'});
  await expect.poll(async()=>{try{return (await fetch(origin+'/ping')).status;}catch{return 0;}}).toBe(200);
});
test.afterAll(async()=>{if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}if(root)fs.rmSync(root,{recursive:true,force:true});});

const png=(page: Page,color: string)=>page.evaluate(c=>{const k=document.createElement('canvas');k.width=800;k.height=500;const x=k.getContext('2d');x.fillStyle=c;x.fillRect(0,0,800,500);return k.toDataURL().split(',')[1];},color).then(b=>Buffer.from(b,'base64'));
const shift=(page: Page,sel: string)=>page.locator(sel).evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

test('compare slider drags on the compositor only, without rebuilding the stage',async({page})=>{
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:800});
  await page.goto(origin+'/?embedded=atelier');
  const file=path.join(root,'figure.png');
  fs.writeFileSync(file,await png(page,'#bcdfeb'));
  await page.evaluate(async()=>{lbList=([{rel:'figure.png',name:'figure.png',ext:'png'}] as unknown as typeof lbList);await lbShow(0);await lbVersionReady;});
  fs.writeFileSync(file,await png(page,'#ebcfbc'));
  await expect.poll(()=>page.evaluate(()=>lbHistory.rows.length),{timeout:8000}).toBe(2);
  await page.locator('#lbCompareBtn').click();
  const split=page.locator('#lbCompare .lbc-split'),handle=split.locator('.lbc-handle');
  await expect.poll(()=>split.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(100);
  const box=await split.boundingBox();
  // No clip-path, no `left` per position: the B pane, its image and the handle move by transform only.
  expect(await split.locator('.lbc-b').evaluate(el=>getComputedStyle(el).clipPath)).toBe('none');
  expect(await shift(page,'#lbCompare .lbc-handle')).toBeCloseTo(box.width/2,0);
  expect(await shift(page,'#lbCompare .lbc-b')).toBeCloseTo(box.width/2,0);
  expect(await shift(page,'#lbCompare .lbc-b img')).toBeCloseTo(-box.width/2,0);
  await split.evaluate(el=>{(el as HTMLElement & {_mark?: boolean})._mark=true;});
  // The stage survives the 2.5 s poll: same versions, same nodes.
  await page.evaluate(()=>lbVersionsPoll());await page.evaluate(()=>lbVersionReady);
  expect(await split.evaluate(el=>(el as HTMLElement & {_mark?: boolean})._mark===true&&el.isConnected)).toBe(true);
  // Grabbing the handle a few pixels off its line does not make it jump.
  const y=box.y+box.height/2;
  await page.mouse.move(box.x+box.width/2+6,y);await page.mouse.down();
  await expect(handle).toHaveAttribute('aria-valuenow','50');
  expect(await split.evaluate(el=>el.classList.contains('dragging'))).toBe(true);
  // A poll during the drag is skipped: the gesture is never interrupted.
  expect(await page.evaluate(()=>{const before=lbHistory.busy;lbVersionsPoll();return lbHistory.busy===before;})).toBe(true);
  await page.mouse.move(box.x+box.width*.8+6,y,{steps:12});
  // Leaving the figure keeps the capture: the slider clamps at the edge.
  await page.mouse.move(box.x+box.width+200,y,{steps:4});
  await expect(handle).toHaveAttribute('aria-valuenow','100');
  await page.mouse.move(box.x+box.width*.3+6,y,{steps:12});
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow','30');
  expect(await split.evaluate(el=>el.classList.contains('dragging'))).toBe(false);
  expect(await shift(page,'#lbCompare .lbc-handle')).toBeCloseTo(box.width*.3,0);
  expect(await page.evaluate(()=>window.getSelection()?.toString()??'')).toBe('');
  expect(await split.evaluate(el=>(el as HTMLElement & {_mark?: boolean})._mark===true)).toBe(true);
  // A click away from the handle still sets the split there.
  await page.mouse.click(box.x+box.width*.25,y);
  await expect(handle).toHaveAttribute('aria-valuenow','25');
  // Keyboard: arrows by 5 %, Shift by 1 %, Home and End.
  await handle.focus();
  await page.keyboard.press('ArrowRight');await expect(handle).toHaveAttribute('aria-valuenow','30');
  await page.keyboard.press('Shift+ArrowLeft');await expect(handle).toHaveAttribute('aria-valuenow','29');
  await page.keyboard.press('End');await expect(handle).toHaveAttribute('aria-valuenow','100');
  await page.keyboard.press('Home');await expect(handle).toHaveAttribute('aria-valuenow','0');
  // Left of the line shows A, right shows B: the colours sit where the split says.
  await page.mouse.click(box.x+box.width*.5,y);
  await page.waitForTimeout(200);
  const shot=await page.screenshot({clip:{x:box.x,y:box.y,width:box.width,height:box.height}});
  const colors=await page.evaluate(async b64=>{const i=new Image();i.src='data:image/png;base64,'+b64;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);
    const at=(fx: number)=>[...x.getImageData(Math.round(i.width*fx),Math.round(i.height*.75),1,1).data].slice(0,3);return [at(.2),at(.8)];},shot.toString('base64'));
  const near=(c: number[],want: number[])=>c.every((v,k)=>Math.abs(v-want[k])<=6);
  expect(near(colors[0],[188,223,235])).toBe(true);
  expect(near(colors[1],[235,207,188])).toBe(true);
  // Side by side and back rebuilds once, then Escape leaves cleanly.
  await page.locator('#lbCompare .lbc-seg button[data-mode="side"]').click();
  await expect(page.locator('#lbCompare .lbc-side figure')).toHaveCount(2);
  await page.locator('#lbCompare .lbc-seg button[data-mode="slider"]').click();
  await expect(handle).toHaveAttribute('aria-valuenow','50');
  await page.keyboard.press('Escape');
  await expect(page.locator('#lbCompare')).toBeHidden();
  expect(await page.evaluate(()=>lbcDragging)).toBe(false);
  expect(errors).toEqual([]);
});
