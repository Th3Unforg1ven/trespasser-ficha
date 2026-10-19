import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFTextField, PDFName } from '../dist/vendor/pdf-lib.js';
import { createCharacter } from '../dist/model.js';
import { createPdfExport } from '../dist/pdf-export.js';

const template = () => readFile(new URL('../dist/assets/trespasser-template.pdf', import.meta.url));
const text = (form, name) => form.getTextField(name).getText() ?? '';
const withoutSpaces = value => value.replace(/\s+/gu, '');

async function exportDocument(character) {
  const bytes = await createPdfExport(character, { templateBytes: await template() });
  assert.ok(bytes instanceof Uint8Array);
  return PDFDocument.load(bytes);
}

function realisticCharacter() {
  const c = createCharacter('João Caçador');
  c.player = 'Conceição';
  c.motto = 'Ação, coração e determinação.';
  c.features = 'Conhece o caminho de casa.\nLembra as histórias da floresta.';
  c.level = 3;
  c.xp = 17;
  c.attributes = { might: 2, agility: 4, intellect: 3, spirit: 1 };
  c.keyAttribute = 'spirit';
  c.trained = ['perception', 'stealth'];
  c.resources = { hp: 3, recovery: 2, recoveryTotal: 9, endurance: 1, focus: 0, resolve: 2 };
  c.bonuses.hp = 11;
  c.bonuses.accuracy = -1;
  c.bonuses.guard = -8;
  c.armor[0].ar = 4;
  c.armor[0].spent = true;
  c.armor[5].ar = 2;
  c.alignments[0] = { name: 'Compaixão', affirm: 2, deny: 1 };
  c.weapons[0] = { name: 'Espada de São João', damage: '2d6', range: 'Corpo a corpo 1', properties: 'Afiada' };
  c.magicItems[1] = { slot: 'ring', name: 'Anel da memória', effect: 'Proteção contra o esquecimento' };
  c.deeds = [{ id: 'deed1', name: 'Golpe certeiro', kind: 'heavy', cost: 2, focus: 0, description: 'Ação, alvo e efeito.' }];
  c.inventory = [{ id: 'item1', name: 'Ferramentas', slots: 0.5, notes: '2 usos' }];
  c.states.burning = 4;
  return c;
}

test('filled PDF carries realistic editable values, accents, radio and checkbox appearances', async () => {
  const c = realisticCharacter();
  const before = JSON.stringify(c);
  const pdf = await exportDocument(c);
  const form = pdf.getForm();
  assert.equal(pdf.getPageCount(), 4);
  assert.equal(form.getFields().length, 215);
  assert.equal(text(form, 'identity_name'), 'João Caçador');
  assert.equal(text(form, 'identity_player'), 'Conceição');
  assert.equal(text(form, 'identity_motto'), 'Ação, coração e determinação.');
  assert.equal(text(form, 'hp_current'), '3');
  assert.equal(text(form, 'hp_total'), '39');
  assert.equal(text(form, 'recovery_current'), '2');
  assert.equal(text(form, 'recovery_total'), '9');
  assert.equal(text(form, 'endurance_current'), '1');
  assert.equal(text(form, 'endurance_total'), '11');
  assert.equal(text(form, 'focus_current'), '0');
  assert.equal(text(form, 'resolve_current'), '2');
  assert.equal(text(form, 'skill_bonus'), '+3');
  assert.equal(text(form, 'skill_die'), 'd8');
  assert.equal(text(form, 'accuracy'), '+3');
  assert.equal(text(form, 'initiative'), '+7');
  assert.equal(text(form, 'guard'), '-2');
  assert.equal(text(form, 'explore'), '+6');
  assert.equal(text(form, 'inventory_used'), '0.5');
  assert.equal(text(form, 'inventory_total'), '7');
  assert.equal(text(form, 'xp_next'), '40');
  assert.equal(text(form, 'weapon_main_name'), 'Espada de São João');
  assert.equal(text(form, 'magic_ring_effect'), 'Proteção contra o esquecimento');
  const featureAppearance = form.getTextField('features').acroField.dict.get(PDFName.of('DA'));
  const featureFontSize = Number(featureAppearance.decodeText().match(/([\d.]+)\s+Tf/u)?.[1]);
  assert.ok(featureFontSize > 0 && featureFontSize <= 9,
    'octal-escaped decimal source sizes must not inflate multiline text');
  assert.equal(text(form, 'state_burning'), '4');
  assert.equal(text(form, 'state_frail'), '0');
  assert.equal(form.getRadioGroup('key_attribute').getSelected(), 'spirit');
  for (const [name, checked] of [
    ['skill_perception', true], ['skill_magic', false],
    ['armor_head_spent', true], ['armor_body_spent', false],
    ['alignment_1_affirm_1', true], ['alignment_1_affirm_2', true],
    ['alignment_1_affirm_3', false], ['alignment_1_deny_1', true], ['alignment_1_deny_2', false],
  ]) {
    assert.equal(form.getCheckBox(name).isChecked(), checked, name);
    const widget = form.getCheckBox(name).acroField.getWidgets()[0];
    assert.ok(widget.dict.has(PDFName.of('AP')), `${name} has a printable appearance`);
    assert.equal(widget.getAppearanceState()?.asString() !== '/Off', checked, name);
  }
  assert.equal(JSON.stringify(c), before, 'export never changes the current web character');
});

test('shared identity and resource fields remain one parent with widgets on every page', async () => {
  const pdf = await exportDocument(realisticCharacter());
  const form = pdf.getForm();
  for (const name of ['identity_name', 'hp_current', 'recovery_current', 'focus_current']) {
    const field = form.getTextField(name);
    const widgets = field.acroField.getWidgets();
    assert.equal(widgets.length, 4, `${name} retains four synchronized widgets`);
    const pageRefs = widgets.map(widget => widget.P()?.toString());
    assert.equal(new Set(pageRefs).size, 4, `${name} appears on all four distinct pages`);
    assert.ok(widgets.every(widget => widget.dict.has(PDFName.of('AP'))), `${name} widget appearances`);
  }
  assert.equal(form.getTextField('weapon_main_name').acroField.getWidgets().length, 2);
  const rootFields = pdf.catalog.lookup(PDFName.of('AcroForm')).lookup(PDFName.of('Fields'));
  assert.equal(rootFields.size(), 215, 'canonical AcroForm field tree is retained');
});

test('saved PDF can be edited and saved again without flattening fields', async () => {
  const pdf = await exportDocument(realisticCharacter());
  const form = pdf.getForm();
  form.getTextField('identity_name').setText('Ícaro da Conceição');
  form.getTextField('hp_current').setText('7');
  form.getCheckBox('armor_head_spent').uncheck();
  form.getRadioGroup('key_attribute').select('agility');
  const reopened = await PDFDocument.load(await pdf.save());
  const restored = reopened.getForm();
  assert.equal(restored.getFields().length, 215);
  assert.equal(text(restored, 'identity_name'), 'Ícaro da Conceição');
  assert.equal(text(restored, 'hp_current'), '7');
  assert.equal(restored.getTextField('hp_current').acroField.getWidgets().length, 4);
  assert.equal(restored.getCheckBox('armor_head_spent').isChecked(), false);
  assert.equal(restored.getRadioGroup('key_attribute').getSelected(), 'agility');
  assert.ok(restored.getFields().every(field => !field.isReadOnly()), 'all fields remain editable');
  assert.ok(reopened.getPages().every(page => (page.node.Annots()?.size() ?? 0) > 0), 'page widgets remain interactive');
});

test('level zero exports displayed unavailable resources as zero and clears key attribute', async () => {
  const c = realisticCharacter();
  c.level = 0;
  c.keyAttribute = 'intellect';
  c.resources.focus = 12;
  const pdf = await exportDocument(c);
  const form = pdf.getForm();
  for (const name of ['recovery_current', 'recovery_total', 'endurance_current', 'endurance_total', 'focus_current', 'resolve_current']) {
    assert.equal(text(form, name), '0', name);
  }
  assert.equal(text(form, 'hp_current'), '3');
  assert.equal(text(form, 'hp_total'), '18');
  assert.equal(text(form, 'accuracy'), '+5');
  assert.equal(form.getRadioGroup('key_attribute').getSelected(), undefined);
  assert.equal(c.resources.focus, 12);
});

test('long notes and extra deeds/inventory stay complete in editable appendix fields', async () => {
  const c = realisticCharacter();
  c.notes = ('Ação e memória ' + '0123456789'.repeat(9) + '\n').repeat(49) + 'FIM DAS ANOTAÇÕES';
  assert.ok(c.notes.length > 5000);
  c.deeds = Array.from({ length: 8 }, (_, index) => ({
    id: `deed${index}`, name: `Façanha adicional ${index + 1}`, kind: index % 2 ? 'mighty' : 'light',
    cost: index % 2 ? 4 : 0, focus: index, description: `Descrição integral ${index + 1}: ação, alvo e efeito únicos.`,
  }));
  c.inventory = Array.from({ length: 12 }, (_, index) => ({
    id: `item${index}`, name: `Provisão adicional ${index + 1}`, slots: 0.5,
    notes: `Nota integral ${index + 1}: quantidade, usos e memória.`,
  }));
  c.states.customCurse = 7;
  const before = JSON.stringify(c);
  const pdf = await exportDocument(c);
  const form = pdf.getForm();
  assert.ok(pdf.getPageCount() > 4, 'overflow adds readable pages');
  const appendixFields = form.getFields().filter(field => field.getName().startsWith('extra_'));
  assert.ok(appendixFields.length > 0, 'continuations remain form fields');
  assert.ok(appendixFields.every(field => !field.isReadOnly()));
  const textFields = form.getFields().filter(field => field instanceof PDFTextField);
  const allText = textFields.map(field => field.getText() ?? '').join('\n');
  assert.ok(withoutSpaces(allText).includes(withoutSpaces(c.notes)), 'all notes survive beyond the base field capacity');
  for (const deed of c.deeds.slice(6)) {
    assert.ok(allText.includes(deed.name), deed.name);
    assert.ok(allText.includes(deed.description), deed.description);
  }
  for (const item of c.inventory.slice(10)) {
    assert.ok(allText.includes(item.name), item.name);
    assert.ok(allText.includes(item.notes), item.notes);
  }
  assert.ok(allText.includes('customCurse'), 'custom imported states stay available in the PDF');
  assert.equal(JSON.stringify(c), before);
  const field = appendixFields.find(entry => entry instanceof PDFTextField);
  assert.ok(field);
  field.setText('Continuação revisada: João e Conceição.');
  const reopened = await PDFDocument.load(await pdf.save());
  assert.equal(text(reopened.getForm(), field.getName()), 'Continuação revisada: João e Conceição.');
});
