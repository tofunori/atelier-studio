import test from 'node:test';
import assert from 'node:assert/strict';
await import('../../assets/pdf_runtime.js');
await import('../../assets/pdf_passage.js');
const {createScheduler, createDocumentCache, createDocumentLoader} = globalThis.AtelierPdfRuntime;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => {resolve=yes; reject=no;}); return {promise, resolve, reject}; };

test('observer pages, initial pages and reading figures share two rendering lanes', async () => {
  const scheduler = createScheduler(2), releases = [], started: any[] = [];
  let active=0, peak=0;
  const jobs = Array.from({length:7}, (_, n) => scheduler.enqueue('page-or-crop-'+n, async () => {
    started.push(n); active++; peak=Math.max(peak,active);
    const done=deferred(); releases.push(done.resolve); await done.promise; active--; return true;
  }, n===6 ? -1 : n));
  await tick(); assert.deepEqual(started,[0,1]);
  releases.shift()(); await tick(); assert.deepEqual(started,[0,1,6]);
  while(releases.length) { releases.shift()(); await tick(); }
  assert.deepEqual(await Promise.all(jobs),Array(7).fill(true)); assert.equal(peak,2);
});

test('cancellation drains a running generation before a replacement gets its lane', async () => {
  const scheduler=createScheduler(1), stopped=deferred(); let cancelled=0, started=0;
  const old=scheduler.enqueue('old',async () => { await stopped.promise; return true; },0,()=>cancelled++);
  await tick(); scheduler.cancel('old');
  const replacement=scheduler.enqueue('new',async () => {started++; return true;});
  await tick(); assert.equal(started,0); assert.equal(cancelled,1);
  stopped.resolve(); assert.equal(await old,false); assert.equal(await replacement,true);
});

test('queued work is deduplicated, reprioritized, paused and cancelled without painting', async () => {
  const scheduler=createScheduler(1), starts: any[]=[];
  scheduler.pause(true);
  const a=scheduler.enqueue('a',async () => starts.push('a'),4);
  const b=scheduler.enqueue('b',async () => starts.push('b'),2);
  assert.equal(scheduler.enqueue('a',async()=>assert.fail('duplicate'),0),a);
  const c=scheduler.enqueue('c',async()=>assert.fail('cancelled'));
  scheduler.cancel('c'); assert.equal(await c,false); await tick(); assert.deepEqual(starts,[]);
  scheduler.pause(false); await Promise.all([a,b]); assert.deepEqual(starts,['a','b']);
});

test('text/page extraction is shared across concurrent requests and repeated zooms', async () => {
  let pages=0,texts=0, indexes=0;
  const proxy={getTextContent:async()=>{texts++;return {items:['albedo']};}};
  const cache=createDocumentCache({getPage:async()=>{pages++;return proxy;}},(tc)=>{indexes++;return tc;});
  const first=cache.text(3), second=cache.text(3);
  assert.equal(first,second); await Promise.all([first,cache.page(3)]);
  await cache.text(3); await cache.drain();
  assert.deepEqual([pages,texts,indexes],[1,1,1]); assert.equal(cache.peekPage(3),proxy);
});

test('a failed extraction can be retried without discarding the document cache', async()=>{
  let calls=0;
  const cache=createDocumentCache({getPage:async()=>({getTextContent:async()=>{if(++calls===1)throw Error('temporary');return 'text';}})},(tc)=>tc);
  await assert.rejects(cache.text(1)); assert.equal(await cache.text(1),'text');
});

test('replacements retain the displayed document until explicit commit, including failed loads', async()=>{
  const tasks: (ReturnType<typeof deferred> & {destroyed:number;destroy():Promise<void>})[]=[];
  const loader=createDocumentLoader(()=>{const task={...deferred(), destroyed:0, async destroy(){this.destroyed++;}};tasks.push(task);return task;});
  const p1=loader.load({}); await tick(); tasks[0].resolve('first'); const first=await p1;
  assert.equal(first.doc,'first'); await first.commit((..._args)=>{});
  const bad=loader.load({}); await tick(); tasks[1].reject(Error('invalid')); await assert.rejects(bad);
  assert.equal(tasks[0].destroyed,0); assert.equal(tasks[1].destroyed,1);
  const p2=loader.load({}); await tick(); tasks[2].resolve('second'); const second=await p2;
  assert.equal(tasks[0].destroyed,0); await second.commit((..._args)=>{}); assert.equal(tasks[0].destroyed,1);
  await loader.destroy(); assert.equal(tasks[2].destroyed,1);
});

test('a newer failed reload during drain preserves the displayed document and rejects the stale candidate',async()=>{
  const tasks: (ReturnType<typeof deferred> & {destroyed:number;destroy():Promise<void>})[]=[], drain=deferred(); let displayed;
  const loader=createDocumentLoader(()=>{const task={...deferred(),destroyed:0,async destroy(){this.destroyed++;}};tasks.push(task);return task;});
  const initial=loader.load({});await tick();tasks[0].resolve('D0');
  await (await initial).commit((doc)=>{displayed=doc;});
  const first=loader.load({});await tick();tasks[1].resolve('D1');
  const candidate=await first;
  const install=(async()=>{await drain.promise;return candidate.commit((doc)=>{displayed=doc;});})();
  const second=loader.load({});await tick();tasks[2].reject(Error('failed D2'));await assert.rejects(second);
  drain.resolve();assert.equal(await install,false);
  assert.equal(displayed,'D0');assert.deepEqual(tasks.map(task=>task.destroyed),[0,1,1]);
  await loader.destroy();assert.deepEqual(tasks.map(task=>task.destroyed),[1,1,1]);
});

test('superseded loaders and stale resolved documents are destroyed', async()=>{
  const tasks: (ReturnType<typeof deferred> & {destroyed:number;destroy():Promise<void>})[]=[];
  const loader=createDocumentLoader(()=>{const task={...deferred(), destroyed:0, async destroy(){this.destroyed++;}};tasks.push(task);return task;});
  const stale=loader.load({}); await tick(); const current=loader.load({}); await tick();
  tasks[0].resolve('stale'); tasks[1].resolve('current');
  assert.equal(await stale,null); assert.equal((await current).doc,'current');
  assert.equal(tasks[0].destroyed,1); await loader.destroy();
});

test('closing the viewer cancels its initial unfinished document load',async()=>{
  const task={...deferred(),destroyed:0,async destroy(){this.destroyed++;}};
  const loader=createDocumentLoader(()=>task);
  const opening=loader.load({});await tick();await loader.destroy();
  task.resolve('too late');assert.equal(await opening,null);assert.equal(task.destroyed,1);
});

test('cached search preserves all accent, split-word and repeated-match ranges',()=>{
  const p=globalThis.AtelierPdfPassage, texts=['Résultats','albédo albedo','precipi-','tation','albedo'];
  const index=p.createIndex(texts);
  assert.deepEqual(p.findAllInIndex(index,'albedo'),[{start:1,end:1},{start:4,end:4}]);
  assert.deepEqual(p.findAllInIndex(index,'precipitation'),[{start:2,end:3}]);
  assert.deepEqual(p.findPassageInIndex(index,'resultats albedo albedo'),{start:0,end:1});
  assert.equal(p.findPassageInIndex(index,'missing'),null);
});
