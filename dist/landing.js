import { mountButtonIcons } from './icons.js?v=ink-1';
import { consumeHavenReturn } from './auth-return.js';
import { createPageTransition } from './ui-shell.js?v=onboarding-1';
import { setupLandingArt } from './landing-art.js?v=panorama-1';

const VIEW_KEY='trespasser.view.v1';

// Only inspect callback parameter names. Credentials stay with the Auth SDK.
export function isAuthReturn(location) {
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const query=new URLSearchParams(location.search);
  return ['access_token','refresh_token','error_description'].some(key=>hash.has(key)) || query.has('code');
}

const wantsWorkspace=(location,savedView)=>!isAuthReturn(location)&&location.hash!=='#inicio'
  &&(location.hash==='#personagens'||savedView==='workspace');
const recordsAvailable=account=>Boolean(account.signedIn&&account.ready&&account.recordsReady&&!account.loading&&!account.blocked);

// Until account data is known, even an explicit character link opens on the home.
export function initialView(location,savedView,account={}) {
  return wantsWorkspace(location,savedView)&&recordsAvailable(account)?'workspace':'home';
}

export function setupLanding({document,window,sessionStorage,location},{
  mountIcons=mountButtonIcons,navigate=url=>window.location.assign(url),
  transition=createPageTransition({document,window}),
}={}) {
  const $=selector=>document.querySelector(selector);
  const landing=$('#landing'),workspace=$('#record-workspace');
  if(!landing||!workspace)return;
  const artwork=setupLandingArt({document,window});
  const read=(storage,key)=>{try{return storage.getItem(key);}catch{return null;}};
  const write=(storage,key,value)=>{try{storage.setItem(key,value);}catch{/* Navigation also works without storage. */}};
  const authReturn=isAuthReturn(location);
  let workspaceIntent=wantsWorkspace(location,read(sessionStorage,VIEW_KEY));
  let account={signedIn:false,ready:false,recordsReady:false,loading:false,blocked:false};
  let moving=false,navigationVersion=0,leavingPage=false;
  mountIcons(document);

  function setView(view,focus=true) {
    const home=view==='home';
    landing.hidden=!home;workspace.hidden=home;document.body.dataset.view=view;
    const skip=$('#skip-link');if(skip)skip.href=home?'#landing-title':'#main';
    write(sessionStorage,VIEW_KEY,view);
    if(focus)$(home?'#landing-title':'#main')?.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'auto'});
  }
  function updateControls() {
    const signedIn=account.signedIn;
    if($('#landing-start-actions'))$('#landing-start-actions').hidden=signedIn;
    if($('#landing-register-actions'))$('#landing-register-actions').hidden=!signedIn;
    const start=$('#landing-start');
    if(start){start.disabled=!account.ready||moving;start.setAttribute('aria-busy',String(!account.ready));}
    const open=$('#landing-open');
    if(open){open.disabled=!recordsAvailable(account)||moving;open.setAttribute('aria-busy',String(signedIn&&!account.recordsReady&&!account.blocked));}
    const havens=$('#landing-havens');if(havens)havens.disabled=!signedIn||!account.ready||moving;
    const settings=$('#landing-settings');if(settings){settings.hidden=!signedIn;settings.disabled=!account.ready||moving;}
    if($('#landing-heading'))$('#landing-heading').textContent=signedIn?'Seus registros':'Sua aventura começa aqui';
    const description=$('.landing-description');
    if(description)description.textContent=!signedIn
      ?'Crie e organize seus personagens e refúgios de Trespasser. Salve na sua conta, continue no celular ou no computador e exporte PDF editável e JSON.'
      :account.blocked
        ?(typeof account.blocked==='string'?account.blocked:'Não foi possível preparar seus personagens. Recarregue para tentar novamente.')
        :!account.recordsReady||account.loading
          ?'Preparando seus registros salvos…'
          :'Escolha o registro de personagens ou de refúgios para continuar sua aventura.';
    const authStatus=$('#landing-auth-status');
    if(authStatus){authStatus.textContent=!account.ready?'Verificando seu acesso…':signedIn&&!account.recordsReady&&!account.blocked?'Carregando personagens…':'';authStatus.hidden=!authStatus.textContent;}
  }
  function cancelNavigation(){navigationVersion++;moving=false;leavingPage=false;transition.finish();}
  async function openCharacters() {
    if(!recordsAvailable(account)||moving)return false;
    workspaceIntent=false;moving=true;const owner=++navigationVersion;updateControls();
    try {
      await transition.run(()=>{if(owner===navigationVersion&&recordsAvailable(account))setView('workspace',false);},{label:'Abrindo personagens…'});
      if(owner===navigationVersion&&recordsAvailable(account)&&document.body.dataset.view==='workspace')$('#main')?.focus({preventScroll:true});
      return owner===navigationVersion;
    } finally {if(owner===navigationVersion){moving=false;updateControls();}}
  }
  function openHavens() {
    if(!account.signedIn||!account.ready||moving)return false;
    workspaceIntent=false;moving=true;leavingPage=true;navigationVersion++;updateControls();
    const finish=transition.start({label:'Abrindo refúgios…'});
    try {navigate('./havens.html');return true;}
    catch {finish();moving=false;leavingPage=false;updateControls();return false;}
  }

  $('#landing-open')?.addEventListener('click',()=>{void openCharacters();});
  $('#landing-havens')?.addEventListener('click',openHavens);
  $('#home-button')?.addEventListener('click',()=>{workspaceIntent=false;cancelNavigation();setView('home');updateControls();});
  // Começar keeps its delegated onboarding action. Auth events never click it.
  window.addEventListener('trespasser:account',event=>{
    const detail=event.detail||{};
    account={signedIn:Boolean(detail.signedIn),ready:Boolean(detail.ready),recordsReady:Boolean(detail.recordsReady),loading:Boolean(detail.loading),blocked:detail.blocked?(detail.message||detail.blocked):false};
    if(!account.signedIn){
      cancelNavigation();
      if(document.body.dataset.view==='workspace')setView('home');
    } else if(document.body.dataset.view==='workspace'&&!recordsAvailable(account)) {
      cancelNavigation();setView('home');
    }
    updateControls();
    if(leavingPage)return;
    // Old Haven login intents are discarded. Every OAuth success lands at home.
    if(account.signedIn&&account.ready)consumeHavenReturn(sessionStorage,{authReturn});
    if(workspaceIntent&&recordsAvailable(account))void openCharacters();
  });
  window.addEventListener('pageshow',event=>{if(event.persisted){cancelNavigation();updateControls();}});
  setView('home',false);updateControls();
  return {setView,openCharacters,openHavens,artwork};
}

if(typeof document!=='undefined')setupLanding({document,window,sessionStorage,location});
