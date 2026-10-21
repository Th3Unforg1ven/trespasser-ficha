import {setButtonLabel,icon} from './icons.js?v=performance-1';
import {t,registerMessages} from './i18n.js';

registerMessages({'Abrindo…':'Opening…','Abrindo seu registro…':'Opening your record…'});

const themeControllers=new WeakMap(),transitions=new WeakMap();

/** Use the existing preference controller; no character/account storage is touched. */
export function setupThemeToggle({document:doc=globalThis.document,window:win=globalThis.window,theme}={}){
  if(!doc||!theme?.getTheme||!theme?.setPreference)throw new TypeError('O controle de aparência precisa do tema existente.');
  if(themeControllers.has(doc))return themeControllers.get(doc);
  const selector='[data-action="toggle-theme"]';
  function refresh(){
    const dark=theme.getTheme()==='dark',label=t(dark?'Ativar modo claro':'Ativar modo escuro');
    doc.querySelectorAll(selector).forEach(button=>{
      button.setAttribute('aria-label',label);button.setAttribute('title',label);
      button.setAttribute('aria-pressed',String(dark));
      if(button.tagName==='BUTTON')button.type='button';
      setButtonLabel(button,'',dark?'torch':'moon');
    });
  }
  function click(event){
    const button=event.target?.closest?.(selector);
    if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;
    event.preventDefault();
    theme.setPreference(theme.getTheme()==='dark'?'light':'dark');refresh();
  }
  doc.addEventListener('click',click);win?.addEventListener('trespasser:theme',refresh);win?.addEventListener('trespasser:language',refresh);
  refresh();
  const api=Object.freeze({refresh,dispose(){doc.removeEventListener('click',click);win?.removeEventListener('trespasser:theme',refresh);win?.removeEventListener('trespasser:language',refresh);themeControllers.delete(doc);}});
  themeControllers.set(doc,api);return api;
}

function makeOverlay(doc){
  let overlay=doc.querySelector('#page-transition');
  if(!overlay){overlay=doc.createElement('div');overlay.id='page-transition';doc.body.append(overlay);}
  overlay.classList.add('page-transition');overlay.hidden=true;overlay.tabIndex=-1;
  overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.setAttribute('aria-atomic','true');
  let label=overlay.querySelector('[data-transition-label]')||overlay.querySelector('#page-transition-label');
  if(!label){
    const panel=doc.createElement('div');panel.className='page-transition-panel';
    const brand=doc.createElement('img');brand.className='page-transition-brand';brand.src=new URL('./assets/Image16.png',import.meta.url).href;brand.alt='Trespasser';brand.width=424;brand.height=144;
    const symbol=doc.createElement('span');symbol.className='page-transition-symbol';symbol.setAttribute('aria-hidden','true');symbol.innerHTML=icon('gate');
    label=doc.createElement('p');label.className='page-transition-label';label.dataset.transitionLabel='';
    panel.append(brand,symbol,label);overlay.replaceChildren(panel);
  }else{
    label.classList.add('page-transition-label');
    label.parentElement?.classList.add('page-transition-panel');
    const brand=label.parentElement?.querySelector('img');brand?.classList.add('page-transition-brand');
    const symbol=label.parentElement?.querySelector('.page-transition-mark');
    if(symbol){symbol.classList.add('page-transition-symbol');symbol.setAttribute('aria-hidden','true');symbol.innerHTML=icon('gate');}
  }
  return {overlay,label};
}

/** Short transitions follow the caller's actual task. The safety deadline only
 * releases the visual/keyboard block; it never reports a pending task as ready.
 * start() returns an idempotent finish for navigation/cold boot. Stale finishes
 * cannot hide a newer transition. One shared controller exists per document.
 */
export function createPageTransition({document:doc=globalThis.document,window:win=globalThis.window,timeoutMs=8000}={}){
  if(!doc?.body)throw new TypeError('A transição precisa de uma página carregada.');
  if(transitions.has(doc))return transitions.get(doc);
  const {overlay,label}=makeOverlay(doc),schedule=(win?.setTimeout??globalThis.setTimeout).bind(win??globalThis),cancel=(win?.clearTimeout??globalThis.clearTimeout).bind(win??globalThis);
  const now=()=>win?.performance?.now?.()??Date.now();
  const timeout=Number.isFinite(timeoutMs)?Math.min(15000,Math.max(1000,timeoutMs)):8000;
  let active=null,sequence=0,locks=[],previousFocus=null,previousBusy=null,sawHidden=false,disposed=false,activeText='';
  const usable=node=>node&&node!==doc.body&&node!==doc.documentElement&&node.isConnected&&!node.disabled&&!node.closest?.('[hidden],[inert]');
  function restoreAttribute(node,name,value){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}
  function release(){
    locks.forEach(({node,inert})=>restoreAttribute(node,'inert',inert));locks=[];
    restoreAttribute(doc.body,'aria-busy',previousBusy);
    const focusWasOverlay=doc.activeElement===overlay||overlay.contains(doc.activeElement);
    overlay.hidden=true;overlay.removeAttribute('aria-busy');
    if(focusWasOverlay){
      const target=usable(previousFocus)?previousFocus:['[data-transition-focus]','#main','#landing-title'].map(s=>doc.querySelector(s)).find(usable);
      target?.focus?.({preventScroll:true});
    }
    previousFocus=null;
  }
  function finish(id=active?.id){
    if(!active||id!==active.id)return;
    cancel(active.timer);active=null;release();
  }
  function start({label:text='Abrindo…'}={}){
    if(disposed)return ()=>{};
    if(active)cancel(active.timer);
    else {
      previousFocus=doc.activeElement;previousBusy=doc.body.getAttribute('aria-busy');
      overlay.hidden=false;overlay.focus({preventScroll:true});
      // Account guards own #main.inert. Touch only direct body children, keeping
      // their previous state and all descendants' independently changing guards.
      locks=[...doc.body.children].filter(node=>node!==overlay&&!node.contains(overlay)).map(node=>({node,inert:node.getAttribute('inert')}));
      locks.forEach(({node})=>node.setAttribute('inert',''));
      doc.body.setAttribute('aria-busy','true');
    }
    activeText=String(text);label.textContent=t(activeText);overlay.hidden=false;overlay.setAttribute('aria-busy','true');
    const id=++sequence;active={id,timer:schedule(()=>finish(id),timeout)};
    return ()=>finish(id);
  }
  async function run(task,{label:text='Abrindo…',minMs=240}={}){
    if(disposed)return typeof task==='function'?task():task;
    const done=start({label:text}),began=now();
    try{
      const result=await (typeof task==='function'?task():task);
      const minimum=Number.isFinite(minMs)?Math.min(500,Math.max(0,minMs)):240;
      const remaining=minimum-(now()-began);
      if(remaining>0)await new Promise(resolve=>schedule(resolve,remaining));
      return result;
    }finally{done();}
  }
  function keydown(event){if(!active)return;if(event.key==='Escape')finish();else if(event.key==='Tab'){event.preventDefault();overlay.focus({preventScroll:true});}}
  function pageshow(event){if(event.persisted)finish();}
  function visibility(){if(doc.visibilityState==='hidden')sawHidden=true;else if(sawHidden){sawHidden=false;finish();}}
  const pagehide=()=>finish(),beforeprint=()=>finish();
  const languagechange=()=>{if(active)label.textContent=t(activeText);};
  doc.addEventListener('keydown',keydown);doc.addEventListener('visibilitychange',visibility);
  win?.addEventListener('pageshow',pageshow);win?.addEventListener('pagehide',pagehide);win?.addEventListener('beforeprint',beforeprint);
  win?.addEventListener('trespasser:language',languagechange);
  const api=Object.freeze({start,finish:()=>finish(),run,dispose(){if(disposed)return;finish();disposed=true;doc.removeEventListener('keydown',keydown);doc.removeEventListener('visibilitychange',visibility);win?.removeEventListener('pageshow',pageshow);win?.removeEventListener('pagehide',pagehide);win?.removeEventListener('beforeprint',beforeprint);win?.removeEventListener('trespasser:language',languagechange);transitions.delete(doc);}});
  transitions.set(doc,api);return api;
}
