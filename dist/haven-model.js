// Trespasser v2.1.3, Rulebook pp. 192, 195-204 and the official Haven Record.
// The table and record list levels 0-9 and twelve skills; contradictory prose
// mentions level 10 / fourteen skills without defining the missing entries.
export const HAVEN_ATTRS = Object.freeze([
  ['military','Militar','Military'],['efficiency','Eficiência','Efficiency'],
  ['resources','Recursos','Resources'],['expertise','Conhecimento','Expertise'],
  ['allegiance','Lealdade','Allegiance'],['appeal','Atratividade','Appeal'],
].map(([key,pt,en])=>Object.freeze({key,pt,en})));
export const HAVEN_SKILLS = Object.freeze([
  ['agriculture','Agricultura','Agriculture'],['construction','Construção','Construction'],
  ['commerce','Comércio','Commerce'],['cuisine','Culinária','Cuisine'],
  ['entertainment','Entretenimento','Entertainment'],['espionage','Espionagem','Espionage'],
  ['faith','Fé','Faith'],['hospitality','Hospitalidade','Hospitality'],
  ['research','Pesquisa','Research'],['seafaring','Navegação','Seafaring'],
  ['statecraft','Diplomacia','Statecraft'],['warfare','Guerra','Warfare'],
].map(([key,pt,en])=>Object.freeze({key,pt,en})));
export const HAVEN_LEVELS = Object.freeze([0,5,10,20,30,40,50,60,80,100].map((populationRank,level)=>Object.freeze({
  level,populationRank,skill:2+Math.floor(level/3),buildSlots:1+Math.floor(level/3),buildingLimit:3*(level+1),
})));
// The rulebook pp. 202-203 takes precedence over three inconsistent printed
// prices in the record. All rates remain explicit manual overrides.
export const HIRELING_TYPES = Object.freeze([
  ['artisan','Artesão','Artisan',100],['cook','Cozinheiro','Cook',100],
  ['harbinger','Arauto','Harbinger',100],['herbalist','Herbalista','Herbalist',50],
  ['messenger','Mensageiro','Messenger',50],['miner','Mineiro','Miner',50],
  ['worker','Trabalhador','Worker',50],['beastTamer','Domador','Beast Tamer',100],
  ['blacksmith','Ferreiro','Blacksmith',100],['engineer','Engenheiro','Engineer',100],
  ['healer','Curandeiro','Healer',100],['mercenary','Mercenário','Mercenary',100],
  ['researcher','Pesquisador','Researcher',100],['wagoner','Carroceiro','Wagoner',100],
  ['alchemist','Alquimista','Alchemist',150],['officer','Oficial','Officer',150],
  ['spy','Espião','Spy',150],['spellscribe','Escriba arcano','Spellscribe',200],
  ['spellsmith','Ferreiro arcano','Spellsmith',200],
].map(([key,pt,en,cost])=>Object.freeze({key,pt,en,cost})));
export const HAVEN_SECTIONS = Object.freeze([
  {key:'haven',pt:'Refúgio',en:'Haven'}, {key:'buildings',pt:'Construções',en:'Buildings'},
  {key:'industry',pt:'Trabalho',en:'Industry'}, {key:'notes',pt:'Anotações',en:'Notes'},
]);
let sequence=0;
const uid=()=>globalThis.crypto?.randomUUID?.() || `haven-${Date.now().toString(36)}-${++sequence}`;
export function createHaven(name='') {
  return {
    kind:'haven',id:uid(),name:String(name),leadership:'',location:'',level:0,partyLevel:0,
    populationRank:0,populationMode:'growth',wealth:0,
    attributes:Object.fromEntries(HAVEN_ATTRS.map(a=>[a.key,0])),trained:[],
    bonuses:{growth:0,decline:0,expenses:0},arrivals:'',
    event:{name:'',clock:0,segments:6,notes:''},builds:[],finishedBuildings:[],projects:[],strongholds:[],productionChains:[],
    hirelings:Object.fromEntries(HIRELING_TYPES.map(t=>[t.key,0])),
    hirelingRates:Object.fromEntries(HIRELING_TYPES.map(t=>[t.key,t.cost])),mercenaryLevel:1,
    storedItems:'',notes:'',
  };
}
function obj(v,label){if(!v||typeof v!=='object'||Array.isArray(v))throw new Error(`${label}: objeto inválido.`);return v;}
function str(v,fallback='',label='Texto',max=50000){if(v===undefined)return fallback;if(typeof v!=='string'||v.length>max)throw new Error(`${label}: texto inválido.`);return v;}
function num(v,fallback=0,label='Número',min=0,max=1e9){if(v===undefined)return fallback;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw new Error(`${label}: número inválido.`);return v;}
function list(v,label){if(v===undefined)return [];if(!Array.isArray(v)||v.length>1000)throw new Error(`${label}: lista inválida.`);return v;}
const clockEntry=(v,label)=>{const x=obj(v,label);return {id:str(x.id,uid(),'ID',200)||uid(),name:str(x.name),clock:num(x.clock,0,'Relógio',0,10000),segments:num(x.segments,6,'Segmentos',1,10000),notes:str(x.notes)};};
export function normalizeHaven(input){
  const data=obj(input,'Refúgio');
  if(data.kind!=='haven')throw new Error('Use um registro de refúgio / Haven.');
  const h=createHaven();
  for(const key of ['name','leadership','location','arrivals','storedItems','notes'])h[key]=str(data[key],h[key],key);
  h.id=str(data.id,h.id,'ID',200)||uid();
  for(const key of ['level','partyLevel'])h[key]=num(data[key],0,key,0,9);
  for(const key of ['populationRank','wealth'])h[key]=num(data[key],0,key);
  h.populationMode=str(data.populationMode,'growth');
  if(!['growth','decline'].includes(h.populationMode))throw new Error('Modo de população inválido.');
  const attrs=data.attributes===undefined?{}:obj(data.attributes,'Atributos');
  for(const a of HAVEN_ATTRS)h.attributes[a.key]=num(attrs[a.key],0,a.en,0,5);
  const keys=new Set(HAVEN_SKILLS.map(s=>s.key));
  h.trained=[...new Set(list(data.trained,'Perícias').map(k=>{if(!keys.has(k))throw new Error('Perícia de refúgio inválida.');return k;}))];
  const bonuses=data.bonuses===undefined?{}:obj(data.bonuses,'Ajustes');
  for(const key of ['growth','decline','expenses'])h.bonuses[key]=num(bonuses[key],0,key,key==='expenses'?-1e9:-10000,key==='expenses'?1e9:10000);
  h.event=clockEntry(data.event??{},'Evento');delete h.event.id;
  for(const key of ['builds','projects'])h[key]=list(data[key],key).map(x=>clockEntry(x,key));
  h.finishedBuildings=list(data.finishedBuildings,'Construções concluídas').map(v=>{const x=obj(v,'Construção');return {id:str(x.id,uid(),'ID',200)||uid(),name:str(x.name),notes:str(x.notes)};});
  h.strongholds=list(data.strongholds,'Fortalezas').map(v=>{const x=obj(v,'Fortaleza');return {...clockEntry(x,'Fortaleza'),project:str(x.project),arrivals:str(x.arrivals)};});
  h.productionChains=list(data.productionChains,'Cadeias de produção').map(v=>{const x=obj(v,'Cadeia');return {id:str(x.id,uid(),'ID',200)||uid(),name:str(x.name),cost:num(x.cost),hirelings:str(x.hirelings),output:str(x.output),notes:str(x.notes)};});
  const counts=data.hirelings===undefined?{}:obj(data.hirelings,'Contratados');
  const rates=data.hirelingRates===undefined?{}:obj(data.hirelingRates,'Pagamento');
  for(const t of HIRELING_TYPES){h.hirelings[t.key]=num(counts[t.key],0,t.en,0,10000);h.hirelingRates[t.key]=num(rates[t.key],t.cost,t.en);}
  h.mercenaryLevel=num(data.mercenaryLevel,1,'Nível do mercenário',1,9);
  return h;
}
export function deriveHaven(h){
  const row=HAVEN_LEVELS[h.level],next=HAVEN_LEVELS[h.level+1];
  if(!row)throw new Error('Nível de refúgio inválido.');
  const trained=new Set(h.trained),a=h.attributes;
  const hirelingCosts=Object.fromEntries(HIRELING_TYPES.map(t=>[t.key,h.hirelings[t.key]*h.hirelingRates[t.key]*(t.key==='mercenary'?h.mercenaryLevel:1)]));
  const hirelingExpenses=Object.values(hirelingCosts).reduce((sum,cost)=>sum+cost,0);
  const totalHirelings=Object.values(h.hirelings).reduce((sum,n)=>sum+n,0);
  return {
    skill:row.skill,buildSlots:row.buildSlots,buildingLimit:row.buildingLimit,
    requiredPopulationRank:row.populationRank,nextPopulationRank:next?.populationRank??null,
    growth:a.appeal+(trained.has('hospitality')?row.skill:0)+h.bonuses.growth,
    decline:a.allegiance+(trained.has('faith')?row.skill:0)+h.bonuses.decline,
    hirelingCosts,hirelingExpenses,weeklyExpenses:Math.max(0,hirelingExpenses+h.bonuses.expenses),
    totalHirelings,buildingCount:h.finishedBuildings.length,activeBuilds:h.builds.length,
    freeBuildSlots:Math.max(0,row.buildSlots-h.builds.length),remainingBuildingCapacity:Math.max(0,row.buildingLimit-h.finishedBuildings.length),
    overHirelingLimit:totalHirelings>h.populationRank,overBuildSlots:h.builds.length>row.buildSlots,
    overBuildingLimit:h.finishedBuildings.length>row.buildingLimit,
    canAdvance:Boolean(next&&h.populationRank>=next.populationRank&&h.partyLevel>=h.level+1),
    stagnant:Boolean(next&&h.populationRank>=next.populationRank),eventCheckThreshold:row.skill,
  };
}
