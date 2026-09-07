import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { math, mathHtml } from 'micromark-extension-math';

import hljs from 'highlight.js/lib/common';
import latex from 'highlight.js/lib/languages/latex';
import swift from 'highlight.js/lib/languages/swift';
import r from 'highlight.js/lib/languages/r';
hljs.registerLanguage('latex', latex); hljs.registerLanguage('tex', latex); hljs.registerLanguage('swift', swift); hljs.registerLanguage('r', r);

function normalizeMath(text) {
  return text.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g).map(part => {
    if (part.startsWith('`') || part.startsWith('~~~')) return part;
    return part.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => '\n$$\n' + math + '\n$$\n').replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => '$' + math + '$');
  }).join('');
}

const content = document.getElementById('content');
const send = value => window.webkit?.messageHandlers?.chat?.postMessage(value);
let latest = '', rendered = null;
function paint() {
  if (latest === rendered || !window.getSelection().isCollapsed) return;
  rendered = latest;
  const next = document.createElement('div');
  next.innerHTML = micromark(normalizeMath(latest), {
    extensions: [gfm(), math()],
    htmlExtensions: [gfmHtml(), mathHtml({throwOnError: false, trust: false})],
    allowDangerousHtml: false, allowDangerousProtocol: false,
  });
  for (const pre of next.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    const languageName = (code?.className || '').replace('language-', '');
    if (code && languageName && hljs.getLanguage(languageName)) { code.innerHTML = hljs.highlight(code.textContent, {language: languageName}).value; }
    const bar = document.createElement('div'); bar.className = 'codebar';
    const language = document.createElement('span');
    language.textContent = (code?.className || '').replace('language-', '') || 'Code';
    const copy = document.createElement('button'); copy.textContent = 'Copier';
    bar.append(language, copy); pre.prepend(bar);
  }
  for (const table of next.querySelectorAll('table')) {
    const wrapper = document.createElement('div'); wrapper.className = 'table-scroll';
    table.replaceWith(wrapper); wrapper.append(table);
  }
  reconcile(content, next);
  reportHeight();
  send({kind:'rendered'});
}
// Keep existing paragraphs, code blocks and text nodes during a stream.
// Selection already pauses painting; reconciliation avoids remounting the
// unmodified prefix every 60 ms or on the final acknowledgement.
function reconcile(target, source) {
  const incoming = [...source.childNodes];
  for (let index = 0; index < incoming.length; index++) {
    const next = incoming[index], current = target.childNodes[index];
    if (!current) { target.append(next); continue; }
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) { current.replaceWith(next); continue; }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      for (const attribute of [...current.attributes]) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
      for (const attribute of [...next.attributes]) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
      reconcile(current, next);
    }
  }
  while (target.childNodes.length > incoming.length) target.lastChild.remove();
}
content.addEventListener('click', event => {
  const button = event.target.closest('.codebar button');
  if (!button) return;
  send({kind:'copy', text:button.closest('pre')?.querySelector('code')?.textContent || ''});
  button.textContent = 'Copié';
  setTimeout(() => { if (button.isConnected) button.textContent = 'Copier'; }, 1500);
});
let scheduled = false;
window.updateMessage = text => {
  latest = text;
  if (!scheduled) { scheduled = true; setTimeout(() => { scheduled = false; paint(); }, 60); }
};
window.setFontSize = size => { document.documentElement.style.setProperty('--body-size', Math.max(12, Math.min(60, size)) + 'px'); reportHeight(); };
window.clearSelection = () => { window.getSelection().removeAllRanges(); paint(); };
document.addEventListener('selectionchange', () => {
  const text = window.getSelection().toString();
  send({kind:'selection', text});
  if (!text) paint();
});
function reportHeight() { send({kind:'height', height: Math.ceil(content.getBoundingClientRect().height)}); }
new ResizeObserver(reportHeight).observe(content);
document.fonts.ready.then(reportHeight);
send({kind:'ready'});

window.addEventListener('error', () => send({kind:'failure'}));

window.setReadingStyle = (font, compact, contrast, reduced) => {
  content.style.fontFamily = font === 'serif' ? 'Georgia, ui-serif, serif' : '-apple-system, BlinkMacSystemFont, sans-serif';
  content.style.lineHeight = compact ? '1.45' : '1.65';
  content.style.color = contrast ? 'CanvasText' : '';
  document.documentElement.dataset.reducedMotion = reduced ? 'true' : 'false';
  reportHeight();
};
