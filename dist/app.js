import { ATTRS, SKILLS, PLIGHTS, createCharacter, derive, normalizeCharacter, rollDice } from './model.js?v=records-2';
import { preparePrint } from './print.js?v=records-2';
import { prepareExport } from './export-bundle.js?v=records-2';
import { createCloudClient } from './cloud-client.js?v=records-2';
import { cloudConfig } from './cloud-config.js';
import { CloudSync } from './cloud-sync.js?v=records-2';
import { isPristineCharacter, localMigrationCandidates, mergeLocalCharacters } from './cloud-ui-state.js?v=records-2';
import { acquireAccountLock } from './account-lock.js';
import { icon, setButtonLabel, mountButtonIcons } from './icons.js?v=portrait-ui-2';
import { setupTheme } from './preferences.js?v=settings-1';
import { setupThemeToggle } from './ui-shell.js?v=records-2';
import { setupLanguage, getLanguage, t, languageSettingsMarkup, translateStatic } from './i18n.js';
import { ui, bilingual, label as localLabel, formatError } from './i18n-character.js?v=ink-fields-1';
import { importPortrait, portraitStyle } from './portrait.js';

setupLanguage({document,window,navigator});
translateStatic(document);

const theme=setupTheme({document,window});
setupThemeToggle({document,window,theme});

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const KEY = 'trespasser.record.v1';
const tabs = [
  ['character','Personagem','Character','Atributos, perícias, saúde e avanço.','person'],
  ['combat','Combate','Combat','Defesas, ataques, feitos e estados.','sword'],
  ['equipment','Equipamento','Equipment','Armas, armadura, itens e inventário.','bag'],
  ['notes','Anotações','Journal','Diário da aventura e registros da mesa.','book']
];
let records = [], activeId, tab = 'character', saveError = false, rollHistory = [];
let exportBusy = false, dialogVersion = 0, exportUrls = [], resourceHelpKey = null;
let cloudConnection, cloudUser = null, cloudEngine = null, cloudGeneration = 0;
let cloudReady = false, cloudPlaceholderId = null, cloudSyncTimer, cloudPollTimer;
let cloudStatus = { state:'local', pending:0 }, authReady = false, authBusy = false, accountProblem = '';
let accountDialogActive = false, onboardingDialogActive = false, authEventRevision = 0, guestBackup;
let migrationSessionIds = new Set();
let cloudEditError = '';
let cloudAccountLock = null, cloudBlockedReason = '';
try {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    const data = JSON.parse(saved);
    if (!Array.isArray(data.characters) || !data.characters.length) throw new Error('Arquivo local inválido');
    records = data.characters.map(normalizeCharacter);
    activeId = records.some(c=>c.id === data.activeId) ? data.activeId : records[0].id;
  }
} catch (e) {
  // Preserve the original stored data for recovery; never silently overwrite it.
  saveError = true;
  queueMicrotask(()=>toast(t('Não foi possível ler o registro local. Exporte esta ficha antes de fechar.'), true));
}
if (!records.length) { const c = createCharacter(); records = [c]; activeId = c.id; }
const current = () => records.find(c=>c.id===activeId);
const valueAt = (obj,path) => path.split('.').reduce((o,k)=>o?.[k],obj);
function setAt(obj,path,value) {
  const keys = path.split('.'); let target=obj;
  keys.slice(0,-1).forEach(k=>target=target[k]); target[keys.at(-1)] = value;
}
function save() {
  if (cloudUser) {
    if (!cloudReady || !cloudEngine) return;
    try {
      const snapshot = cloudRecords();
      if (snapshot.length && cloudPlaceholderId) { records=snapshot;cloudPlaceholderId=null; }
      cloudEditError='';
      onCloudStatus({state:'pending',pending:Math.max(1,cloudStatus.pending||0)});
      cloudEngine.setRecords(snapshot, snapshot.some(c=>c.id===activeId) ? activeId : null);
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer=setTimeout(syncCloud,700);
    } catch {
      cloudEditError='Não foi possível guardar a edição · reduza a ficha ou exporte uma cópia';
      onCloudStatus({state:'error',pending:1,message:cloudEditError});
      toast(t('Não foi possível guardar a edição. Use Exportar para preservar esta ficha.'),true);
    }
    return;
  }
  if (saveError) { $('#save-status').textContent=t('Salvamento indisponível · exporte uma cópia'); return; }
  try {
    localStorage.setItem(KEY, JSON.stringify({version:1, activeId,characters:records}));
    setSaveStatus(t('Salvo neste navegador'));
  } catch {
    $('#save-status').textContent=t('Não foi possível salvar · exporte uma cópia');
    toast(t('O navegador não conseguiu salvar. Use Exportar para guardar seus dados.'),true);
  }
}
function setSaveStatus(message, state='local') {
  const status=$('#save-status');
  status.dataset.state=state;
  status.replaceChildren();
  const dot=document.createElement('span');dot.className='status-dot';dot.setAttribute('aria-hidden','true');
  status.append(dot,document.createTextNode(t(message)));
}
function cloudRecords() {
  return records.filter(c=>c.id!==cloudPlaceholderId || !isPristineCharacter(c));
}
function setCloudLoading(loading) {
  $('#main').inert=loading;
  $('#main').setAttribute('aria-busy',String(loading));
  for (const selector of ['#add-character','#new-character','#mobile-new','#import-button','#mobile-character-select']) $(selector).disabled=loading;
  syncExportButtons();
}
function migratedLocalIds() {
  if (!cloudUser) return [];
  try { const ids=JSON.parse(localStorage.getItem(ui`${KEY}.migrated.${cloudUser.id}`)||'[]');return [...new Set([...migrationSessionIds,...(Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[])])]; }
  catch { return [...migrationSessionIds]; }
}
function pendingLocalCharacters() {
  if (cloudEditError || hasUncachedEdits()) return [];
  return localMigrationCandidates(guestBackup?.records||[],cloudRecords(),migratedLocalIds());
}
function hasUncachedEdits() { return cloudStatus.pending>0 && cloudStatus.localSaved===false; }
function settingsContent() {
  const preference=theme.getPreference();
  const choices=[['light',t('Claro'),'torch'],['dark',t('Modo escuro'),'moon'],['system',t('Automático'),'settings']];
  return ui`<section class="settings-appearance" aria-labelledby="appearance-title"><h3 id="appearance-title">Aparência</h3><div class="settings-themes" role="group" aria-label="Tema da ficha">${choices.map(([value,label,symbol])=>ui`<button type="button" class="button" data-icon="${symbol}" data-action="theme" data-theme-value="${value}" aria-pressed="${preference===value}">${label}</button>`).join('')}</div><p class="panel-note">Automático acompanha o tema do dispositivo. A escolha fica salva neste navegador.</p></section>${languageSettingsMarkup()}<section class="settings-section" aria-labelledby="settings-account-title"><h3 id="settings-account-title">Conta</h3>${accountContent()}</section>`;
}
function refreshThemeControls() {
  document.querySelectorAll('[data-theme-value]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeValue===theme.getPreference())));
}
window.addEventListener('trespasser:theme',refreshThemeControls);
function accountContent() {
  if (!authReady) return ui(['<p role="status">Verificando sua conta…</p>']);
  if (!cloudConnection) return ui(['<p role="alert">O acesso à conta está indisponível. Suas fichas continuam salvas neste navegador. Recarregue a página para tentar novamente.</p>']);
  const problem=accountProblem?ui`<p class="inline-warning" role="alert">${esc(t(accountProblem))}</p>`:'';
  if (!cloudUser) return ui`<p>Entre com a mesma conta no celular e no computador para abrir suas fichas privadas e continuar de onde parou.</p>${problem}<div class="dialog-actions"><button class="button primary" data-icon="helm" data-action="cloud-login" ${authBusy?'disabled aria-busy="true"':''}>${authBusy?t('Abrindo login…'):t('Entrar com Google')}</button></div><p class="panel-note">Sem entrar, as fichas ficam apenas neste navegador. Ao entrar, você poderá salvar suas fichas locais na conta.</p>`;
  const local=pendingLocalCharacters(),unsafe=hasUncachedEdits();
  return ui`<p class="account-identity"><span class="eyebrow">SUA CONTA</span><strong>${esc(cloudUser.email||t('Conta conectada'))}</strong></p><p>Suas fichas ficam privadas nesta conta. Entre com o mesmo Google em outro dispositivo para continuar a edição.</p><p class="account-sync-status" role="status">${esc(t(cloudStatusLabel()))}</p>${problem}<div class="dialog-actions account-actions"><button class="button" data-icon="logout" data-action="cloud-logout" ${authBusy||cloudEditError||unsafe?'disabled':''} ${authBusy?'aria-busy="true"':''}>Sair deste dispositivo</button>${cloudEditError||unsafe?ui(['<button class="button" data-icon="export" data-action="export">Exportar uma cópia</button>']):''}</div>${local.length?ui`<div class="local-migration"><h3>Fichas deste navegador</h3><p>${local.length===1?t('Há uma ficha local que você pode salvar'):t('Há {count} fichas locais que você pode salvar',{count:local.length})} na sua conta. A cópia local será mantida.</p><button class="button" data-icon="import" data-action="cloud-migrate" ${!cloudReady||authBusy?'disabled':''}>Salvar minhas fichas locais na conta</button></div>`:''}<p class="panel-note">${cloudEditError?t('Essas edições ainda não foram guardadas. Exporte uma cópia e reduza o conteúdo da ficha antes de sair.'):unsafe?t('As edições estão somente na memória desta página. Mantenha-a aberta até aparecer “Salvo online” ou exporte uma cópia.'):cloudStatus.pending?t('Há alterações pendentes. Se sair agora, elas ficam guardadas neste navegador para sincronizar quando você entrar novamente.'):t('O salvamento é automático. PDF e JSON continuam disponíveis como cópias independentes.')}</p>`;
}
function openAccountDialog() { showDialog(t('Configurações'),settingsContent());accountDialogActive=true; }
function onboardingContent() {
  const problem=accountProblem?ui`<p class="inline-warning" role="alert">${esc(t(accountProblem))}</p>`:'';
  return ui`<div class="onboarding-intro"><p>Guarde seus personagens e refúgios em uma conta e continue a aventura no celular ou no computador.</p><p>Use sua conta Google para entrar. No primeiro acesso, sua conta é criada automaticamente.</p></div>${problem}${!authReady?ui(['<p role="status">Verificando seu acesso…</p>']):''}${authReady&&!cloudConnection?ui(['<p role="alert">O acesso ao Google está indisponível. Recarregue a página para tentar novamente.</p>']):''}<div class="dialog-actions"><button type="button" class="button primary" data-icon="helm" data-action="cloud-login" ${!authReady||!cloudConnection||authBusy?'disabled':''} ${authBusy?'aria-busy="true"':''}>${authBusy?t('Abrindo Google…'):t('Continuar com Google')}</button></div><p class="panel-note onboarding-note">Seus registros ficam privados na sua conta. PDF editável e JSON continuam disponíveis para exportar.</p>`;
}
function openOnboardingDialog() {
  if(cloudUser)return;
  showDialog(t('Entrar ou criar conta'),onboardingContent());onboardingDialogActive=true;
}
function updateAccountControls(refreshDialog=false) {
  syncPortraitControls();
  const button=$('#account-button');
  setButtonLabel(button,t('Ajustes'),'settings');
  button.title=t('Configurações');
  window.dispatchEvent(new CustomEvent('trespasser:account',{detail:{signedIn:Boolean(cloudUser),ready:authReady,recordsReady:cloudReady,loading:Boolean(cloudUser&&!cloudReady&&!cloudBlockedReason),blocked:Boolean(cloudBlockedReason),message:accountProblem||cloudBlockedReason||''}}));
  if(onboardingDialogActive && $('#utility-dialog').open) {
    if(cloudUser)closeDialog();
    else if(refreshDialog){$('#dialog-title').textContent=t('Entrar ou criar conta');$('#dialog-content').innerHTML=onboardingContent();mountButtonIcons($('#dialog-content'));}
  }
  if (accountDialogActive && $('#utility-dialog').open) {
    if (refreshDialog) { $('#dialog-title').textContent=t('Configurações');$('#dialog-content').innerHTML=settingsContent();mountButtonIcons($('#dialog-content')); }
    else {
      const status=$('#dialog-content .account-sync-status');if(status)status.textContent=t(cloudStatusLabel());
    }
  }
}
function cloudStatusLabel() {
  if (cloudBlockedReason) return cloudBlockedReason;
  if (!cloudReady) return t('Carregando suas fichas…');
  const labels={syncing:t('Sincronizando com sua conta…'),synced:t('Salvo online'),offline:t('Sem conexão · alterações pendentes neste navegador'),error:t('Sincronização pendente · tente novamente')};
  return ['error','offline'].includes(cloudStatus.state) && cloudStatus.message?cloudStatus.message:labels[cloudStatus.state]||t('Salvo neste dispositivo · sincronização pendente');
}
function onCloudStatus(status) {
  const wasUnsafe=hasUncachedEdits();
  if (cloudEditError) status={state:'error',message:cloudEditError,pending:1};
  cloudStatus={...status,localSaved:status.localSaved??cloudStatus.localSaved};
  setSaveStatus(cloudStatusLabel(),status.state);
  updateAccountControls(wasUnsafe!==hasUncachedEdits());
}
function applyCloudSnapshot(snapshot) {
  if (cloudEditError) return;
  const incoming=snapshot.records.map(normalizeCharacter);
  const incomingId=incoming.some(c=>c.id===snapshot.activeId)?snapshot.activeId:incoming[0]?.id;
  if (JSON.stringify(incoming)===JSON.stringify(cloudRecords()) && (incomingId===activeId || !incoming.length&&cloudPlaceholderId===activeId)) return;
  records=incoming;
  cloudPlaceholderId=null;
  if (!records.length) { const blank=createCharacter();records=[blank];cloudPlaceholderId=blank.id; }
  activeId=incomingId||records[0].id;
  render();
}
async function syncCloud() {
  if (!cloudReady || !cloudEngine || !cloudUser || cloudEditError) return;
  try { await cloudEngine.sync(); }
  catch { if(cloudUser)setSaveStatus(t('Sincronização pendente · tente novamente'),'error'); }
}
function stopCloud() {
  cloudGeneration+=1;
  clearTimeout(cloudSyncTimer);clearInterval(cloudPollTimer);
  cloudEngine?.stop();cloudEngine=null;cloudReady=false;cloudPlaceholderId=null;cloudEditError='';
  cloudAccountLock?.release();cloudAccountLock=null;cloudBlockedReason='';
}
function restoreGuest() {
  if (guestBackup) {
    records=structuredClone(guestBackup.records);activeId=guestBackup.activeId;saveError=guestBackup.saveError;
    try {
      const saved=JSON.parse(localStorage.getItem(KEY)||'null');
      if(saved?.characters?.length) { records=saved.characters.map(normalizeCharacter);activeId=records.some(c=>c.id===saved.activeId)?saved.activeId:records[0].id; }
    } catch { saveError=true; }
  }
  render();
  setSaveStatus(saveError?t('Salvamento indisponível · exporte uma cópia'):t('Salvo neste navegador'),saveError?'error':'local');
}
async function attachSession(session) {
  const user=session?.user||null;
  if ((user?.id||null)===(cloudUser?.id||null)) { if(user)cloudUser=user;updateAccountControls(true);return; }
  if ($('#utility-dialog').open) closeDialog();
  if (!cloudUser) guestBackup={records:structuredClone(records),activeId,saveError};
  stopCloud();cloudUser=user;authBusy=false;accountProblem='';migrationSessionIds=new Set();
  if (!user) {setCloudLoading(false);restoreGuest();updateAccountControls(true);return;}
  const generation=cloudGeneration;
  records=[createCharacter()];activeId=records[0].id;cloudPlaceholderId=activeId;render();
  setCloudLoading(true);setSaveStatus(t('Carregando suas fichas…'),'syncing');updateAccountControls(true);
  let acquired;
  try {
    acquired=await acquireAccountLock(navigator.locks,ui`trespasser.account.${user.id}`);
  } catch(error) {
    if(generation!==cloudGeneration)return;
    cloudBlockedReason=error.code==='ACCOUNT_LOCK_UNSUPPORTED'?error.message:'Não foi possível abrir esta conta com segurança. Recarregue a página ou use um navegador atualizado.';
    accountProblem=cloudBlockedReason;onCloudStatus({state:'error',pending:0,localSaved:true,message:cloudBlockedReason});updateAccountControls(true);
    return;
  }
  if(generation!==cloudGeneration){acquired?.release();return;}
  if(!acquired){
    cloudBlockedReason='Esta conta está aberta em outra aba. Feche-a e recarregue esta página.';
    accountProblem=cloudBlockedReason;onCloudStatus({state:'error',pending:0,localSaved:true,message:cloudBlockedReason});updateAccountControls(true);
    return;
  }
  cloudAccountLock=acquired;
  cloudEngine=new CloudSync({adapter:cloudConnection.adapter.forUser(user.id),storage:localStorage,cacheKey:ui`${KEY}.cloud.${user.id}`,makeId:uid,
    onChange:snapshot=>{if(generation===cloudGeneration)applyCloudSnapshot(snapshot);},
    onStatus:status=>{if(generation===cloudGeneration)onCloudStatus(status);},
    onConflict:conflict=>{if(generation===cloudGeneration)toast(conflict.message||t('Edições simultâneas preservadas em uma ficha com “(conflito)”. Confira as duas versões.'),true);}
  });
  try {
    await cloudEngine.start({records:[],activeId:null});
    if (generation!==cloudGeneration) return;
    cloudReady=true;setCloudLoading(false);onCloudStatus(cloudStatus);updateAccountControls(true);
    cloudPollTimer=setInterval(()=>{if(!document.hidden)syncCloud();},15000);
  } catch {
    if(generation!==cloudGeneration)return;
    cloudReady=true;setCloudLoading(false);onCloudStatus({state:'error',pending:0,message:t('Não foi possível sincronizar. Suas edições ficam neste dispositivo; tente novamente.')});updateAccountControls(true);
  }
}
async function initializeCloud() {
  // A stalled SDK session lock must not leave the account dialog unusable.
  const verificationTimer=setTimeout(()=>{
    if(!authReady){authReady=true;accountProblem='A verificação da sessão está demorando. Você pode tentar entrar novamente.';updateAccountControls(true);}
  },20000);
  try {
    cloudConnection=createCloudClient(cloudConfig);
    // The auth callback stays synchronous; SDK calls happen after its lock is released.
    cloudConnection.auth.onAuthStateChange((event,session)=>{
      if(!session?.user&&event!=='SIGNED_OUT')return;
      const revision=++authEventRevision;
      setTimeout(()=>{if(revision===authEventRevision){authReady=true;accountProblem='';void attachSession(session);}},0);
    });
    const revision=authEventRevision;
    const {data,error}=await cloudConnection.auth.getSession();
    if(error)throw error;
    if(revision===authEventRevision){authReady=true;accountProblem='';await attachSession(data.session);}
  } catch {
    authReady=true;
    if(!cloudUser){accountProblem='Não foi possível verificar sua sessão. Você pode tentar entrar novamente.';updateAccountControls(true);}
  } finally { clearTimeout(verificationTimer); }
}
async function loginCloud() {
  if (!cloudConnection || authBusy) return;
  authBusy=true;accountProblem='';updateAccountControls(true);
  try {
    const redirectTo=new URL('./',location.href);redirectTo.search='';redirectTo.hash='';
    const {error}=await cloudConnection.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo.href}});
    if(error)throw error;
  } catch { accountProblem='Não foi possível abrir o login com Google. Tente novamente.';authBusy=false;updateAccountControls(true); }
}
async function logoutCloud() {
  if (!cloudConnection || authBusy || cloudEditError || hasUncachedEdits()) return;
  const signingOutId=cloudUser?.id||null;
  authBusy=true;accountProblem='';updateAccountControls(true);
  try {
    const {error}=await cloudConnection.auth.signOut({scope:'local'});
    if(error)throw error;
    if((cloudUser?.id||null)===signingOutId)await attachSession(null);
    if(!cloudUser)toast(t('Você saiu da conta neste dispositivo. As fichas online continuam na sua conta.'));
  } catch { if((cloudUser?.id||null)===signingOutId)accountProblem='Não foi possível sair agora. Tente novamente.'; }
  finally {if(!cloudUser||cloudUser.id===signingOutId){authBusy=false;updateAccountControls(true);}}
}
async function migrateLocalCharacters() {
  if (!cloudReady || !cloudUser || authBusy || cloudEditError || hasUncachedEdits()) return;
  const result=mergeLocalCharacters(cloudRecords(),guestBackup?.records||[],migratedLocalIds(),uid);
  if (!result.migratedIds.length)return;
  records=result.records;activeId=result.activeId;cloudPlaceholderId=null;
  save();render();
  result.migratedIds.forEach(id=>migrationSessionIds.add(id));
  // setRecords caches synchronously. Only record the migration when that cache succeeded.
  if (cloudStatus.state!=='error') {
    try { localStorage.setItem(ui`${KEY}.migrated.${cloudUser.id}`,JSON.stringify([...new Set([...migratedLocalIds(),...result.migratedIds])])); }
    catch { toast(t('As fichas foram copiadas, mas o navegador não conseguiu registrar a transferência.'),true); }
  }
  updateAccountControls(true);await syncCloud();
  toast(cloudStatus.state==='synced'?t('Fichas salvas online. A cópia local deste navegador foi mantida.'):t('Fichas copiadas; a sincronização está pendente. Mantenha este navegador até aparecer “Salvo online”.'),cloudStatus.state!=='synced');
}
let toastTimer;
function toast(message, long=false) { $('#toast').textContent=t(message); $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,long?9000:3500); }
function field(label,path,{type='text',placeholder='',min,max,step,help='',cls=''}={}) {
  label=localLabel(label);placeholder=t(placeholder);help=t(help);
  const value=valueAt(current(),path) ?? '';
  if(type==='text'&&!max)max=50000;
  if(type==='number'){min ??= path.startsWith('bonuses.')?-10000:0;max ??= path.startsWith('bonuses.')?10000:path.endsWith('.clock')?100:path.endsWith('.slots')?1000:path.endsWith('.cost')||path.startsWith('deeds.')&&path.endsWith('.focus')?10000:1000000000;}
  return ui`<label class="field ${cls}"><span>${label}</span><input data-field="${path}" type="${type}" aria-label="${esc(label.replace(/<[^>]*>/g,' ')+(path.startsWith('armor.')?' · '+t(armorLabels[current().armor[Number(path.split('.')[1])].slot]):''))}" value="${esc(value)}" placeholder="${esc(placeholder)}"${type==='text'?ui` maxlength="${max}"`:''}${min!==undefined?ui` min="${min}"`:''}${max!==undefined?ui` max="${max}"`:''}${step?ui` step="${step}"`:''}>${help?ui`<small>${help}</small>`:''}</label>`;
}
const num = (label,path,opts={})=>field(label,path,{type:'number',step:1,...opts});
const area = (label,path,placeholder='',rows=4) => ui`<label class="field"><span>${localLabel(label)}</span><textarea data-field="${path}" rows="${rows}" maxlength="50000" placeholder="${esc(t(placeholder))}">${esc(valueAt(current(),path))}</textarea></label>`;
function panel(title,en,body,opts='') { return ui`<section class="panel ${opts}"><div class="panel-heading"><h3>${bilingual(title,en)}</h3></div>${body}</section>`; }
const signed = n=>n>0?ui`+${n}`:String(n);
function renderSidebar() {
  $('#mobile-character-select').innerHTML=records.map(c=>ui`<option value="${esc(c.id)}" ${c.id===activeId?'selected':''}>${esc(c.name||t('Novo personagem'))}</option>`).join('');
  $('#character-list').innerHTML=records.map(c=>ui`<button class="character-item ${c.id===activeId?'selected':''}" data-character="${esc(c.id)}" ${c.id===activeId?'aria-current="true"':''}>${esc(c.name || t('Novo personagem'))}</button>`).join('');
  $('#navigation').innerHTML=tabs.map(([key,name,en,desc,symbol])=>ui`<button class="nav-item ${key===tab?'active':''}" data-tab="${key}" ${key===tab?'aria-current="page"':''}>${icon(symbol,'nav-icon')}<span>${t(name)}</span>${getLanguage()==='pt'?ui`<span class="nav-english">${en}</span>`:''}</button>`).join('');
}
function portraitMarkup(portrait,preview=false) {
  return `<div class="portrait-frame${preview?' portrait-preview':''}">${portrait?.dataUrl?`<img src="${esc(portrait.dataUrl)}" alt="${esc(t('Retrato do personagem'))}" style="${esc(portraitStyle(portrait))}">`:`<div class="portrait-placeholder">${icon('person')}<span>${t('Retrato do personagem')}</span></div>`}</div>`;
}
function renderIdentity() {
  const c=current();
  $('#breadcrumb-name').textContent=c.name || t('Novo personagem');
  $('#identity').innerHTML=ui`<section class="identity-card"><div class="record-mark"><img src="./assets/Image16.png" alt="Trespasser"><h1>Registro de personagem</h1><span>${getLanguage()==='pt'?'Character record · ':''}v2.1.3</span></div><div class="identity-fields"><div class="identity-top">${field(bilingual('Nome do personagem','Name'),'name',{placeholder:t('Nome'),max:100,cls:'identity-name'})}${field(bilingual('Jogador','Player'),'player',{placeholder:t('Jogador'),max:100})}</div>${field(bilingual('Palavras para viver','Words to live by'),'motto',{placeholder:t('Uma convicção, um voto, uma lembrança.')})}</div><div class="character-portrait">${portraitMarkup(c.portrait)}<div class="portrait-actions" data-portrait-controls><button type="button" class="portrait-edit-control icon-button" data-icon="edit" data-action="portrait-edit" aria-label="${t('Editar retrato')}" title="${t('Editar retrato')}" ${!canEditPortrait()?'disabled':''}></button></div></div></section>`;
  mountButtonIcons($('#identity'));
}
function plightsMarkup() {
  const c=current(),selected=new Set(c.plightSelections||[]);
  return `<fieldset class="plights-fieldset"><legend>${bilingual('Aflições','Plights')}</legend><div class="plights-grid">${PLIGHTS.map(p=>`<label class="plight-choice" title="${esc(getLanguage()==='en'?p.descriptionEn:p.descriptionPt)}"><input type="checkbox" data-plight="${p.key}" ${selected.has(p.key)?'checked':''}><span><strong>${getLanguage()==='en'?p.en:p.pt}</strong>${getLanguage()==='pt'?`<small>${p.en}</small>`:''}<span class="plight-description">${getLanguage()==='en'?p.descriptionEn:p.descriptionPt}</span></span></label>`).join('')}</div><p class="panel-note plights-note">${t('Aflições comuns do livro, p. 58. Marque as aflições atuais e resolva seus efeitos na mesa.')}</p></fieldset>${c.plights?`<details class="legacy-plights"><summary>${t('Anotações anteriores')}</summary>${area(t('Anotações anteriores'),'plights','',3)}</details>`:''}`;
}
let portraitDraft=null,portraitOwner=null,portraitRequest=null;
const canEditPortrait=()=>!cloudUser||cloudReady&&!cloudBlockedReason;
const hasPortraitDraft=()=>Boolean(portraitDraft&&portraitOwner?.id===activeId&&portraitOwner.generation===cloudGeneration&&$('#utility-dialog').open);
const canSavePortrait=()=>canEditPortrait()&&hasPortraitDraft()&&Boolean(portraitDraft.dataUrl||current()?.portrait?.dataUrl);
function syncPortraitControls() {
  const disabled=!canEditPortrait();
  // Readiness changes only update existing controls; preserve identity inputs,
  // focus, and any in-progress crop preview rather than rendering the card again.
  document.querySelectorAll('[data-portrait-controls] button, [data-action="portrait-choose"]').forEach(button=>{button.disabled=disabled;});
  document.querySelectorAll('[data-action="portrait-save"]').forEach(button=>{button.disabled=!canSavePortrait();});
  document.querySelectorAll('[data-action="portrait-remove"], [data-portrait-crop]').forEach(control=>{control.disabled=disabled||!hasPortraitDraft()||!portraitDraft.dataUrl;});
}
function showPortraitEditor(draft=current().portrait) {
  if(!canEditPortrait())return;
  const owner={id:activeId,generation:cloudGeneration};
  const hasImage=Boolean(draft.dataUrl);
  const guidance=hasImage?'Ajuste o zoom e a posição para enquadrar seu personagem.':current()?.portrait?.dataUrl?'O retrato será removido ao salvar. Você também pode escolher outra imagem.':'Escolha uma imagem para ajustar o enquadramento antes de salvar.';
  const content=()=>`<div class="portrait-editor${hasImage?'':' portrait-empty'}"><div>${portraitMarkup(draft,true)}<button type="button" class="button" data-icon="import" data-action="portrait-choose">${t(hasImage?'Trocar imagem':'Escolher imagem')}</button><button type="button" class="text-button portrait-remove-control" data-icon="trash" data-action="portrait-remove" ${hasImage?'':'disabled'}>${t('Remover retrato')}</button></div><div class="portrait-adjustments"><p>${t(guidance)}</p>${[['zoom','Zoom',1,3,0.05],['x','Posição horizontal',0,100,1],['y','Posição vertical',0,100,1]].map(([key,name,min,max,step])=>`<label class="field"><span>${t(name)} <output data-portrait-output="${key}">${key==='zoom'?Number(draft[key]).toFixed(2)+'×':Math.round(draft[key])+'%'}</output></span><input type="range" data-portrait-crop="${key}" min="${min}" max="${max}" step="${step}" value="${draft[key]}" aria-label="${t(name)}" ${hasImage?'':'disabled'}></label>`).join('')}<p class="panel-note">${t('PNG, JPEG ou WebP, até 12 MB. A imagem é reduzida e salva com a ficha.')}</p><div class="dialog-actions"><button type="button" class="button primary" data-action="portrait-save" ${hasImage||current()?.portrait?.dataUrl?'':'disabled'}>${t('Salvar retrato')}</button><button type="button" class="button" data-action="portrait-cancel">${t('Cancelar')}</button></div></div></div>`;
  showDialog(t('Ajustar retrato'),content());portraitDraft=structuredClone(draft);portraitOwner=owner;
  syncPortraitControls();
}
function choosePortrait() {
  if(!canEditPortrait()||!$('#utility-dialog').open)return;
  portraitRequest={id:activeId,generation:cloudGeneration,dialogVersion};
  $('#portrait-file').value='';$('#portrait-file').click();
}

const resourceNames={hp:'Pontos de vida',recovery:'Dados de recuperação',endurance:'Resistência',focus:'Foco',resolve:'Determinação'};
function showResourceHelp(key) {
  if(!Object.hasOwn(resourceNames,key))return;
  const c=current(),d=derive(c),a=c.attributes,b=c.bonuses;
  const paragraph=text=>`<p>${esc(text)}</p>`;
  const formula=text=>`<p class="resource-guide-formula">${esc(text)}</p>`;
  const currentValue=d.commoner&&key!=='hp'?0:c.resources[key];
  let content='',pages='';
  if(key==='hp'){
    pages=d.commoner?'45, 86':'45, 88–89';
    content=formula(t('Máximo: ({level} + 1) × (5 + {might}) + {bonus} = {total} PV.',{level:c.level,might:a.might,bonus:b.hp,total:d.hpMax}));
    content+=paragraph(t('O máximo cresce com o nível e Might. Dez é apenas a base de um personagem de nível 1 com Might 0 e sem ajustes.'));
    content+=paragraph(t('Bônus de vocação, como Fortitude, talentos, itens e efeitos entram em Combate → Ajustes de regras → PV máximos. Alterar nível, atributos ou ajustes recalcula o máximo, sem restaurar os PV atuais.'));
    if(d.commoner)content+=paragraph(t('No nível 0, o Commoner tem 5 + Might PV. Chegar a 0 PV causa morte imediata, sem teste de Tenacity; recupera PV com descanso de uma semana.'));
  } else if(d.commoner){
    pages=key==='resolve'?'44, 86':'86';
    content=paragraph(t(key==='resolve'?'Resolve é um recurso de trespassers (p. 44). Este registro o habilita a partir do nível 1.':'Commoners de nível 0 não têm Endurance, dados de recuperação ou Focus. Esses recursos são habilitados a partir do nível 1.'));
    content+=paragraph(t('Os valores salvos são preservados ao mudar de nível; a ficha não os restaura automaticamente.'));
  } else if(key==='recovery'){
    pages='23–24, 45';
    content=formula(t('Disponíveis: {current} de {total} dados {die}.',{current:c.resources.recovery,total:d.recoveryMax,die:d.skillDie}));
    content+=paragraph(t('O total é uma reserva diária: após o descanso noturno, você perde os dados restantes e recebe tantos dados quanto sua Endurance atual. O tamanho de cada dado é seu Skill die.'));
    content+=paragraph(t('A reserva registrada é {total}; a Endurance atual é {endurance}. Reduzir Endurance durante o dia não altera retroativamente essa reserva.',{total:d.recoveryMax,endurance:c.resources.endurance}));
    content+=paragraph(t('Use Combate → Descanso noturno para renovar a reserva depois de resolver o descanso na mesa. Para corrigir um registro, use Combate → Ajustes de regras → Total de dados de recuperação. Com Endurance 0, o descanso noturno não recupera PV nem dados.'));
  } else if(key==='endurance'){
    pages='23–24';
    content=formula(t('Máximo: 10 + Spirit {spirit} + ajuste {bonus} = {total}.',{spirit:a.spirit,bonus:b.endurance,total:d.enduranceMax}));
    content+=paragraph(t('Endurance diminui com fome, esforço, magia e outros perigos. O descanso noturno usa a Endurance restante para renovar os dados de recuperação; não restaura a própria Endurance.'));
    content+=paragraph(t('Uma semana de descanso no refúgio restaura Endurance, PV e dados de recuperação. Registre essa recuperação depois de resolvê-la na mesa. Ajustes adicionais ficam em Combate → Ajustes de regras → Endurance máx.'));
  } else if(key==='focus'){
    pages='11, 44';
    content=formula(t('Início do combate: Skill {skill} + ajuste {bonus} = {total} Focus.',{skill:d.skill,bonus:b.focus,total:d.focusStart}));
    content+=paragraph(t('O livro não define um máximo de Focus: você pode ganhar mais durante o combate. O valor inicial não é um limite, e o excesso não é levado para o combate seguinte.'));
    content+=paragraph(t('Use Combate → Iniciar combate depois de ter um ou dois minutos para recuperar o fôlego. Esse botão prepara o Focus inicial, mantendo as marcas de custo dos feitos. Ajustes do valor inicial ficam em Combate → Ajustes de regras → Foco inicial.'));
    content+=paragraph(t('Ao terminar seu turno sem tentar um feito heavy, mighty ou special, ganhe Focus igual ao Skill bonus. Atualize esse ganho na ficha conforme a mesa. Skill: +2 nos níveis 0–2, +3 em 3–5, +4 em 6–8 e +5 no nível 9.'));
  } else if(key==='resolve'){
    pages='44';
    content=formula(t('Máximo: 3 Resolve.'));
    content+=paragraph(t('O limite de três é uma regra fixa. Você pode ganhar Resolve no início do dia com Endurance abaixo da metade, por ferimentos, ao presenciar a morte de um aliado ou por uma striking success de um aliado, conforme a mesa.'));
    content+=paragraph(t('Uma vez por turno, gaste 1 Resolve para obter 1 AP extra, ganhar 2 Focus ou tentar um segundo feito. Após a primeira semana de descanso ao retornar ao refúgio, Resolve volta a 0. Registre esses ganhos e gastos manualmente.'));
  }
  const summary=t('Valor atual registrado: {value}.',{value:currentValue});
  showDialog(t(resourceNames[key]),`<div class="resource-guide"><p class="resource-guide-summary">${esc(summary)}</p>${content}<p class="panel-note resource-guide-source">${esc(t('Fonte: Trespasser v2.1.3, pp. {pages}.',{pages}))}</p></div>`);
  resourceHelpKey=key;
}
function renderResources() {
  const c=current(),d=derive(c);
  const definitions=[['hp',t('Pontos de vida'),'Hit points',d.hpMax,'red'],['recovery',t('Dados de recuperação'),'Recovery dice',d.recoveryMax,'ochre'],['endurance',t('Resistência'),'Endurance',d.enduranceMax,'green'],['focus',t('Foco'),'Focus',null,'green'],['resolve',t('Determinação'),'Resolve',d.commoner?0:3,'ochre']];
  $('#resources').innerHTML=ui`<section class="resource-strip" aria-label="Recursos do personagem">${definitions.map(([key,pt,en,max,color])=>ui`<div class="resource ${color} ${d.commoner&&key!=='hp'?'unavailable':''}"><button type="button" class="resource-label resource-help" data-resource-help="${key}" aria-label="${esc(t('Entender {name}',{name:t(pt)}))}" title="${esc(t('Entender {name}',{name:t(pt)}))}"><span>${bilingual(pt,en)}</span></button><div class="resource-control"><button class="step-button" data-resource="${key}" data-delta="-1" aria-label="${esc(t('Diminuir {name}',{name:t(pt)}))}" ${d.commoner&&key!=='hp'?'disabled':''}>−</button><label><span class="sr-only">${t('{name} atuais',{name:t(pt)})}</span><input type="number" min="0" max="${max??1000000000}" data-field="resources.${key}" value="${d.commoner&&key!=='hp'?0:c.resources[key]}" ${d.commoner&&key!=='hp'?'disabled':''}></label><span class="resource-max">${max!==null?ui`/ ${max}`:t('atual')}</span><button class="step-button" data-resource="${key}" data-delta="1" aria-label="${esc(t('Aumentar {name}',{name:t(pt)}))}" ${d.commoner&&key!=='hp'?'disabled':''}>+</button></div><div class="resource-track"><i style="width:${max>0?Math.min(100,Math.max(0,c.resources[key]/max*100)):0}%"></i></div></div>`).join('')}</section>`;
}
function characterPage() {
  const c=current(),d=derive(c);
  const attrs=ATTRS.map(a=>ui`<div class="attribute"><div><strong>${getLanguage()==='en'?a.en:a.pt}</strong>${getLanguage()==='pt'?ui`<small>${a.en}</small>`:''}</div><label><span class="sr-only">${getLanguage()==='en'?a.en:a.pt}</span><input type="number" data-field="attributes.${a.key}" min="0" max="5" value="${c.attributes[a.key]}"></label><label class="key-choice" title="Atributo-chave"><input type="radio" name="key-attribute" data-key="${a.key}" ${c.keyAttribute===a.key?'checked':''} ${d.commoner?'disabled':''}><span aria-hidden="true">◆</span><span class="sr-only">${t('{name} é atributo-chave',{name:getLanguage()==='en'?a.en:a.pt})}</span></label></div>`).join('');
  const skills=SKILLS.map(s=>ui`<label class="skill-check"><input type="checkbox" data-skill="${s.key}" ${c.trained.includes(s.key)?'checked':''}><span><strong>${getLanguage()==='en'?s.en:s.pt}</strong>${getLanguage()==='pt'?ui`<small>${s.en}</small>`:''}</span><span class="skill-bonus">${c.trained.includes(s.key)?signed(d.skill):'—'}</span></label>`).join('');
  const alignments=c.alignments.map((a,i)=>ui`<div class="alignment-row">${field(bilingual(t('Traço {number}',{number:i+1}),`Trait ${i+1}`),ui`alignments.${i}.name`,{placeholder:t('Convicção ou ideal')})}<div class="alignment-ticks"><span>Negar <small>Deny</small></span>${[1,2,3].map(n=>ui`<button data-alignment="${i}.deny.${n}" class="tick ${a.deny>=n?'on':''}" aria-label="${t('Negar traço {number}: {count}',{number:i+1,count:n})}" aria-pressed="${a.deny>=n}">◆</button>`).join('')}<span class="tick-spacer"></span><span>Afirmar <small>Affirm</small></span>${[1,2,3].map(n=>ui`<button data-alignment="${i}.affirm.${n}" class="tick ${a.affirm>=n?'on':''}" aria-label="${t('Afirmar traço {number}: {count}',{number:i+1,count:n})}" aria-pressed="${a.affirm>=n}">◆</button>`).join('')}</div></div>`).join('');
  return ui`<div class="character-sheet-grid">
    <div class="sheet-column attribute-column">${panel(t('Atributos & perícias'),'Attributes & skills',ui`<div class="attribute-header"><span>ATRIBUTO</span><span>VALOR</span><span title="Atributo-chave">CHAVE</span></div>${attrs}<div class="skill-summary"><span>Proficiência <small>Skill bonus</small></span><strong>+${d.skill}</strong><span>Dado de perícia <small>Skill die</small></span><strong>${d.skillDie}</strong></div><div class="skills-grid">${skills}</div><div class="derived-pair"><div><span>Explorar <small>Explore</small></span><strong>${signed(d.explore)}</strong></div><div><span>Encontro <small>Encounter</small></span><strong>${signed(d.encounter)}</strong></div></div><p class="panel-note">${d.commoner?t('Nível 0: Precisão usa o maior entre Força e Agilidade.'):t('◆ Marque seu atributo-chave para calcular a Precisão.')}</p>`)}</div>
    <div class="sheet-column health-column">${panel(t('Saúde & ferimentos'),'Health & injuries',ui`${plightsMarkup()}<div class="injuries">${c.injuries.map((inj,i)=>ui`<div>${field(bilingual(t('Ferimento {number}',{number:i+1}),`Injury ${i+1}`),ui`injuries.${i}.name`,{placeholder:t('Ferimento')})}${num(ui(['Relógio <small>Clock</small>']),ui`injuries.${i}.clock`,{min:0})}</div>`).join('')}</div>`)}${panel(t('Características & talentos'),'Features & talents',area(t('Características, habilidades e benefícios'),'features',t('Talentos, habilidades de linhagem e benefícios da vocação.'),13),'features-panel')}</div>
    <div class="sheet-column advancement-column">${panel(t('Avanço'),'Advancement',ui`<div class="advancement-stats">${num(ui(['Nível <small>Level</small>']),'level',{min:0,max:9})}${num(ui(['Experiência <small>XP</small>']),'xp',{min:0})}<div class="field"><span>Próximo nível <small>Next level</small></span><div class="readout">${d.nextXp??'—'}<small>${d.commoner?t('Após o Primeiro Dia'):c.level===9?t('Nível máximo'):'XP'}</small></div></div></div><div class="advancement-fields">${field(ui(['Linhagem <small>Lineage</small>']),'lineage',{placeholder:t('Linhagem')})}${field(ui(['Vida passada <small>Past life</small>']),'pastLife',{placeholder:t('Vida passada')})}${field(ui(['Vocação <small>Calling</small>']),'calling',{placeholder:c.level===0?'Commoner':t('Vocação')})}${field(ui(['Ofícios <small>Crafts</small>']),'crafts',{placeholder:t('Ofícios')})}</div><p class="panel-note">Altere o nível após gastar a experiência e escolher os benefícios do avanço.</p>`)}${panel(t('Alinhamento'),'Alignment',alignments)}</div>
  </div>`;
}
const STATES=[['accurate','Preciso','Accurate'],['inaccurate','Impreciso','Inaccurate'],['guarded','Protegido','Guarded'],['unguarded','Desprotegido','Unguarded'],['fortified','Fortificado','Fortified'],['frail','Frágil','Frail'],['hastened','Acelerado','Hastened'],['hindered','Atrasado','Hindered'],['mending','Regenerando','Mending'],['afflicted','Afligido','Afflicted'],['strong','Forte','Strong'],['weak','Enfraquecido','Weak'],['swift','Veloz','Swift'],['slow','Lento','Slow'],['willful','Determinado','Willful'],['weary','Exausto','Weary'],['bleeding','Sangrando','Bleeding'],['blinded','Cego','Blinded'],['burning','Em chamas','Burning'],['staggered','Cambaleante','Staggered'],['toppled','Derrubado','Toppled']];
function combatPage() {
  const c=current(),d=derive(c);
  const metrics=[['initiative',t('Iniciativa'),'Initiative','Agility + Skill'],['accuracy',t('Precisão'),'Accuracy',d.commoner?t('Maior entre MGT/AGI + Skill'):t('Atributo-chave + Skill')],['guard',t('Guarda'),'Guard',d.encumbered?t('Armadura ≥ 6: sem Agility'):'Agility + Armor'],['resist',t('Resistir'),'Resist','Spirit + Skill'],['prevail',t('Prevalecer'),'Prevail','Intellect + Skill'],['tenacity',t('Tenacidade'),'Tenacity','Might + Spirit']];
  return ui`<div class="combat-actions"><div><span class="eyebrow">ROTINAS DE COMBATE</span><p>Prepare o foco ou registre o descanso concluído.</p></div><button class="button primary" data-icon="sword" data-action="start-combat">${icon('sword')} Iniciar combate</button><button class="button" data-icon="moon" data-action="night-rest">Descanso noturno</button></div><div class="combat-metrics">${metrics.map(([key,pt,en,formula])=>ui`<div class="combat-metric"><span>${bilingual(pt,en)}</span><strong>${signed(d[key])}</strong><small>${formula}</small></div>`).join('')}</div><div class="two-columns">${panel(t('Movimento & ataque'),'Movement & attack',ui`<div class="movement"><div><span>Velocidade <small>Speed</small></span><strong>${d.speed}</strong><small>quadrados · bônus ${signed(d.speedBonus)}</small></div><div><span>Dado de perícia</span><strong>${d.skillDie}</strong><button class="text-button" data-icon="dice" data-roll="${d.skillDie}">Rolar dado</button></div></div><div class="weapon-summary">${c.weapons.map((w,i)=>ui`<div><span>${i===0?t('Mão principal'):t('Mão secundária')}</span><strong>${esc(w.name || t('Sem arma registrada'))}</strong><small>${esc(w.damage || t('Dano não definido'))} ${w.range?'· '+esc(w.range):''}</small>${w.damage?ui`<button class="button small" data-icon="dice" data-roll="${esc(w.damage)}">Rolar dano</button>`:''}</div>`).join('')}</div><p class="panel-note">Ataques e efeitos são resolvidos na mesa. Registre ajustes temporários abaixo.</p>`)}${panel(t('Ferimentos & aflições'),'Injuries & plights',ui`${plightsMarkup()}<div class="injuries">${c.injuries.map((inj,i)=>ui`<div>${field(bilingual(t('Ferimento {number}',{number:i+1}),`Injury ${i+1}`),ui`injuries.${i}.name`,{placeholder:t('Descreva o ferimento')})}${num('Relógio · Clock',ui`injuries.${i}.clock`,{min:0})}</div>`).join('')}</div>`)}</div>${panel(t('Feitos'),'Deeds',ui`<div class="panel-toolbar"><p class="panel-note">Registre seus feitos. O custo crescente continua entre combates.</p><button class="button small" data-icon="plus" data-action="add-deed">Adicionar feito</button></div>${c.deeds.length?ui`<div class="deeds-grid">${c.deeds.map((deed,i)=>ui`<article class="deed"><div class="deed-title">${field(t('Nome do feito'),ui`deeds.${i}.name`,{placeholder:t('Nome do feito')})}<button class="icon-button danger" data-icon="trash" data-remove="deeds.${i}" aria-label="${t('Excluir feito {number}',{number:i+1})}">×</button></div><div class="form-grid thirds"><label class="field"><span>Categoria</span><select data-field="deeds.${i}.kind">${[['light',t('Leve · Light')],['heavy',t('Pesado · Heavy')],['mighty',t('Poderoso · Mighty')],['special',t('Especial · Special')]].map(([v,t])=>ui`<option value="${v}" ${deed.kind===v?'selected':''}>${t}</option>`).join('')}</select></label>${num(t('Custo base'),ui`deeds.${i}.cost`,{min:0})}${num(t('Marcas de foco'),ui`deeds.${i}.focus`,{min:0})}</div>${area(t('Efeito / notas'),ui`deeds.${i}.description`,t('Ação, alvo, alcance, acerto e spark.'),3)}<button class="button use-deed" data-icon="sword" data-use-deed="${i}" ${d.commoner?'disabled':''}>${t('Usar · {count} foco',{count:Number(deed.cost)+Number(deed.focus)})}</button></article>`).join('')}</div>`:ui(['<div class="empty-state">'])+icon('sword')+ui(['<h4>Nenhum feito registrado</h4><p>Adicione um feito e registre seu custo e efeito.</p></div>'])}`)}${panel(t('Estados'),'States',ui`<p class="panel-note top-note">Intensidade 0 = inativo. Os estados ficam registrados; aplique seus efeitos na mesa ou nos ajustes.</p><div class="states-grid">${STATES.map(([key,pt,en])=>num(ui`${pt} <small>${en}</small>`,ui`states.${key}`,{min:0,max:10})).join('')}</div>`)}${adjustmentPanel()}`;
}
function adjustmentPanel() {
  return panel(t('Ajustes de regras'),'Bonuses & overrides',ui`<details><summary>Bônus de vocação, talentos, itens e efeitos <span>+</span></summary><p class="panel-note">Valores somados aos cálculos básicos. Inclua aqui o bônus de PV da vocação (Fortitude). Alterar máximos não restaura recursos atuais.</p><div class="form-grid quarters">${[['hp',t('PV máximos')],['endurance',t('Endurance máx.')],['guard',t('Guarda')],['accuracy',t('Precisão')],['initiative',t('Iniciativa')],['resist',t('Resistir')],['prevail',t('Prevalecer')],['tenacity',t('Tenacidade')],['speed',t('Velocidade base')],['focus',t('Foco inicial')]].map(([key,pt])=>num(pt,ui`bonuses.${key}`)).join('')}${num(t('Total de dados de recuperação'),'resources.recoveryTotal',{min:0})}</div></details>`);
}
const armorLabels={head:'Cabeça · Head',body:'Corpo · Body',arms:'Braços · Arms',legs:'Pernas · Legs',outer:'Cobertura · Outer',shield:'Escudo · Shield'};
function equipmentPage() {
  const c=current(),d=derive(c);
  return ui`${panel(t('Armas'),'Weapons',ui`<div class="two-columns inner">${c.weapons.map((w,i)=>ui`<div class="equipment-block"><p class="eyebrow">${i===0?t('MÃO PRINCIPAL · MAIN HAND'):t('MÃO SECUNDÁRIA · OFF HAND')}</p><div class="form-grid">${field(t('Arma'),ui`weapons.${i}.name`,{placeholder:t('Nome da arma'),cls:'full'})}${field(t('Dados de dano'),ui`weapons.${i}.damage`,{placeholder:t('Ex.: 2d6')})}${field(t('Tipo & alcance'),ui`weapons.${i}.range`,{placeholder:t('Tipo e alcance')})}${field(t('Propriedades'),ui`weapons.${i}.properties`,{cls:'full'})}</div></div>`).join('')}</div>`)}${panel(t('Armadura'),'Armor',ui`<div class="armor-total">${icon('shield')}<span>Armadura total <small>Total armor rating</small></span><strong>${d.armor}</strong><span class="tag ${d.encumbered?'warning':''}">${d.encumbered?t('Carga pesada · AR ≥ 6'):t('Sem penalidade de armadura')}</span></div><p class="panel-note">L = leve, H = pesada. Peças pesadas: ${d.heavyArmor} / ${c.attributes.might} permitidas por Might. ${d.heavyArmor>c.attributes.might?t('Confira a carga: há peças pesadas além do limite. ') : ''}Armas e armaduras equipadas não ocupam espaços do inventário.</p><div class="table-scroll"><table class="armor-table"><thead><tr><th>Posição / peça</th><th>Peso<br><small>Weight</small></th><th>AR</th><th>Dado<br><small>Die</small></th><th>Propriedades</th><th>Gasto</th></tr></thead><tbody>${c.armor.map((a,i)=>ui`<tr><td>${field(armorLabels[a.slot] || a.slot,ui`armor.${i}.name`,{placeholder:'—'})}</td><td><label class="field"><span>Peso</span><select aria-label="${t('Peso')} · ${t(armorLabels[a.slot])}" data-field="armor.${i}.weight" ${a.slot==='shield'?'disabled':''}>${[['','—'],['L','L'],['H','H']].map(([v,t])=>ui`<option value="${v}" ${a.weight===v?'selected':''}>${t}</option>`).join('')}</select></label></td><td>${num('AR',ui`armor.${i}.ar`,{min:0,max:100})}</td><td>${field(t('Dado'),ui`armor.${i}.die`,{placeholder:'d6'})}</td><td>${field(t('Propriedades'),ui`armor.${i}.properties`,{placeholder:t('Efeito da peça')})}</td><td><label class="check-only"><input type="checkbox" data-field="armor.${i}.spent" ${a.spent?'checked':''}><span class="sr-only">Dado de armadura gasto: ${t(armorLabels[a.slot])}</span></label></td></tr>`).join('')}</tbody></table></div>`)}${panel(t('Itens mágicos'),'Magic items',ui`<div class="magic-grid">${c.magicItems.map((m,i)=>ui`<div class="equipment-block"><p class="eyebrow">${[t('AMULETO · AMULET'),t('ANEL · RING'),t('TALISMÃ · TALISMAN')][i]}</p>${field(t('Item'),ui`magicItems.${i}.name`,{placeholder:t('Nome do item')})}${area(t('Efeito'),ui`magicItems.${i}.effect`,t('Propriedades e efeito mágico.'),3)}</div>`).join('')}</div>`)}${panel(t('Inventário'),'Inventory',ui`<div class="inventory-head"><div><strong class="slots ${d.usedSlots>d.slots?'overloaded':''}">${d.usedSlots}<small>/ ${d.slots}</small></strong><span>espaços ocupados <small>5 + Might</small></span></div><div>${field(t('Moedas · cp / sp / gp'),'coins',{placeholder:t('Ex.: 25 cp, 2 sp')})}<button class="button small" data-icon="plus" data-action="add-item">Adicionar item</button></div></div>${d.usedSlots>d.slots?ui(['<p class="inline-warning">A capacidade foi excedida. Confira a carga com o Judge.</p>']):''}${c.inventory.length?ui`<div class="inventory-list">${c.inventory.map((item,i)=>ui`<div class="inventory-item"><span class="item-number">${String(i+1).padStart(2,'0')}</span>${field(t('Item'),ui`inventory.${i}.name`,{placeholder:t('O que você carrega?')})}${num(t('Espaços'),ui`inventory.${i}.slots`,{min:0,step:0.5})}${field(t('Notas'),ui`inventory.${i}.notes`,{placeholder:t('Quantidade, uso, detalhes…')})}<button class="icon-button danger" data-icon="trash" data-remove="inventory.${i}" aria-label="${t('Excluir item {number}',{number:i+1})}">×</button></div>`).join('')}</div>`:ui(['<div class="empty-state">'])+icon('bag')+ui(['<h4>Inventário vazio</h4><p>Adicione itens e os espaços que ocupam.</p></div>'])}`)}`;
}
function notesPage() { return ui`${panel(t('Diário de viagem'),'Journal',area(t('Anotações da aventura'),'notes',t('Pessoas que encontrou. Promessas que fez. Lugares aos quais talvez volte.'),18))}<div class="quiet-callout">${icon('book')}<div><h3>${cloudUser?t('Sua ficha online'):t('Continue em outro dispositivo')}</h3><p>${cloudUser?t('As alterações são sincronizadas com sua conta. Entre com o mesmo Google no celular e no computador para acessar esta ficha.'):t('Use Entrar para salvar suas fichas na conta e continuar no celular ou no computador. Sem entrar, elas ficam neste navegador.')}</p><button class="text-button" data-icon="settings" data-action="cloud-account">${cloudUser?t('Configurações'):t('Entrar para salvar online')}</button><h3>Cópia da ficha</h3><p>Exportar baixa um ZIP com o PDF preenchível e o JSON da ficha. O PDF mantém campos editáveis; o JSON permite reabrir o personagem neste site. Alterações nos arquivos são independentes. Use a impressão para levar uma cópia em papel.</p><button class="text-button" data-icon="export" data-action="export">Exportar PDF + JSON</button></div></div>`; }
const pages={character:characterPage,combat:combatPage,equipment:equipmentPage,notes:notesPage};
function renderContent() { $('#sheet-content').innerHTML=pages[tab]();mountButtonIcons($('#sheet-content'));syncExportButtons(); }
function render() {
  const previous=document.activeElement;
  const focused=previous?.dataset.field;
  const selection=focused && ['text','search','url','tel','password'].includes(previous.type)||previous?.tagName==='TEXTAREA'
    ? {start:previous.selectionStart,end:previous.selectionEnd,direction:previous.selectionDirection,scroll:previous.scrollTop}:null;
  renderSidebar(); renderIdentity(); renderResources(); renderContent();
  const i=tabs.findIndex(t=>t[0]===tab); $('#section-title').textContent=t(tabs[i][1]); $('#section-description').textContent=t(tabs[i][3]);
  if (focused) {
    const next=document.querySelector(ui`[data-field="${CSS.escape(focused)}"]`);next?.focus({preventScroll:true});
    if (selection && next?.setSelectionRange) {next.setSelectionRange(selection.start,selection.end,selection.direction);next.scrollTop=selection.scroll;}
  }
}
function retireExportUrls() {
  const retired = exportUrls;
  exportUrls = [];
  // Give any download already handed to the browser time to read its Blob.
  if (retired.length) setTimeout(()=>retired.forEach(url=>URL.revokeObjectURL(url)),60_000);
}
function invalidateDialog() { dialogVersion += 1; resourceHelpKey=null; retireExportUrls(); }
function showDialog(title,content) {
  accountDialogActive=false;onboardingDialogActive=false;portraitDraft=null;portraitOwner=null;
  invalidateDialog();
  $('#dialog-title').textContent=title; $('#dialog-content').innerHTML=content;mountButtonIcons($('#dialog-content'));
  if (!$('#utility-dialog').open) $('#utility-dialog').showModal();
  syncExportButtons();
  return dialogVersion;
}
function closeDialog() { accountDialogActive=false;onboardingDialogActive=false;portraitDraft=null;portraitOwner=null;invalidateDialog(); $('#utility-dialog').close(); }
function syncExportButtons() {
  document.querySelectorAll('#export-button, [data-action="export"]').forEach(button=>{
    button.disabled=exportBusy || Boolean(cloudUser&&!cloudReady);
    if (exportBusy) button.setAttribute('aria-busy','true'); else button.removeAttribute('aria-busy');
  });
}
function freezeSnapshot(value) {
  if (value && typeof value==='object') {
    Object.values(value).forEach(freezeSnapshot);
    Object.freeze(value);
  }
  return value;
}
function exportLink(bytes,type,filename,label,primary=false) {
  const url=URL.createObjectURL(new Blob([bytes],{type}));
  exportUrls.push(url);
  return ui`<a class="button${primary?' primary':''}" href="${esc(url)}" download="${esc(filename)}"><span class="button-symbol" aria-hidden="true">${icon('export')}</span><span class="button-label">${esc(label)}</span></a>`;
}
async function exportCharacter() {
  if (exportBusy) return;
  exportBusy=true;
  syncExportButtons();
  let owner;
  let snapshot;
  let backupJson;
  let backupStem='trespasser-personagem';
  try {
    snapshot=freezeSnapshot(structuredClone(current()));
    backupStem=(snapshot.name||backupStem).replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,80)||backupStem;
    backupJson=JSON.stringify({format:'trespasser-character',version:1,rules:'2.1.3',character:snapshot},null,2);
    owner=showDialog(t('Preparando exportação'),ui`<p role="status">Gerando o PDF preenchível e o JSON de <strong>${esc(snapshot.name||t('Novo personagem'))}</strong>…</p><p>O download será um ZIP com os dois arquivos. Você também poderá baixá-los separadamente.</p>`);
    const result=await prepareExport(snapshot);
    if (dialogVersion!==owner || !$('#utility-dialog').open) return;
    const pdfLink=exportLink(result.pdf,'application/pdf',ui`${result.stem}.pdf`,t('Baixar PDF editável'),true);
    const jsonLink=exportLink(result.json,'application/json',ui`${result.stem}.json`,t('Baixar JSON'));
    const zipLink=exportLink(result.zip,'application/zip',ui`${result.stem}.zip`,t('Baixar ZIP novamente'));
    $('#dialog-title').textContent=t('PDF + JSON prontos');
    $('#dialog-content').innerHTML=ui`<p role="status">O ZIP com o PDF preenchível e o JSON está pronto. Se o download não começar, use o link abaixo.</p><div class="dialog-actions export-downloads">${pdfLink}${jsonLink}${zipLink}</div><p>O PDF mantém seus campos editáveis. Importe o JSON neste site para reabrir o personagem. Alterações no PDF, no JSON e na ficha do navegador não são sincronizadas.</p>`;
    $('#dialog-content a').focus({preventScroll:true});
    try {
      $('#dialog-content a[download$=".zip"]').click();
      toast(t('PDF preenchível e JSON preparados no ZIP.'));
    } catch {
      toast(t('Arquivos prontos. Use Baixar ZIP novamente para iniciar o download.'),true);
    }
  } catch (error) {
    console.error('Não foi possível concluir a exportação da ficha.',error);
    if (owner!==undefined && (dialogVersion!==owner || !$('#utility-dialog').open)) return;
    if (backupJson) {
      retireExportUrls();
      if (owner===undefined) showDialog(t('Não foi possível gerar o PDF'),'');
      const jsonLink=exportLink(backupJson,'application/json',ui`${backupStem}.json`,t('Baixar JSON de backup'),true);
      const reason=typeof error?.message==='string'?formatError(error.message.trim()):'';
      $('#dialog-title').textContent=t('Não foi possível gerar o PDF');
      $('#dialog-content').innerHTML=ui`<p role="alert">A exportação do PDF não foi concluída.${reason?ui`<br>Motivo: ${esc(reason)}`:''}</p><p>Seus dados continuam na ficha; baixe o JSON de backup e tente exportar novamente.</p><div class="dialog-actions export-downloads">${jsonLink}</div><p>O JSON permite reabrir este personagem pela opção Importar.</p>`;
      $('#dialog-content a').focus({preventScroll:true});
    } else {
      toast(t('Não foi possível preparar a exportação. Seus dados continuam na ficha. Tente novamente.'),true);
    }
  } finally {
    exportBusy=false;
    syncExportButtons();
  }
}
function numericValue(input) {
  let v=Number(input.value); if (!Number.isFinite(v)) v=0;
  if(input.min!=='')v=Math.max(Number(input.min),v); if(input.max!=='')v=Math.min(Number(input.max),v);
  return input.step==='0.5'?Math.round(v*2)/2:Math.trunc(v);
}
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.dataset.portraitCrop){
    if(!canEditPortrait()||!hasPortraitDraft()||!portraitDraft.dataUrl)return;
    const key=el.dataset.portraitCrop;portraitDraft[key]=Number(el.value);
    const preview=$('#dialog-content .portrait-preview img');if(preview)preview.setAttribute('style',portraitStyle(portraitDraft));
    const output=document.querySelector(`[data-portrait-output="${key}"]`);if(output)output.textContent=key==='zoom'?portraitDraft[key].toFixed(2)+'×':Math.round(portraitDraft[key])+'%';
    return;
  }
  if (!el.matches('[data-field]'))return;
  const val=el.type==='checkbox'?el.checked:el.type==='number'?numericValue(el):el.value;
  setAt(current(),el.dataset.field,val); save();
  if(el.dataset.field==='name'||el.dataset.field==='calling'){ renderSidebar();$('#breadcrumb-name').textContent=current().name||t('Novo personagem'); }
});
document.addEventListener('change',e=>{
  const el=e.target,c=current();
  if(el.dataset.plight){if(!canEditPortrait())return;c.plightSelections=el.checked?[...new Set([...(c.plightSelections||[]),el.dataset.plight])]:(c.plightSelections||[]).filter(key=>key!==el.dataset.plight);save();return;}
  if(el.dataset.skill){ c.trained=el.checked?[...new Set([...c.trained,el.dataset.skill])]:c.trained.filter(k=>k!==el.dataset.skill);save();render(); }
  else if(el.dataset.key){ c.keyAttribute=el.dataset.key;save();render(); }
  else if(el.matches('[data-field]')&&(el.type==='number'||el.type==='checkbox'||el.tagName==='SELECT')){
    if(el.tagName==='SELECT'){setAt(c,el.dataset.field,el.value);if(/^deeds\.\d+\.kind$/.test(el.dataset.field)){const i=Number(el.dataset.field.split('.')[1]);c.deeds[i].cost=el.value==='heavy'?2:el.value==='mighty'?4:0;}}
    save();render();
  }
});
document.addEventListener('click',e=>{
  const el=e.target.closest('button'); if(!el)return;
  const c=current(),d=derive(c);
  if(el.dataset.resourceHelp){showResourceHelp(el.dataset.resourceHelp);return;}
  if(el.dataset.tab){ tab=el.dataset.tab;render();$('#section-title').setAttribute('tabindex','-1');$('#section-title').focus({preventScroll:true});return; }
  if(el.dataset.character){activeId=el.dataset.character;save();render();document.querySelector('[data-field="name"]')?.focus({preventScroll:true});return;}
  if(el.dataset.resource){const k=el.dataset.resource;const max={hp:d.hpMax,recovery:d.recoveryMax,endurance:d.enduranceMax,resolve:3}[k]??1000000000;c.resources[k]=Math.max(0,Math.min(max,c.resources[k]+Number(el.dataset.delta)));save();renderResources();return;}
  if(el.dataset.alignment){const[i,k,n]=el.dataset.alignment.split('.');c.alignments[i][k]=c.alignments[i][k]===Number(n)?Number(n)-1:Number(n);save();renderContent();return;}
  if(el.dataset.remove){const[k,i]=el.dataset.remove.split('.');c[k].splice(Number(i),1);save();renderContent();return;}
  if(el.dataset.roll){openDice(el.dataset.roll);performRoll(el.dataset.roll);return;}
  if(el.dataset.useDeed!==undefined){const deed=c.deeds[Number(el.dataset.useDeed)],cost=Number(deed.cost)+Number(deed.focus);if(c.resources.focus<cost){toast(t('Foco insuficiente para este feito.'));return;}c.resources.focus-=cost;if(['heavy','mighty'].includes(deed.kind))deed.focus=Math.min(10000,deed.focus+1);save();render();toast(t('Feito usado: {count} foco gasto.',{count:cost}));return;}
  const action=el.dataset.action;
  if(action==='portrait-edit'){showPortraitEditor(c.portrait);return;}
  if(action==='portrait-choose'){choosePortrait();return;}
  if(action==='portrait-cancel'){closeDialog();return;}
  if(action==='portrait-save'){if(canSavePortrait()){const removed=!portraitDraft.dataUrl;c.portrait=structuredClone(portraitDraft);save();renderIdentity();closeDialog();toast(t(removed?'Retrato removido.':'Retrato salvo.'));}return;}
  if(action==='portrait-remove'){if(canEditPortrait()&&hasPortraitDraft()&&portraitDraft.dataUrl){showPortraitEditor({dataUrl:'',zoom:1,x:50,y:50});document.querySelector('[data-action="portrait-choose"]')?.focus({preventScroll:true});}return;}
  if(action==='onboarding'){openOnboardingDialog();return;}
  if(action==='cloud-account'){openAccountDialog();return;}
  if(action==='settings'){openAccountDialog();return;}
  if(action==='theme'){theme.setPreference(el.dataset.themeValue);refreshThemeControls();return;}
  if(action==='cloud-login'){void loginCloud();return;}
  if(action==='cloud-logout'){void logoutCloud();return;}
  if(action==='cloud-migrate'){void migrateLocalCharacters();return;}
  if(action==='add-item'){c.inventory.push({id:uid(),name:'',slots:1,notes:''});save();renderContent();document.querySelector(ui`[data-field="inventory.${c.inventory.length-1}.name"]`)?.focus();}
  if(action==='add-deed'){c.deeds.push({id:uid(),name:'',kind:'light',cost:0,focus:0,description:''});save();renderContent();document.querySelector(ui`[data-field="deeds.${c.deeds.length-1}.name"]`)?.focus();}
  if(action==='export')exportCharacter();
  if(action==='start-combat'){
    if(d.commoner){toast(t('Commoners não usam foco.'));return;}
    showDialog(t('Iniciar combate'),ui`<p>Definir o foco para <strong>${d.focusStart??d.skill}</strong> (Skill + ajustes)? As marcas de foco dos feitos continuam registradas.</p><button class="button primary" data-icon="sword" data-action="confirm-combat">Iniciar combate</button>`);
  }
  if(action==='confirm-combat'){c.resources.focus=d.focusStart??d.skill;save();render();closeDialog();toast(t('Foco inicial preparado.'));}
  if(action==='night-rest'){
    if(d.commoner){toast(t('A recuperação de Commoners é resolvida com o Judge.'));return;}
    showDialog(t('Descanso noturno'),ui`<p>Depois de resolver o descanso na mesa, restaure seus PV, renove os dados de recuperação conforme a Endurance restante, apague as marcas de foco dos feitos e recupere os dados de armadura.</p><label class="skill-check rest-food"><input id="rest-food" type="checkbox" checked><span><strong>Consegui me alimentar</strong><small>Se não conseguiu comer, perde 1 Endurance.</small></span></label><p class="panel-note">Com Endurance 0, não há recuperação de PV nem ganho de dados de recuperação. Recursos de foco e Resolve continuam como estão.</p><button class="button primary" data-icon="rest" data-action="confirm-rest">Aplicar descanso concluído</button>`);
  }
  if(action==='confirm-rest'){
    const ate=$('#rest-food').checked;
    c.resources.endurance=Math.max(0,c.resources.endurance-(ate?0:1));
    if(c.resources.endurance>0)c.resources.hp=d.hpMax;
    c.resources.recovery=c.resources.endurance;c.resources.recoveryTotal=c.resources.endurance;
    c.deeds.forEach(x=>x.focus=0);c.armor.forEach(x=>x.spent=false);save();render();closeDialog();toast(t('Descanso registrado. Resolva aflições e ferimentos com o Judge.'));
  }
  if(action==='duplicate'){const copy=normalizeCharacter(structuredClone(c));copy.id=uid();copy.name=(c.name||t('Personagem'))+t(' (cópia)');records.push(copy);activeId=copy.id;save();render();closeDialog();toast(t('Cópia criada.'));}
  if(action==='delete')showDialog(t('Excluir personagem'),ui`<p>Excluir <strong>${esc(c.name||t('Novo personagem'))}</strong> ${cloudUser?t('da sua conta e dos dispositivos sincronizados'):t('deste navegador')}? Essa ação não pode ser desfeita. Você pode exportar uma cópia antes.</p><div class="dialog-actions"><button class="button" data-icon="export" data-action="export">Exportar ficha</button><button class="button destructive" data-icon="trash" data-action="confirm-delete">Excluir personagem</button></div>`);
  if(action==='confirm-delete'){records=records.filter(x=>x.id!==activeId);if(!records.length){records=[createCharacter()];if(cloudUser)cloudPlaceholderId=records[0].id;}activeId=records[0].id;save();render();closeDialog();toast(t('Personagem excluído.'));}
});
function addCharacter(){const c=createCharacter();records.push(c);activeId=c.id;tab='character';save();render();document.querySelector('[data-field="name"]').focus();toast(t('Nova ficha criada. Escolha o nível e preencha seus atributos.'));}
$('#mobile-new').addEventListener('click',addCharacter);$('#mobile-dice').addEventListener('click',()=>openDice());
$('#mobile-character-select').addEventListener('change',e=>{activeId=e.target.value;save();render();});
$('#new-character').addEventListener('click',addCharacter);$('#add-character').addEventListener('click',addCharacter);
$('#export-button').addEventListener('click',exportCharacter);
$('#account-button').addEventListener('click',openAccountDialog);
$('#import-button').addEventListener('click',()=>{$('#import-file').value='';$('#import-file').click();});
$('#import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  if(!canEditPortrait())return;
  const generation=cloudGeneration,userId=cloudUser?.id||null;
  try{
    if(file.size>2_000_000)throw new Error(t('O arquivo deve ter até 2 MB.'));
    const data=JSON.parse(await file.text());
    if(generation!==cloudGeneration||userId!==(cloudUser?.id||null)||!canEditPortrait())throw new Error(t('A conta mudou durante a importação. Tente novamente.'));
    if(data.format!=='trespasser-character'||data.version!==1||!data.character)throw new Error(t('Use um JSON exportado por esta ficha (versão 1).'));
    const c=normalizeCharacter(data.character);c.id=uid();records.push(c);activeId=c.id;save();render();toast(t('Ficha importada como um novo personagem.'));
  }catch(err){toast(t('Não foi possível importar: ')+formatError(err.message),true);}
});
$('#sheet-menu-button').addEventListener('click',()=>showDialog(t('Gerenciar ficha'),ui`<p>Organize seus personagens. Exportar prepara um ZIP com o PDF preenchível e o JSON para backup ou transferência.</p><div class="menu-actions"><button class="button" data-icon="duplicate" data-action="duplicate">Duplicar personagem</button><button class="button" data-icon="export" data-action="export">Exportar PDF + JSON</button><button class="button danger" data-icon="trash" data-action="delete">Excluir personagem</button></div>`));
$('#dialog-close').addEventListener('click',closeDialog);
$('#utility-dialog').addEventListener('cancel',invalidateDialog);
$('#utility-dialog').addEventListener('close',()=>{if (!$('#utility-dialog').open) invalidateDialog();});
$('#utility-dialog').addEventListener('click',e=>{if(e.target===$('#utility-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
$('#about-button').addEventListener('click',()=>showDialog(t('Sobre este registro'),ui`<p>Ferramenta não oficial baseada no Rulebook e Character Record de <strong>Trespasser v2.1.3</strong>. Traduções de interface são livres; os termos em inglês ajudam a consultar o livro.</p><h3>Cálculos</h3><p>Os atributos, nível, perícias e AR alimentam os valores da ficha. Vocação, talentos e efeitos específicos exigem ajustes manuais em Combate. Estados e aflições são registros; seus efeitos precisam ser resolvidos na mesa.</p><p>PV: (nível + 1) × (5 + Might), mais o ajuste de PV. Endurance: 10 + Spirit. AR ≥ 6 remove Agility da Guarda e limita o bônus de velocidade a +2. Commoners não usam Endurance, recuperação ou foco.</p><h3>Seus dados</h3><p>Entre com Google para salvar suas fichas privadas na conta e acessar os mesmos personagens no celular e no computador. O salvamento é automático; confira o indicador “Salvo online”. Sem conexão, as alterações ficam pendentes neste navegador e são enviadas quando a conexão volta. Edições simultâneas conflitantes são preservadas em uma cópia com “(conflito)”.</p><p>Sem entrar, o salvamento continua local. As fichas locais podem ser copiadas para a conta pela opção Configurações. Ao sair, você volta às fichas locais; as fichas da conta continuam privadas. Limpar os dados do navegador apaga cópias locais e alterações ainda não sincronizadas.</p><p>Exportar baixa um ZIP com o PDF preenchível e o JSON da ficha; também oferece os arquivos separados. Alterações nesses arquivos são independentes da ficha online. Importar o JSON cria uma nova ficha.</p><button class="button" data-icon="settings" data-action="cloud-account">${cloudUser?t('Configurações'):t('Entrar para salvar online')}</button><p class="panel-note">Referências do livro: pp. 11–12, 19, 22–24, 31, 44–45, 55, 63, 71, 75, 86, 88–90. A impressão inclui todas as seções da ficha; use Exportar para gerar o PDF preenchível.</p>`));
function openDice(expression='1d20') {
  showDialog(t('Rolagem de dados'),ui`<p class="panel-note">Rolagem livre. Para testes: d20 + atributo + Skill bonus quando a perícia é treinada. Compare com o TN anunciado na mesa.</p><form id="dice-form"><label class="field"><span>Expressão de dados</span><input id="dice-expression" value="${esc(expression)}" placeholder="Ex.: 1d20+3" maxlength="80" autocomplete="off" required></label><button type="submit" class="button primary">${icon('dice')} Rolar dados</button></form><div id="dice-result" aria-live="polite"></div><div class="roll-history" id="roll-history"></div>`);
  $('#dice-form').addEventListener('submit',e=>{e.preventDefault();performRoll($('#dice-expression').value);});
}
function performRoll(expression){
  try{const result=rollDice(expression);rollHistory.unshift(result);rollHistory=rollHistory.slice(0,5);$('#dice-result').innerHTML=ui`<div class="roll-result"><span>RESULTADO</span><strong>${result.total}</strong><small>${esc(expression)} · dados: ${result.rolls.join(', ')}</small></div>`;$('#roll-history').innerHTML=rollHistory.slice(1).map(r=>ui`<div><span>${esc(r.expression)}</span><strong>${r.total}</strong></div>`).join('');}catch(e){$('#dice-result').innerHTML=ui`<p class="inline-warning">${esc(t(e.message))}</p>`;}
}
$('#dice-open').addEventListener('click',()=>openDice());
let cleanupPrint;
window.addEventListener('beforeprint',()=>{
  cleanupPrint?.();$('#print-document')?.remove();
  const printRoot=document.createElement('main');printRoot.id='print-document';printRoot.className='print-only';
  const title=document.createElement('h1');title.textContent=t('Trespasser · Ficha de personagem');title.className='print-record-title';printRoot.append(title);
  printRoot.append($('#identity').cloneNode(true),$('#resources').cloneNode(true));
  const content=document.createElement('div');content.innerHTML=tabs.map(t=>ui`<h2 class="print-section-title">${getLanguage()==='en'?t[2]:t[1]}</h2>${pages[t[0]]()}`).join('');printRoot.append(content);
  printRoot.querySelectorAll('[name]').forEach(el=>el.removeAttribute('name'));
  printRoot.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  document.body.append(printRoot);cleanupPrint=preparePrint(printRoot);
});
window.addEventListener('afterprint',()=>{cleanupPrint?.();cleanupPrint=null;$('#print-document')?.remove();});
$('#print-button').addEventListener('click',()=>window.print());
window.addEventListener('storage',e=>{if(e.key===KEY&&!cloudUser){showDialog(t('O registro mudou em outra aba'),ui`<p>Outra aba alterou os personagens. Recarregue para ler os dados mais recentes antes de continuar. Exporte esta ficha se quiser preservar a edição atual.</p><div class="dialog-actions"><button class="button" data-icon="export" data-action="export">Exportar esta versão</button><button class="button primary" data-icon="sync" id="reload-records">Carregar versão recente</button></div>`);saveError=true;$('#save-status').textContent=t('Alteração em outra aba · recarregue');$('#reload-records').addEventListener('click',()=>location.reload());}});
window.addEventListener('online',()=>{void syncCloud();});
window.addEventListener('focus',()=>{void syncCloud();});
window.addEventListener('beforeunload',event=>{
  if (cloudUser && (cloudEditError || hasUncachedEdits())) { event.preventDefault();event.returnValue=''; }
});
window.addEventListener('pagehide',()=>{stopCloud();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncCloud();});

$('#portrait-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0],request=portraitRequest;portraitRequest=null;
  if(!file||!request||request.id!==activeId||request.generation!==cloudGeneration||request.dialogVersion!==dialogVersion||!$('#utility-dialog').open||!canEditPortrait())return;
  const version=showDialog(t('Preparando retrato'),`<p role="status">${t('Preparando sua imagem…')}</p>`);
  try{
    const portrait=await importPortrait(file);
    if(version!==dialogVersion||!$('#utility-dialog').open||request.id!==activeId||request.generation!==cloudGeneration||!canEditPortrait())return;
    showPortraitEditor(portrait);
  }catch(error){
    if(version!==dialogVersion||request.id!==activeId||request.generation!==cloudGeneration)return;
    showDialog(t('Não foi possível abrir a imagem'),`<p role="alert">${esc(formatError(error?.message||'Escolha uma imagem PNG, JPEG ou WebP.'))}</p><button type="button" class="button" data-action="portrait-choose">${t('Escolher outra imagem')}</button>`);
  }
});
window.addEventListener('trespasser:language',()=>{
  const openResourceHelp=resourceHelpKey;
  const languageFocused=document.activeElement?.matches?.('[data-language-preference]');
  translateStatic(document);render();updateAccountControls(true);
  if(cloudUser)setSaveStatus(cloudStatusLabel(),cloudStatus.state);
  else setSaveStatus(saveError?'Salvamento indisponível · exporte uma cópia':'Salvo neste navegador',saveError?'error':'local');
  if(portraitDraft&&$('#utility-dialog').open)showPortraitEditor(portraitDraft);
  if(openResourceHelp&&$('#utility-dialog').open)showResourceHelp(openResourceHelp);
  if(languageFocused)document.querySelector('[data-language-preference]')?.focus({preventScroll:true});
});

mountButtonIcons(document);
render(); if(!saveError)save();
void initializeCloud();
