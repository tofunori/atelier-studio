
(function () {
  // Keep each original range as the source of truth, including its handlers.
  var controls = new Map();
  function enhance(range: HTMLInputElement) {
    if (controls.has(range)) return;
    var number = document.createElement('input');
    number.type = 'number'; number.className = 'atelier-number';
    number.title = 'Glisser pour ajuster · cliquer pour saisir';
    var labels = Array.from(range.labels || []);
    number.setAttribute('aria-label', range.getAttribute('aria-label') || labels.map(function (l) { return l.textContent.trim(); }).join(' ') || range.name || 'Valeur du paramètre');
    if (range.hasAttribute('aria-labelledby')) number.setAttribute('aria-labelledby',range.getAttribute('aria-labelledby'));
    if (range.hasAttribute('aria-describedby')) number.setAttribute('aria-describedby',range.getAttribute('aria-describedby'));
    var min: number, max: number, step: number, dragging = null;
    function sync() {
      min = range.min === '' ? 0 : Number(range.min); max = range.max === '' ? 100 : Number(range.max);
      if (!Number.isFinite(min)) min=0; if (!Number.isFinite(max)) max=100;
      step = range.step === 'any' ? 0 : Number(range.step || 1); if (!Number.isFinite(step) || step < 0) step=1;
      number.min=String(min); number.max=String(max); number.step=range.step || '1'; number.disabled=range.matches(':disabled');
      if (document.activeElement !== number || dragging) number.value=range.value;
      var mode=range.getAttribute('data-atelier-control');
      var ruler=mode==='ruler' || (mode!=='scrub' && min===0 && max===100);
      range.classList.add('atelier-range'); range.classList.toggle('atelier-range-hidden',!ruler);
    }
    function apply(value: number, commit: boolean) {
      if (range.matches(':disabled') || !Number.isFinite(value)) return;
      if (step>0) value=min+Math.round((value-min)/step)*step;
      value=Math.max(min,Math.min(max,Number(value.toPrecision(12))));
      range.value=String(value);
      range.dispatchEvent(new Event('input',{bubbles:true}));
      if (commit) range.dispatchEvent(new Event('change',{bubbles:true}));
      sync();
    }
    range.insertAdjacentElement('afterend',number);
    controls.set(range,{number:number,sync:sync});
    range.addEventListener('input',function(){if(document.activeElement!==number || dragging)number.value=range.value;sync();});
    range.addEventListener('change',function(){if(document.activeElement!==number || dragging)number.value=range.value;sync();});
    // A widget may restore state by setting .value without dispatching an event.
    var descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    if (!Object.getOwnPropertyDescriptor(range,'value')) Object.defineProperty(range,'value',{
      configurable:true,get:function(){return descriptor.get.call(this);},
      set:function(value){descriptor.set.call(this,value);if(document.activeElement!==number) number.value=this.value;}
    });
    number.addEventListener('input',function(e){e.stopPropagation();if(number.value!=='' && number.validity.valid)apply(number.valueAsNumber,false);});
    number.addEventListener('change',function(e){e.stopPropagation();apply(number.valueAsNumber,true);number.value=range.value;});
    number.addEventListener('blur',function(){number.value=range.value;});
    number.addEventListener('keydown',function(e){if(e.key==='Escape'){number.value=range.value;number.blur();}if(e.key==='Enter'){apply(number.valueAsNumber,true);number.value=range.value;number.blur();}});
    number.addEventListener('pointerdown',function(e){
      if(e.button!==0 || number.disabled || document.activeElement===number) return;
      dragging={x:e.clientX,value:Number(range.value),moved:false};number.setPointerCapture(e.pointerId);e.preventDefault();
    });
    number.addEventListener('pointermove',function(e){if(!dragging)return;var dx=e.clientX-dragging.x;if(Math.abs(dx)>3)dragging.moved=true;if(dragging.moved)apply(dragging.value+dx*(max-min)/240,false);});
    number.addEventListener('pointerup',function(){if(!dragging)return;var moved=dragging.moved;dragging=null;if(moved){range.dispatchEvent(new Event('change',{bubbles:true}));number.value=range.value;}else{number.focus();number.select();}});
    number.addEventListener('pointercancel',function(){if(dragging && dragging.moved)range.dispatchEvent(new Event('change',{bubbles:true}));dragging=null;});
    labels.forEach(function(label){label.addEventListener('click',function(e){if(range.classList.contains('atelier-range-hidden') && e.target!==number){e.preventDefault();number.focus();}});});
    sync();
  }
  function scan() {
    controls.forEach(function(control,range){if(!range.isConnected){control.number.remove();controls.delete(range);}else control.sync();});
    document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(enhance);
  }
  function start(){scan();new MutationObserver(function(records){
    if(records.some(function(record){
      if(record.type==='attributes')return (record.target as Element).matches('input[type=range],fieldset');
      return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(function(node){return node.nodeType===1 && ((node as Element).matches('input[type=range]') || (node as Element).querySelector<HTMLInputElement>('input[type=range]'));});
    }))scan();
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['min','max','step','disabled','value','data-atelier-control']});document.addEventListener('reset',function(){setTimeout(scan,0);});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
