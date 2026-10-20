import { setButtonLabel, mountButtonIcons } from './icons.js?v=ink-1';

const VIEW_KEY='trespasser.view.v1';

// Only check for callback parameter names. Credentials are never copied or logged.
export function isAuthReturn(location) {
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const query=new URLSearchParams(location.search);
  return ['access_token','refresh_token','error_description'].some(key=>hash.has(key)) || query.has('code');
}

export function initialView(location, savedView) {
  return isAuthReturn(location) || savedView==='workspace' ? 'workspace' : 'home';
}

export function setupLanding({document,window,sessionStorage,location},{setLabel=setButtonLabel,mountIcons=mountButtonIcons}={}) {
  const landing=document.querySelector('#landing');
  const workspace=document.querySelector('#record-workspace');
  if(!landing||!workspace)return;
  mountIcons(document);
  const read=(storage,key)=>{try{return storage.getItem(key);}catch{return null;}};
  const write=(storage,key,value)=>{try{storage.setItem(key,value);}catch{/* Navigation also works without browser storage. */}};
  const setView=(view,focus=true)=>{
    const home=view==='home';
    landing.hidden=!home;workspace.hidden=home;
    document.body.dataset.view=view;
    const skip=document.querySelector('#skip-link');
    if(skip)skip.href=home?'#landing-title':'#main';
    write(sessionStorage,VIEW_KEY,view);
    if(focus)document.querySelector(home?'#landing-title':'#main')?.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'auto'});
  };
  document.querySelector('#landing-open').addEventListener('click',()=>setView('workspace'));
  document.querySelector('#landing-guest').addEventListener('click',()=>setView('workspace'));
  document.querySelector('#landing-login').addEventListener('click',()=>{
    setView('workspace');
    // The existing document click handler handles cloud-login or cloud-account.
  });
  document.querySelector('#home-button').addEventListener('click',()=>setView('home'));
  window.addEventListener('trespasser:account',event=>{
    const signedIn=Boolean(event.detail?.signedIn);
    const login=document.querySelector('#landing-login');
    const ready=Boolean(event.detail?.ready);
    setLabel(login,signedIn?'Minha conta':'Entrar com Google','helm');
    login.dataset.action=signedIn?'cloud-account':'cloud-login';
    login.disabled=!ready;
    login.setAttribute('aria-busy',String(!ready));
    document.querySelector('#landing-guest').hidden=signedIn;
    document.querySelector('.landing-description').textContent=signedIn
      ?'Suas fichas salvas na conta estão disponíveis no computador e no celular.'
      :'Abra suas fichas ou entre com Google para continuar no computador e no celular.';
  });
  setView(initialView(location,read(sessionStorage,VIEW_KEY)),false);
  return {setView};
}

if(typeof document!=='undefined')setupLanding({document,window,sessionStorage,location});
