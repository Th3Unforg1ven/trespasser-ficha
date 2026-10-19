import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from '../dist/vendor/pdf-lib.js';
import '../dist/vendor/jszip.js';
import { createCharacter, normalizeCharacter } from '../dist/model.js';
import { prepareExport } from '../dist/export-bundle.js';

const template = () => readFile(new URL('../dist/assets/trespasser-template.pdf', import.meta.url));

function completeCharacter() {
  const c = createCharacter('João Caçador');
  c.id = 'qa-personagem-joao';
  Object.assign(c, {
    player: 'Conceição', motto: 'Ação, coração e determinação.', lineage: 'Humano',
    pastLife: 'Guarda de caravana', calling: 'Warden', crafts: 'Cartografia e marcenaria',
    level: 4, xp: 23, keyAttribute: 'spirit', trained: ['athletics', 'nature', 'perception'],
    plights: 'Exaustão após atravessar o pântano.',
    features: 'Fortitude: +10 PV (registrado nos ajustes).\nConhece os caminhos e as antigas histórias da floresta.',
    notes: 'Dia 3: encontrei Ícaro na ponte.\nPrometi devolver o anel à aldeia de São João.',
    coins: '25 cp, 2 sp, 1 gp',
    attributes: { might: 2, agility: 4, intellect: 1, spirit: 3 },
    resources: { hp: 17, recovery: 3, recoveryTotal: 8, endurance: 6, focus: 0, resolve: 2 },
    bonuses: { hp: 10, endurance: 2, guard: 1, accuracy: -1, initiative: 1, resist: 0, prevail: 2, tenacity: 1, speed: 1, focus: 2 },
    alignments: [{ name: 'Proteger os esquecidos', affirm: 2, deny: 1 }, { name: 'Manter a palavra', affirm: 1, deny: 0 }],
    injuries: [{ name: 'Ombro ferido', clock: 3 }, { name: 'Cicatriz na perna', clock: 1 }, { name: '', clock: 0 }],
    weapons: [
      { name: 'Lança de freixo', damage: '2d6', range: 'Corpo a corpo 2', properties: 'Alcance e haste reforçada' },
      { name: 'Arco curto', damage: '1d8', range: 'À distância 10', properties: 'Duas mãos' },
    ],
    magicItems: [
      { slot: 'amulet', name: 'Amuleto de musgo', effect: 'Lembra o caminho de casa.' },
      { slot: 'ring', name: 'Anel de Conceição', effect: 'Proteção contra o esquecimento.' },
      { slot: 'talisman', name: 'Talismã da aurora', effect: 'Brilha à luz da manhã.' },
    ],
    deeds: [
      { id: 'feito1', name: 'Passo da floresta', kind: 'light', cost: 0, focus: 0, description: 'Movimento: atravessar terreno difícil sem perder o rumo.' },
      { id: 'feito2', name: 'Golpe certeiro', kind: 'heavy', cost: 2, focus: 1, description: 'Ação: atacar o alvo com a lança. Registre o acerto e o efeito na mesa.' },
      { id: 'feito3', name: 'Última promessa', kind: 'mighty', cost: 4, focus: 2, description: 'Proteja um aliado adjacente e enfrente o perigo.' },
    ],
    inventory: [
      { id: 'item1', name: 'Rações de viagem', slots: 1, notes: 'Três dias de comida' },
      { id: 'item2', name: 'Corda', slots: 1, notes: '10 metros, duas marcas de uso' },
      { id: 'item3', name: 'Mapa da região', slots: 0.5, notes: 'Anotações de Ícaro' },
      { id: 'item4', name: 'Ferramentas', slots: 2, notes: 'Marcenaria; caixa de madeira' },
    ],
    states: { accurate: 1, bleeding: 2, burning: 0 },
  });
  const armor = [
    ['Elmo de ferro', 'H', 1, 'd6', 'Proteção da cabeça', false],
    ['Cota de malha', 'H', 2, 'd8', 'Malha reparada', true],
    ['Braçadeiras', 'L', 1, 'd6', 'Couro endurecido', false],
    ['Botas de viagem', 'L', 0, '', 'Sola reforçada', false],
    ['Capa de chuva', 'L', 0, '', 'Lã e cera', false],
    ['Escudo de carvalho', '', 2, 'd8', 'Marca da caravana', true],
  ];
  c.armor = c.armor.map((piece, index) => {
    const [name, weight, ar, die, properties, spent] = armor[index];
    return { slot: piece.slot, name, weight, ar, die, properties, spent };
  });
  return c;
}

test('one export ZIP contains the exact editable PDF and a complete importable JSON snapshot', async () => {
  const c = completeCharacter();
  const before = JSON.stringify(c);
  const result = await prepareExport(c, { templateBytes: await template() });
  assert.ok(result.pdf instanceof Uint8Array);
  assert.ok(result.zip instanceof Uint8Array);
  assert.equal(typeof result.json, 'string');
  assert.equal(result.stem, 'João Caçador');
  const archive = await globalThis.JSZip.loadAsync(result.zip);
  assert.deepEqual(Object.keys(archive.files).sort(), ['João Caçador.json', 'João Caçador.pdf']);
  const packedPdf = await archive.file('João Caçador.pdf').async('uint8array');
  const packedJson = await archive.file('João Caçador.json').async('string');
  assert.deepEqual(packedPdf, result.pdf);
  assert.equal(packedJson, result.json);
  const data = JSON.parse(packedJson);
  assert.deepEqual(Object.keys(data).sort(), ['character', 'format', 'rules', 'version']);
  assert.equal(data.format, 'trespasser-character');
  assert.equal(data.version, 1);
  assert.equal(data.rules, '2.1.3');
  assert.deepEqual(normalizeCharacter(data.character), normalizeCharacter(c));
  assert.deepEqual(normalizeCharacter(JSON.parse(JSON.stringify(data.character))), normalizeCharacter(c));
  assert.equal(JSON.stringify(c), before, 'export does not change any current character data');

  const pdf = await PDFDocument.load(packedPdf);
  const form = pdf.getForm();
  assert.equal(pdf.getPageCount(), 4);
  assert.equal(form.getFields().length, 215);
  assert.ok(form.getFields().every(field => !field.isReadOnly()));
  assert.equal(form.getTextField('identity_name').getText(), data.character.name);
  assert.equal(form.getTextField('identity_player').getText(), 'Conceição');
  assert.equal(form.getTextField('hp_current').getText(), '17');
  assert.equal(form.getTextField('hp_total').getText(), '45');
  assert.equal(form.getTextField('focus_current').getText(), '0');
  assert.equal(form.getTextField('inventory_used').getText(), '4.5');
  assert.equal(form.getTextField('notes').getText(), c.notes);
  assert.equal(form.getTextField('deed_2_focus').getText(), '1');
  assert.equal(form.getTextField('weapon_off_name').getText(), 'Arco curto');
  assert.equal(form.getRadioGroup('key_attribute').getSelected(), 'spirit');
  assert.equal(form.getCheckBox('armor_body_spent').isChecked(), true);
  assert.equal(form.getCheckBox('skill_nature').isChecked(), true);

  // Reproducible artifacts for independent pypdf and rendered-page QA.
  const output = new URL('../tmp/pdfs/', import.meta.url);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(new URL('web-export-qa.zip', output), result.zip),
    writeFile(new URL('web-export-qa.pdf', output), result.pdf),
    writeFile(new URL('web-export-qa.json', output), result.json),
  ]);
});

test('ZIP entry filenames are sanitized independently from the full character name', async () => {
  const c = createCharacter('CON');
  const result = await prepareExport(c, { templateBytes: await template() });
  const archive = await globalThis.JSZip.loadAsync(result.zip);
  assert.equal(result.stem, 'trespasser-CON');
  assert.deepEqual(Object.keys(archive.files).sort(), ['trespasser-CON.json', 'trespasser-CON.pdf']);
  assert.equal(JSON.parse(result.json).character.name, 'CON');
  const pdf = await PDFDocument.load(result.pdf);
  assert.equal(pdf.getForm().getTextField('identity_name').getText(), 'CON');
});
