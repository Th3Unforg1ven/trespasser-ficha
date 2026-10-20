import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../dist/model.js';
import { isPristineCharacter, localMigrationCandidates, mergeLocalCharacters } from '../dist/cloud-ui-state.js';

test('a blank sheet is only a placeholder; resource and rules edits make it meaningful', () => {
  const blank = createCharacter();
  assert.equal(isPristineCharacter(blank), true);
  blank.resources.hp -= 1;
  assert.equal(isPristineCharacter(blank), false);
  const edited = createCharacter();
  edited.attributes.might = 2;
  assert.equal(isPristineCharacter(edited), false);
});

test('local migration keeps existing account sheets and safely copies a colliding id', () => {
  const account = createCharacter('Na conta');
  const local = { ...createCharacter('Do navegador'), id: account.id };
  const merged = mergeLocalCharacters([account], [local], [], () => 'safe-new-id');
  assert.deepEqual(merged.records[0], account);
  assert.equal(merged.records[1].id, 'safe-new-id');
  assert.equal(merged.records[1].name, 'Do navegador');
  assert.equal(local.id, account.id);
});

test('migration skips blanks, already copied local ids, and identical account copies', () => {
  const copied = createCharacter('Já copiado');
  const same = createCharacter('Mesmo personagem');
  const fresh = createCharacter('Falta copiar');
  assert.deepEqual(localMigrationCandidates([createCharacter(), copied, same, fresh], [same], [copied.id]).map(c => c.id), [fresh.id]);
});
