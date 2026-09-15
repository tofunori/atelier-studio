// Approved responsive viewer. Move existing controls so their state and handlers survive.
(() => {
  const get = id => document.getElementById(id);
  const viewer = get('lb'), head = get('lbHead'), more = get('lbMore');
  if (!viewer || !head) return;
  viewer.classList.add('responsive-viewer');
  head.setAttribute('role', 'toolbar');
  head.setAttribute('aria-label', 'Commandes du lecteur');
  const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  const chevron = svg('<path d="m7 10 5 5 5-5"/>');
  const fit = svg('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="m8 12 3-3m-3 3 3 3m5-3-3-3m3 3-3 3"/>');
  const chat = svg('<path d="M21 11a8 8 0 0 1-8 8H6l-3 3V11a9 9 0 0 1 18 0Z"/><path d="M8 11h8m-4-4v8"/>');
  const button = (id, label, content, action) => {
    const el = document.createElement('button');
    el.id = id; el.type = 'button'; el.title = label;
    el.setAttribute('aria-label', label); el.innerHTML = content;
    el.onclick = action; return el;
  };
  // The bubble is symmetric around x=12, and its body around y=11: so is the plus.
  get('lbAdd').innerHTML = chat + '<span class="viewer-label">Joindre</span>';
  get('lbAnnot').insertAdjacentHTML('beforeend', '<span class="viewer-label">Annoter</span>');
  get('lbClose').innerHTML = svg('<path d="m6 6 12 12M6 18 18 6"/>');
  get('lbVersionPrev').innerHTML = svg('<path d="m14 6-6 6 6 6"/>');
  get('lbVersionNext').innerHTML = svg('<path d="m10 6 6 6-6 6"/>');
  const palette = get('annotBar');
  viewer.append(palette);
  const caption=document.createElement('div');caption.id='lbFigureCaption';viewer.append(caption);
  const syncCaption=()=>caption.textContent=get('lbCap').querySelector('b')?.textContent||'';
  new MutationObserver(syncCaption).observe(get('lbCap'),{childList:true,subtree:true,characterData:true});syncCaption();
  palette.append(button('annotDone', 'Terminer l’annotation', svg('<path d="m5 12 4 4L19 6"/>'), () => get('lbAnnot').click()));
  // Annotation count remains available without occupying the reading toolbar.
  more.querySelector('div').append(get('annotPill'));
  get('annotPillN').addEventListener('click',()=>{more.open=false;});
  const zoom = document.createElement('details'); zoom.id = 'lbZoomMenu';
  zoom.innerHTML = `<summary title="Zoom et ajustement" aria-label="Zoom et ajustement">${fit}<span class="viewer-label" id="lbZoomLabel">Ajuster</span>${chevron}</summary><div class="viewer-menu"></div>`;
  get('lbZoom').before(zoom);
  const zoomBody = zoom.querySelector('div');
  zoomBody.append(get('lbZoom'));
  for (const percent of [100, 150, 200]) {
    zoomBody.append(button(`lbZoom${percent}`, `${percent} %`, `${percent} %`, () => {
      const image = get('lbImg'), wrap = get('lbWrap');
      if (!image.naturalWidth) return;
      const fitScale = wrap.offsetWidth / image.naturalWidth / lbZoomLevel;
      lbSetZoom(percent / 100 / fitScale); zoom.open = false;
    }));
  }
  const syncZoom = () => get('lbZoomLabel').textContent = get('lbFit').textContent;
  new MutationObserver(syncZoom).observe(get('lbFit'), {childList:true,subtree:true,characterData:true});
  const overflow = document.createElement('div'); overflow.id = 'lbOverflow';
  more.querySelector('div').prepend(overflow);
  const proxy = (id, target, label) => button(id, label, get(target).innerHTML, event => {
    event.stopPropagation(); more.open = false; get(target).click();
  });
  overflow.append(proxy('lbOverflowInfo', 'lbInfoBtn', 'Informations sur le fichier'));
  overflow.append(button('lbOverflowZoom', 'Zoom et ajustement', fit + 'Zoom et ajustement', () => { more.open=false; zoom.open=true; }));
  overflow.append(proxy('lbOverflowAdd', 'lbAdd', 'Joindre au chat'));
  get('lbOverflowInfo').insertAdjacentText('beforeend', 'Informations');
  const syncAdd = () => get('lbOverflowAdd').disabled = get('lbAdd').disabled;
  new MutationObserver(syncAdd).observe(get('lbAdd'), {attributes:true,attributeFilter:['disabled']}); syncAdd();
  // At very narrow widths the arrows move into the menu; version remains visible.
  const versionActions = document.createElement('div'); versionActions.id = 'lbOverflowVersions';
  more.querySelector('div').prepend(versionActions);
  versionActions.append(proxy('lbOverflowPrev','lbVersionPrev','Version précédente'), proxy('lbOverflowNext','lbVersionNext','Version suivante'));
  get('lbOverflowPrev').insertAdjacentText('beforeend','Version précédente');
  get('lbOverflowNext').insertAdjacentText('beforeend','Version suivante');
  const syncVersions = () => {for(const [a,b] of [['lbOverflowPrev','lbVersionPrev'],['lbOverflowNext','lbVersionNext']])get(a).disabled=get(b).disabled;};
  for(const id of ['lbVersionPrev','lbVersionNext'])new MutationObserver(syncVersions).observe(get(id),{attributes:true,attributeFilter:['disabled']});syncVersions();
  more.querySelector('div').append(button('lbResetView','Réinitialiser la vue','Réinitialiser la vue',()=>{lbSetZoom(1);more.open=false;}));
  for(const details of [zoom,more,get('annotShapes')])details.addEventListener('toggle',()=>{
    if(details.open)for(const other of [zoom,more,get('annotShapes')])if(other!==details)other.open=false;
  });
  document.addEventListener('pointerdown', e => {
    if (!zoom.contains(e.target) && !e.target.closest('#lbOverflowZoom')) zoom.open=false;
    if (!more.contains(e.target)) more.open=false;
  });
  document.addEventListener('keydown', e => {
    if(e.key!=='Escape')return;
    const open=[zoom,more,get('annotShapes')].find(d=>d.open);
    if(open){open.open=false;open.querySelector('summary').focus();e.preventDefault();e.stopImmediatePropagation();}
  },true);
  new MutationObserver(()=>{
    if(!viewer.classList.contains('show')){zoom.open=false;more.open=false;}
  }).observe(viewer,{attributes:true,attributeFilter:['class']});
})();
