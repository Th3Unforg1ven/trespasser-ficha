import { ATTRS, SKILLS, derive, normalizeCharacter } from './model.js';

const BONUS_KEYS = ['hp', 'endurance', 'guard', 'accuracy', 'initiative', 'resist', 'prevail', 'tenacity', 'speed', 'focus'];
export const STANDARD_STATES = Object.freeze([
  'accurate', 'inaccurate', 'guarded', 'unguarded', 'fortified', 'frail',
  'hastened', 'hindered', 'mending', 'afflicted', 'strong', 'weak', 'swift',
  'slow', 'willful', 'weary', 'bleeding', 'blinded', 'burning', 'staggered', 'toppled',
]);
const DEED_KINDS = Object.freeze({
  light: 'Leve / Light', heavy: 'Pesado / Heavy',
  mighty: 'Poderoso / Mighty', special: 'Especial / Special',
});
const signed = value => value > 0 ? `+${value}` : String(value);

// One normalized copy feeds both downloadable files. The PDF uses a manual
// snapshot of the same calculated values shown by the web character record.
export function buildExportData(input) {
  const character = normalizeCharacter(input);
  const c = character;
  const d = derive(c);
  const values = {
    identity_name: c.name,
    identity_player: c.player,
    identity_motto: c.motto,
    hp_current: String(c.resources.hp),
    hp_total: String(d.hpMax),
    recovery_current: String(d.commoner ? 0 : c.resources.recovery),
    recovery_total: String(d.recoveryMax),
    endurance_current: String(d.commoner ? 0 : c.resources.endurance),
    endurance_total: String(d.enduranceMax),
    focus_current: String(d.commoner ? 0 : c.resources.focus),
    resolve_current: String(d.commoner ? 0 : c.resources.resolve),
    skill_bonus: signed(d.skill),
    skill_die: d.skillDie,
    explore: signed(d.explore),
    encounter: signed(d.encounter),
    plights: c.plights,
    features: c.features,
    level: String(c.level),
    xp_current: String(c.xp),
    xp_next: d.nextXp === null ? '—' : String(d.nextXp),
    lineage: c.lineage,
    past_life: c.pastLife,
    calling: c.calling,
    crafts: c.crafts,
    speed_base: String(d.speed),
    speed_bonus: String(d.speedBonus),
    armor_total: String(d.armor),
    coins: c.coins,
    inventory_used: String(d.usedSlots),
    inventory_total: String(d.slots),
    notes: c.notes,
  };

  for (const { key } of ATTRS) values[`attribute_${key}`] = String(c.attributes[key]);
  for (const { key } of SKILLS) values[`skill_${key}`] = c.trained.includes(key);
  for (const key of ['initiative', 'accuracy', 'guard', 'resist', 'prevail', 'tenacity']) {
    values[key] = signed(d[key]);
  }
  for (const key of BONUS_KEYS) values[`bonus_${key}`] = String(c.bonuses[key]);
  for (const key of STANDARD_STATES) values[`state_${key}`] = String(c.states[key] ?? 0);

  c.injuries.forEach((injury, index) => {
    values[`injury_${index + 1}`] = injury.name;
    values[`injury_clock_${index + 1}`] = String(injury.clock);
  });
  c.alignments.forEach((alignment, index) => {
    const prefix = `alignment_${index + 1}`;
    values[prefix] = alignment.name;
    for (const side of ['affirm', 'deny']) {
      for (let tick = 1; tick <= 3; tick++) values[`${prefix}_${side}_${tick}`] = alignment[side] >= tick;
    }
  });
  c.weapons.forEach((weapon, index) => {
    const hand = index === 0 ? 'main' : 'off';
    for (const key of ['name', 'damage', 'range', 'properties']) values[`weapon_${hand}_${key}`] = weapon[key];
  });
  c.armor.forEach(armor => {
    for (const key of ['name', 'weight', 'die', 'properties', 'spent']) values[`armor_${armor.slot}_${key}`] = armor[key];
    values[`armor_${armor.slot}_ar`] = String(armor.ar);
  });
  c.magicItems.forEach(item => {
    for (const key of ['name', 'effect']) values[`magic_${item.slot}_${key}`] = item[key];
  });

  for (let index = 0; index < 6; index++) {
    const deed = c.deeds[index];
    const prefix = `deed_${index + 1}`;
    values[`${prefix}_name`] = deed?.name ?? '';
    values[`${prefix}_kind`] = deed ? DEED_KINDS[deed.kind] : '';
    values[`${prefix}_cost`] = deed ? String(deed.cost) : '';
    values[`${prefix}_focus`] = deed ? String(deed.focus) : '';
    values[`${prefix}_effect`] = deed?.description ?? '';
  }
  for (let index = 0; index < 10; index++) {
    const item = c.inventory[index];
    const prefix = `inventory_${index + 1}`;
    values[`${prefix}_name`] = item?.name ?? '';
    values[`${prefix}_slots`] = item ? String(item.slots) : '';
    values[`${prefix}_notes`] = item?.notes ?? '';
  }

  return {
    character,
    values,
    keyAttribute: d.commoner ? null : c.keyAttribute,
    deedsOverflow: c.deeds.slice(6),
    inventoryOverflow: c.inventory.slice(10),
  };
}

export function fileStem(character) {
  let stem = String(character?.name ?? '').normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/gu, ' ').trim();
  // Windows also reserves these names when followed by an extension.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `trespasser-${stem}`;
  stem = Array.from(stem).slice(0, 80).join('').replace(/[. ]+$/u, '');
  return stem || 'trespasser-personagem';
}
