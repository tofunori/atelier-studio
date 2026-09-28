import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const bundled = await build({entryPoints: [new URL("../../src/studio/core/chat_attach.ts", import.meta.url).pathname], bundle:true, write:false, format:"esm"});
const {installChatAttach, requestChatAttachment} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const markdownHtml = await readFile(new URL("../../assets/md_studio.html", import.meta.url), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (json: { text?: string; mtime?: number; error?: string; message?: string; }, ok = true) => ({ok, status:ok ? 200 : 500, json:async () => json});

async function markdownFixture(t: test.TestContext, initialRead = (..._args) => response({text:"initial", mtime:12})) {
  const dom = new JSDOM(markdownHtml, {url:"http://localhost/md_studio.html?path=test.md", runScripts:"outside-only"});
  const win = dom.window;
  t.after(() => win.close());
  let text = "initial", change: () => void, poll;
  const requests = [];
  let reader = initialRead;
  let writer = (..._args) => response({mtime:13});
  win.setInterval = (fn) => {poll = fn; return 0;};
  win.toastui = {Editor:class {
    constructor(..._args){ }
    on(_event, fn){change = fn;}
    getMarkdown(){return text;}
    setMarkdown(value: string){text = value; change?.();}
  }};
  win.fetch = async (url: string, init) => {
    requests.push({url, init});
    return url === "/codesave" ? writer(url, init) : reader(url, init);
  };
  win.eval([...win.document.scripts].find(script => script.textContent.includes("const path =")).textContent + "\nwindow.__state = () => ({dirty,diskMtime,saving,loading});");
  await tick();
  return {win, requests, state:() => win.__state(),
    edit(value: string){text = value; change();}, save:() => win.eval("save()"), poll:() => poll(),
    setWriter(fn){writer = fn;}, setReader(fn){reader = fn;}, text:() => text};
}

for (const [label, writer] of [
  ["HTTP error JSON", () => response({error:"disk full"}, false)],
  ["successful HTTP with error JSON", () => response({error:"disk full"})],
  ["malformed success", () => response({})],
  ["network error", () => {throw new Error("network down");}],
]) test(`Markdown preserves dirty state and mtime after ${label}`, async t => {
  const f = await markdownFixture(t);
  f.edit("changed"); f.setWriter(writer); await f.save();
  assert.equal(f.state().dirty, true);
  assert.equal(f.state().diskMtime, 12);
  assert.match(f.win.document.getElementById("state").textContent, /Échec/);
  assert.equal(f.win.document.getElementById("save").disabled, false);
});

test("Markdown only saves once while pending and keeps edits made during the request", async t => {
  const f = await markdownFixture(t);
  let resolve;
  f.setWriter(() => new Promise(r => {resolve = r;}));
  f.edit("version 1");
  const saving = f.save();
  await f.save();
  assert.equal(f.requests.filter(r => r.url === "/codesave").length, 1);
  assert.equal(f.win.document.getElementById("save").disabled, true);
  f.edit("version 2"); resolve(response({mtime:13})); await saving;
  assert.equal(f.state().dirty, true);
  assert.equal(f.state().diskMtime, 13);
  assert.equal(f.text(), "version 2");
  f.setWriter(() => response({mtime:14})); await f.save();
  assert.equal(f.state().dirty, false);
  assert.match(f.win.document.getElementById("state").textContent, /sauvegardé/);
});

test("Markdown conflict keeps the buffer and allows an explicit retry with the disk mtime", async t => {
  const f = await markdownFixture(t);
  f.edit("mine"); f.setWriter(() => response({error:"conflit",mtime:15}, false)); await f.save();
  assert.equal(f.state().dirty, true);
  assert.equal(f.state().diskMtime, 15);
  assert.match(f.win.document.getElementById("state").textContent, /conflit/);
  f.setWriter((_url, init: { body: string; }) => {assert.equal(JSON.parse(init.body).mtime,15);return response({mtime:16});});
  await f.save(); assert.equal(f.state().dirty, false);
});

test("Markdown rejected initial load exposes a retry, then mounts successfully", async t => {
  const f = await markdownFixture(t, () => {throw new Error("offline");});
  assert.equal(f.win.document.getElementById("loadState").hidden, false);
  assert.match(f.win.document.getElementById("loadMessage").textContent, /Impossible.*offline/);
  assert.equal(f.win.document.getElementById("loadRetry").hidden, false);
  f.setReader(() => response({text:"initial",mtime:12}));
  await f.win.eval("loadDocument()");
  assert.equal(f.win.document.getElementById("loadState").hidden, true);
  assert.equal(f.win.document.getElementById("ed").hidden, false);
});

test("Markdown refresh cannot replace text edited while the external read was pending", async t => {
  const f = await markdownFixture(t);
  let resolve;
  f.setReader((url) => url.includes("statonly") ? response({mtime:15}) : new Promise(r => {resolve = r;}));
  const refresh = f.poll(); await tick();
  f.edit("local edit"); resolve(response({text:"external",mtime:15})); await refresh;
  assert.equal(f.text(), "local edit"); assert.equal(f.state().dirty, true);
});

function chatFixture(t: test.TestContext){
  const dom = new JSDOM('<button title="Ajouter au chat"></button>', {url:"http://localhost"});
  const win = dom.window; t.after(() => win.close()); win.__atelierNonce = "nonce";
  const posts = [], messages = [], button = win.document.querySelector("button");
  const ack = (data: Record<string, any> = {}, source = win.top) => win.dispatchEvent(new win.MessageEvent("message", {source,
    data:{type:"atelier-add-to-chat-ack",nonce:"nonce",requestId:posts[0]?.requestId,ok:true,...data}}));
  return {win, button, posts, messages, ack};
}

test("editor attachment waits for an authenticated matching ACK and blocks repeated clicks", async t => {
  const f = chatFixture(t);
  installChatAttach({window:f.win,button:f.button,path:"/test.md",postToHost:(p) => f.posts.push(p),notify:(m) => f.messages.push(m)});
  f.button.click(); f.button.click();
  assert.equal(f.posts.length,1); assert.equal(f.messages.length,0); assert.equal(f.button.disabled,true);
  f.ack({nonce:"wrong"}); f.ack({requestId:"wrong"}); f.ack({}, null); await tick();
  assert.equal(f.button.classList.contains("is-done"),false);
  f.ack(); await tick();
  assert.equal(f.button.classList.contains("is-done"),true); assert.equal(f.button.disabled,false);
  assert.deepEqual(f.messages,["test.md ajouté au chat"]);
});

test("attachment rejection restores the button and never confirms success", async t => {
  const f = chatFixture(t);
  installChatAttach({window:f.win,button:f.button,path:"/test.md",postToHost:(p) => f.posts.push(p),notify:(m) => f.messages.push(m)});
  f.button.click(); f.ack({ok:false,error:"Aucun projet"}); await tick();
  assert.equal(f.button.disabled,false); assert.equal(f.button.classList.contains("is-done"),false);
  assert.deepEqual(f.messages,["Aucun projet"]);
});

test("attachment retry is bounded and keeps one request identity", async t => {
  const f = chatFixture(t);
  const pending = requestChatAttachment({window:f.win,postToHost:(p) => f.posts.push(p),payload:{type:"atelier-attach-pdf",rel:"a.pdf"},timeoutMs:1});
  await assert.rejects(pending,/non confirmé/);
  assert.equal(f.posts.length,3); assert.equal(new Set(f.posts.map(p => p.requestId)).size,1);
});

test("attachment manual retries can retain an explicit insertion identity", async t => {
  const f = chatFixture(t);
  const send = () => requestChatAttachment({window:f.win,postToHost:(p) => f.posts.push(p),
    payload:{type:"atelier-add-to-chat",text:"quote"},requestId:"stable-insertion",timeoutMs:1});
  await assert.rejects(send(), /non confirmé/);
  const retry = send(); f.ack(); await retry;
  assert.equal(f.posts.length, 4);
  assert.deepEqual([...new Set(f.posts.map(p => p.requestId))], ["stable-insertion"]);
});

test("Markdown rejects an old external read after a newer local save completed", async t => {
  const f = await markdownFixture(t);
  let resolve;
  f.setReader((url) => url.includes("statonly") ? response({mtime:15}) : new Promise(r => {resolve = r;}));
  const refresh = f.poll(); await tick();
  f.edit("new local saved"); f.setWriter(() => response({mtime:16})); await f.save();
  resolve(response({text:"old external",mtime:15})); await refresh;
  assert.equal(f.text(),"new local saved"); assert.equal(f.state().dirty,false); assert.equal(f.state().diskMtime,16);
});

const pillSource = await readFile(new URL("../../assets/sel_pill.js",import.meta.url),"utf8");
function pillFixture(t: test.TestContext){
  const dom = new JSDOM('<iframe></iframe>',{url:'http://localhost',runScripts:'outside-only'}); t.after(() => dom.window.close());
  const win = dom.window.document.querySelector('iframe').contentWindow;
  win.document.body.innerHTML = '<div id="pill"><textarea></textarea><button class="go"></button></div>';
  const timers = new Map(); let serial = 0;
  win.setTimeout = (fn,ms) => {const id=++serial;timers.set(id,{fn,ms});return id;};
  win.clearTimeout = (id) => timers.delete(id);
  let resolve: (value?) => void, reject; const sent = [];
  win.fetch = async () => response({message:'quote'});
  win.__atelierPost = (..._args) => {};
  win.AtelierStudioCore = {requestChatAttachment:() => new Promise((yes,no) => {resolve=yes;reject=no;})};
  win.eval(pillSource);
  const api = win.SelPill.attach({pill:win.document.getElementById('pill'),getQuote:() => ({text:'selection'}),onSent:(value) => sent.push(value)});
  return {win,api,timers,sent,resolve:() => resolve(),reject:() => reject(new Error('rejet'))};
}

test("selection pill keeps the selection and skips success while ACK is pending or rejected",async t => {
  const f = pillFixture(t);
  const pending = f.api.send(); await tick();
  assert.equal(f.api.go.disabled,true); assert.equal(f.sent.length,0);
  f.reject(); await pending;
  assert.equal(f.api.go.disabled,false); assert.equal(f.sent.length,0); assert.equal(f.api.go.textContent,'!');
});

test("selection pill cancels old confirmation cleanup on a new send or comment",async t => {
  const f = pillFixture(t);
  let pending = f.api.send(); await tick(); f.resolve(); await pending;
  assert.equal(f.sent.length,1); assert.equal([...f.timers.values()].filter(timer => timer.ms===1200).length,1);
  pending = f.api.send(); await tick();
  assert.equal([...f.timers.values()].filter(timer => timer.ms===1200).length,0);
  f.api.ta.value = 'new comment'; f.api.ta.dispatchEvent(new f.win.Event('input'));
  f.resolve(); await pending;
  assert.equal(f.sent.length,1); assert.equal(f.api.ta.value,'new comment');
  assert.equal([...f.timers.values()].filter(timer => timer.ms===1200).length,0);
});

test("a custom-positioned selection survives the previous send confirmation", async t => {
  const f = pillFixture(t);
  const pill = f.win.document.getElementById('pill');
  pill.style.display = 'flex';
  const pending = f.api.send(); await tick(); f.resolve(); await pending;
  const oldConfirmation = [...f.timers.values()].find(timer => timer.ms === 1200);
  assert.ok(oldConfirmation);
  // LaTeX positions the pill itself, but must renew the shared selection state.
  f.api.renewSelection();
  assert.equal([...f.timers.values()].some(timer => timer.ms === 1200), false);
  oldConfirmation.fn(); // A callback already queued must also leave it visible.
  assert.equal(pill.style.display, 'flex');
  assert.equal(f.api.go.title, 'Ajouter au chat');
  assert.equal(f.sent.length, 1);
});
