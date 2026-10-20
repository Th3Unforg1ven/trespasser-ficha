import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {PDFDocument,PDFName} from '../dist/vendor/pdf-lib.js';
import {createHaven,normalizeHaven} from '../dist/haven-model.js';
import {createHavenPdfExport,prepareHavenExport,havenJson,havenFileStem} from '../dist/haven-export.js';
const template=()=>readFile(new URL('../dist/assets/haven-template.pdf',import.meta.url));
const text=(form,key)=>form.getTextField(key).getText()??'';
function realistic(){
 const h=createHaven('Refúgio São João');h.id='haven-qa';h.leadership='Ícaro e Conceição';h.location='Vale da névoa';h.level=3;h.partyLevel=4;h.populationRank=23;h.wealth=2500;
 h.attributes={military:1,efficiency:2,resources:3,expertise:1,allegiance:4,appeal:3};h.trained=['faith','hospitality'];h.hirelings.cook=2;h.hirelings.herbalist=3;h.hirelings.mercenary=1;h.mercenaryLevel=3;h.bonuses.expenses=25;
 h.builds=[{id:'b',name:'Ponte de pedra',clock:2,segments:8,notes:'Sobre o rio'}];h.finishedBuildings=[{id:'f',name:'Cozinha',notes:'Rações finas'}];h.projects=[{id:'p',name:'Mapa antigo',clock:3,segments:6,notes:'Tradução'}];h.strongholds=[{id:'s',name:'Torre da aurora',project:'Erguer a torre',clock:2,segments:8,arrivals:'Visitantes da floresta',notes:'Casa do mago'}];h.productionChains=[{id:'c',name:'Rações',cost:250,hirelings:'3 Herbalist + 1 Cook',output:'3 fine rations',notes:'Sem somar custo novamente'}];h.arrivals='Caravana do norte';h.event={name:'Chuva forte',clock:1,segments:4,notes:'Rio subindo'};h.storedItems='Corda e material';h.notes='Promessa de proteger o vale.';return h;
}
test('ZIP contains the same PDF and a complete importable haven JSON without mutation',async()=>{
 const h=realistic(),before=JSON.stringify(h),result=await prepareHavenExport(h,{templateBytes:await template()});
 assert.equal(JSON.stringify(h),before);const envelope=JSON.parse(result.json);assert.equal(envelope.format,'trespasser-haven');assert.equal(envelope.rules,'2.1.3');assert.deepEqual(normalizeHaven(envelope.haven),h);
 const zip=await globalThis.JSZip.loadAsync(result.zip);assert.deepEqual(Object.keys(zip.files).sort(),[`${result.stem}.json`,`${result.stem}.pdf`]);assert.deepEqual(await zip.file(`${result.stem}.pdf`).async('uint8array'),result.pdf);assert.equal(await zip.file(`${result.stem}.json`).async('string'),result.json);
 const doc=await PDFDocument.load(result.pdf),form=doc.getForm();assert.ok(doc.getPageCount()>=3);assert.ok(form.getFields().length>170);
 for(const [key,value] of Object.entries({haven_name:h.name,leadership:h.leadership,location:h.location,population_rank:'23',growth:'+6',decline:'+7',wealth:'2500',weekly_expenses:'675',hireling_cook_rate:'x 100 cp',hireling_mercenary_rate:'x 300 cp',build_1_name:'Ponte de pedra',build_1_clock:'2/8',stronghold_1_name:'Torre da aurora',stronghold_1_clock:'2/8'}))assert.equal(text(form,key),value,key);
 assert.equal(form.getCheckBox('skill_hospitality').isChecked(),true);assert.equal(form.getCheckBox('skill_faith').isChecked(),true);assert.equal(form.getCheckBox('skill_commerce').isChecked(),false);assert.equal(form.getCheckBox('level_3').isChecked(),true);
 for(const field of form.getFields()){assert.equal(field.isReadOnly(),false,field.getName());assert.ok(field.acroField.getWidgets().every(w=>w.dict.has(PDFName.of('AP'))),field.getName());}
 const roots=doc.catalog.lookup(PDFName.of('AcroForm')).lookup(PDFName.of('Fields'));assert.equal(roots.size(),form.getFields().length);
 await mkdir(new URL('../tmp/pdfs/haven/',import.meta.url),{recursive:true});await writeFile(new URL('../tmp/pdfs/haven/realistic.pdf',import.meta.url),result.pdf);
});
test('exported fields can be edited and saved again without flattening',async()=>{
 const bytes=await createHavenPdfExport(realistic(),{templateBytes:await template()}),doc=await PDFDocument.load(bytes),form=doc.getForm();form.getTextField('haven_name').setText('Refúgio de Conceição');form.getTextField('wealth').setText('42');form.getCheckBox('skill_faith').uncheck();const after=await PDFDocument.load(await doc.save());assert.equal(text(after.getForm(),'haven_name'),'Refúgio de Conceição');assert.equal(text(after.getForm(),'wealth'),'42');assert.equal(after.getForm().getCheckBox('skill_faith').isChecked(),false);assert.ok(after.getPages().every(p=>(p.node.Annots()?.size()??0)>0));
});
test('long notes and records beyond official slots continue in editable fields',async()=>{
 const h=realistic();h.arrivals='Chegou a caravana. '.repeat(450);h.notes='Linha longa de anotações do refúgio.\n'.repeat(120);h.builds=Array.from({length:5},(_,i)=>({id:`b${i}`,name:`Obra ${i+1}`,clock:1,segments:6,notes:''}));h.strongholds=Array.from({length:7},(_,i)=>({id:`s${i}`,name:`Fortaleza ${i+1}`,project:'Projeto',clock:1,segments:6,arrivals:'Visitantes',notes:''}));
 const doc=await PDFDocument.load(await createHavenPdfExport(h,{templateBytes:await template()})),form=doc.getForm();assert.equal(text(form,'arrivals'),h.arrivals,'canonical source retains full text');const continued=form.getFields().filter(f=>f.getName().startsWith('continuation_')).map(f=>f.getText()).join('\n');assert.match(continued,/Obra 5/);assert.match(continued,/Fortaleza 7/);assert.match(continued,/Linha longa/);assert.ok(doc.getPageCount()>3);assert.ok(form.getFields().every(f=>!f.isReadOnly()));
});
test('safe filenames and Unicode fallback keep original JSON independent of PDF font support',async()=>{
 const h=createHaven('CON');assert.equal(havenFileStem(h),'trespasser-CON');h.notes='Emoji 🏰';assert.equal(JSON.parse(havenJson(h)).haven.notes,h.notes);await assert.rejects(createHavenPdfExport(h,{templateBytes:await template()}),/JSON/);assert.throws(()=>havenJson({name:'Character'}),/Haven/);
});
