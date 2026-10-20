import test from 'node:test';
import assert from 'node:assert/strict';
import { createHaven,normalizeHaven } from '../dist/haven-model.js';
import { translateHavenMessage } from '../dist/havens.js';
import { setLanguagePreference } from '../dist/i18n.js';

const diagnostic=mutate=>{const record=createHaven();mutate(record);try{normalizeHaven(record);}catch(error){return error.message;}assert.fail('Expected validation failure');};
test('Haven validation diagnostics localize fields and all validation types without changing the record',()=>{
  setLanguagePreference('en');
  const cases=[
    [record=>record.level=12,'Haven level: invalid number.'],
    [record=>record.name=42,'Name: invalid text.'],
    [record=>record.attributes=[],'Attributes: invalid object.'],
    [record=>record.projects=42,'Projects: invalid list.'],
    [record=>record.mercenaryLevel=12,'Mercenary level: invalid number.'],
    [record=>record.event=[],'Event: invalid object.'],
    [record=>record.trained=['unknown'],'Invalid haven skill.'],
  ];
  for(const [mutate,expected] of cases)assert.equal(translateHavenMessage(diagnostic(mutate)),expected);
  const record=createHaven('Anotações');record.notes='name: texto inválido.';const before=JSON.stringify(record);
  assert.equal(translateHavenMessage('Um erro desconhecido: com os detalhes originais.'),'Um erro desconhecido: com os detalhes originais.');
  assert.equal(translateHavenMessage('Custom diagnostic <details>'),'Custom diagnostic <details>');
  assert.equal(JSON.stringify(record),before);
  setLanguagePreference('pt');
  assert.equal(translateHavenMessage('level: número inválido.'),'level: número inválido.');
});
test('Haven PDF errors retain unsupported characters while translating their explanation',()=>{
  setLanguagePreference('en');
  assert.equal(translateHavenMessage('O caractere “🧙” não é suportado pela fonte do PDF. Use o JSON para preservar o texto completo.'),'The PDF font does not support “🧙”. Use JSON to preserve the full text.');
  setLanguagePreference('pt');
});
