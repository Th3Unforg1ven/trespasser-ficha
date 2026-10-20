import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFCheckBox, PDFTextField } from '../dist/vendor/pdf-lib.js';
import { createCharacter, derive, normalizeCharacter } from '../dist/model.js';
import { buildExportData, fileStem } from '../dist/export-data.js';
import { portraitPng } from './portrait-fixture.mjs';

test('export mapping covers every canonical template field with correct value types', async () => {
  const template = await PDFDocument.load(await readFile(new URL('../dist/assets/trespasser-template.pdf', import.meta.url)));
  const fields = new Map(template.getForm().getFields().map(field => [field.getName(), field]));
  fields.delete('key_attribute');
  const data = buildExportData(createCharacter());
  assert.deepEqual(Object.keys(data.values).sort(), [...fields.keys()].sort());
  for (const [name, field] of fields) {
    assert.ok(field instanceof PDFCheckBox || field instanceof PDFTextField, `${name} has a supported value type`);
    assert.equal(typeof data.values[name], field instanceof PDFCheckBox ? 'boolean' : 'string', name);
  }
  assert.equal(data.keyAttribute, 'might');
  assert.equal(data.values.deed_6_cost, '');
  assert.equal(data.values.inventory_10_slots, '');
});

test('exports current resources independently from calculated maxima and daily recovery snapshot', () => {
  const c = createCharacter('João Caçador');
  c.level = 6;
  c.xp = 17;
  c.attributes = { might: 2, agility: 4, intellect: 3, spirit: 1 };
  c.keyAttribute = 'spirit';
  c.trained = ['stealth', 'perception'];
  c.resources = { hp: 3, recovery: 2, recoveryTotal: 9, endurance: 1, focus: 19, resolve: 2 };
  c.armor[0].ar = 4;
  c.armor[5].ar = 2;
  c.bonuses.hp = 11;
  c.bonuses.accuracy = -1;
  c.bonuses.guard = -8;
  c.bonuses.speed = 1;
  c.inventory = [{ id: '1', name: 'Ferramentas', slots: 0.5, notes: '2 usos' }];
  const { values } = buildExportData(c);
  assert.deepEqual([
    values.hp_current, values.hp_total, values.recovery_current, values.recovery_total,
    values.endurance_current, values.endurance_total, values.focus_current, values.resolve_current,
  ], ['3', '60', '2', '9', '1', '11', '19', '2']);
  assert.deepEqual([
    values.skill_bonus, values.skill_die, values.explore, values.encounter, values.initiative,
    values.accuracy, values.guard, values.resist, values.prevail, values.tenacity,
    values.speed_base, values.speed_bonus, values.armor_total, values.inventory_total, values.inventory_used,
    values.xp_current, values.xp_next,
  ], ['+4', 'd10', '+7', '+8', '+8', '+4', '-2', '+5', '+7', '+3', '6', '2', '6', '7', '0.5', '17', '70']);
  assert.equal(values.skill_stealth, true);
  assert.equal(values.skill_magic, false);
  assert.equal(values.bonus_guard, '-8');
});

test('level zero follows unavailable UI resources without discarding stored JSON values', () => {
  const c = createCharacter();
  c.level = 0;
  c.attributes = { might: 2, agility: 3, intellect: 5, spirit: 4 };
  c.keyAttribute = 'intellect';
  c.resources.resolve = 3;
  const data = buildExportData(c);
  for (const key of ['endurance_current', 'endurance_total', 'recovery_current', 'recovery_total', 'focus_current', 'resolve_current']) {
    assert.equal(data.values[key], '0', key);
  }
  assert.equal(data.values.hp_current, '10');
  assert.equal(data.values.hp_total, '7');
  assert.equal(data.values.accuracy, '+5');
  assert.equal(data.values.xp_next, '—');
  assert.equal(data.keyAttribute, null);
  assert.equal(data.character.keyAttribute, 'intellect');
  assert.equal(data.character.resources.resolve, 3);
  c.level = 9;
  assert.equal(buildExportData(c).values.xp_next, '—');
});

test('all user values and overflow records survive intact in a separate normalized snapshot', () => {
  const c = createCharacter('Conceição');
  const longText = 'Ação, coração e determinação.\n'.repeat(100);
  c.player = 'Ícaro'; c.motto = 'Uma promessa.'; c.lineage = 'Humana';
  c.pastLife = 'Cartógrafa'; c.calling = 'Magus'; c.crafts = 'Alquimia';
  c.plights = longText; c.features = longText; c.notes = longText; c.coins = '25 cp, 2 sp';
  c.alignments = [{ name: 'Compaixão', affirm: 2, deny: 1 }, { name: 'Ambição', affirm: 0, deny: 3 }];
  c.injuries[2] = { name: 'Braço ferido', clock: 100 };
  c.weapons[1] = { name: 'Cajado', damage: '2d6', range: 'Alcance 2', properties: longText };
  c.armor[1] = { slot: 'body', name: 'Cota', weight: 'H', ar: 3, die: 'd8', properties: longText, spent: true };
  c.magicItems[2] = { slot: 'talisman', name: 'Talismã de São João', effect: longText };
  c.states.burning = 4; c.states.customCurse = 7;
  c.deeds = Array.from({ length: 8 }, (_, index) => ({ id: `deed${index}`, name: `Feito ${index}`, kind: 'mighty', cost: 4, focus: 2, description: longText }));
  c.inventory = Array.from({ length: 12 }, (_, index) => ({ id: `item${index}`, name: `Item ${index}`, slots: 0.5, notes: longText }));
  const original = JSON.stringify(c);
  const data = buildExportData(c);
  assert.deepEqual(data.character, normalizeCharacter(c));
  assert.equal(JSON.stringify(c), original);
  assert.notEqual(data.character, c);
  assert.notEqual(data.character.deeds[0], c.deeds[0]);
  assert.equal(data.values.plights, longText);
  assert.equal(data.values.features, longText);
  assert.equal(data.values.notes, longText);
  assert.equal(data.values.weapon_off_properties, longText);
  assert.equal(data.values.armor_body_properties, longText);
  assert.equal(data.values.armor_body_spent, true);
  assert.equal(data.values.armor_head_spent, false);
  assert.equal(data.values.magic_talisman_effect, longText);
  assert.equal(data.values.injury_clock_3, '100');
  assert.equal(data.values.state_burning, '4');
  assert.equal(data.values.state_frail, '0');
  assert.equal(data.character.states.customCurse, 7);
  assert.equal(data.values.deed_6_kind, 'Poderoso / Mighty');
  assert.equal(data.values.deed_6_effect, longText);
  assert.equal(data.values.inventory_10_notes, longText);
  assert.deepEqual(data.deedsOverflow, c.deeds.slice(6));
  assert.deepEqual(data.inventoryOverflow, c.inventory.slice(10));
  assert.deepEqual([
    data.values.alignment_1_affirm_1, data.values.alignment_1_affirm_2, data.values.alignment_1_affirm_3,
    data.values.alignment_1_deny_1, data.values.alignment_1_deny_2, data.values.alignment_2_deny_3,
  ], [true, true, false, true, false, true]);
  const jsonRoundtrip = normalizeCharacter(JSON.parse(JSON.stringify(data.character)));
  assert.deepEqual(jsonRoundtrip, data.character);
  assert.equal(derive(jsonRoundtrip).usedSlots, 6);
});

test('malformed records fail export validation rather than silently losing data', () => {
  assert.throws(() => buildExportData({ level: 10 }));
  assert.throws(() => buildExportData({ inventory: [{ slots: -1 }] }));
});

test('shared export snapshot includes the portrait framing and both selected/legacy plights', () => {
  const c=createCharacter('Imagem');
  c.portrait={dataUrl:portraitPng(),zoom:2,x:0,y:100};
  c.plightSelections=['sickly']; c.plights='Condição própria';
  const data=buildExportData(c);
  assert.deepEqual(JSON.parse(JSON.stringify(data.character)).portrait,c.portrait);
  assert.deepEqual(data.character.plightSelections,['sickly']);
  assert.equal(data.values.plights,'Enfermiço / Sickly\nCondição própria');
});

test('download filenames retain accents while excluding Windows reserved names and unsafe paths', () => {
  assert.equal(fileStem({ name: '  João Caçador  ' }), 'João Caçador');
  assert.equal(fileStem({ name: '../Ficha: "v2"\\a?*|<>\u0000' }), '..-Ficha- -v2--a------');
  assert.equal(fileStem({ name: 'CON' }), 'trespasser-CON');
  assert.equal(fileStem({ name: 'Lpt9.txt' }), 'trespasser-Lpt9.txt');
  assert.equal(fileStem({ name: ' .  ' }), 'trespasser-personagem');
  assert.equal(fileStem({ name: '' }), 'trespasser-personagem');
  assert.equal(fileStem(), 'trespasser-personagem');
  assert.equal(Array.from(fileStem({ name: '😀'.repeat(81) })).length, 80);
  assert.ok(!fileStem({ name: 'A'.repeat(79) + ' .' }).endsWith(' '));
});
