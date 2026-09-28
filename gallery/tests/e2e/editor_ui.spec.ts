import {test, expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

test.use({browserName:'webkit'});
const assets = new URL('../../assets/', import.meta.url);
const html = await readFile(new URL('code_editor.html', assets), 'utf8');
const css = (await Promise.all(['code_editor.css','csv_table.css'].map(file => readFile(new URL(file, assets),'utf8')))).join('\n').replace(/@import[^;]+;/g,'');
const toolkit = await readFile(new URL('csv_table.js', assets),'utf8');
const core = (await build({entryPoints:[new URL('../../src/studio/core/index.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'AtelierStudioCore'})).outputFiles[0].text;
const code = (await build({entryPoints:[new URL('../../src/studio/features/code/index.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'AtelierStudioCode'})).outputFiles[0].text;
const shell = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,'');

async function mount(page: Page){
  await page.route('http://editor.test/**', (route) => {
    if(route.request().url().includes('/ls?')) return route.fulfill({json:{path:'/project',items:[{name:'notes.md',dir:false},{name:'data.csv',dir:false}]}});
    return route.fulfill({contentType:'text/html',body:shell});
  });
  await page.goto('http://editor.test/code_editor.html');
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:core}); await page.addScriptTag({content:code}); await page.addScriptTag({content:toolkit});
  await page.addScriptTag({content:html.match(/<script\b[^>]*data-atelier-source="gallery\/src\/browser\/pages\/code_editor_3\.ts"[^>]*>([\s\S]*?)<\/script>/)[1]});
  await page.evaluate(() => {
    document.getElementById('fname').textContent = 'analysis_with_a_very_long_scientific_filename.csv';
    window.controller = AtelierStudioCode.createCsvViewController({enabled:true,getEditor:() => ({getValue:()=>'name,value\nb,2\na,1',refresh(..._args){}} as unknown as ReturnType<Parameters<typeof AtelierStudioCode.createCsvViewController>[0]["getEditor"]>),toolkit:AtelierCsv});
    controller.activate();
    AtelierStudioCore.createStudioFilePicker({currentPath:'/project/test.csv',picker:document.getElementById('picker'),pathLabel:document.getElementById('pickerPath'),list:document.getElementById('pickerList'),openButton:document.getElementById('openFile')});
  });
}

for(const width of [430,600,1200]) test(`Code CSV commands fit a ${width}px pane and secondary tools remain reachable`, async ({page}) => {
  await page.setViewportSize({width,height:700}); await mount(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const search = await page.locator('#csvSearch').boundingBox();
  expect(search.x).toBeGreaterThanOrEqual(0); expect(search.x+search.width).toBeLessThanOrEqual(width);
  await page.locator('#csvSourceBtn').click();
  await page.getByRole('button',{name:'Autres outils'}).click();
  await expect(page.locator('#wrapSel')).toBeVisible();
  const menu = await page.locator('.code-menu').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.x+menu.width).toBeLessThanOrEqual(width);
  await page.locator('#wrapSel').focus(); await page.keyboard.press('Escape');
  await expect(page.locator('#codeMore')).not.toHaveAttribute('open','');
  await expect(page.locator('#codeMore summary')).toBeFocused();
});

test('CSV Enter/Space sorting announces order and file picker traps focus with native keyboard activation', async ({page}) => {
  await mount(page);
  const sort = page.getByRole('button',{name:'Trier par value'});
  await sort.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('th[aria-sort="ascending"]')).toContainText('value'); await expect(sort).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('th[aria-sort="descending"]')).toContainText('value'); await expect(sort).toBeFocused();
  await page.getByRole('button',{name:'Ouvrir…'}).click();
  await expect(page.getByRole('button',{name:'notes.md'})).toBeFocused();
  await page.keyboard.press('End'); await expect(page.getByRole('button',{name:'data.csv'})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button',{name:'notes.md'})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'Ouvrir…'})).toBeFocused();
});
