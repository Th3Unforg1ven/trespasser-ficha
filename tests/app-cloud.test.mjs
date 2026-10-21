import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as model from '../dist/model.js';
import * as uiState from '../dist/cloud-ui-state.js';
import { CloudSync } from '../dist/cloud-sync.js';
import { acquireAccountLock } from '../dist/account-lock.js';
import { icon, setButtonLabel, mountButtonIcons } from '../dist/icons.js';
import { setupTheme } from '../dist/preferences.js';
import { setupThemeToggle } from '../dist/ui-shell.js';
import { setupLanguage, getLanguage, t, languageSettingsMarkup, translateStatic, setLanguagePreference } from '../dist/i18n.js';
import { ui, bilingual, label as localLabel, formatError } from '../dist/i18n-character.js';
import { importPortrait, portraitStyle } from '../dist/portrait.js';
import { portraitPng } from './portrait-fixture.mjs';

const KEY='trespasser.record.v1';
const appSource=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const session=id=>id?{user:{id,email:`${id}@example.test`}}:null;

class Element {
  constructor(){this.dataset={};this.listeners=new Map();this.children=[];this._innerHTML='';this.innerHTMLWrites=0;this.textContent='';this.open=false;this.disabled=false;this.type='';this.tagName='DIV';}
  get innerHTML(){return this._innerHTML;}
  set innerHTML(value){this._innerHTML=value;this.innerHTMLWrites++;}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
  hasAttribute(name){return name in this;}
  querySelector(){return null;}
  querySelectorAll(){return [];}
  replaceChildren(...nodes){this.children=nodes;this.textContent=nodes.map(n=>n.textContent||'').join('');}
  append(...nodes){this.textContent+=nodes.map(n=>n.textContent||'').join('');}
  showModal(){this.open=true;}
  close(){this.open=false;}
  click(){this.clickCount=(this.clickCount||0)+1;}
  focus(){this.focusCount=(this.focusCount||0)+1;if(this.ownerDocument)this.ownerDocument.activeElement=this;}
}

function browserLocks() {
  const held=new Set();
  return {held,async request(name,_options,callback){if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
}

function fixture({guest=model.createCharacter('Ficha local'),initialUser=null,deferredSession=false,deferredLogout=false,remote=new Map(),locks=browserLocks()}={}) {
  const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[`#${match[1]}`,new Element()]));
  const documentListeners=new Map(),windowListeners=new Map();
  const storage=new Map([[KEY,JSON.stringify({version:1,activeId:guest.id,characters:[guest]})]]);
  const writes=[],writeAttempts=[];
  let quotaFailure=false;
  const localStorage={getItem:key=>storage.get(key)??null,setItem(key,value){writeAttempts.push([key,value]);if(quotaFailure)throw new Error('Quota exceeded');writes.push([key,value]);storage.set(key,value);}};
  let portraitHtml='',portraitButtons=[];
  function identityPortraitButtons() {
    const markup=elements.get('#identity').innerHTML;
    if(markup!==portraitHtml){
      portraitHtml=markup;
      portraitButtons=[...markup.matchAll(/<button\b([^>]*data-action="(portrait-(?:edit|remove))"[^>]*)>/g)].map(match=>{
        const button=new Element();button.tagName='BUTTON';button.dataset.action=match[2];button.disabled=/\bdisabled\b/.test(match[1]);return button;
      });
    }
    return portraitButtons;
  }
  let portraitDialogHtml='',portraitDialogControls=[];
  function dialogPortraitControls(){
    const markup=elements.get('#dialog-content').innerHTML;
    if(markup!==portraitDialogHtml){
      portraitDialogHtml=markup;
      portraitDialogControls=[...markup.matchAll(/<(button|input)\b([^>]*(?:data-action="portrait-[^"]+"|data-portrait-crop="[^"]+")[^>]*)>/g)].map(match=>{
        const control=new Element();control.tagName=match[1].toUpperCase();
        const action=match[2].match(/data-action="([^"]+)"/),crop=match[2].match(/data-portrait-crop="([^"]+)"/);
        if(action)control.dataset.action=action[1];if(crop)control.dataset.portraitCrop=crop[1];
        control.disabled=/\bdisabled\b/.test(match[2]);return control;
      });
    }
    return portraitDialogControls;
  }
  const matchPortraitControl=(control,selector)=>selector===`[data-action="${control.dataset.action}"]`||selector==='[data-portrait-crop]'&&control.dataset.portraitCrop;
  const resourceDom=new Map();
  let navigationHtml='',navigationButtons=[];
  function navigationNodes(){
    const markup=elements.get('#navigation').innerHTML;
    if(markup!==navigationHtml){
      navigationHtml=markup;
      navigationButtons=[...markup.matchAll(/<button\b([^>]*data-tab="([^"]+)"[^>]*)>/g)].map(match=>{
        const button=new Element(),classes=new Set((match[1].match(/class="([^"]+)"/)?.[1]||'').split(/\s+/));button.dataset.tab=match[2];button.tagName='BUTTON';
        button.classList={contains:name=>classes.has(name),toggle(name,active){if(active)classes.add(name);else classes.delete(name);}};
        if(/aria-current="page"/.test(match[1]))button.setAttribute('aria-current','page');return button;
      });
    }
    return navigationButtons;
  }
  function resourceNodes(selector){
    const kind={'[data-resource-value]':'resourceValue','[data-resource-max]':'resourceMax','[data-resource-track]':'resourceTrack'}[selector];
    if(!kind)return [];
    for(const container of ['#resources','#sheet-content']){
      const markup=elements.get(container).innerHTML;
      if(resourceDom.get(container)?.markup===markup)continue;
      const nodes=[];
      for(const match of markup.matchAll(/<(input|span|i)\b([^>]*data-resource-(value|max|track)="([^"]+)"[^>]*)>([^<]*)/g)){
        const node=new Element();node.tagName=match[1].toUpperCase();node.dataset[`resource${match[3][0].toUpperCase()+match[3].slice(1)}`]=match[4];node.style={};
        if(match[1]==='input'){
          node.type='number';node.dataset.field=`resources.${match[4]}`;node.min=match[2].match(/min="([^"]+)"/)?.[1]||'';node.max=match[2].match(/max="([^"]+)"/)?.[1]||'';
          node.value=match[2].match(/(?:^|\s)value="([^"]+)"/)?.[1]||'';node.step='1';node.disabled=/\bdisabled\b/.test(match[2]);node.matches=selector=>selector==='[data-field]';
        } else if(match[1]==='span')node.textContent=match[5];
        else node.style.width=match[2].match(/width:([^;" ]+)/)?.[1]||'';
        nodes.push(node);
      }
      resourceDom.set(container,{markup,nodes});
    }
    return [...resourceDom.values()].flatMap(entry=>entry.nodes).filter(node=>kind in node.dataset);
  }
  const document={hidden:false,activeElement:null,documentElement:{dataset:{},style:{}},
    querySelector:selector=>elements.get(selector)||[...identityPortraitButtons(),...dialogPortraitControls()].find(control=>matchPortraitControl(control,selector))||null,
    querySelectorAll:selector=>selector.startsWith('#export-button')?[elements.get('#export-button')]:selector==='#navigation [data-tab]'?navigationNodes():[...resourceNodes(selector),...(selector.includes('[data-action="portrait-edit"]')?identityPortraitButtons():[]),...dialogPortraitControls().filter(control=>selector.split(', ').some(part=>matchPortraitControl(control,part)))],
    createElement:()=>{const element=new Element();element.ownerDocument=document;return element;},createTextNode:text=>({textContent:text}),
    addEventListener(event,listener){const prior=documentListeners.get(event);documentListeners.set(event,prior?value=>{prior(value);listener(value);}:listener);}};
  for(const element of elements.values())element.ownerDocument=document;
  let nextTimer=0,authListener,resolveSession,resolveLogout,authUser=initialUser,inCallback=false;
  const timers=new Map(),intervals=new Map(),calls=[],events=[];
  const auth={
    onAuthStateChange(callback){authListener=callback;return{data:{subscription:{unsubscribe(){authListener=null;}}}};},
    getSession(){return deferredSession?new Promise(resolve=>{resolveSession=resolve;}):Promise.resolve({data:{session:session(initialUser)},error:null});},
    async signOut(){assert.equal(inCallback,false,'SDK auth calls must happen outside its callback lock');emit(null);if(deferredLogout)await new Promise(resolve=>{resolveLogout=resolve;});return{error:null};},
    async signInWithOAuth(options){assert.equal(inCallback,false);calls.push({type:'login',options});return{error:null};}
  };
  function emit(id){authUser=id;inCallback=true;try{authListener(id?'SIGNED_IN':'SIGNED_OUT',session(id));}finally{inCallback=false;}}
  const adapter={
    forUser(expectedUser){return{
      list(){assert.equal(authUser,expectedUser);return adapter.list();},
      save(sent){assert.equal(authUser,expectedUser);return adapter.save(sent);}
    };},
    async list(){assert.equal(inCallback,false,'loading the account inside the SDK callback can deadlock');calls.push({type:'list',user:authUser});return structuredClone(remote.get(authUser)||[]);},
    async save(sent){assert.equal(inCallback,false);calls.push({type:'save',user:authUser});const rows=remote.get(authUser)||[];const old=rows.find(r=>r.id===sent.id);if((old?.revision||0)!==sent.revision)return null;const row={id:sent.id,data:structuredClone(sent.data),revision:sent.revision+1,deleted_at:sent.deleted?'2026-10-19T12:00:00Z':null};remote.set(authUser,[...rows.filter(r=>r.id!==row.id),row]);return row;}
  };
  const window={localStorage,addEventListener(event,listener){const prior=windowListeners.get(event);windowListeners.set(event,prior?value=>{prior(value);listener(value);}:listener);},dispatchEvent:event=>{events.push(event);windowListeners.get(event.type)?.(event);}};
  const dependencies={...model,...uiState,CloudSync,acquireAccountLock,icon,setButtonLabel,mountButtonIcons,setupTheme,setupThemeToggle,setupLanguage,getLanguage,t,languageSettingsMarkup,translateStatic,ui,bilingual,localLabel,formatError,importPortrait,portraitStyle,createCloudClient:()=>({auth,adapter}),cloudConfig:{},navigator:{locks,language:'pt-BR'},
    preparePrint(){},prepareExport(){throw new Error('Export is outside this auth test');},
    document,window,localStorage,location:{href:'https://example.test/trespasser-ficha/?ignored=1#ignored',reload(){calls.push({type:'reload'});}},
    setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    setInterval:(fn,delay)=>{const id=++nextTimer;intervals.set(id,{fn,delay});return id;},clearInterval:id=>intervals.delete(id)};
  const run=new Function(...Object.keys(dependencies),appSource+'\nreturn {getState:()=>({records,activeId,tab,cloudUser,cloudReady,cloudStatus,portraitDraft}),attachSession,save,syncCloud,logoutCloud,loginCloud,migrateLocalCharacters,showPortraitEditor};');
  const app=run(...Object.values(dependencies));
  const runTimers=async(delay=0)=>{for(const[id,timer]of[...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}await flush();};
  function edit(path,value,element={}){const target={dataset:{field:path},value,type:'text',matches:selector=>selector==='[data-field]',...element};documentListeners.get('input')({target});}
  return{app,storage,localStorage,writes,writeAttempts,elements,auth,adapter,calls,events,emit,runTimers,edit,remote,locks,windowListeners,document,clickAction:(action,extra={})=>documentListeners.get('click')({target:{closest:selector=>selector==='button'?({dataset:{action,...extra}}):null}}),setQuotaFailure:value=>{quotaFailure=value;},
    change:target=>documentListeners.get('change')({target}),input:target=>documentListeners.get('input')({target}),
    resolveSession:id=>resolveSession({data:{session:session(id)},error:null}),resolveLogout:()=>resolveLogout()};
}

test('compact character panels preserve saved fields and features grow only with their own text',async()=>{
  const character=model.createCharacter('Registro completo');
  character.features='Uma habilidade de linhagem.\nOutro talento & uma técnica.';
  character.lineage='Anão';character.pastLife='Ferreiro';character.calling='Sentinel';character.crafts='Metalurgia';
  character.alignments[0].name='Honrar meu juramento';character.alignments[0].affirm=2;
  character.injuries[0].name='Cicatriz';character.injuries[0].clock=3;
  const f=fixture({guest:character});await flush();
  const before=JSON.stringify(f.app.getState().records);
  const markup=f.elements.get('#sheet-content').innerHTML;
  assert.deepEqual([...markup.matchAll(/<section class="panel ([^"]+)">/g)].map(match=>match[1]),['attribute-panel','health-panel','advancement-panel','alignment-panel','features-panel']);
  assert.doesNotMatch(markup,/sheet-column/);
  assert.match(markup,/<textarea data-field="features" rows="5"[^>]*>Uma habilidade de linhagem\.\nOutro talento &amp; uma técnica\.<\/textarea>/);
  for(const value of ['Anão','Ferreiro','Sentinel','Metalurgia','Honrar meu juramento','Cicatriz'])assert.ok(markup.includes(value));
  assert.equal(JSON.stringify(f.app.getState().records),before,'a compact rerender cannot change stored character values');

  const featuresElement={tagName:'TEXTAREA',style:{},scrollHeight:340,offsetHeight:144,clientHeight:140,closest:selector=>selector==='.features-panel'?{}:null};
  const longFeatures=Array.from({length:20},(_,i)=>`Talento ${i+1}: descrição preservada.`).join('\n');
  f.edit('features',longFeatures,featuresElement);
  assert.equal(featuresElement.style.height,'344px','typed features grow to their content without editing unrelated fields');
  assert.equal(f.app.getState().records[0].features,longFeatures);
  featuresElement.scrollHeight=140;
  f.edit('features','Uma habilidade.',featuresElement);
  assert.equal(featuresElement.style.height,'144px','removing text restores compact height without a tall empty field');
  f.clickAction('',{tab:'equipment'});f.clickAction('',{tab:'character'});
  assert.match(f.elements.get('#sheet-content').innerHTML,/>Uma habilidade\.<\/textarea>/);
  const restored={...f.app.getState().records[0],features:character.features};
  assert.equal(JSON.stringify([restored]),before,'all fields outside features retain their previous values');
  const notesStyle={height:'200px'};
  f.edit('notes','Diário preservado',{style:notesStyle,scrollHeight:500,offsetHeight:144,clientHeight:140});
  assert.equal(notesStyle.height,'200px','features sizing does not resize the journal');
});

test('portrait controls unlock after cold account initialization and stay blocked with an unavailable account lock',async()=>{
  const f=fixture({initialUser:'account-a'});await flush();
  assert.equal(f.app.getState().cloudReady,true);
  assert.equal(f.document.querySelector('[data-action="portrait-edit"]').disabled,false);
  const identityMarkup=f.elements.get('#identity').innerHTML;
  const draft={dataUrl:portraitPng(),zoom:1.5,x:30,y:60};
  f.app.showPortraitEditor(draft);
  f.edit('motto','Convicção digitada antes de atualizar a conta');
  const editedIdentity=f.elements.get('#identity').innerHTML;
  f.emit('account-a');await f.runTimers();
  assert.equal(f.document.querySelector('[data-action="portrait-edit"]').disabled,false);
  assert.equal(f.elements.get('#identity').innerHTML,editedIdentity,'readiness updates must not replace typed identity inputs');
  assert.equal(editedIdentity,identityMarkup);
  assert.deepEqual(f.app.getState().portraitDraft,draft,'same-account refresh must not discard the crop draft');
  assert.equal(f.app.getState().records[0].motto,'Convicção digitada antes de atualizar a conta');

  const blocked=fixture({initialUser:'account-a',locks:null});await flush();
  assert.equal(blocked.app.getState().cloudReady,false);
  assert.equal(blocked.document.querySelector('[data-action="portrait-edit"]').disabled,true);
  blocked.emit('account-a');await blocked.runTimers();
  assert.equal(blocked.document.querySelector('[data-action="portrait-edit"]').disabled,true);
});

test('changing interface language preserves the active sheet, section, cloud gates, and stored data',async()=>{
  const character=model.createCharacter('Combate');character.notes='Inventário';
  const f=fixture({guest:character});await flush();
  f.clickAction('',{tab:'equipment'});
  f.clickAction('settings');
  const before=structuredClone(f.app.getState()),archiveWrites=f.writes.filter(([key])=>key===KEY).length;
  setLanguagePreference('en');
  assert.equal(f.elements.get('#section-title').textContent,'Equipment');
  assert.match(f.elements.get('#navigation').innerHTML,/>Character</);
  assert.doesNotMatch(f.elements.get('#navigation').innerHTML,/>Personagem</);
  assert.match(f.elements.get('#identity').innerHTML,/value="Combate"/);
  assert.equal(f.elements.get('#dialog-title').textContent,'Settings');
  assert.match(f.elements.get('#dialog-content').innerHTML,/Interface language/);
  assert.equal(JSON.stringify(f.app.getState().records),JSON.stringify(before.records));
  assert.equal(f.app.getState().activeId,before.activeId);
  assert.equal(f.app.getState().tab,'equipment');
  assert.equal(f.writes.filter(([key])=>key===KEY).length,archiveWrites,'language changes do not save or migrate character data');
  setLanguagePreference('pt');
  assert.equal(f.elements.get('#section-title').textContent,'Equipamento');
  assert.equal(f.elements.get('#dialog-title').textContent,'Configurações');

  const blocked=fixture({initialUser:'account-a',locks:undefined});await flush();
  // While account verification is pending, a language rerender must keep its guard.
  blocked.elements.get('#main').inert=true;
  setLanguagePreference('en');
  assert.equal(blocked.elements.get('#main').inert,true);
  setLanguagePreference('pt');
});

test('resource help explains calculated HP, daily recovery pools, and uncapped Focus without editing the sheet',async()=>{
  const character=model.createCharacter('Recursos preservados');
  character.level=4;character.attributes.might=2;character.attributes.spirit=3;
  character.bonuses.hp=5;character.resources.hp=6;
  character.resources.endurance=4;character.resources.recoveryTotal=12;character.resources.recovery=8;
  character.resources.focus=17;
  const f=fixture({guest:character});await flush();
  const before=JSON.stringify(f.app.getState().records),writes=f.writes.filter(([key])=>key===KEY).length;
  const strip=f.elements.get('#resources').innerHTML;
  assert.equal((strip.match(/data-resource-help=/g)||[]).length,5);
  assert.match(strip,/max="40" data-field="resources.hp"[^>]*value="6"/);
  f.clickAction('',{resourceHelp:'hp'});
  assert.match(f.elements.get('#dialog-content').innerHTML,/\(4 \+ 1\) × \(5 \+ 2\) \+ 5 = 40 PV/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/sem restaurar os PV atuais/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/45, 88–89/);
  f.clickAction('',{resourceHelp:'recovery'});
  assert.match(f.elements.get('#dialog-content').innerHTML,/8 de 12 dados d8/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/Endurance atual é 4/);
  f.clickAction('',{resourceHelp:'focus'});
  assert.match(f.elements.get('#dialog-content').innerHTML,/Skill 3 \+ ajuste 0 = 3 Focus/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/não define um máximo de Focus/);
  setLanguagePreference('en');
  assert.equal(f.elements.get('#dialog-title').textContent,'Focus');
  assert.match(f.elements.get('#dialog-content').innerHTML,/The starting value is not a limit/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/Current recorded value: 17/);
  assert.equal(JSON.stringify(f.app.getState().records),before);
  assert.equal(f.writes.filter(([key])=>key===KEY).length,writes);
  f.clickAction('',{resource:'focus',delta:'1'});
  assert.equal(f.app.getState().records[0].resources.focus,18,'Focus can increase above its starting value and above ten');
  setLanguagePreference('pt');
});

test('level-zero resource help explains Commoner rules while preserving stored values',async()=>{
  const character=model.createCharacter();character.level=0;character.attributes.might=2;
  character.resources.focus=17;character.resources.endurance=8;
  const f=fixture({guest:character});await flush();
  const before=JSON.stringify(f.app.getState().records);
  f.clickAction('',{resourceHelp:'hp'});
  assert.match(f.elements.get('#dialog-content').innerHTML,/\(0 \+ 1\) × \(5 \+ 2\) \+ 0 = 7 PV/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/morte imediata/);
  for(const key of ['focus','endurance','recovery']){
    f.clickAction('',{resourceHelp:key});
    assert.match(f.elements.get('#dialog-content').innerHTML,/Commoners de nível 0 não têm/);
    assert.match(f.elements.get('#dialog-content').innerHTML,/valores salvos são preservados/);
  }
  f.clickAction('',{resourceHelp:'resolve'});
  assert.match(f.elements.get('#dialog-content').innerHTML,/habilita a partir do nível 1/);
  assert.equal(JSON.stringify(f.app.getState().records),before);
});

test('Character has only five top resources and editing them preserves focus, health fields, and the daily pool',async()=>{
  const character=model.createCharacter('Saúde registrada');character.resources.hp=6;character.resources.endurance=4;
  character.injuries[0].name='Ferimento preservado';character.features='Característica preservada';
  const f=fixture({guest:character});await flush();
  const inputs=key=>f.document.querySelectorAll('[data-resource-value]').filter(input=>input.dataset.resourceValue===key);
  assert.equal((f.elements.get('#resources').innerHTML.match(/data-resource-value=/g)||[]).length,5);
  assert.doesNotMatch(f.elements.get('#sheet-content').innerHTML,/data-resource-value|data-resource-widget|resource-strip/);
  for(const key of ['hp','recovery','endurance','focus','resolve'])assert.equal(inputs(key).length,1);
  assert.match(f.elements.get('#sheet-content').innerHTML,/data-field="injuries.0.name"[^>]*value="Ferimento preservado"/);
  assert.match(f.elements.get('#sheet-content').innerHTML,/Característica preservada/);
  const [top]=inputs('hp');f.document.activeElement=top;
  const topMarkup=f.elements.get('#resources').innerHTML,contentMarkup=f.elements.get('#sheet-content').innerHTML;
  top.value='8';f.input(top);
  assert.equal(f.app.getState().records[0].resources.hp,8);
  assert.equal(Number(inputs('hp')[0].value),8);
  assert.equal(f.document.activeElement,top);assert.equal(inputs('hp')[0],top);
  assert.equal(f.elements.get('#resources').innerHTML,topMarkup);assert.equal(f.elements.get('#sheet-content').innerHTML,contentMarkup);
  assert.ok(f.document.querySelectorAll('[data-resource-track]').filter(track=>track.dataset.resourceTrack==='hp').every(track=>track.style.width==='80%'));
  f.change(top);
  assert.equal(inputs('hp')[0],top,'committing a number keeps the same control and focus');
  f.clickAction('',{resource:'hp',delta:'-1'});
  assert.equal(Number(top.value),7);
  top.value='5';f.input(top);
  assert.equal(Number(top.value),5);
  const endurance=inputs('endurance')[0];endurance.value='2';f.input(endurance);
  assert.equal(Number(endurance.value),2);
  assert.equal(Number(inputs('recovery')[0].value),10,'changing Endurance preserves the current recovery pool');
  assert.equal(f.app.getState().records[0].resources.recoveryTotal,10);
  assert.equal(f.app.getState().records[0].injuries[0].name,'Ferimento preservado');
  assert.equal(f.app.getState().records[0].features,'Característica preservada');
  assert.equal(model.derive(f.app.getState().records[0]).hpMax,10);
});

test('Combat keeps only the top resources, retains Focus above its start, and honors resource bounds',async()=>{
  const character=model.createCharacter('Combate registrado');character.resources.focus=17;character.resources.resolve=2;
  const f=fixture({guest:character});await flush();f.clickAction('',{tab:'combat'});
  const markup=f.elements.get('#sheet-content').innerHTML;
  assert.match(markup,/two-columns combat-overview/);assert.match(markup,/panel movement-panel/);assert.match(markup,/panel combat-health-panel/);
  assert.doesNotMatch(markup,/data-resource-value|data-resource-widget|resource-strip/);
  assert.match(markup,/data-field="injuries.0.name"/);assert.match(markup,/data-field="resources.recoveryTotal"/);
  assert.equal((f.elements.get('#resources').innerHTML.match(/data-resource-value=/g)||[]).length,5);
  const inputs=key=>f.document.querySelectorAll('[data-resource-value]').filter(input=>input.dataset.resourceValue===key);
  for(const key of ['hp','recovery','endurance','focus','resolve'])assert.equal(inputs(key).length,1);
  const focus=inputs('focus')[0];f.document.activeElement=focus;focus.value='25';f.input(focus);f.change(focus);
  assert.equal(Number(focus.value),25);assert.equal(f.app.getState().records[0].resources.focus,25);
  assert.equal(inputs('focus')[0],focus);assert.equal(f.document.activeElement,focus);
  f.clickAction('',{resource:'focus',delta:'1'});
  assert.equal(Number(focus.value),26);
  for(let n=0;n<3;n++)f.clickAction('',{resource:'resolve',delta:'1'});
  assert.equal(Number(inputs('resolve')[0].value),3);
  const hp=inputs('hp')[0];hp.value='99';f.input(hp);f.change(hp);
  assert.equal(Number(hp.value),10,'the control uses the calculated HP maximum');
  const raw=JSON.parse(f.storage.get(KEY));
  assert.equal(raw.characters[0].resources.focus,26);assert.equal(raw.characters[0].resources.resolve,3);assert.equal(raw.characters[0].resources.hp,10);
});

test('input persists numbers and checkboxes once while change without input still applies and saves its value',async()=>{
  const character=model.createCharacter('Eventos preservados');character.resources.hp=6;
  character.deeds.push({id:'one-deed',name:'Feito',kind:'light',cost:0,focus:0,description:''});
  const f=fixture({guest:character});await flush();
  const field=(path,value,options={})=>({dataset:{field:path},value:String(value),type:'number',tagName:'INPUT',min:'0',max:'100',step:'1',matches:selector=>selector==='[data-field]',...options});
  const persisted=()=>JSON.parse(f.storage.get(KEY)).characters[0];
  let count=f.writes.length;
  const hp=f.document.querySelectorAll('[data-resource-value]').find(input=>input.dataset.resourceValue==='hp');hp.value='7';
  f.input(hp);assert.equal(persisted().resources.hp,7,'the input is durable before blur or timers');
  f.change(hp);assert.equal(f.writes.length,count+1,'the matching change does not write the same snapshot again');
  count=f.writes.length;
  const might=field('attributes.might',2);f.change(might);
  assert.equal(persisted().attributes.might,2);assert.equal(persisted().resources.hp,7);assert.equal(f.writes.length,count+1);
  assert.equal(model.derive(f.app.getState().records[0]).hpMax,14);
  count=f.writes.length;
  const armor=field('armor.0.spent','',{type:'checkbox',checked:true});f.input(armor);f.change(armor);
  assert.equal(persisted().armor[0].spent,true);assert.equal(f.writes.length,count+1);
  const unchecked=field('armor.0.spent','',{type:'checkbox',checked:false});f.change(unchecked);
  assert.equal(persisted().armor[0].spent,false,'a checkbox change without input also updates the model');
  const kind=field('deeds.0.kind','mighty',{tagName:'SELECT',type:'select-one'});f.input(kind);f.change(kind);
  assert.equal(persisted().deeds[0].kind,'mighty');assert.equal(persisted().deeds[0].cost,4,'the change still applies category-dependent deed costs');
});

test('change retries a failed synchronous cache write for guest and account edits, then suppresses duplicates after recovery',async()=>{
  for(const signedIn of [false,true]){
    const character=model.createCharacter('Retentativa');character.id='retry-hero';character.resources.hp=6;
    const remote=new Map([['account-a',[{id:character.id,data:character,revision:1,deleted_at:null}]]]);
    const f=fixture({guest:character,initialUser:signedIn?'account-a':null,remote});await flush();
    const key=signedIn?`${KEY}.cloud.account-a`:KEY;
    const attempts=()=>f.writeAttempts.filter(([writeKey])=>writeKey===key).length;
    const hp=f.document.querySelectorAll('[data-resource-value]').find(input=>input.dataset.resourceValue==='hp'),before=attempts();
    f.setQuotaFailure(true);hp.value='8';f.input(hp);f.change(hp);
    assert.equal(attempts(),before+2,'an uncached input cannot suppress the next retry');
    assert.equal(f.app.getState().records[0].resources.hp,8,'failed storage retains the edit in memory');
    f.setQuotaFailure(false);f.change(hp);
    const cached=JSON.parse(f.storage.get(key));
    assert.equal((signedIn?cached.records:cached.characters)[0].resources.hp,8);
    assert.equal(attempts(),before+3);
    f.change(hp);assert.equal(attempts(),before+3,'a retry confirmed in local storage now suppresses duplicate change events');
  }
});

test('change can correct an account edit rejected by model validation without another input event',async()=>{
  const character=model.createCharacter('Validação');character.id='validated-hero';
  const remote=new Map([['account-a',[{id:character.id,data:character,revision:1,deleted_at:null}]]]);
  const f=fixture({initialUser:'account-a',remote});await flush();
  const attribute={dataset:{field:'attributes.might'},value:'6',type:'number',tagName:'INPUT',min:'0',max:'10',step:'1',matches:selector=>selector==='[data-field]'};
  f.input(attribute);assert.equal(f.app.getState().cloudStatus.state,'error');
  attribute.value='5';f.change(attribute);
  assert.equal(f.app.getState().records[0].attributes.might,5);
  assert.equal(JSON.parse(f.storage.get(`${KEY}.cloud.account-a`)).records[0].attributes.might,5);
  assert.equal(f.app.getState().cloudStatus.state,'pending');
});

test('tab navigation updates content and existing nav state while preserving identity, portrait, resources, and data',async()=>{
  const character=model.createCharacter('Navegação preservada');character.resources.hp=6;character.notes='Diário preservado';
  character.portrait={dataUrl:portraitPng(30,40),zoom:1.4,x:25,y:70};
  const f=fixture({guest:character});await flush();
  const snapshot=JSON.stringify(f.app.getState().records),writeCount=f.writes.length;
  const fixed=['#identity','#resources','#character-list','#mobile-character-select','#navigation'];
  const fixedWrites=fixed.map(selector=>f.elements.get(selector).innerHTMLWrites);
  const portrait=f.document.querySelector('[data-action="portrait-edit"]'),resource=f.document.querySelectorAll('[data-resource-value]')[0];
  const nav=f.document.querySelectorAll('#navigation [data-tab]'),content=f.elements.get('#sheet-content');
  const contentWrites=content.innerHTMLWrites;
  f.clickAction('',{tab:'equipment'});
  assert.equal(f.app.getState().tab,'equipment');assert.equal(f.elements.get('#section-title').textContent,'Equipamento');
  assert.equal(content.innerHTMLWrites,contentWrites+1);
  assert.deepEqual(fixed.map(selector=>f.elements.get(selector).innerHTMLWrites),fixedWrites);
  assert.equal(f.document.querySelector('[data-action="portrait-edit"]'),portrait);
  assert.equal(f.document.querySelectorAll('[data-resource-value]')[0],resource);
  assert.equal(f.document.querySelectorAll('#navigation [data-tab]')[0],nav[0]);
  for(const button of nav){assert.equal(button.classList.contains('active'),button.dataset.tab==='equipment');assert.equal(button['aria-current'],button.dataset.tab==='equipment'?'page':undefined);}
  assert.equal(f.document.activeElement,f.elements.get('#section-title'));
  f.clickAction('',{tab:'equipment'});assert.equal(content.innerHTMLWrites,contentWrites+1,'selecting the active section does not replace its fields');
  f.clickAction('',{tab:'combat'});
  assert.equal(f.elements.get('#section-title').textContent,'Combate');assert.equal(content.innerHTMLWrites,contentWrites+2);
  assert.deepEqual(fixed.map(selector=>f.elements.get(selector).innerHTMLWrites),fixedWrites);
  assert.equal(f.writes.length,writeCount);assert.equal(JSON.stringify(f.app.getState().records),snapshot);
});

test('portrait adjustments remain a draft until saved and are discarded when the account changes',async()=>{
  const f=fixture();await flush();
  const draft={dataUrl:portraitPng(),zoom:1.5,x:30,y:60};
  f.app.showPortraitEditor(draft);
  assert.equal(f.app.getState().records[0].portrait.dataUrl,'');
  assert.match(f.elements.get('#dialog-content').innerHTML,/data-portrait-crop="zoom"/);
  f.clickAction('portrait-cancel');
  assert.equal(f.app.getState().portraitDraft,null);
  assert.equal(f.app.getState().records[0].portrait.dataUrl,'');
  f.app.showPortraitEditor(draft);f.clickAction('portrait-save');
  assert.deepEqual(f.app.getState().records[0].portrait,draft);
  f.app.showPortraitEditor({...draft,zoom:2});
  f.emit('new-account');await f.runTimers();
  f.clickAction('portrait-save');
  assert.equal(f.app.getState().records[0].portrait.dataUrl,'','an old account portrait cannot be written into a new account');
  assert.equal(f.app.getState().portraitDraft,null);
});

test('the portrait card exposes one edit icon and opens an empty editor before choosing an image',async()=>{
  const f=fixture();await flush();
  const identity=f.elements.get('#identity').innerHTML;
  assert.equal([...identity.matchAll(/data-action="portrait-/g)].length,1);
  assert.match(identity,/class="portrait-edit-target" data-action="portrait-edit" aria-label="Editar retrato"/);
  assert.doesNotMatch(identity,/data-action="portrait-remove"|>Adicionar retrato<|>Ajustar retrato</);
  const before=JSON.stringify(f.app.getState().records),writes=f.writes.length;
  f.clickAction('portrait-edit');
  assert.equal(f.elements.get('#utility-dialog').open,true);
  assert.deepEqual(f.app.getState().portraitDraft,{dataUrl:'',zoom:1,x:50,y:50});
  assert.match(f.elements.get('#dialog-content').innerHTML,/>Escolher imagem</);
  assert.equal(f.document.querySelector('[data-action="portrait-save"]').disabled,true);
  assert.equal(f.document.querySelector('[data-action="portrait-remove"]').disabled,true);
  for(const crop of f.document.querySelectorAll('[data-portrait-crop]'))assert.equal(crop.disabled,true);
  f.emit(null);await f.runTimers();
  assert.equal(f.document.querySelector('[data-action="portrait-save"]').disabled,true,'readiness refresh cannot enable empty saving');
  for(const crop of f.document.querySelectorAll('[data-portrait-crop]'))assert.equal(crop.disabled,true);
  f.clickAction('portrait-save');
  assert.equal(JSON.stringify(f.app.getState().records),before);
  assert.equal(f.writes.length,writes);
  assert.equal(f.elements.get('#portrait-file').clickCount,undefined,'opening the editor does not invoke the file chooser');
  f.clickAction('portrait-cancel');
  setLanguagePreference('en');f.clickAction('portrait-edit');
  assert.match(f.elements.get('#identity').innerHTML,/aria-label="Edit portrait"/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/>Choose image</);
  f.clickAction('portrait-cancel');setLanguagePreference('pt');
});

test('removing a portrait is a draft, cancellation keeps the original, and saving removes it',async()=>{
  const guest=model.createCharacter('Retrato');guest.portrait={dataUrl:portraitPng(),zoom:1.7,x:20,y:80};
  const f=fixture({guest});await flush();
  const original=structuredClone(f.app.getState().records[0].portrait),writes=f.writes.length;
  f.clickAction('portrait-edit');f.clickAction('portrait-remove');
  assert.deepEqual(f.app.getState().records[0].portrait,original);
  assert.deepEqual(f.app.getState().portraitDraft,{dataUrl:'',zoom:1,x:50,y:50});
  assert.equal(f.writes.length,writes,'removal is not saved until the user saves');
  assert.match(f.elements.get('#dialog-content').innerHTML,/O retrato será removido ao salvar\. Você também pode escolher outra imagem\./);
  assert.equal(f.document.querySelector('[data-action="portrait-save"]').disabled,false,'an empty draft can save removal of an existing image');
  assert.equal(f.document.querySelector('[data-action="portrait-remove"]').disabled,true);
  for(const crop of f.document.querySelectorAll('[data-portrait-crop]'))assert.equal(crop.disabled,true);
  f.emit(null);await f.runTimers();
  assert.equal(f.document.querySelector('[data-action="portrait-save"]').disabled,false);
  for(const crop of f.document.querySelectorAll('[data-portrait-crop]'))assert.equal(crop.disabled,true,'readiness refresh cannot enable crop controls without an image');
  f.clickAction('portrait-cancel');
  assert.deepEqual(f.app.getState().records[0].portrait,original);
  setLanguagePreference('en');
  f.clickAction('portrait-edit');f.clickAction('portrait-remove');
  assert.match(f.elements.get('#dialog-content').innerHTML,/Saving will remove the portrait\. You can also choose another image\./);
  setLanguagePreference('pt');f.clickAction('portrait-save');
  assert.deepEqual(f.app.getState().records[0].portrait,{dataUrl:'',zoom:1,x:50,y:50});
  assert.equal(f.elements.get('#utility-dialog').open,false);
  assert.equal(f.elements.get('#toast').textContent,'Retrato removido.');
  const saved=JSON.parse(f.storage.get(KEY));assert.equal(saved.characters[0].portrait.dataUrl,'');
});

test('a closed portrait editor invalidates a delayed file chooser response',async()=>{
  const f=fixture();await flush();
  f.clickAction('portrait-edit');f.clickAction('portrait-choose');
  assert.equal(f.elements.get('#portrait-file').clickCount,1);
  f.clickAction('portrait-cancel');
  await f.elements.get('#portrait-file').listeners.get('change')({target:{files:[{type:'image/png',size:100}]}});
  assert.equal(f.elements.get('#utility-dialog').open,false);
  assert.equal(f.app.getState().portraitDraft,null);
  assert.equal(f.app.getState().records[0].portrait.dataUrl,'');
});

test('a delayed character JSON import cannot write into the next signed-in account or guest archive',async()=>{
  for(const destination of ['account-b',null]){
    const f=fixture({initialUser:'account-a'});await flush();
    const guestArchive=f.storage.get(KEY);
    let finishRead;
    const file={size:100,text:()=>new Promise(resolve=>{finishRead=resolve;})};
    const importing=f.elements.get('#import-file').listeners.get('change')({target:{files:[file]}});
    f.emit(destination);await f.runTimers();
    const before=JSON.stringify(f.app.getState().records),writes=f.writes.length;
    finishRead(JSON.stringify({format:'trespasser-character',version:1,character:{name:'Importação da conta anterior'}}));
    await importing;await flush();
    assert.equal(JSON.stringify(f.app.getState().records),before);
    assert.equal(f.writes.length,writes);
    assert.equal(f.storage.get(KEY),guestArchive);
    assert.equal(f.calls.some(call=>call.type==='save'),false);
    assert.match(f.elements.get('#toast').textContent,/A conta mudou durante a importação/);
  }
});

test('character JSON import preserves legacy records and cannot start in an unready account',async()=>{
  const f=fixture();await flush();
  await f.elements.get('#import-file').listeners.get('change')({target:{files:[{size:100,text:async()=>JSON.stringify({
    format:'trespasser-character',version:1,character:{name:'Ficha antiga',plights:'Aflição personalizada',resources:{hp:3}},
  })}]}});
  const imported=f.app.getState().records.at(-1);
  assert.equal(imported.name,'Ficha antiga');assert.equal(imported.plights,'Aflição personalizada');
  assert.equal(imported.resources.hp,3);
  assert.deepEqual(imported.portrait,{dataUrl:'',zoom:1,x:50,y:50});
  assert.deepEqual(imported.plightSelections,[]);
  const blocked=fixture({initialUser:'account-a',locks:null});await flush();
  let read=false;
  await blocked.elements.get('#import-file').listeners.get('change')({target:{files:[{size:100,text:async()=>{read=true;return '{}';}}]}});
  assert.equal(read,false);
  assert.equal(blocked.calls.some(call=>call.type==='save'),false);
});

test('invalid character imports report the model diagnostic in the current interface language',async()=>{
  const f=fixture();await flush();setLanguagePreference('en');
  const before=JSON.stringify(f.app.getState().records);
  await f.elements.get('#import-file').listeners.get('change')({target:{files:[{size:100,text:async()=>JSON.stringify({
    format:'trespasser-character',version:1,character:{name:'Uma pessoa chamada Nível',level:99},
  })}]}});
  assert.equal(f.elements.get('#toast').textContent,'Could not import: Level: invalid number.');
  assert.equal(JSON.stringify(f.app.getState().records),before);
  setLanguagePreference('pt');
});

test('book plight choices persist separately and preserve legacy notes in both languages',async()=>{
  const character=model.createCharacter('Guardião');character.plights='Condição específica da mesa';
  const f=fixture({guest:character});await flush();
  assert.equal((f.elements.get('#sheet-content').innerHTML.match(/data-plight=/g)||[]).length,10);
  assert.match(f.elements.get('#sheet-content').innerHTML,/Condição específica da mesa/);
  f.change({dataset:{plight:'afraid'},checked:true,closest:()=>null});
  assert.deepEqual(f.app.getState().records[0].plightSelections,['afraid']);
  assert.equal(f.app.getState().records[0].plights,'Condição específica da mesa');
  setLanguagePreference('en');
  assert.match(f.elements.get('#sheet-content').innerHTML,/data-plight="afraid" checked/);
  assert.match(f.elements.get('#sheet-content').innerHTML,/>Afraid</);
  assert.match(f.elements.get('#sheet-content').innerHTML,/Previous notes/);
  f.change({dataset:{plight:'afraid'},checked:false,closest:()=>null});
  assert.deepEqual(f.app.getState().records[0].plightSelections,[]);
  assert.equal(f.app.getState().records[0].plights,'Condição específica da mesa');
  setLanguagePreference('pt');
});

test('a late signout response cannot replace a newer connected account',async()=>{
  const c=model.createCharacter('Ficha da conta B');
  const f=fixture({initialUser:'account-a',deferredLogout:true,remote:new Map([['account-b',[{id:c.id,data:c,revision:1,deleted_at:null}]]])});
  await flush();
  const leaving=f.app.logoutCloud();
  f.emit('account-b');await f.runTimers();
  assert.equal(f.app.getState().cloudUser.id,'account-b');
  f.resolveLogout();await leaving;
  assert.equal(f.app.getState().cloudUser.id,'account-b');
  assert.equal(f.app.getState().records[0].id,c.id);
  assert.equal(f.app.getState().cloudReady,true);
});

test('a stale initial auth session cannot replace a newer sign-in, and SDK callbacks defer work',async()=>{
  const f=fixture({deferredSession:true});
  f.emit('new-account');
  f.resolveSession('stale-account');
  await flush();
  assert.equal(f.app.getState().cloudUser,null);
  await f.runTimers();
  assert.equal(f.app.getState().cloudUser.id,'new-account');
  assert.equal(f.app.getState().cloudReady,true);
  assert.equal(f.calls.some(call=>call.user==='stale-account'),false);
  assert.equal(f.storage.has(`${KEY}.cloud.stale-account`),false);
});

test('editing private account data never writes it to the guest archive; logout restores guest sheets',async()=>{
  const privateCharacter=model.createCharacter('Personagem privado');
  const f=fixture({initialUser:'account-a',remote:new Map([['account-a',[{id:privateCharacter.id,data:privateCharacter,revision:1,deleted_at:null}]]])});
  await flush();
  const guestArchive=f.storage.get(KEY);
  f.edit('name','Nome privado alterado');
  assert.equal(f.app.getState().cloudStatus.state,'pending');
  assert.equal(f.storage.get(KEY),guestArchive);
  assert.match(f.storage.get(`${KEY}.cloud.account-a`),/Nome privado alterado/);
  assert.equal(f.writes.filter(([key])=>key===KEY).some(([,value])=>value.includes('privado')),false);
  await f.app.logoutCloud();
  await f.runTimers();
  assert.equal(f.app.getState().cloudUser,null);
  assert.equal(f.app.getState().records[0].name,'Ficha local');
  assert.equal(f.storage.get(KEY),guestArchive);
  assert.equal(f.elements.get('#main').inert,false);
});

test('switching accounts keeps caches separate and an empty account does not upload its placeholder',async()=>{
  const f=fixture({initialUser:'account-a'});
  await flush();
  assert.equal(f.app.getState().records.length,1);
  assert.equal(JSON.parse(f.storage.get(`${KEY}.cloud.account-a`)).records.length,0);
  assert.equal(f.calls.filter(call=>call.type==='save').length,0);
  f.edit('name','Pertence à conta A');
  f.emit('account-b');await f.runTimers();
  assert.equal(f.app.getState().cloudUser.id,'account-b');
  assert.equal(f.app.getState().records[0].name,'');
  assert.equal(JSON.parse(f.storage.get(`${KEY}.cloud.account-b`)).records.length,0);
  assert.match(f.storage.get(`${KEY}.cloud.account-a`),/Pertence à conta A/);
  assert.equal(f.storage.get(KEY).includes('Pertence'),false);
});

test('login returns to a clean project-root URL and export becomes available after account loading',async()=>{
  const f=fixture();await flush();await f.app.loginCloud();
  assert.equal(f.calls.find(call=>call.type==='login').options.options.redirectTo,'https://example.test/trespasser-ficha/');
  f.emit('account-a');await f.runTimers();
  assert.equal(f.elements.get('#export-button').disabled,false);
});

test('settings remain available with their engraved gear through sign-in and sign-out',async()=>{
  const f=fixture();await flush();
  const button=f.elements.get('#account-button');
  assert.equal(button.textContent,'Ajustes');
  assert.match(button.children[0].innerHTML,/aria-hidden="true"/);
  f.emit('account-a');await f.runTimers();
  assert.equal(button.children[1].textContent,'Ajustes');
  assert.match(button.children[0].innerHTML,/icon--settings/);
  await f.app.logoutCloud();
  assert.equal(button.children[1].textContent,'Ajustes');
  assert.equal(button.dataset.icon,'settings');
});

test('local migration candidates and account refreshes never open settings automatically',async()=>{
  const f=fixture({initialUser:'account-a'});await flush();
  assert.equal(f.app.getState().cloudReady,true);
  assert.equal(f.elements.get('#utility-dialog').open,false);
  const latest=f.events.findLast(event=>event.type==='trespasser:account').detail;
  assert.equal(latest.recordsReady,true);
  assert.equal(latest.signedIn,true);
  f.emit('account-a');await f.runTimers();
  assert.equal(f.elements.get('#utility-dialog').open,false);
  f.clickAction('settings');
  assert.equal(f.elements.get('#utility-dialog').open,true);
  assert.match(f.elements.get('#dialog-content').innerHTML,/Salvar minhas fichas locais na conta/);
  await f.app.logoutCloud();
  assert.equal(f.elements.get('#utility-dialog').open,false);
});

test('Começar explicitly opens the Google account dialog, and sign-in closes it without opening settings',async()=>{
  const f=fixture();await flush();
  assert.equal(f.elements.get('#utility-dialog').open,false);
  f.clickAction('onboarding');
  assert.equal(f.elements.get('#dialog-title').textContent,'Entrar ou criar conta');
  assert.match(f.elements.get('#dialog-content').innerHTML,/Continuar com Google/);
  assert.doesNotMatch(f.elements.get('#dialog-content').innerHTML,/Aparência|data-theme-value/);
  setLanguagePreference('en');
  assert.equal(f.elements.get('#dialog-title').textContent,'Sign in or create an account');
  assert.match(f.elements.get('#dialog-content').innerHTML,/Continue with Google/);
  setLanguagePreference('pt');
  assert.equal(f.elements.get('#dialog-title').textContent,'Entrar ou criar conta');
  assert.equal(f.calls.some(call=>call.type==='login'),false);
  f.clickAction('cloud-login');await flush();
  assert.equal(f.calls.find(call=>call.type==='login').options.provider,'google');
  f.emit('account-a');await f.runTimers();
  assert.equal(f.elements.get('#utility-dialog').open,false);
  assert.equal(f.events.findLast(event=>event.type==='trespasser:account').detail.recordsReady,true);
});

test('settings change appearance independently from characters and expose automatic saving without a manual sync action',async()=>{
  const f=fixture({initialUser:'account-a'});await flush();
  f.elements.get('#account-button').listeners.get('click')();
  assert.equal(f.elements.get('#dialog-title').textContent,'Configurações');
  const content=f.elements.get('#dialog-content').innerHTML;
  assert.match(content,/data-theme-value="dark"/);
  assert.match(content,/data-action="cloud-logout"/);
  assert.doesNotMatch(content,/data-action="cloud-sync"|Sincronizar agora/);
  const archive=f.storage.get(KEY),accountArchive=f.storage.get(`${KEY}.cloud.account-a`),requests=f.calls.length;
  f.clickAction('theme',{themeValue:'dark'});
  assert.equal(f.document.documentElement.dataset.theme,'dark');
  assert.equal(f.storage.get('trespasser.theme.v1'),'dark');
  assert.equal(f.storage.get(KEY),archive);
  assert.equal(f.storage.get(`${KEY}.cloud.account-a`),accountArchive);
  assert.equal(f.calls.length,requests);
  f.windowListeners.get('storage')({key:'trespasser.theme.v1',newValue:'light',storageArea:f.localStorage});
  assert.equal(f.document.documentElement.dataset.theme,'light');
  assert.equal(f.storage.get(KEY),archive);
  assert.equal(f.calls.length,requests);
});

test('a stalled session check releases the account dialog and a later valid auth event still works',async()=>{
  const f=fixture({deferredSession:true});
  f.elements.get('#account-button').listeners.get('click')();
  assert.match(f.elements.get('#dialog-content').innerHTML,/Verificando sua conta/);
  await f.runTimers(20000);
  assert.match(f.elements.get('#dialog-content').innerHTML,/Entrar com Google/);
  assert.match(f.elements.get('#dialog-content').innerHTML,/verificação da sessão está demorando/);
  await f.app.loginCloud();
  assert.equal(f.calls.some(call=>call.type==='login'),true);
  assert.equal(f.elements.get('#main').inert,undefined);
  f.emit('eventual-account');await f.runTimers();
  assert.equal(f.app.getState().cloudUser.id,'eventual-account');
  assert.equal(f.app.getState().cloudReady,true);
  assert.equal(f.elements.get('#main').inert,false);
});

test('a rejected edit cannot become falsely saved or get overwritten by a background sync',async()=>{
  const c=model.createCharacter('Ficha grande');
  const f=fixture({initialUser:'account-a',remote:new Map([['account-a',[{id:c.id,data:c,revision:1,deleted_at:null}]]])});
  await flush();
  const current=f.app.getState().records[0];
  current.inventory=Array.from({length:1001},(_,i)=>({id:`item-${i}`,name:`Item ${i}`,slots:1,notes:''}));
  f.app.save();
  assert.equal(f.app.getState().cloudStatus.state,'error');
  const requestCount=f.calls.length;
  await f.app.syncCloud();
  assert.equal(f.calls.length,requestCount);
  assert.equal(f.app.getState().records[0].inventory.length,1001);
  assert.equal(f.app.getState().cloudStatus.state,'error');
  f.elements.get('#account-button').listeners.get('click')();
  assert.match(f.elements.get('#dialog-content').innerHTML,/edições ainda não foram guardadas/);
  await f.app.logoutCloud();
  assert.equal(f.app.getState().cloudUser.id,'account-a');
  current.inventory=[];f.app.save();await f.app.syncCloud();
  assert.equal(f.app.getState().cloudStatus.state,'synced');
});

test('quota plus offline keeps the only in-memory copy visible and blocks logout, migration and closing',async()=>{
  const c=model.createCharacter('Ficha privada');
  const f=fixture({initialUser:'account-a',remote:new Map([['account-a',[{id:c.id,data:c,revision:1,deleted_at:null}]]])});
  await flush();
  const normalList=f.adapter.list;
  f.setQuotaFailure(true);
  f.edit('notes','Única cópia em memória');
  f.adapter.list=async()=>{throw new Error('Network disconnected');};
  await f.app.syncCloud();
  assert.equal(f.app.getState().cloudStatus.pending,1);
  assert.equal(f.app.getState().cloudStatus.localSaved,false);
  f.elements.get('#account-button').listeners.get('click')();
  const dialog=f.elements.get('#dialog-content').innerHTML;
  assert.match(dialog,/somente na memória/);
  assert.match(dialog,/Exportar uma cópia/);
  assert.match(dialog,/data-action="cloud-logout" disabled/);
  assert.doesNotMatch(dialog,/ficam guardadas neste navegador/);
  const before=f.app.getState().records.length;
  await f.app.migrateLocalCharacters();
  assert.equal(f.app.getState().records.length,before);
  await f.app.logoutCloud();
  assert.equal(f.app.getState().cloudUser.id,'account-a');
  let prevented=false;
  const event={preventDefault(){prevented=true;}};
  f.windowListeners.get('beforeunload')(event);
  assert.equal(prevented,true);
  assert.equal(event.returnValue,'');

  // Once the cloud confirms the write, lack of a browser cache is no longer
  // a reason to block logout or warn about closing the page.
  f.adapter.list=normalList;
  await f.app.syncCloud();
  assert.equal(f.app.getState().cloudStatus.pending,0);
  assert.equal(f.remote.get('account-a')[0].data.notes,'Única cópia em memória');
  prevented=false;
  f.windowListeners.get('beforeunload')({preventDefault(){prevented=true;}});
  assert.equal(prevented,false);
  await f.app.logoutCloud();
  assert.equal(f.app.getState().cloudUser,null);
});

test('only one tab may initialize an account cache; blocked tab can log out but cannot export its placeholder',async()=>{
  const locks=browserLocks();
  const first=fixture({initialUser:'account-a',locks});
  await flush();
  assert.equal(first.app.getState().cloudReady,true);
  const second=fixture({initialUser:'account-a',locks});
  await flush();
  assert.equal(second.app.getState().cloudReady,false);
  assert.equal(second.elements.get('#main').inert,true);
  assert.equal(second.elements.get('#export-button').disabled,true);
  assert.equal(second.calls.some(call=>call.type==='list'||call.type==='save'),false);
  assert.equal(second.storage.has(`${KEY}.cloud.account-a`),false);
  assert.equal(second.elements.get('#utility-dialog').open,false);
  assert.match(second.events.findLast(event=>event.type==='trespasser:account').detail.message,/Esta conta está aberta em outra aba\. Feche-a e recarregue esta página\./);
  await second.app.logoutCloud();
  assert.equal(second.app.getState().cloudUser,null);
  assert.equal(second.elements.get('#export-button').disabled,false);
  assert.equal(locks.held.has('trespasser.account.account-a'),true);
  await first.app.logoutCloud();await flush();
  assert.equal(locks.held.size,0);
  const next=fixture({initialUser:'account-a',locks});await flush();
  assert.equal(next.app.getState().cloudReady,true);
});

test('unsupported Web Locks blocks online edits explicitly and leaves guest sheets available after logout',async()=>{
  const f=fixture({initialUser:'account-a',locks:null});await flush();
  assert.equal(f.app.getState().cloudReady,false);
  assert.equal(f.elements.get('#main').inert,true);
  assert.equal(f.elements.get('#export-button').disabled,true);
  assert.equal(f.calls.some(call=>call.type==='list'||call.type==='save'),false);
  assert.equal(f.storage.has(`${KEY}.cloud.account-a`),false);
  assert.equal(f.elements.get('#utility-dialog').open,false);
  assert.match(f.events.findLast(event=>event.type==='trespasser:account').detail.message,/Use um navegador atualizado/);
  await f.app.logoutCloud();
  assert.equal(f.app.getState().records[0].name,'Ficha local');
  assert.equal(f.elements.get('#main').inert,false);
});

test('a late lock acquisition after logout releases itself without touching the private cache',async()=>{
  let acquire;
  const held=new Set();
  const locks={request(name,_options,callback){return new Promise((resolve,reject)=>{
    acquire=()=>{held.add(name);Promise.resolve(callback({name})).then(value=>{held.delete(name);resolve(value);},reject);};
  });}};
  const f=fixture({initialUser:'account-a',locks});await flush();
  assert.equal(f.app.getState().cloudReady,false);
  await f.app.logoutCloud();
  acquire();await flush();
  assert.equal(f.app.getState().cloudUser,null);
  assert.equal(held.size,0);
  assert.equal(f.calls.some(call=>call.type==='list'||call.type==='save'),false);
  assert.equal(f.storage.has(`${KEY}.cloud.account-a`),false);
});

test('pagehide stops synchronization and releases the tab lock; bfcache return reloads before editing',async()=>{
  const locks=browserLocks(),f=fixture({initialUser:'account-a',locks});await flush();
  assert.equal(locks.held.size,1);
  f.windowListeners.get('pagehide')();await flush();
  assert.equal(locks.held.size,0);
  const calls=f.calls.length;
  await f.app.syncCloud();
  assert.equal(f.calls.length,calls);
  f.windowListeners.get('pageshow')({persisted:true});
  assert.equal(f.calls.at(-1).type,'reload');
});
