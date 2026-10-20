import {PDFDocument,PDFName,PDFHexString,StandardFonts,defaultTextFieldAppearanceProvider,rgb} from './vendor/pdf-lib.js';
import {normalizeHaven,deriveHaven,HAVEN_ATTRS,HAVEN_SKILLS,HIRELING_TYPES} from './haven-model.js';
import {fileStem} from './export-data.js';

let templatePromise;
async function template(){
  if(!templatePromise)templatePromise=fetch(new URL('./assets/haven-template.pdf',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Não foi possível carregar o modelo de refúgio.');return r.arrayBuffer();}).catch(e=>{templatePromise=null;throw e;});
  return templatePromise;
}
export const havenFileStem=h=>fileStem({name:h?.name||'trespasser-refugio'});
export function havenJson(input){return JSON.stringify({format:'trespasser-haven',version:1,rules:'2.1.3',haven:normalizeHaven(input)},null,2);}
const signed=n=>n>0?`+${n}`:String(n);
const clock=x=>`${x.clock}/${x.segments}`;
const description=x=>[x.name,x.notes].filter(Boolean).join(': ');
function linesFor(text,font,size,width){
  const lines=[];
  for(const paragraph of text.split(/\r\n|\r|\n/u)){
    let line='';
    for(const word of paragraph.match(/\S+|\s+/gu)||[]){
      if(!word.trim()){if(line)line+=' ';continue;}
      if(font.widthOfTextAtSize(line+word,size)<=width){line+=word;continue;}
      if(line.trim())lines.push(line.trimEnd());line='';
      for(const char of word){if(line&&font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}line+=char;}
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Adds genuine portable AcroForm fields over the official two-page layout,
 * with visible PT-BR/EN vector labels pre-composed in its local template.
 * Extra records and long text continue on additional editable pages. No flatten.
 */
export async function createHavenPdfExport(input,{templateBytes}={}){
  const h=normalizeHaven(input),d=deriveHaven(h);
  if(JSON.stringify(h).length>2_000_000)throw new Error('A ficha excede 2 MB. Exporte o JSON e reduza o conteúdo antes de gerar o PDF.');
  const doc=await PDFDocument.load(templateBytes??await template());
  if(doc.getPageCount()!==2)throw new Error('Modelo de refúgio inválido: são necessárias duas páginas.');
  const form=doc.getForm(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const supported=new Set(font.getCharacterSet()),extras=[];
  function display(value){
    const text=String(value).normalize('NFC').replace(/\t/gu,'    ');
    for(const char of text)if(!/[\r\n]/u.test(char)&&!supported.has(char.codePointAt(0)))throw new Error(`O caractere “${char}” não é suportado pela fonte do PDF. Use o JSON para preservar o texto completo.`);
    return text;
  }
  function appearance(field,text,size){
    field.acroField.setDefaultAppearance(`/${font.name} ${size} Tf 0 g`);
    field.updateAppearances(font,(actual,widget,embedded)=>{
      const view=Object.create(actual);view.getText=()=>text;
      return defaultTextFieldAppearanceProvider(view,widget,embedded);
    });
  }
  function text(page,name,label,value,x,top,width,height,{size=8,multiline=false,continuation=true,opaque=false}={}){
    const field=form.createTextField(name),canonical=String(value??''),rendered=display(canonical);
    // Avoid asking pdf-lib to auto-fit an overflowing canonical value while the
    // widget is being attached. Its final appearance is fitted below.
    field.setText('');field.disableReadOnly();if(multiline)field.enableMultiline();
    field.acroField.dict.set(PDFName.of('TU'),PDFHexString.fromText(label));
    field.acroField.setDefaultAppearance(`/${font.name} ${size} Tf 0 g`);
    field.setFontSize(size);
    field.addToPage(typeof page==='number'?doc.getPage(page):page,{x,y:792-top-height,width,height,font,borderWidth:0,borderColor:undefined,textColor:rgb(0,0,0),backgroundColor:opaque?rgb(1,1,1):undefined});
    field.setText(canonical);
    let fit;
    for(let candidate=size;candidate>=Math.min(size,6.5)-.001;candidate-=.25){
      const lines=multiline?linesFor(rendered,font,candidate,width-4):[rendered.replace(/[\r\n]+/gu,' ')];
      if(lines.every(line=>font.widthOfTextAtSize(line,candidate)<=width-4)&&lines.length*font.heightAtSize(candidate)*1.2<=height-3){fit={text:lines.join('\n'),size:candidate};break;}
    }
    if(fit)appearance(field,fit.text,fit.size);
    else {
      const markerSize=Math.min(size,6.5);
      const marker=font.widthOfTextAtSize('Ver continuação',markerSize)<=width-4?'Ver continuação':'...';
      appearance(field,marker,markerSize);
      if(canonical&&continuation)extras.push({label,text:canonical});
    }
    form.markFieldAsClean(field.ref);return field;
  }
  function check(page,name,label,checked,x,top,size=7){
    const field=form.createCheckBox(name);field.disableReadOnly();field.addToPage(doc.getPage(page),{x,y:792-top-size,width:size,height:size,borderWidth:0,borderColor:undefined,backgroundColor:undefined});
    field.acroField.dict.set(PDFName.of('TU'),PDFHexString.fromText(label));if(checked)field.check();else field.uncheck();field.updateAppearances();form.markFieldAsClean(field.ref);
  }
  text(0,'haven_name','Nome do refúgio / Haven Name',h.name,298,24,288,16);
  text(0,'leadership','Liderança / Leadership',h.leadership,288,50,110,15);
  text(0,'location','Localização / Location',h.location,477,50,110,15);
  HAVEN_ATTRS.forEach((a,i)=>text(0,`attribute_${a.key}`,`${a.pt} / ${a.en}`,h.attributes[a.key],138,120+i*21,45,17));
  text(0,'skill_bonus','Proficiência / Skill bonus',signed(d.skill),139,256,44,18);
  HAVEN_SKILLS.forEach((s,i)=>{const right=i>=6,row=right?i-6:i;check(0,`skill_${s.key}`,`${s.pt} / ${s.en}`,h.trained.includes(s.key),right?186:99,294+row*17.5,6);});
  for(let i=0;i<10;i++)check(0,`level_${i}`,`Nível / Level ${i}`,h.level===i,18,455+i*14.2,6);
  text(0,'population_rank','Patamar de população / Population Rank',h.populationRank,337,438,57,17);
  text(0,'growth','Crescimento / Growth',signed(d.growth),372,471,23,15);
  text(0,'decline','Declínio / Decline',signed(d.decline),372,489,23,15);
  text(0,'arrivals','Chegadas / Arrivals',h.arrivals,214,535,180,226,{multiline:true});
  text(0,'event_name','Evento / Event',h.event.name,21,624,124,22);
  text(0,'event_clock','Relógio / Clock',clock(h.event),161,624,27,20,{size:7});
  text(0,'event_notes','Notas do evento / Event notes',h.event.notes,21,665,174,96,{multiline:true});
  for(let i=0;i<4;i++){
    const b=h.builds[i],x=i%2?408:213,top=i<2?126:158;
    text(0,`build_${i+1}_name`,`Construção ${i+1} / Build`,b?.name??'',x,top,144,23);
    text(0,`build_${i+1}_clock`,`Relógio ${i+1} / Clock`,b?clock(b):'',x+157,top+4,19,17,{size:7});
    if(b?.notes)extras.push({label:`Construção ${i+1} / Build: ${b.name}`,text:b.notes});
  }
  h.builds.slice(4).forEach((b,i)=>extras.push({label:`Construção ${i+5} / Build`,text:`${b.name}\nRelógio / Clock: ${clock(b)}\n${b.notes}`}));
  text(0,'finished_buildings','Construções concluídas / Finished Buildings',h.finishedBuildings.map(description).join('\n'),213,216,375,173,{multiline:true});
  for(let i=0;i<10;i++){
    const p=h.projects[i],top=440+i*33.1;
    text(0,`project_${i+1}_name`,`Projeto ${i+1} / Project`,p?.name??'',417,top,138,23);
    text(0,`project_${i+1}_clock`,`Relógio do projeto ${i+1} / Clock`,p?clock(p):'',566,top+3,19,18,{size:7});
    if(p?.notes)extras.push({label:`Projeto ${i+1} / Project: ${p.name}`,text:p.notes});
  }
  h.projects.slice(10).forEach((p,i)=>extras.push({label:`Projeto ${i+11} / Project`,text:`${p.name}\nRelógio / Clock: ${clock(p)}\n${p.notes}`}));
  text(1,'wealth','Riqueza atual em cp / Current Wealth',h.wealth,125,37,70,18);
  HIRELING_TYPES.forEach((t,i)=>{
    const top=81+i*12.65;
    text(1,`hireling_${t.key}_count`,`${t.pt} / ${t.en}`,h.hirelings[t.key],83,top,20,11.5,{size:7});
    const rate=h.hirelingRates[t.key]*(t.key==='mercenary'?h.mercenaryLevel:1);
    text(1,`hireling_${t.key}_rate`,`Pagamento em cp por semana / Weekly cost: ${t.en}`,`x ${rate} cp`,106,top,46,11.5,{size:6.8,opaque:true});
    text(1,`hireling_${t.key}_total`,`Total em cp / Total: ${t.en}`,d.hirelingCosts[t.key],160,top,34,11.5,{size:7});
  });
  text(1,'weekly_expenses','Despesas semanais em cp / Weekly Expenses',d.weeklyExpenses,135,374,59,17);
  text(1,'expense_note','Custos usados / Cost basis','Taxas do livro / Rulebook pp. 202-203.\nMercenário: nível x taxa.\nAjustes e detalhes na continuação.',19,334,177,31,{size:7,multiline:true,opaque:true});
  for(let i=0;i<6;i++){
    const c=h.productionChains[i],top=56+i*20.2;
    text(1,`chain_${i+1}_cost`,`Cadeia ${i+1}: custo / Cost`,c?c.cost:'',220,top,37,17.5,{size:7});
    text(1,`chain_${i+1}_hirelings`,`Cadeia ${i+1}: contratados / Hirelings`,c?.hirelings??'',262,top,140,17.5,{size:7});
    text(1,`chain_${i+1}_output`,`Cadeia ${i+1}: produção / Output`,c?.output??'',407,top,181,17.5,{size:7});
    if(c&&(c.name||c.notes))extras.push({label:`Cadeia ${i+1} / Production chain`,text:description(c)});
  }
  h.productionChains.slice(6).forEach((c,i)=>extras.push({label:`Cadeia ${i+7} / Production chain`,text:`${description(c)}\nCusto / Cost: ${c.cost} cp\n${c.hirelings}\n${c.output}`}));
  text(1,'stored_items','Itens armazenados / Stored Items',h.storedItems,218,215,370,176,{multiline:true});
  for(let i=0;i<6;i++){
    const s=h.strongholds[i],column=i%3,x=20+196*column,top=i<3?409:598;
    text(1,`stronghold_${i+1}_name`,`Fortaleza ${i+1} / Stronghold`,s?.name??'',x+76,top,102,19);
    text(1,`stronghold_${i+1}_project`,`Obra da fortaleza ${i+1} / Project`,s?.project??'',x+1,top+43,137,23);
    text(1,`stronghold_${i+1}_clock`,`Relógio da fortaleza ${i+1} / Clock`,s?clock(s):'',x+151,top+47,18,16,{size:7});
    text(1,`stronghold_${i+1}_arrivals`,`Chegadas da fortaleza ${i+1} / Arrivals`,s?.arrivals??'',x+1,top+99,175,62,{multiline:true});
    if(s?.notes)extras.push({label:`Fortaleza ${i+1} / Stronghold: ${s.name}`,text:s.notes});
  }
  h.strongholds.slice(6).forEach((s,i)=>extras.push({label:`Fortaleza ${i+7} / Stronghold`,text:`${s.name}\n${s.project}\nRelógio / Clock: ${clock(s)}\n${s.arrivals}\n${s.notes}`}));
  extras.unshift({label:'Dados adicionais / Additional details',text:`Nível / Level: ${h.level}\nNível do grupo / Party level: ${h.partyLevel}\nPopulação / Population mode: ${h.populationMode==='decline'?'Declínio / Decline':'Crescimento / Growth'}\nAjuste de crescimento / Growth adjustment: ${h.bonuses.growth}\nAjuste de declínio / Decline adjustment: ${h.bonuses.decline}\nDespesas adicionais / Extra expenses: ${h.bonuses.expenses} cp\nNível dos mercenários / Mercenary level: ${h.mercenaryLevel}\nAs cadeias distribuem os contratados; seus custos não são somados novamente.\nProduction chains allocate hirelings; their costs are not charged twice.\nValores calculados são uma fotografia manual; editar o PDF não recalcula a ficha online.`});
  if(h.notes)extras.push({label:'Anotações / Notes',text:h.notes});
  // A clean continuation page, with editable text fields rather than painted text.
  let page,cursor,index=0;
  function nextPage(){
    if(doc.getPageCount()>=120)throw new Error('O PDF excede 120 páginas. Use o JSON e reduza o conteúdo.');
    page=doc.addPage([612,792]);cursor=76;
    page.drawRectangle({x:12,y:12,width:588,height:768,borderWidth:2,borderColor:rgb(0,0,0)});
    page.drawText('TRESPASSER - REGISTRO DE REFÚGIO',{x:25,y:752,font:bold,size:16});
    page.drawText('HAVEN RECORD - CONTINUAÇÃO / CONTINUATION - CAMPOS EDITÁVEIS',{x:25,y:732,font,size:8});
    page.drawText(String(doc.getPageCount()),{x:575,y:24,font,size:8});
  }
  for(const extra of extras){
    const rendered=display(extra.text),all=linesFor(rendered,font,9,552);
    for(let offset=0;offset<all.length;){
      if(!page||cursor>660)nextPage();
      const count=Math.min(Math.floor((743-cursor-24)/12),all.length-offset);
      if(count<1){nextPage();continue;}
      const portion=all.slice(offset,offset+count),height=portion.length*12+8;
      const label=linesFor(display(extra.label),bold,9,552)[0]||'Continuação / Continuation';
      page.drawText(label,{x:25,y:792-cursor,font:bold,size:9});
      text(page,`continuation_${++index}`,extra.label,portion.join('\n'),25,cursor+7,562,height,{size:9,multiline:true,continuation:false});
      cursor+=height+30;offset+=count;
    }
  }
  doc.setTitle(`${h.name||'Refúgio'} - Trespasser Haven Record`);doc.setSubject('Registro não oficial editável / Editable unofficial record - Trespasser v2.1.3');
  return doc.save({updateFieldAppearances:false});
}
export async function prepareHavenExport(input,options={}){
  const h=normalizeHaven(input),stem=havenFileStem(h),json=havenJson(h);
  const [pdf]=await Promise.all([createHavenPdfExport(h,options),import('./vendor/jszip.js')]);
  const archive=new globalThis.JSZip();archive.file(`${stem}.pdf`,pdf);archive.file(`${stem}.json`,json);
  const zip=await archive.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
  return {pdf,json,zip,stem};
}
