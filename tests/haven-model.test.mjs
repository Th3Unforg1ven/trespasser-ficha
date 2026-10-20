import test from 'node:test';
import assert from 'node:assert/strict';
import {createHaven,normalizeHaven,deriveHaven,HAVEN_LEVELS,HAVEN_SKILLS} from '../dist/haven-model.js';
test('haven advancement matches every row of the official record without inventing level ten',()=>{
 const h=createHaven();const ranks=[0,5,10,20,30,40,50,60,80,100];
 for(let i=0;i<10;i++){h.level=i;const d=deriveHaven(h);assert.equal(d.requiredPopulationRank,ranks[i]);assert.equal(d.nextPopulationRank,ranks[i+1]??null);assert.equal(d.skill,[2,2,2,3,3,3,4,4,4,5][i]);assert.equal(d.buildSlots,[1,1,1,2,2,2,3,3,3,4][i]);assert.equal(d.buildingLimit,3*(i+1));}
 assert.equal(HAVEN_LEVELS.length,10);assert.equal(HAVEN_SKILLS.length,12);assert.throws(()=>normalizeHaven({...h,level:10}));
});
test('growth and decline add only the relevant trained skill and never change population',()=>{
 const h=createHaven();h.level=3;h.attributes.appeal=2;h.attributes.allegiance=4;h.trained=['hospitality'];h.bonuses.growth=1;
 const d=deriveHaven(h);assert.equal(d.growth,6);assert.equal(d.decline,4);assert.equal(h.populationRank,0);
 h.trained.push('faith');assert.equal(deriveHaven(h).decline,7);
});
test('advancement checks both prerequisites; population loss never lowers the level',()=>{
 const h=createHaven();h.populationRank=5;assert.equal(deriveHaven(h).stagnant,true);assert.equal(deriveHaven(h).canAdvance,false);h.partyLevel=1;assert.equal(deriveHaven(h).canAdvance,true);assert.equal(h.level,0);
 h.level=4;h.populationRank=0;assert.equal(deriveHaven(h).requiredPopulationRank,30);assert.equal(h.level,4);
});
test('hireling costs follow rulebook corrections and mercenary levels without counting production chains twice',()=>{
 const h=createHaven();Object.assign(h.hirelings,{artisan:1,cook:1,harbinger:1,herbalist:2,alchemist:1,mercenary:2});h.mercenaryLevel=3;h.productionChains=[{cost:250}];h.bonuses.expenses=20;
 const d=deriveHaven(h);assert.equal(d.totalHirelings,8);assert.equal(d.hirelingExpenses,1150);assert.equal(d.weeklyExpenses,1170);assert.equal(d.overHirelingLimit,true);h.hirelingRates.artisan=50;assert.equal(deriveHaven(h).hirelingExpenses,1100);
});
test('clock records, rates, manual notes and non-full resources survive an immutable roundtrip',()=>{
 const h=createHaven('São João');h.wealth=123;h.builds=[{id:'build',name:'Ponte',clock:2,segments:8,notes:'Rio'}];h.strongholds=[{id:'s',name:'Torre',project:'Erguer',clock:1,segments:6,arrivals:'Ícaro',notes:'Alto'}];h.notes='<script>texto</script>';
 const serialized=JSON.stringify(h);assert.deepEqual(normalizeHaven(JSON.parse(serialized)),h);deriveHaven(h);assert.equal(JSON.stringify(h),serialized);
});
test('invalid foreign records, clocks, skills and financial values fail instead of coercing',()=>{
 for(const data of [null,{},[],{kind:'character'},{kind:'haven',attributes:{appeal:6}},{kind:'haven',wealth:-1},{kind:'haven',hirelings:{cook:0.5}},{kind:'haven',trained:['magic']},{kind:'haven',event:{segments:0}},{kind:'haven',populationMode:'unknown'}])assert.throws(()=>normalizeHaven(data));
 const h=normalizeHaven({kind:'haven',name:'Novo'});assert.equal(h.level,0);assert.equal(h.hirelingRates.cook,100);assert.equal(h.populationRank,0);
});
