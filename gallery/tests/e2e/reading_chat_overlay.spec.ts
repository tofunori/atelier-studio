import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
test('reading chat floats above the fullscreen iframe and keeps reading on send',async({page})=>{
  const result=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {ReadingChatOverlay} from './src/components/ReadingChatOverlay'; import {createThreadEventStore} from './src/lib/threadEventStore'; const store=createThreadEventStore({a:[{kind:'text',text:'La réponse du chat actif.'}]}); window.sent=[];createRoot(document.getElementById('root')).render(<ReadingChatOverlay threadId="a" store={store} topLayer={true} prompt="" onPromptChange={()=>{}} count={2} disabled={false} working={false} onClear={()=>{}} onSend={value=>window.sent.push(value)}/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outdir:'/tmp/reading-chat-test',jsx:'automatic',platform:'browser',format:'iife'});
  await page.setContent('<style>iframe{position:fixed;inset:0;margin:0;width:100vw;height:100vh;border:0}</style><iframe popover="manual" srcdoc="<h1>MODIS albedo retrieval</h1><p>Document en lecture</p>"></iframe><div id="root"></div>');
  await page.evaluate(()=>document.querySelector('iframe').showPopover());
  for(const output of result.outputFiles) {
    if(output.path.endsWith('.css'))await page.addStyleTag({content:output.text});
    else await page.addScriptTag({content:output.text});
  }
  const send=page.getByRole('button',{name:'Envoyer les annotations'});
  await expect(send).toBeVisible();
  await send.click();
  await expect.poll(()=>page.evaluate(()=>window.sent)).toEqual([true]);
  expect(await page.locator('iframe').evaluate(el=>el.matches(':popover-open'))).toBe(true);
  await page.getByRole('button',{name:'Dernière réponse'}).click();
  await expect(page.getByText('La réponse du chat actif.')).toBeVisible();
  await page.setViewportSize({width:390,height:760});
  const box=await page.locator('.reading-chat-overlay').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:'/tmp/atelier-reading-overlay-webkit.png'});
});
