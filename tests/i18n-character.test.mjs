import test from 'node:test';
import assert from 'node:assert/strict';
import { setLanguagePreference } from '../dist/i18n.js';
import { formatError } from '../dist/i18n-character.js';

test('character diagnostics translate known validation fields and preserve unrelated text',()=>{
  setLanguagePreference('en');
  for(const [source,expected] of [
    ['Nível: número inválido.','Level: invalid number.'],
    ['name: texto inválido.','Name: invalid text.'],
    ['Atributos: objeto inválido.','Attributes: invalid object.'],
    ['Aflições: lista inválida.','Plights: invalid list.'],
    ['Bônus hp: número inválido.','HP bonus: invalid number.'],
    ['Recurso recoveryTotal: número inválido.','Total recovery dice resource: invalid number.'],
    ['Aflição inválida.','Invalid plight.'],
    ['Tipo de façanha inválido.','Invalid deed kind.'],
  ])assert.equal(formatError(source),expected);
  for(const source of ['Personagem chamado Combate','Minhas anotações sobre Inventário','Estrela: texto inválido.','constructor: texto inválido.','Bônus custom: número inválido.']){
    assert.equal(formatError(source),source);
  }
  setLanguagePreference('pt');
  assert.equal(formatError('Nível: número inválido.'),'Nível: número inválido.');
});

test('PDF and portrait diagnostics translate without dropping the unsupported character',()=>{
  setLanguagePreference('en');
  assert.equal(formatError('Não foi possível carregar o modelo do PDF. Tente novamente.'),'Could not load the PDF template. Try again.');
  for(const character of ['☠','😀','<','”'])assert.equal(
    formatError(`O caractere “${character}” não é suportado pela fonte do PDF. O JSON preserva o texto completo.`),
    `The character “${character}” is not supported by the PDF font. JSON preserves the full text.`
  );
  assert.equal(formatError('A imagem é grande demais. Escolha uma imagem menor.'),'The image is too large. Choose a smaller image.');
  setLanguagePreference('pt');
});
