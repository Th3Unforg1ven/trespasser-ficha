import { createHaven, normalizeHaven, deriveHaven, HAVEN_ATTRS, HAVEN_SKILLS, HAVEN_LEVELS, HIRELING_TYPES } from './haven-model.js';
import { createCloudClient } from './cloud-client.js?v=records-2';
import { cloudConfig } from './cloud-config.js';
import { CloudSync } from './cloud-sync.js?v=performance-1';
import { acquireAccountLock } from './account-lock.js';
import { setupTheme } from './preferences.js?v=settings-1';
import { icon, mountButtonIcons } from './icons.js?v=performance-1';
import { preparePrint } from './print.js?v=records-2';
import { setupThemeToggle, createPageTransition } from './ui-shell.js?v=performance-1';
import { setupLanguage, t, getLanguage, languageSettingsMarkup, translateStatic } from './i18n.js';
import './i18n-havens.js';

export const HAVEN_KEY = 'trespasser.havens.v1';
const clone = value => structuredClone(value);
const content = value => { const { id, ...data } = normalizeHaven(value); return JSON.stringify(data); };
const pristine = () => content(createHaven());
const meaningful = value => content(value) !== pristine();
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const HAVEN_ERROR_FIELDS=Object.freeze({
  name:'Nome',leadership:'Liderança',location:'Localização',arrivals:'Chegadas',storedItems:'Itens armazenados',notes:'Anotações',
  level:'Nível do refúgio',partyLevel:'Nível do grupo',populationRank:'Grau de população',populationMode:'Condição da população',wealth:'Riqueza',
  growth:'Crescimento',decline:'Declínio',expenses:'Despesas',builds:'Construções em andamento',projects:'Projetos',
});
/** Translate known validation structures without rewriting unknown diagnostics. */
export function translateHavenMessage(source) {
  const value=t(source);if(getLanguage()!=='en'||value!==source)return value;
  const unsupported=String(source).match(/^O caractere “(.+)” não é suportado pela fonte do PDF\. Use o JSON para preservar o texto completo\.$/u);
  if(unsupported)return t('O caractere “{character}” não é suportado pela fonte do PDF. Use o JSON para preservar o texto completo.',{character:unsupported[1]});
  return String(source).replace(/^(.+): (objeto inválido\.|texto inválido\.|número inválido\.|lista inválida\.)$/,(_,label,suffix)=>`${t(Object.hasOwn(HAVEN_ERROR_FIELDS,label)?HAVEN_ERROR_FIELDS[label]:label)}: ${t(suffix)}`);
}

/** Account boundaries and persistence are independent from the page DOM. */
export function createHavenController({ storage, sessionStorage, locks, location,
  makeId = () => crypto.randomUUID(), makeConnection = createCloudClient,
  Sync = CloudSync, lock = acquireAccountLock,
  timers = globalThis, onChange = () => {}, onToast = () => {} } = {}) {
  let records = [], activeId, readError = false, localUnsaved = false;
  let user = null, connection, engine, generation = 0, authRevision = 0;
  let ready = false, sessionChecked = false, authBusy = false, loading = false, cloudReady = false;
  let placeholderId = null, lockHandle, syncTimer, pollTimer, verificationTimer, subscription;
  let problem = '', blocked = '', editError = '', status = { state:'local', pending:0, localSaved:true };
  let guestBackup, migrationSession = new Set();
  const fresh = (name = '') => { const haven = createHaven(name); haven.id = makeId(); return haven; };
  function readGuest() {
    const raw = storage?.getItem(HAVEN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.havens) || !saved.havens.length || saved.havens.length > 10000) throw new Error('Registro local inválido.');
    const data = saved.havens.map(normalizeHaven);
    if (new Set(data.map(item => item.id)).size !== data.length) throw new Error('Identificadores repetidos.');
    return { records:data, activeId:data.some(item => item.id === saved.activeId) ? saved.activeId : data[0].id };
  }
  try { const saved = readGuest(); if (saved) ({records,activeId} = saved); }
  catch { readError = true; localUnsaved = true; }
  if (!records.length) { records = [fresh()]; activeId = records[0].id; }
  const cloudRecords = () => records.filter(item => item.id !== placeholderId || meaningful(item));
  const unsafe = () => Boolean(editError || status.pending > 0 && status.localSaved === false);
  function migratedIds() {
    try { const data = JSON.parse(storage?.getItem(`${HAVEN_KEY}.migrated.${user.id}`) || '[]'); return new Set([...migrationSession,...(Array.isArray(data) ? data.filter(id => typeof id === 'string') : [])]); }
    catch { return new Set(migrationSession); }
  }
  function candidates() {
    if (!user || unsafe()) return [];
    const done = migratedIds();
    return (guestBackup?.records || []).filter(item => meaningful(item) && !done.has(item.id)
      && !cloudRecords().some(saved => saved.id === item.id && content(saved) === content(item)));
  }
  function statusLabel() {
    if (blocked) return blocked;
    if (!user) return localUnsaved ? 'Salvamento indisponível · exporte uma cópia' : 'Salvo neste navegador';
    if (loading) return 'Carregando seus refúgios…';
    if (editError) return editError;
    if (['error','offline'].includes(status.state) && status.message) return status.message;
    return ({ syncing:'Sincronizando com sua conta…', synced:'Salvo online', offline:'Sem conexão · alterações pendentes neste navegador' })[status.state] || 'Salvo neste dispositivo · sincronização pendente';
  }
  function getState() {
    return { records:clone(records), activeId, user:user ? {id:user.id,email:user.email} : null,
      ready, sessionChecked, authBusy, loading, cloudReady, blocked, problem, status:{...status},
      statusLabel:statusLabel(), canEdit:!loading && !blocked, unsafe:unsafe() || !user && localUnsaved,
      canLogout:!authBusy && !unsafe(), migrationCount:candidates().length };
  }
  const emit = (reason = 'state') => onChange(getState(),reason);
  function onStatus(value) { status = {...value,localSaved:value.localSaved ?? status.localSaved}; emit('status'); }
  function stop() {
    generation++;timers.clearTimeout(syncTimer);timers.clearInterval(pollTimer);
    engine?.stop();engine=null;cloudReady=false;placeholderId=null;editError='';
    lockHandle?.release();lockHandle=null;blocked='';
  }
  async function sync() {
    if (!cloudReady || !engine || !user || editError) return;
    await engine.sync();
  }
  function save(reason = 'edit') {
    if (user) {
      if (!cloudReady || !engine || blocked) return;
      try {
        const data = cloudRecords();
        if (data.length && placeholderId) { records=data;placeholderId=null; }
        editError='';status={...status,state:'pending',pending:Math.max(1,status.pending || 0)};
        engine.setRecords(data,data.some(item => item.id === activeId) ? activeId : null);
        timers.clearTimeout(syncTimer);syncTimer=timers.setTimeout(() => { void sync(); },700);
      } catch {
        editError='Não foi possível guardar a edição · exporte uma cópia';
        status={state:'error',pending:1,localSaved:false,message:editError};
        onToast('Não foi possível guardar a edição. Exporte uma cópia antes de fechar.',true);
      }
    } else {
      try {
        if (readError) throw new Error('O registro local original foi preservado.');
        if (!storage) throw new Error('Salvamento indisponível.');
        storage.setItem(HAVEN_KEY,JSON.stringify({version:1,activeId,havens:records}));localUnsaved=false;
      } catch { localUnsaved=true;onToast('O navegador não conseguiu salvar. Exporte uma cópia para preservar a edição.',true); }
    }
    emit(reason);
  }
  function applySnapshot(snapshot) {
    if (editError) return;
    const incoming = snapshot.records.map(normalizeHaven);
    const selected = incoming.some(item => item.id === snapshot.activeId) ? snapshot.activeId : incoming[0]?.id;
    if (JSON.stringify(incoming) === JSON.stringify(cloudRecords()) && (selected === activeId || !incoming.length && placeholderId === activeId)) return;
    records=incoming;placeholderId=null;
    if (!records.length) { records=[fresh()];placeholderId=records[0].id; }
    activeId=selected || records[0].id;emit('remote');
  }
  async function attachSession(session) {
    const next = session?.user || null;
    if ((next?.id || null) === (user?.id || null)) { if (next) user=next;emit('account');return; }
    if (!user) guestBackup={records:clone(records),activeId,localUnsaved,readError};
    stop();user=next;authBusy=false;problem='';migrationSession=new Set();
    status={state:'local',pending:0,localSaved:true};
    if (!user) {
      loading=false;
      if (guestBackup) ({records,activeId,localUnsaved,readError}=clone(guestBackup));
      try { const saved=readGuest();if(saved)({records,activeId}=saved); } catch { readError=true;localUnsaved=true; }
      emit('scope');return;
    }
    const owner=generation;
    records=[fresh()];activeId=records[0].id;placeholderId=activeId;loading=true;emit('scope');
    let acquired;
    try { acquired=await lock(locks,`trespasser.havens.account.${user.id}`); }
    catch(error) {
      if(owner!==generation)return;
      blocked=error.code==='ACCOUNT_LOCK_UNSUPPORTED' ? error.message : 'Não foi possível abrir esta conta com segurança. Recarregue a página.';
      problem=blocked;loading=false;emit('account');return;
    }
    if(owner!==generation){acquired?.release();return;}
    if(!acquired){blocked='Este registro de refúgios está aberto em outra aba. Feche-a e recarregue esta página.';problem=blocked;loading=false;emit('account');return;}
    lockHandle=acquired;
    engine=new Sync({adapter:connection.adapter.forUser(user.id),storage,cacheKey:`${HAVEN_KEY}.cloud.${user.id}`,
      makeId,normalizeRecord:normalizeHaven,
      onChange:snapshot=>{if(owner===generation)applySnapshot(snapshot);},
      onStatus:value=>{if(owner===generation)onStatus(value);},
      onConflict:conflict=>{if(owner===generation)onToast(conflict.message || 'Edições simultâneas preservadas em um refúgio com “(conflito)”.',true);}
    });
    try { await engine.start({records:[],activeId:null}); }
    catch { if(owner!==generation)return;status={state:'error',pending:0,localSaved:true,message:'Não foi possível sincronizar. Tente novamente ao recuperar a conexão.'}; }
    if(owner!==generation)return;
    cloudReady=true;loading=false;emit('account');
    pollTimer=timers.setInterval(() => { void sync(); },15000);
  }
  async function initialize() {
    verificationTimer=timers.setTimeout(()=>{if(!ready){ready=true;problem='A verificação da sessão está demorando. Você pode tentar entrar novamente.';emit('account');}},20000);
    try {
      connection=makeConnection({...cloudConfig,table:'trespasser_havens',rpc:'trespasser_save_haven'});
      subscription=connection.auth.onAuthStateChange((event,session)=>{
        // INITIAL_SESSION may be empty after a verification failure. Wait for
        // getSession's successful result before treating a visitor as signed out.
        if(!session?.user&&event!=='SIGNED_OUT')return;
        const revision=++authRevision;
        timers.setTimeout(()=>{if(revision===authRevision){ready=true;sessionChecked=Boolean(session?.user)||event==='SIGNED_OUT';problem='';void attachSession(session);}},0);
      })?.data?.subscription;
      const revision=authRevision;
      const {data,error}=await connection.auth.getSession();
      if(error)throw error;
      if(revision===authRevision){ready=true;sessionChecked=true;problem='';await attachSession(data.session);}
    } catch {ready=true;if(!user){problem='Não foi possível verificar sua sessão. Você pode tentar entrar novamente.';emit('account');}}
    finally {timers.clearTimeout(verificationTimer);}
  }
  async function login() {
    if (!connection || !ready || authBusy) return;
    const owner=generation;
    authBusy=true;problem='';emit('account');
    try {
      const redirectTo=new URL('./',location.href);redirectTo.search='';redirectTo.hash='';
      const {error}=await connection.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo.href}});
      if(error)throw error;
    } catch {if(owner!==generation)return;authBusy=false;problem='Não foi possível abrir o login com Google. Tente novamente.';emit('account');}
  }
  async function logout() {
    if(!connection || !user || authBusy || unsafe())return;
    const signingOutId=user.id;
    authBusy=true;problem='';emit('account');
    try {const {error}=await connection.auth.signOut({scope:'local'});if(error)throw error;if(user?.id===signingOutId)await attachSession(null);if(!user)onToast('Você saiu neste dispositivo. Os refúgios online continuam na sua conta.');}
    catch {if(user?.id===signingOutId)problem='Não foi possível sair agora. Tente novamente.';}
    finally {if(!user||user.id===signingOutId){authBusy=false;emit('account');}}
  }
  function change(mutator,reason='edit') {
    if(loading || blocked)return false;
    const copy=clone(records),previousId=activeId;
    try{mutator(copy);records=copy.map(normalizeHaven);}
    catch(error){activeId=previousId;onToast(error?.message||'O registro contém um valor inválido.',true);return false;}
    save(reason);return true;
  }
  function update(path,value) {
    const keys=path.split('.');
    if(keys.some(key=>['__proto__','prototype','constructor','id','kind'].includes(key)))throw new Error('Campo inválido.');
    return change(data=>{
      let target=data.find(item=>item.id===activeId);
      for(const key of keys.slice(0,-1)){if(!Object.hasOwn(target,key))throw new Error('Campo inválido.');target=target[key];}
      if(!Object.hasOwn(target,keys.at(-1)))throw new Error('Campo inválido.');target[keys.at(-1)]=value;
    });
  }
  function add(name='') {const item=fresh(name);if(change(data=>{data.push(item);activeId=item.id;},'records')){placeholderId=null;return item.id;}return null;}
  function select(id) {if(records.some(item=>item.id===id)&&!loading&&!blocked){activeId=id;save('records');}}
  function duplicate() {const copy=clone(records.find(item=>item.id===activeId));copy.id=makeId();copy.name=`${copy.name || 'Novo refúgio'} (cópia)`;if(change(data=>{data.push(copy);activeId=copy.id;},'records'))placeholderId=null;}
  function remove(id) {if(!records.some(item=>item.id===id))return;change(data=>{const i=data.findIndex(item=>item.id===id);data.splice(i,1);if(!data.length){const blank=fresh();data.push(blank);placeholderId=user?blank.id:null;}activeId=data[0].id;},'records');}
  function importRecord(input) {
    const raw=input?.format==='trespasser-haven'&&input.version===1 ? input.haven : input;
    if(raw?.kind!=='haven')throw new Error('Escolha um JSON de Refúgio de Trespasser.');
    const item=normalizeHaven(raw);item.id=makeId();
    if(!change(data=>{data.push(item);activeId=item.id;},'records'))throw new Error('Aguarde o carregamento da conta.');
    placeholderId=null;return item;
  }
  async function migrate() {
    if(!cloudReady || !user || authBusy || unsafe())return;
    const local=candidates();if(!local.length)return;
    const data=clone(cloudRecords()),used=new Set(data.map(item=>item.id));
    for(const original of local){const copy=clone(original);while(used.has(copy.id))copy.id=makeId();used.add(copy.id);data.push(copy);activeId=copy.id;}
    records=data;placeholderId=null;save('records');
    if(status.localSaved!==false&&!editError){
      for(const item of local)migrationSession.add(item.id);
      try{storage?.setItem(`${HAVEN_KEY}.migrated.${user.id}`,JSON.stringify([...migratedIds()]));}catch{onToast('Refúgios copiados; não foi possível registrar a transferência neste navegador.',true);}
    }
    emit('account');await sync();
  }
  function externalGuestChange(){if(user)return;readError=true;localUnsaved=true;blocked='O registro local mudou em outra aba. Exporte sua versão e recarregue antes de editar.';emit('blocked');}
  return {getState,initialize,login,logout,sync,update,change,add,select,duplicate,remove,importRecord,migrate,externalGuestChange,
    dispose(){authRevision++;stop();timers.clearTimeout(verificationTimer);subscription?.unsubscribe();},
  };
}

const TABS = [ ['refuge','Refúgio','castle'], ['construction','Construções','gate'], ['economy','Trabalho','bag'], ['notes','Anotações','book'] ];
const ROWS = {
  builds:{pt:'Construções em andamento',en:'Build slots',item:'Construção',clock:true,fields:[]},
  finishedBuildings:{pt:'Construções concluídas',en:'Finished buildings',item:'Construção',fields:[]},
  projects:{pt:'Projetos',en:'Projects',item:'Projeto',clock:true,fields:[]},
  strongholds:{pt:'Fortalezas',en:'Strongholds',item:'Fortaleza',clock:true,fields:[['project','Projeto','Project'],['arrivals','Chegadas','Arrivals']]},
  productionChains:{pt:'Cadeias de produção',en:'Production chains',item:'Cadeia de produção',fields:[['cost','Custo','Cost','number'],['hirelings','Trabalhadores','Hirelings'],['output','Produção','Output']]},
};
const signed = number => Number(number)>0 ? `+${number}` : String(number ?? 0);

export function setupHavenPage({document,window,localStorage,sessionStorage,navigator,location},dependencies={}) {
  const $ = selector => document.querySelector(selector);
  setupLanguage({document,window,navigator,localStorage});
  const theme = setupTheme({document,window,localStorage});
  const themeToggle = setupThemeToggle({document,window,theme});
  const transition = createPageTransition({document,window});
  const finishInitialLoading = transition.start({label:'Abrindo refúgios…'});
  let returningToEntry = false;
  let state,tab='refuge',dialogVersion=0,settingsOpen=false,exportBusy=false,urls=[],toastTimer,cleanupPrint;
  const message=translateHavenMessage;
  function toast(value,long=false){$('#toast').textContent=message(value);$('#toast').hidden=false;window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>{$('#toast').hidden=true;},long?9000:4000);}
  const controller=createHavenController({storage:localStorage,sessionStorage,locks:navigator.locks,location,
    timers:window,...dependencies,onToast:toast,onChange:(snapshot,reason)=>{
      const oldScope=state?.user?.id || null;
      const accountControlsChanged=state?.canLogout!==snapshot.canLogout||state?.unsafe!==snapshot.unsafe||state?.migrationCount!==snapshot.migrationCount;
      state=snapshot;
      if(reason==='scope' || (oldScope !== (state.user?.id || null))){if($('#utility-dialog').open)closeDialog();}
      if(!['edit','status','account'].includes(reason))render();else if(reason==='edit')refreshComputed();
      refreshStatus();
      if((reason==='account'||accountControlsChanged)&&settingsOpen&&$('#utility-dialog').open)refreshSettings();
      if(state.ready&&!state.loading){
        finishInitialLoading();
        // Only a confirmed signed-out session returns to the public entry.
        // Verification failures stay visible so cached edits remain accessible.
        if(state.sessionChecked&&!state.user&&!state.unsafe&&!returningToEntry){
          returningToEntry=true;location.replace(new URL('./#inicio',location.href).href);
        }
      }
    }});
  state=controller.getState();
  const current = () => state.records.find(item=>item.id===state.activeId);
  const valueAt = path => path.split('.').reduce((value,key)=>value?.[key],current());
  const bi=(pt,en)=>getLanguage()==='en'?esc(en):`${esc(pt)}<small>${esc(en)}</small>`;
  const localLabel=source=>{const parts=String(source).match(/^(.*?)\s*<small>(.*?)<\/small>$/);return parts?bi(parts[1],parts[2]):t(source);};
  function field(label,path,{type='text',min=0,max=1000000000,step=1}={}) {
    return `<label class="field"><span>${localLabel(label)}</span><input type="${type}" data-field="${path}" value="${esc(valueAt(path))}" ${type==='number'?`min="${min}" max="${max}" step="${step}"`:'maxlength="50000"'}></label>`;
  }
  const number = (label,path,options={}) => field(label,path,{type:'number',...options});
  const area = (label,path,rows=3) => `<label class="field"><span>${localLabel(label)}</span><textarea rows="${rows}" maxlength="50000" data-field="${path}">${esc(valueAt(path))}</textarea></label>`;
  const panel = (pt,en,body,extra='') => `<section class="panel ${extra}"><header class="panel-heading"><h3>${bi(pt,en)}</h3></header>${body}</section>`;
  function choice(label,path,choices) {
    return `<label class="field"><span>${localLabel(label)}</span><select data-field="${path}">${choices.map(([value,text])=>`<option value="${esc(value)}" ${String(valueAt(path))===String(value)?'selected':''}>${esc(t(text))}</option>`).join('')}</select></label>`;
  }
  function metric(label,value,detail='',derived='') {return `<div class="haven-metric"><span>${t(label)}</span><strong ${derived?`data-derived="${derived}"`:''}>${esc(value)}</strong>${getLanguage()==='en'?`<small>${derived==='weeklyExpenses'?t('cp / semana'):' '}</small>`:`<small>${detail}</small>`}</div>`;}
  function renderIdentity() {
    $('#haven-identity').innerHTML=`${field('Nome do refúgio <small>Name</small>','name')}<div class="form-grid">${field('Liderança <small>Leadership</small>','leadership')}${field('Localização <small>Location</small>','location')}</div>`;
  }
  function renderMetrics() {
    const haven=current(),derived=deriveHaven(haven);
    $('#haven-metrics').innerHTML=metric(t('Nível'),haven.level,'Haven level','level')+metric(t('População'),haven.populationRank,'Population rank','populationRank')+metric(t('Riqueza'),haven.wealth,'Wealth','wealth')+metric(t('Perícia'),signed(derived.skill),'Skill','skill')+metric(t('Despesas'),derived.weeklyExpenses,t('cp por semana · Weekly expenses'),'weeklyExpenses');
  }
  function refugePage() {
    const haven=current(),d=deriveHaven(haven);
    return `<div class="haven-grid">${panel(t('Atributos'),'Attributes',`<div class="haven-attributes">${HAVEN_ATTRS.map(attr=>`<label class="haven-attribute"><span>${bi(attr.pt,attr.en)}</span><input aria-label="${esc(t(attr.pt))}" type="number" data-field="attributes.${attr.key}" min="0" max="5" value="${haven.attributes[attr.key]}"></label>`).join('')}</div>`)}${panel(t('Perícias'),'Skills',`<p class="panel-note">${t('Marque as perícias treinadas do refúgio.')}</p><div class="haven-skills">${HAVEN_SKILLS.map(skill=>`<label><input type="checkbox" data-trained="${skill.key}" ${haven.trained.includes(skill.key)?'checked':''}><span>${bi(skill.pt,skill.en)}</span><strong data-skill="${skill.key}">${haven.trained.includes(skill.key)?signed(d.skill):'—'}</strong></label>`).join('')}</div>`)}${panel(t('Nível & população'),'Haven level & population',`<div class="form-grid thirds">${choice('Nível do refúgio <small>Haven level</small>','level',HAVEN_LEVELS.map(row=>[row.level,String(row.level)]))}${number('Grau de população <small>Population rank</small>','populationRank')}${number('Nível do grupo <small>Party level</small>','partyLevel',{max:9})}</div><p class="haven-rule-note" id="haven-advance-note">${advanceNote(d)}</p><div class="form-grid thirds">${number('Riqueza <small>Wealth</small>','wealth')}${number('Ajuste de crescimento <small>Growth bonus</small>','bonuses.growth',{min:-10000,max:10000})}${number('Ajuste de declínio <small>Decline bonus</small>','bonuses.decline',{min:-10000,max:10000})}</div><div class="derived-pair"><div><span>${bi('Crescimento','Growth')}</span><strong data-derived="growth">${signed(d.growth)}</strong></div><div><span>${bi('Declínio','Decline')}</span><strong data-derived="decline">${signed(d.decline)}</strong></div></div><div class="form-grid" style="margin-top:15px">${choice('Condição da população <small>Population condition</small>','populationMode',[['growth',t('Crescimento · Growth')],['decline',t('Declínio · Decline')]])}${area('Chegadas <small>Arrivals</small>','arrivals')}</div>`)}${panel(t('Evento'),'Event',`${field('Nome do evento <small>Event name</small>','event.name')}<div class="haven-event-clock">${number('Marcas <small>Clock</small>','event.clock',{max:10000})}${number('Segmentos <small>Segments</small>','event.segments',{min:1,max:10000})}<progress id="event-progress" value="${haven.event.clock}" max="${haven.event.segments}" aria-label="${t('Progresso do evento')}"></progress></div>${area('Registro do evento <small>Event notes</small>','event.notes',4)}<p class="panel-note">${t('O relógio registra o evento decidido na mesa; alterar as marcas não dispara efeitos automaticamente.')}</p>`)}</div>`;
  }
  function advanceNote(d) {
    if(d.nextPopulationRank===null || d.nextPopulationRank===undefined)return t('Último nível da tabela de refúgios. O nível permanece um registro manual.');
    return t('Próximo grau de população: {rank}. {requirements} O avanço é manual.',{rank:d.nextPopulationRank,requirements:d.canAdvance?t('Confira os requisitos do livro antes de avançar.'):t('Confira o nível do grupo e a população antes de avançar.')});
  }
  function rowsPanel(key) {
    const definition=ROWS[key],rows=current()[key];
    return panel(definition.pt,definition.en,`<div class="haven-list-toolbar"><p class="panel-note">${rows.length} ${rows.length===1?t('registro'):t('registros')}</p><button type="button" class="button" data-icon="plus" data-action="add-row" data-list="${key}" aria-label="${t('Adicionar {item}',{item:key==='finishedBuildings'?t('construção concluída'):t(definition.item.toLocaleLowerCase('pt-BR'))})}">${t('Adicionar')}</button></div><div class="haven-rows">${rows.length?rows.map((row,index)=>`<article class="haven-row"><div class="haven-row-header"><h4>${t(definition.item)} ${index+1}</h4><button type="button" class="icon-button" data-icon="trash" data-action="remove-row" data-list="${key}" data-row-id="${esc(row.id)}" aria-label="${t('Excluir {item} {number}',{item:t(definition.item.toLocaleLowerCase('pt-BR')),number:index+1})}"></button></div>${field('Nome <small>Name</small>',`${key}.${index}.name`)}${definition.fields.length?`<div class="form-grid ${definition.fields.length>2?'thirds':''}">${definition.fields.map(([name,pt,en,type])=>field(`${pt} <small>${en}</small>`,`${key}.${index}.${name}`,{type:type||'text'})).join('')}</div>`:''}${definition.clock?`<div class="form-grid">${number('Marcas <small>Clock</small>',`${key}.${index}.clock`,{max:10000})}${number('Segmentos <small>Segments</small>',`${key}.${index}.segments`,{min:1,max:10000})}</div>`:''}${area('Anotações <small>Notes</small>',`${key}.${index}.notes`,2)}${key==='builds'?`<div class="haven-row-actions"><button type="button" class="button" data-icon="check" data-action="finish-build" data-row-id="${esc(row.id)}">${t('Registrar conclusão')}</button></div>`:''}</article>`).join(''):`<p class="haven-empty">${t('Nenhum registro. Use Adicionar para começar.')}</p>`}</div>`);
  }
  function constructionPage() {
    const d=deriveHaven(current());
    return `<p class="haven-rule-note" id="haven-capacity">${capacityNote(d)}</p><div class="haven-grid">${rowsPanel('builds')}${rowsPanel('finishedBuildings')}${rowsPanel('projects')}${rowsPanel('strongholds')}</div>`;
  }
  const capacityNote = d => t('Espaços de construção: {active}/{slots}. Construções concluídas: {count}/{limit}. {note}',{active:d.activeBuilds,slots:d.buildSlots,count:d.buildingCount,limit:d.buildingLimit,note:d.overBuildSlots||d.overBuildingLimit?t('Há registros acima do limite do nível; confira as exceções na mesa.'):t('Os limites são informativos; a ficha preserva todos os registros.')});
  function economyPage() {
    const haven=current(),d=deriveHaven(haven);
    return `<div class="haven-grid">${panel(t('Trabalhadores'),'Hirelings',`<p class="panel-note">${t('Quantidades e custo semanal em cp. As taxas do livro podem ser ajustadas para a sua mesa. Artesão, cozinheiro e arauto usam 100 cp do livro; a folha oficial imprime 50 cp.')}</p><div class="haven-hirelings">${HIRELING_TYPES.map(type=>`<div>${number(`${esc(type.pt)} <small>${esc(type.en)}</small>`,`hirelings.${type.key}`,{max:10000})}${number(t('cp / semana'),`hirelingRates.${type.key}`)}</div>`).join('')}</div><div class="form-grid" style="margin-top:18px">${number('Nível dos mercenários <small>Mercenary level</small>','mercenaryLevel',{min:1,max:9})}${number('Ajuste de despesas <small>Expense bonus</small>','bonuses.expenses',{min:-1000000000})}</div><p class="panel-note">${t('A taxa dos mercenários é multiplicada pelo nível registrado. O custo não é debitado automaticamente da riqueza.')}</p><div class="derived-pair"><div><span>${bi('Trabalhadores','Hirelings')}</span><strong data-derived="totalHirelings">${d.totalHirelings}</strong></div><div><span>${bi('Despesas semanais','Weekly expenses · cp')}</span><strong data-derived="weeklyExpenses">${d.weeklyExpenses}</strong></div></div>`)}<div>${rowsPanel('productionChains')}${panel(t('Itens armazenados'),'Stored items',area('Itens <small>Items</small>','storedItems',10))}</div></div>`;
  }
  function notesPage() {return panel(t('Anotações do refúgio'),'Haven notes',`${area('Diário & decisões da mesa <small>Journal & rulings</small>','notes',18)}<p class="panel-note">${t('Registre aqui acontecimentos, exceções e efeitos dos edifícios. O registro não aplica ciclos semanais nem muda a população, os relógios, o nível ou a riqueza sozinho.')}</p>`);}
  const pages={refuge:refugePage,construction:constructionPage,economy:economyPage,notes:notesPage};
  function renderContent() {
    const content=$('#haven-content');
    content.innerHTML=pages[tab]();mountButtonIcons(content);
  }
  function selectTab(next) {
    if(next===tab||!Object.hasOwn(pages,next))return;
    tab=next;
    $('#navigation').querySelectorAll('[data-tab]').forEach(button=>{
      const active=button.dataset.tab===tab;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    renderContent();
  }
  function render() {
    const focused=document.activeElement,path=focused?.dataset.field,focusedTab=focused?.dataset.tab;
    const selection=path&&(focused.tagName==='TEXTAREA'||focused.type==='text')?{start:focused.selectionStart,end:focused.selectionEnd,scroll:focused.scrollTop}:null;
    const picker=$('#haven-select');picker.innerHTML=state.records.map(item=>`<option value="${esc(item.id)}" ${item.id===state.activeId?'selected':''}>${esc(item.name||t('Novo refúgio'))}</option>`).join('');
    renderIdentity();renderMetrics();
    $('#navigation').innerHTML=TABS.map(([key,label,symbol])=>`<button type="button" class="nav-item ${tab===key?'active':''}" data-tab="${key}" ${tab===key?'aria-current="page"':''}>${icon(symbol,'nav-icon')}<span>${t(label)}</span></button>`).join('');
    renderContent();refreshStatus();
    if(path){const next=document.querySelector(`[data-field="${CSS.escape(path)}"]`);next?.focus({preventScroll:true});if(selection&&next?.setSelectionRange){next.setSelectionRange(selection.start,selection.end);next.scrollTop=selection.scroll;}}
    else if(focusedTab)$('#navigation').querySelector(`[data-tab="${focusedTab}"]`)?.focus({preventScroll:true});
  }
  function refreshComputed() {
    const haven=current(),d=deriveHaven(haven);
    const values={...d,level:haven.level,populationRank:haven.populationRank,wealth:haven.wealth};
    document.querySelectorAll('[data-derived]').forEach(element=>{const key=element.dataset.derived;element.textContent=['skill','growth','decline'].includes(key)?signed(values[key]):String(values[key]??'');});
    document.querySelectorAll('[data-skill]').forEach(element=>{element.textContent=haven.trained.includes(element.dataset.skill)?signed(d.skill):'—';});
    if($('#event-progress')){$('#event-progress').max=haven.event.segments;$('#event-progress').value=haven.event.clock;}
    if($('#haven-advance-note'))$('#haven-advance-note').textContent=advanceNote(d);
    if($('#haven-capacity'))$('#haven-capacity').textContent=capacityNote(d);
    const selected=$('#haven-select').selectedOptions?.[0];if(selected)selected.textContent=haven.name||t('Novo refúgio');
  }
  function refreshStatus() {
    $('#breadcrumb-name').textContent=current().name||t('Novo refúgio');
    $('#save-status').textContent=message(state.statusLabel);$('#save-status').dataset.state=state.user?state.status.state:state.unsafe?'error':'local';
    $('#main').inert=!state.ready||!state.user||!state.canEdit;$('#main').setAttribute('aria-busy',String(!state.ready||state.loading));
    for(const selector of ['#new-haven','#import-button','#haven-select','#manage-haven'])$(selector).disabled=!state.ready||!state.user||!state.canEdit;
    $('#export-button').disabled=exportBusy||!state.ready||state.loading||Boolean(state.user&&!state.cloudReady);$('#export-button').setAttribute('aria-busy',String(exportBusy));
    const entryStatus=$('#haven-entry-status');
    const entryMessage=state.problem||state.blocked||(state.sessionChecked&&!state.user&&state.unsafe?t('Há uma cópia que não foi salva. Exporte-a antes de sair desta página.'):'');
    entryStatus.hidden=!entryMessage;entryStatus.textContent=message(entryMessage);
    if(settingsOpen&&$('#utility-dialog').open){const status=$('#dialog-content .account-sync-status');if(status)status.textContent=message(state.statusLabel);}
  }
  function retireUrls(){const old=urls;urls=[];if(old.length)window.setTimeout(()=>old.forEach(url=>URL.revokeObjectURL(url)),60000);}
  function invalidateDialog(){dialogVersion++;retireUrls();}
  function showDialog(title,html){settingsOpen=false;invalidateDialog();$('#dialog-title').textContent=t(title);$('#dialog-content').innerHTML=html;translateStatic($('#dialog-content'));mountButtonIcons($('#dialog-content'));if(!$('#utility-dialog').open)$('#utility-dialog').showModal();return dialogVersion;}
  function closeDialog(){settingsOpen=false;invalidateDialog();$('#utility-dialog').close();}
  function settingsContent() {
    const choices=[['light',t('Claro'),'torch'],['dark',t('Modo escuro'),'moon'],['system',t('Automático'),'settings']];
    let account='';
    const problem=state.problem?`<p class="inline-warning" role="alert">${esc(message(state.problem))}</p>`:'';
    if(!state.ready)account=`<p role="status">${t('Verificando sua conta…')}</p>`;
    else if(!state.user)account=`<p>${t('Entre pela tela inicial para acessar seus refúgios privados em seus dispositivos.')}</p>${problem}<div class="dialog-actions"><a class="button primary" href="./#inicio" data-icon="gate"><span class="button-label">${t('Ir para início')}</span></a></div><p class="panel-note">${t('As cópias existentes neste navegador são preservadas.')}</p>`;
    else account=`<p class="account-identity"><span class="eyebrow">${t('SUA CONTA')}</span><strong>${esc(state.user.email||t('Conta conectada'))}</strong></p><p>${t('Refúgios e personagens compartilham a conta. Os registros são privados.')}</p><p class="account-sync-status" role="status">${esc(message(state.statusLabel))}</p>${problem}<div class="dialog-actions"><button type="button" class="button" data-action="logout" data-icon="logout" ${!state.canLogout?'disabled':''}>${t('Sair deste dispositivo')}</button>${state.unsafe?`<button type="button" class="button" data-action="export" data-icon="export">${t('Exportar uma cópia')}</button>`:''}</div>${state.migrationCount?`<div class="local-migration"><h3>${t('Refúgios deste navegador')}</h3><p>${t('Você pode copiar {count} {records} para esta conta. A cópia local será mantida.',{count:state.migrationCount,records:state.migrationCount===1?t('refúgio local'):t('refúgios locais')})}</p><button type="button" class="button" data-action="migrate" data-icon="import" ${!state.cloudReady||state.authBusy?'disabled':''}>${t('Salvar meus refúgios locais na conta')}</button></div>`:''}<p class="panel-note">${state.unsafe?t('Há edições que não foram guardadas. Exporte uma cópia e mantenha a página aberta.'):state.status.pending?t('Alterações pendentes ficam neste navegador para sincronizar quando você entrar novamente.'):t('O salvamento é automático. PDF e JSON são cópias independentes.')}</p>`;
    return `<section class="settings-appearance" aria-labelledby="appearance-title"><h3 id="appearance-title">${t('Aparência')}</h3><div class="settings-themes" role="group" aria-label="${t('Tema da ficha')}">${choices.map(([value,label,symbol])=>`<button type="button" class="button" data-icon="${symbol}" data-action="theme" data-theme-value="${value}" aria-pressed="${theme.getPreference()===value}">${label}</button>`).join('')}</div><p class="panel-note">${t('Automático acompanha o tema do dispositivo. A escolha fica salva neste navegador.')}</p></section>${languageSettingsMarkup()}<section class="settings-section"><h3>${t('Conta')}</h3>${account}</section>`;
  }
  function openSettings(){showDialog(t('Configurações'),settingsContent());settingsOpen=true;}
  function refreshSettings(){if(!settingsOpen)return;const selectedLanguage=document.activeElement?.hasAttribute?.('data-language-preference');$('#dialog-title').textContent=t('Configurações');$('#dialog-content').innerHTML=settingsContent();mountButtonIcons($('#dialog-content'));if(selectedLanguage)$('#dialog-content [data-language-preference]')?.focus({preventScroll:true});}
  function exportLink(value,type,filename,label,primary=false) {
    const url=URL.createObjectURL(new Blob([value],{type}));urls.push(url);
    return `<a class="button${primary?' primary':''}" href="${esc(url)}" download="${esc(filename)}">${icon('export')}<span class="button-label">${label}</span></a>`;
  }
  async function exportHaven() {
    if(exportBusy||state.loading||state.user&&!state.cloudReady)return;
    exportBusy=true;refreshStatus();
    const snapshot=clone(current()),backup=JSON.stringify({format:'trespasser-haven',version:1,rules:'2.1.3',haven:snapshot},null,2);
    const owner=showDialog(t('Preparando exportação'),`<p role="status">${t('Gerando o PDF preenchível e o JSON de')} <strong>${esc(snapshot.name||t('Novo refúgio'))}</strong>…</p>`);
    try {
      const {prepareHavenExport}=await import('./haven-export.js');
      const result=await prepareHavenExport(snapshot);
      if(owner!==dialogVersion||!$('#utility-dialog').open)return;
      $('#dialog-title').textContent=t('PDF + JSON prontos');
      $('#dialog-content').innerHTML=`<p role="status">${t('O ZIP reúne o PDF preenchível e o JSON do refúgio. Use os links para baixar os arquivos separados.')}</p><div class="dialog-actions export-downloads">${exportLink(result.zip,'application/zip',`${result.stem}.zip`,t('Baixar ZIP'),true)}${exportLink(result.pdf,'application/pdf',`${result.stem}.pdf`,t('Baixar PDF editável'))}${exportLink(result.json,'application/json',`${result.stem}.json`,t('Baixar JSON'))}</div><p class="panel-note">${t('Importar o JSON cria uma nova ficha. Alterações nesses arquivos são independentes do registro online.')}</p>`;
      $('#dialog-content a').focus({preventScroll:true});$('#dialog-content a').click();
    } catch(error) {
      if(owner!==dialogVersion||!$('#utility-dialog').open)return;
      $('#dialog-title').textContent=t('A exportação do PDF não foi concluída');
      $('#dialog-content').innerHTML=`<p role="alert">${esc(message(error?.message||'Não foi possível gerar o PDF agora.'))}</p><p>${t('Seus dados continuam no registro. Baixe o JSON de backup para preservar esta versão.')}</p><div class="dialog-actions">${exportLink(backup,'application/json','trespasser-refugio.json',t('Baixar JSON de backup'),true)}</div>`;
    } finally {exportBusy=false;refreshStatus();}
  }
  function addRow(key) {
    if(!Object.hasOwn(ROWS,key))return;
    const row={id:crypto.randomUUID(),name:'',notes:''};
    for(const [field,,,type] of ROWS[key].fields)row[field]=type==='number'?0:'';
    if(ROWS[key].clock){row.clock=0;row.segments=6;}
    controller.change(data=>data.find(item=>item.id===state.activeId)[key].push(row),'records');
  }
  document.addEventListener('input',event=>{
    const element=event.target;
    if(!element.matches?.('[data-field]')||element.tagName==='SELECT')return;
    let value=element.value;
    if(element.type==='number'){
      const raw=value,parsed=Number(raw);
      value=Number.isFinite(parsed)?parsed:0;
      value=Math.max(Number(element.min||0),Math.min(Number(element.max||1000000000),Math.trunc(value)));
      if(raw!==''&&Number.isFinite(parsed)&&parsed!==value)element.value=String(value);
    }
    controller.update(element.dataset.field,value);
  });
  document.addEventListener('change',event=>{
    const element=event.target;
    if(element.matches?.('input[type="number"][data-field]'))element.value=String(valueAt(element.dataset.field));
    if(element.matches?.('select[data-field]')){const path=element.dataset.field;controller.update(path,path==='level'?Number(element.value):element.value);refreshComputed();}
    if(element.dataset?.trained){const trained=new Set(current().trained);element.checked?trained.add(element.dataset.trained):trained.delete(element.dataset.trained);controller.update('trained',[...trained]);refreshComputed();}
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-action],[data-tab]');if(!button||button.disabled)return;
    if(button.dataset.tab){selectTab(button.dataset.tab);return;}
    const {action,list,rowId}=button.dataset;
    if(action==='theme'){theme.setPreference(button.dataset.themeValue);refreshSettings();}
    if(action==='login')void controller.login();
    if(action==='logout')void controller.logout();
    if(action==='migrate')void controller.migrate();
    if(action==='export')void exportHaven();
    if(action==='duplicate'){controller.duplicate();closeDialog();toast(t('Cópia criada.'));}
    if(action==='delete')showDialog(t('Excluir refúgio'),`<p>${t('Excluir {name}? A exclusão será sincronizada com a conta quando houver conexão.',{name:`<strong>${esc(current().name||t('Novo refúgio'))}</strong>`})}</p><div class="dialog-actions"><button type="button" class="button danger" data-icon="trash" data-action="confirm-delete" data-record-id="${esc(state.activeId)}">${t('Excluir refúgio')}</button><button type="button" class="button" data-action="cancel">${t('Cancelar')}</button></div>`);
    if(action==='confirm-delete'){controller.remove(button.dataset.recordId);closeDialog();toast(t('Refúgio excluído.'));}
    if(action==='cancel')closeDialog();
    if(action==='add-row')addRow(list);
    if(action==='remove-row'&&Object.hasOwn(ROWS,list))showDialog(t('Excluir registro'),`<p>${t('Excluir este registro de {item}?',{item:esc(t(ROWS[list].pt.toLocaleLowerCase('pt-BR')))})}</p><div class="dialog-actions"><button type="button" class="button danger" data-action="confirm-remove-row" data-list="${list}" data-row-id="${esc(rowId)}" data-record-id="${esc(state.activeId)}" data-icon="trash">${t('Excluir')}</button><button type="button" class="button" data-action="cancel">${t('Cancelar')}</button></div>`);
    if(action==='confirm-remove-row'&&Object.hasOwn(ROWS,list)){controller.change(data=>{const record=data.find(item=>item.id===button.dataset.recordId);if(record)record[list]=record[list].filter(row=>row.id!==rowId);},'records');closeDialog();}
    if(action==='finish-build')showDialog(t('Concluir construção'),`<p>${t('Registrar esta construção como concluída? Seu nome e anotações serão preservados na lista de construções concluídas.')}</p><div class="dialog-actions"><button type="button" class="button" data-action="confirm-finish" data-row-id="${esc(rowId)}" data-record-id="${esc(state.activeId)}" data-icon="check">${t('Registrar conclusão')}</button><button type="button" class="button" data-action="cancel">${t('Cancelar')}</button></div>`);
    if(action==='confirm-finish'){controller.change(data=>{const record=data.find(item=>item.id===button.dataset.recordId),row=record?.builds.find(item=>item.id===rowId);if(row){record.finishedBuildings.push({id:crypto.randomUUID(),name:row.name,notes:row.notes});record.builds=record.builds.filter(item=>item.id!==rowId);}},'records');closeDialog();}
  });
  $('#new-haven').addEventListener('click',()=>{controller.add();tab='refuge';render();$('[data-field="name"]').focus();});
  $('#haven-select').addEventListener('change',event=>{controller.select(event.target.value);});
  $('#manage-haven').addEventListener('click',()=>showDialog(t('Gerenciar refúgio'),`<div class="menu-actions"><button type="button" class="button" data-action="duplicate" data-icon="duplicate">${t('Duplicar refúgio')}</button><button type="button" class="button" data-action="export" data-icon="export">${t('Exportar PDF + JSON')}</button><button type="button" class="button danger" data-action="delete" data-icon="trash">${t('Excluir refúgio')}</button></div>`));
  $('#account-button').addEventListener('click',openSettings);
  $('#export-button').addEventListener('click',()=>{void exportHaven();});
  $('#import-button').addEventListener('click',()=>{$('#import-file').value='';$('#import-file').click();});
  $('#import-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const owner=state.user?.id||null;
    try{if(file.size>2000000)throw new Error(t('O JSON deve ter no máximo 2 MB.'));const input=JSON.parse(await file.text());if(owner!==(state.user?.id||null))throw new Error(t('A conta mudou durante a importação. Tente novamente.'));controller.importRecord(input);tab='refuge';render();toast(t('Refúgio importado como uma nova ficha.'));}
    catch(error){toast(error?.message||t('Não foi possível importar este JSON.'),true);}
  });
  $('#about-button').addEventListener('click',()=>showDialog(t('Regras & salvamento'),`<p>${t('Registro não oficial de Refúgios baseado no Haven Record e no Rulebook de Trespasser v2.1.3. Os termos originais acompanham a tradução para facilitar a consulta.')}</p><p>${t('A ficha calcula os valores derivados dos campos registrados. Nível, população, riqueza, projetos, eventos e passagens de semana continuam sob controle da mesa. Nenhuma alteração dispara efeitos do livro automaticamente.')}</p><p>${t('Ao entrar com Google, seus refúgios ficam privados na conta e disponíveis em seus dispositivos. Sem conexão, as edições ficam pendentes no navegador. Sem entrar, o salvamento é apenas local. Alterações conflitantes são preservadas em cópias.')}</p><p>${t('Exportar prepara um ZIP com PDF preenchível e JSON. Os arquivos são cópias independentes; importar um JSON cria um novo refúgio.')}</p><p class="panel-note">${t('O PDF editável inclui todos os campos e registros, inclusive listas que precisem de páginas adicionais.')}</p>`));
  $('#dialog-close').addEventListener('click',closeDialog);
  $('#utility-dialog').addEventListener('cancel',()=>{settingsOpen=false;invalidateDialog();});
  $('#utility-dialog').addEventListener('close',()=>{settingsOpen=false;invalidateDialog();});
  window.addEventListener('trespasser:theme',()=>{if(settingsOpen)refreshSettings();});
  window.addEventListener('trespasser:language',()=>{
    const focusedTab=document.activeElement?.dataset?.tab;
    translateStatic(document);render();
    if(settingsOpen)refreshSettings();
    if(focusedTab)document.querySelector(`[data-tab="${focusedTab}"]`)?.focus({preventScroll:true});
  });
  window.addEventListener('online',()=>{void controller.sync();});
  window.addEventListener('focus',()=>{void controller.sync();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void controller.sync();});
  window.addEventListener('storage',event=>{if(event.key===HAVEN_KEY&&!state.user){controller.externalGuestChange();toast(t('O registro mudou em outra aba. Exporte sua versão e recarregue.'),true);}});
  window.addEventListener('beforeunload',event=>{if(state.unsafe){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{controller.dispose();themeToggle.dispose();transition.dispose();});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  window.addEventListener('beforeprint',()=>{cleanupPrint=preparePrint($('#main'));});
  window.addEventListener('afterprint',()=>{cleanupPrint?.();cleanupPrint=null;});
  mountButtonIcons(document);render();void controller.initialize();
  return {controller,render,openSettings};
}

if(typeof document!=='undefined'&&document.querySelector('#haven-content')){
  let storage=null,tabStorage=null;try{storage=window.localStorage;}catch{}try{tabStorage=window.sessionStorage;}catch{}
  setupHavenPage({document,window,localStorage:storage,sessionStorage:tabStorage,navigator,location});
}
