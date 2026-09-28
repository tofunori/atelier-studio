(function(root, factory){
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AtelierPdfRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, createAtelierPdfRuntimeApi);
function createAtelierPdfRuntimeApi(){
  /** Shared by page and reading-mode canvases. Cancellation retains its lane
   * until PDF.js actually settles; a new generation cannot exceed the limit. */
  function createScheduler(limit = 2){
    const jobs = new Map();
    let running = 0, sequence = 0, paused = false;
    function pump(){
      while (!paused && running < limit) {
        const job = [...jobs.values()].filter(j => !j.running && !j.cancelled)
          .sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)[0];
        if (!job) break;
        job.running = true; running++;
        Promise.resolve().then(() => job.cancelled ? false : job.work(job))
          .then(value => finish(job, value), error => finish(job, false, error));
      }
    }
    function finish(job, value: boolean, error?: undefined){
      jobs.delete(job.key); running--;
      if (error) job.reject(error); else job.resolve(job.cancelled ? false : value);
      pump();
    }
    function enqueue(key, work, priority = 0, cancelWork = () => {}){
      const existing = jobs.get(key);
      if (existing) { existing.priority = Math.min(existing.priority, priority); return existing.promise; }
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      jobs.set(key, {key, work, priority, cancelWork, resolve, reject, promise,
        sequence:sequence++, running:false, cancelled:false});
      pump(); return promise;
    }
    function cancel(key){
      const job = jobs.get(key); if (!job) return;
      job.cancelled = true;
      if (job.running) job.cancelWork();
      else { jobs.delete(key); job.resolve(false); }
    }
    return {enqueue, cancel, pause(value: boolean){ paused = value; if (!paused) pump(); },
      drain(keys){ return Promise.allSettled(keys.map((key) => jobs.get(key)?.promise)); }};
  }

  /** Per-document promises survive zoom, but never a document replacement. */
  function createDocumentCache(pdf, makeText){
    const pages = new Map(), texts = new Map(), resolvedPages = new Map();
    function memo(map, n, load){
      if (!map.has(n)) {
        const promise = Promise.resolve().then(load).catch(error => { map.delete(n); throw error; });
        map.set(n, promise);
      }
      return map.get(n);
    }
    const page = (n) => memo(pages, n, async () => {
      const proxy = await pdf.getPage(n); resolvedPages.set(n, proxy); return proxy;
    });
    const text = (n) => memo(texts, n, async () => {
      const proxy = await page(n);
      return makeText(await proxy.getTextContent(), proxy);
    });
    return {page, text, peekPage:(n) => resolvedPages.get(n),
      drain:() => Promise.allSettled([...pages.values(), ...texts.values()])};
  }

  /** Keeps the last successful document until a replacement is loaded. Every
   * superseded loading task is destroyed, including failures and stale results. */
  function createDocumentLoader(open){
    let active = null, pending = null, generation = 0;
    const destructions = new WeakMap();
    function destroy(task: {destroy(): unknown}){
      if (!task) return Promise.resolve();
      if (!destructions.has(task)) destructions.set(task, Promise.resolve().then(() => task.destroy()).catch(() => {}));
      return destructions.get(task);
    }
    async function load(options){
      const token = ++generation, previousPending = pending;
      pending = null;
      await destroy(previousPending);
      if (token !== generation) return null;
      const task = pending = open(options);
      let doc;
      try { doc = await task.promise; }
      catch (error) { if (pending === task) pending = null; await destroy(task); if (token !== generation) return null; throw error; }
      if (token !== generation) { await destroy(task); return null; }
      // A loaded candidate is not the displayed document. Keep ownership with
      // pending until the caller has drained old work and installs it atomically.
      // A newer failed load must not retire the document still on screen.
      return {doc, async commit(install){
        if (token !== generation || pending !== task) return false;
        try { install(doc); }
        catch (error) { pending = null; await destroy(task); throw error; }
        const previous = active; active = task; pending = null;
        await destroy(previous);
        return true;
      }};
    }
    return {load, async destroy(){ generation++; const tasks = [pending, active]; pending = active = null; await Promise.all(tasks.map(destroy)); }};
  }
  return {createScheduler, createDocumentCache, createDocumentLoader};
}
export type AtelierPdfRuntimeApi = ReturnType<typeof createAtelierPdfRuntimeApi>;

