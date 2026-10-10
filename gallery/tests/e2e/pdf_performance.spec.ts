import {test, expect} from '@playwright/test';
import {spawnGalleryServer, freePort, stopGalleryServer, waitForServer} from '../gallery_server.mts';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {removeTempRoot} from './temp-root.ts';
import { type ChildProcessWithoutNullStreams,type ChildProcessByStdio,ChildProcess } from 'node:child_process';
import { Writable,Readable } from 'node:stream';

// An actual 20-page PDF, with one landscape sheet and page-specific phrases.
// No production document, conversion process or fixture dependency is needed.
function longPdf(count=20){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids=[];
  for(let n=1;n<=count;n++){
    const page=objects.length+1, content=page+1; kids.push(`${page} 0 R`);
    const width=n===19?800:600, height=n===19?600:800;
    const stream=`BT /F1 14 Tf 35 ${height-60} Td (Page ${n} marker${n} needle${n}) Tj 0 -24 Td (Surface albedo and glacier snow.) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Count ${count} /Kids [${kids.join(' ')}] >>`;
  let body='%PDF-1.4\n', offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(body);
  body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))body+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  return body+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

let root: string, server: import("node:child_process").ChildProcess, port: number;
test.beforeAll(async()=>{
  root=mkdtempSync(path.join(tmpdir(),'atelier-pdf-performance-'));
  writeFileSync(path.join(root,'long.pdf'),longPdf());
  writeFileSync(path.join(root,'figures_data.json'),'{}');
  writeFileSync(path.join(root,'figures_index.html'),'<html></html>');
  port=await freePort();server=spawnGalleryServer({root,port,watch:false});
  await waitForServer(port,{child:server});
});
test.afterAll(async()=>{await stopGalleryServer(server);await removeTempRoot(root);});
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    const stats: Record<string,any>=window.__pdfStats={loads:0,destroyed:0,destroyedIds:[],texts:{} as Record<string, any>,active:0,peak:0};
    let currentLib;
    Object.defineProperty(window,'pdfjsLib',{configurable:true,get:()=>currentLib,set(lib){
      const wrapped={...lib,getDocument(options){
        const id=stats.loads++;
        const task=lib.getDocument(options);
        return {destroy:async()=>{stats.destroyed++;stats.destroyedIds.push(id);await stats.beforeDestroy?.(id);return task.destroy();},promise:task.promise.then((doc)=>{
          const getPage=doc.getPage.bind(doc);
          doc.getPage=async (n)=>{
            const proxy=await getPage(n);
            if(!proxy.__instrumented){
              proxy.__instrumented=true;
              const text=proxy.getTextContent.bind(proxy),render=proxy.render.bind(proxy);
              proxy.getTextContent=(...args)=>{stats.texts[n]=(stats.texts[n]||0)+1;return text(...args);};
              proxy.render=(...args)=>{
                stats.active++;stats.peak=Math.max(stats.peak,stats.active);
                const result=render(...args);result.promise.then(()=>stats.active--,()=>stats.active--);return result;
              };
            }
            return proxy;
          };
          return doc;
        })};
      }};
      currentLib=wrapped;
    }});
  });
});

test('a failed newer reload during a successful reload drain retains a working document',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=long.pdf`);
  await expect(page.locator('.pg[data-page="1"] .textLayer')).toBeAttached();
  await page.evaluate(()=>{
    const original=pdfRenderScheduler.drain;
    let release;const gate=new Promise(resolve=>{release=resolve;});
    window.__releaseDrain=release;
    pdfRenderScheduler.drain=((async keys=>{
      await original(keys);pdfRenderScheduler.drain=original;
      window.__waitingForDrain=true;await gate;
    }) as unknown as typeof pdfRenderScheduler.drain);
    window.__firstReload=__reloadPdf();
  });
  await expect.poll(()=>page.evaluate(()=>window.__waitingForDrain)).toBe(true);
  await page.route('**/long.pdf?*',route=>route.fulfill({status:500,body:'Temporary read error'}));
  await page.evaluate(()=>__reloadPdf());
  await page.evaluate(async()=>{window.__releaseDrain();await window.__firstReload;});
  const stats: Record<string,any>=await page.evaluate(()=>window.__pdfStats);
  expect(stats.destroyedIds).not.toContain(0);
  expect(stats.loads-stats.destroyed).toBe(1);
  await page.click('#findBtn');await page.fill('#findBar input','needle20');
  await expect(page.locator('.pg[data-page="20"] .find-cur')).toContainText('needle20');
  await page.click('#zIn');
  await expect(page.locator('#zPct')).toHaveText('120%');
  await expect(page.locator('.pg[data-page="20"] .find-cur')).toContainText('needle20');
  expect(errors).toEqual([]);
});

test('a citation whose page is off by one is found on the next page',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=long.pdf&page=19&quote=marker20`);
  await expect(page.locator('#status')).toContainText('Passage retrouvé — p. 20');
  await expect(page.locator('.pg[data-page="20"] .pdfsel').first()).toBeVisible();
  expect(await page.evaluate(()=>hlText())).toBe('marker20');
  await expect(page.locator('#selPill')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a distant citation is ready without extracting all earlier pages',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=long.pdf&page=20&quote=marker20`);
  // La citation arrive SÉLECTIONNÉE (barre de sélection ouverte), pas enregistrée.
  await expect(page.locator('#status')).toContainText('Passage retrouvé');
  await expect(page.locator('.pg[data-page="20"] .pdfsel').first()).toBeVisible();
  expect(await page.evaluate(()=>hlText())).toBe('marker20');
  await expect(page.locator('#selPill')).toBeVisible();
  const stats: Record<string,any>=await page.evaluate(()=>window.__pdfStats);
  expect(Object.keys(stats.texts).length).toBeLessThan(8);
  expect(stats.texts[20]).toBe(1);expect(stats.peak).toBeLessThanOrEqual(2);
  expect(await page.locator('.textLayer').count()).toBeLessThan(8);
  expect(errors).toEqual([]);
});

test('a committed replacement refreshes search when a newer request fails during old-document destruction',async({page})=>{
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=long.pdf`);
  await expect(page.locator('.pg[data-page="1"] .textLayer')).toBeAttached();
  await page.click('#findBtn');await page.fill('#findBar input','needle20');
  await expect(page.locator('#findBar .cnt')).toHaveText('1/1');
  let requests=0;
  await page.route('**/long.pdf?*',route=>++requests===1
    ? route.fulfill({status:200,contentType:'application/pdf',body:longPdf(3)})
    : route.fulfill({status:500,body:'Temporary read error'}));
  await page.evaluate(()=>{
    let release;const gate=new Promise(resolve=>{release=resolve;});
    window.__releaseDestroy=release;
    window.__pdfStats.beforeDestroy=async (id)=>{if(id===0){window.__waitingForDestroy=true;await gate;}};
    window.__committedReload=__reloadPdf();
  });
  await expect.poll(()=>page.evaluate(()=>window.__waitingForDestroy)).toBe(true);
  await page.evaluate(()=>__reloadPdf());
  await page.evaluate(async()=>{window.__releaseDestroy();await window.__committedReload;});
  await expect(page.locator('.pg')).toHaveCount(3);
  await expect(page.locator('#findBar .cnt')).toHaveText('aucun');
});

test('search indexes distant pages without DOM and survives zoom, mixed sizes and reloads',async({page})=>{
  test.setTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/.fig_thumbs/pdf_viewer.html?file=long.pdf`);
  await expect(page.locator('.pg[data-page="1"] .textLayer')).toBeAttached();
  await page.click('#findBtn');await page.fill('#findBar input','needle20');
  await expect(page.locator('#findBar .cnt')).toHaveText('1/1',{timeout:15000});
  await expect(page.locator('.pg[data-page="20"] .find-cur')).toContainText('needle20');
  expect(await page.locator('.textLayer').count()).toBeLessThan(8);
  const oldScale=await page.locator('.pg[data-page="20"]').getAttribute('data-vscale');
  await page.click('#zIn');
  await expect(page.locator('#zPct')).toHaveText('120%');
  await expect.poll(()=>page.locator('.pg[data-page="20"]').evaluate(el=>el.dataset.vscale)).not.toBe(oldScale);
  await expect(page.locator('.pg[data-page="20"] .find-cur')).toContainText('needle20');
  const before=await page.evaluate(()=>window.__pdfStats);
  expect(Object.keys(before.texts)).toHaveLength(20);
  expect(Object.values(before.texts).every(count=>count===1)).toBe(true);
  expect(before.peak).toBeLessThanOrEqual(2);
  await page.locator('.pg[data-page="19"]').scrollIntoViewIfNeeded();
  await expect(page.locator('.pg[data-page="19"] .textLayer')).toBeAttached();
  expect(await page.locator('.pg[data-page="19"]').evaluate(el=>(el as HTMLElement).offsetWidth>(el as HTMLElement).offsetHeight)).toBe(true);
  await page.click('#findBar .fclose');
  for(let n=0;n<4;n++)await page.evaluate(()=>__reloadPdf());
  await page.evaluate(()=>Promise.all([__reloadPdf(),__reloadPdf()]));
  await page.evaluate(()=>{window.__lastGoodPage=document.querySelector('.pg .textLayer');});
  await page.route('**/long.pdf?*',route=>route.fulfill({status:500,body:'Temporary read error'}));
  await page.evaluate(()=>__reloadPdf());
  expect(await page.evaluate(()=>window.__lastGoodPage.isConnected)).toBe(true);
  const after=await page.evaluate(()=>window.__pdfStats);
  expect(after.loads-after.destroyed).toBe(1);expect(after.peak).toBeLessThanOrEqual(2);
  await expect(page.locator('.pg .textLayer').first()).toBeAttached();
  expect(errors).toEqual([]);
});
