import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
const repo=process.cwd(), root=realpathSync('/tmp/atelier-public-demo/Observatory');
const output=path.join(repo,'docs/media/public'), web=path.join(repo,'website/public/media');
mkdirSync(output,{recursive:true});mkdirSync(web,{recursive:true});
const port=await new Promise((resolve,reject)=>{const socket=net.createServer();socket.on('error',reject);socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(()=>resolve(p));});});
const origin=`http://127.0.0.1:${port}`;
const gallery=spawn(path.join(repo,'rust/target/debug/atelier-gallery-server'),['--root',root,'--port',String(port)],{cwd:root,env:{...process.env,ATELIER_ASSETS_DIR:path.join(repo,'gallery/assets'),ATELIER_TOOL_ROOT:path.join(repo,'gallery')},stdio:'ignore'});
let startupError, browser;gallery.on('error',e=>startupError=e);
const base=`http://127.0.0.1:4199/scripts/public-demo/index.html?port=${port}`;
const scenes=[['workspace','reading'],['writing','editor'],['graphite','reading','graphite'],['pierre','reading','pierre'],['monokai','reading','monokai'],['settings','settings'],['gallery','gallery'],['editor','editor'],['reading','reading']];
async function context(options={}){
 const ctx=await browser.newContext({viewport:{width:1600,height:1000},locale:'en-US',deviceScaleFactor:1,...options});
 await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());
   return [origin,'http://127.0.0.1:4199'].includes(u.origin)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();
 });
 return ctx;
}
async function check(page,name){
 const texts=await Promise.all(page.frames().map(frame=>frame.locator('body').innerText()));
 const text=texts.join('\n');
 if(/tofunori|Thierry|UTQR|albedo|glacier|\/Users\/|FRQNT|échec de persistance|failed to load/i.test(text)) throw new Error('Capture content check failed: '+name);
 if(!(await page.locator('.topbar').count())||!(await page.locator('.rail').count())) throw new Error('Missing production shell: '+name+' '+page.url()+' '+text.slice(0,1200));
 return text;
}
async function settle(page){
 await page.locator('iframe').waitFor();
 const frame=page.frameLocator('iframe');
 if(!(await page.getByRole('dialog').count()) && await frame.locator('#zOut').count()) {await frame.locator('#zOut').click();}
 await page.waitForTimeout(1700);
}
try{
 let ready=false;
 for(let i=0;i<100;i++){
   if(startupError||gallery.exitCode!==null) throw startupError??new Error('Gallery exited');
   const html=await fetch(origin+'/figures_index.html').then(r=>r.ok?r.text():'').catch(()=>'');
   if(html.includes('Observatory')){ready=true;break;}
   await new Promise(r=>setTimeout(r,200));
 }
 if(!ready) throw new Error('Demo gallery did not become ready');
 browser=await chromium.launch();
 const ctx=await context(), page=await ctx.newPage(), log=[];
 page.on('response',async r=>{if(r.url().includes('/versions')&&r.status()>=400) console.log('Demo version persistence:',r.status(),await r.text());});
 for(const [name,scene,theme='graphite'] of scenes){
  await page.goto(`${base}&scene=${scene}&theme=${theme}`,{waitUntil:'networkidle'});await settle(page);
  const visibleText=await check(page,name);
  await page.screenshot({path:path.join(output,name+'.png')});copyFileSync(path.join(output,name+'.png'),path.join(web,name+'.png'));
  log.push({name,source:'Production shell, panels and surfaces; fictional fixtures',visibleText});
 }
 await ctx.close();
 const tourCtx=await context({recordVideo:{dir:'/tmp/atelier-public-demo/tour',size:{width:1600,height:1000}}});
 const tour=await tourCtx.newPage();
 await tour.goto(base+'&scene=reading',{waitUntil:'networkidle'});await settle(tour);await check(tour,'reading');await tour.waitForTimeout(2500);
 for(const title of ['analysis.py','Atelier','observation-windows.pdf']){
  if(title==='Atelier') { await tour.getByRole('button',{name:'More surfaces',exact:true}).click(); await tour.locator('.topbar-menu-name').getByText('Atelier',{exact:true}).click(); await tour.keyboard.press('Escape'); } else await tour.getByText(title,{exact:true}).first().click();await tour.waitForTimeout(1800);await settle(tour);await check(tour,title);await tour.waitForTimeout(2200);
 }
 await tour.getByRole('button',{name:'Settings',exact:true}).click();await tour.waitForTimeout(1500);await check(tour,'settings');await tour.waitForTimeout(2500);
 const video=tour.video();await tour.close();await tourCtx.close();const source=await video.path();
 execFileSync('ffmpeg',['-y','-i',source,'-an','-c:v','libx264','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',path.join(output,'atelier-tour.mp4')],{stdio:'ignore'});
 execFileSync('ffmpeg',['-y','-i',source,'-vf','fps=6,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse','-loop','0',path.join(output,'atelier-tour.gif')],{stdio:'ignore'});
 copyFileSync(path.join(output,'atelier-tour.mp4'),path.join(web,'atelier-tour.mp4'));
 writeFileSync(path.join(output,'manifest.json'),JSON.stringify({capturedAt:new Date().toISOString(),fixtures:'scripts/public-demo/fixtures.py',scenes:log},null,2));
 console.log('Captured nine full-panel views and a continuous navigation tour.');
}finally{await browser?.close();gallery.kill('SIGTERM');}
