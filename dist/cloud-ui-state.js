import { createCharacter, normalizeCharacter } from './model.js';

const content = character => {
  const { id, ...data } = normalizeCharacter(character);
  return JSON.stringify(data);
};
const pristine = content(createCharacter());

export const isPristineCharacter = character => content(character) === pristine;

export function localMigrationCandidates(localRecords, accountRecords, migratedIds = []) {
  const migrated = new Set(migratedIds);
  return localRecords.filter(character => !migrated.has(character.id)
    && !isPristineCharacter(character)
    && !accountRecords.some(saved => saved.id === character.id && content(saved) === content(character)));
}

// A collision creates a new sheet. Existing account data is never overwritten.
export function mergeLocalCharacters(accountRecords, localRecords, migratedIds = [], makeId = () => crypto.randomUUID()) {
  const records = structuredClone(accountRecords);
  const used = new Set(records.map(character => character.id));
  const candidates = localMigrationCandidates(localRecords, accountRecords, migratedIds);
  let activeId = records[0]?.id ?? null;
  for (const original of candidates) {
    const copy = normalizeCharacter(original);
    while (used.has(copy.id)) copy.id = makeId();
    used.add(copy.id);
    records.push(copy);
    activeId = copy.id;
  }
  return { records, activeId, migratedIds: candidates.map(character => character.id) };
}
