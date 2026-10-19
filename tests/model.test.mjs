import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, derive, normalizeCharacter, rollDice } from '../dist/model.js';

test('advancement follows every level of the official table', () => {
  const c = createCharacter();
  c.attributes.might = 2;
  const skills = [2, 2, 2, 3, 3, 3, 4, 4, 4, 5];
  const dice = ['d6', 'd6', 'd6', 'd8', 'd8', 'd8', 'd10', 'd10', 'd10', 'd12'];
  for (let level = 0; level <= 9; level++) {
    c.level = level;
    const d = derive(c);
    assert.equal(d.skill, skills[level]);
    assert.equal(d.skillDie, dice[level]);
    assert.equal(d.hpMax, 7 * (level + 1));
    assert.equal(d.nextXp, level === 0 || level === 9 ? null : 10 * (level + 1));
  }
});

test('Might retroactively changes HP; current resources are never refilled', () => {
  const c = createCharacter();
  c.level = 5;
  c.resources.hp = 3;
  c.attributes.might = 2;
  c.bonuses.hp = 10;
  assert.equal(derive(c).hpMax, 52);
  c.attributes.might = 3;
  assert.equal(derive(c).hpMax, 58);
  assert.equal(c.resources.hp, 3);
});

test('armor threshold changes guard and speed, including a shield', () => {
  const c = createCharacter();
  c.attributes.agility = 5;
  c.armor[0].ar = 3;
  c.armor[5].ar = 2;
  assert.equal(derive(c).guard, 10);
  assert.equal(derive(c).speedBonus, 5);
  c.armor[1].ar = 1;
  c.armor[0].weight = 'H';
  c.armor[5].weight = 'H';
  assert.equal(derive(c).guard, 6);
  assert.equal(derive(c).speedBonus, 2);
  assert.equal(derive(c).heavyArmor, 1);
  c.bonuses.guard = 2;
  assert.equal(derive(c).guard, 8);
});

test('commoners use Might/Agility for accuracy and have no daily resources', () => {
  const c = createCharacter();
  c.level = 0;
  c.attributes = { might: 2, agility: 3, intellect: 5, spirit: 4 };
  c.keyAttribute = 'intellect';
  const d = derive(c);
  assert.equal(d.accuracy, 5);
  assert.equal(d.hpMax, 7);
  assert.equal(d.enduranceMax, 0);
  assert.equal(d.recoveryMax, 0);
  assert.equal(d.focusStart, 0);
  assert.equal(d.commoner, true);
});

test('daily recovery pool remains a snapshot when endurance decreases', () => {
  const c = createCharacter();
  c.attributes.spirit = 3;
  c.resources.endurance = 2;
  c.resources.recoveryTotal = 12;
  c.resources.recovery = 9;
  assert.equal(derive(c).enduranceMax, 13);
  assert.equal(derive(c).recoveryMax, 12);
  assert.equal(derive(c).focusMax, null);
  assert.equal(c.resources.recovery, 9);
});

test('key attribute, trained skills, explicit bonuses and inventory calculate independently', () => {
  const c = createCharacter();
  c.level = 3;
  c.attributes = { might: 2, agility: 4, intellect: 3, spirit: 1 };
  c.keyAttribute = 'spirit';
  c.trained = ['perception'];
  c.bonuses.accuracy = -1;
  c.inventory = [{ id: 'a', name: 'Pack', slots: 2, notes: '' }, { id: 'b', name: 'Small item', slots: 0.5, notes: '' }];
  const d = derive(c);
  assert.equal(d.accuracy, 3);
  assert.equal(d.explore, 6);
  assert.equal(d.encounter, 4);
  assert.equal(d.slots, 7);
  assert.equal(d.usedSlots, 2.5);
  assert.equal(d.initiative, 7);
  assert.equal(d.resist, 4);
  assert.equal(d.prevail, 6);
  assert.equal(d.tenacity, 3);
});

test('save roundtrip preserves non-full resources and safely normalizes records', () => {
  const c = createCharacter('Aela');
  c.resources.hp = 1;
  c.resources.focus = 17;
  c.inventory.push({ id: 'item', name: '<script>Text only</script>', slots: 1, notes: '' });
  c.deeds.push({ id: 'deed', name: 'Custom', kind: 'mighty', cost: 4, focus: 3, description: '' });
  c.states.burning = 4;
  const restored = normalizeCharacter(JSON.parse(JSON.stringify(c)));
  assert.equal(restored.id, c.id);
  assert.equal(restored.resources.hp, 1);
  assert.equal(restored.resources.focus, 17);
  assert.equal(restored.deeds[0].focus, 3);
  assert.equal(restored.states.burning, 4);
  assert.equal(restored.inventory[0].name, '<script>Text only</script>');
});

test('malformed imports fail clearly and do not accept invalid rules values', () => {
  for (const data of [null, [], { level: 10 }, { attributes: { might: 6 } }, { resources: { resolve: 4 } }, { trained: ['arcana'] }, { states: { burning: 11 } }, { armor: [{ slot: 'head' }, { slot: 'head' }] }, { inventory: [{ slots: -1 }] }]) {
    assert.throws(() => normalizeCharacter(data));
  }
  const c = normalizeCharacter({ name: 'Commoner', level: 0 });
  assert.equal(c.resources.hp, 5);
  assert.equal(c.resources.endurance, 0);
  assert.equal(c.resources.recoveryTotal, 0);
});

test('dice parser respects signed modifiers and die bounds', () => {
  const fixed = rollDice('2d1 + 4 - d1');
  assert.deepEqual(fixed.rolls, [1, 1, -1]);
  assert.equal(fixed.total, 5);
  for (let index = 0; index < 100; index++) {
    const result = rollDice('1d20+3');
    assert.equal(result.rolls.length, 1);
    assert.ok(result.rolls[0] >= 1 && result.rolls[0] <= 20);
    assert.equal(result.total, result.rolls[0] + 3);
  }
  for (const expression of ['101d6', '0d6', '1d0', '1d1001', '1d6;alert(1)', '1d6++2', '', 'Infinity', '1d6 + 100001']) {
    assert.throws(() => rollDice(expression));
  }
});
