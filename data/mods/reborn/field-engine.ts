/** Reborn field adapter. Source: official 19.5 patch, normal difficulty. */
import type {Battle} from '../../../sim/battle';
import type {Pokemon} from '../../../sim/pokemon';
import type {Side} from '../../../sim/side';
import {chessPieceLabel} from './chess';
import {swallowWastelandHazard} from './wasteland';
import {FIELD_DATA} from './field-data';
import {genericSeed} from './field-generic';
import {Field} from '../../../sim/field';

// Route every native creator (Surge, Seed Sower, Max moves, etc.) through Reborn.
export const rebornFieldScripts: NonNullable<ModdedBattleScriptsData['field']> = {
 setWeather(status, source = null, sourceEffect = null) {
  if (status && ['underwater', 'newworld'].includes(fieldId(this.battle))) return false;
  const previous = this.weather;
  const result = Field.prototype.setWeather.call(this, status, source, sourceEffect);
  const current = this.weather;
  const field = fieldId(this.battle);
  if (result && ((field === 'desert' && ['sunnyday', 'sandstorm'].includes(current)) ||
   (field === 'ashenbeach' && current === 'sandstorm') ||
   (['mountain', 'snowymountain'].includes(field) && current === 'sunnyday') ||
   (['icy', 'snowymountain'].includes(field) && ['hail', 'snowscape'].includes(current)))) {
   this.weatherState.duration = 8;
   this.battle.add('rebornweatherduration', current, 8);
  }
  const sun = ['sunnyday', 'desolateland'];
  const rain = ['raindance', 'primordialsea'];
  if (result && ((sun.includes(previous) && rain.includes(current)) ||
   (rain.includes(previous) && sun.includes(current)))) {
   startTimedField(this.battle, 'rainbow', this.weatherState.source, this.weatherState.duration || 0, false, true, current);
  }
  return result;
 },
 setTerrain(status, source = null, sourceEffect = null) {
  if (['underwater', 'newworld'].includes(fieldId(this.battle))) return false;
  const id = this.battle.dex.conditions.get(status).id;
  if (!['grassyterrain', 'electricterrain', 'mistyterrain', 'psychicterrain'].includes(id) || !this.pseudoWeather.rebornfieldstate) {
   return Field.prototype.setTerrain.call(this, status, source, sourceEffect);
  }
  sourceEffect ||= this.battle.effect;
  source ||= this.battle.event?.target;
  if (source === 'debug') source = this.battle.sides[0].active[0];
  if (!source) throw new Error('setting terrain without a source');
  const field = id === 'psychicterrain' ? 'psyterrain' : id === 'grassyterrain' ? 'grassy' : id === 'mistyterrain' ? 'misty' : 'electerrain';
  if (fieldId(this.battle) === field) return false;
  if (sourceEffect?.effectType === 'Ability') this.battle.add('-ability', source, sourceEffect.name, '[then]');
  return startTimedField(this.battle, field, source, 5, sourceEffect?.id !== 'genesissupernova');
 },
};
export const FIELDS: Record<string, string> = Object.fromEntries(Object.entries(FIELD_DATA).map(([id, data]) => [id, data.name]));
export function fieldId(battle: Battle): string {
	// Temporary terrains suspend the underlying Reborn field without erasing it.
	if (battle.field.terrain) return 'none';
	return battle.field.pseudoWeather.rebornfieldstate?.fieldId || 'none';
}
export function flowerGardenStage(id: string | undefined): number {
 return id?.startsWith('flowergarden') ? Number(id.slice('flowergarden'.length)) || 0 : 0;
}

export function growFlowerGarden(b: Battle) {
 const stage = flowerGardenStage(fieldId(b));
 if (!stage || stage === 5) return;
 b.add('message', 'The garden grew a little!');
 setField(b, 'flowergarden' + (stage + 1));
}

const GARDEN_SPREAD_MOVES = new Set([
 'petalblizzard', 'petaldance', 'poisonpowder', 'powder', 'sleeppowder', 'spore', 'stunspore',
]);

export function gardenSpreadMove(b: Battle, move: string) {
 return ['doubles', 'multi'].includes(b.gameType) && fieldId(b) === 'flowergarden5' && GARDEN_SPREAD_MOVES.has(move);
}

export function gardenMoveRequests(b: Battle, moves: ReturnType<Pokemon['getMoves']>) {
 for (const move of moves) if (move.target && gardenSpreadMove(b, move.id)) move.target = 'allAdjacentFoes';
 return moves;
}

const CRYSTAL_TYPES = ['Fire', 'Water', 'Grass', 'Psychic'] as const;

export function crystalType(battle: Battle, advance = false) {
 const state = battle.field.pseudoWeather.rebornfieldstate;
 const index = state.crystalIndex ?? 0;
 if (advance) {
  state.crystalIndex = (index + 1) % CRYSTAL_TYPES.length;
  battle.add('reborncrystaltype', CRYSTAL_TYPES[state.crystalIndex]);
 }
 return CRYSTAL_TYPES[index];
}

const NEW_WORLD_TYPES = [
 'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const;

export function rollNewWorldForm(battle: Battle, pokemon: Pokemon) {
 if (!pokemon.hp || pokemon.transformed) return;
 const species = pokemon.baseSpecies.baseSpecies;
 if (!(species === 'Arceus' && pokemon.hasAbility('multitype')) &&
  !(species === 'Silvally' && pokemon.hasAbility('rkssystem'))) return;
 const type = battle.sample(NEW_WORLD_TYPES);
 const forme = battle.dex.species.get(type === 'Normal' ? species : species + '-' + type);
 if (!pokemon.volatiles.rebornnewworldforme) pokemon.addVolatile('rebornnewworldforme');
 if (pokemon.species.id !== forme.id) pokemon.formeChange(forme, pokemon.getAbility());
}

export function camouflageType(battle: Battle, move?: ActiveMove & {rebornCamouflageType?: string}) {
 const id = fieldId(battle);
 if (id === 'crystalcavern') return crystalType(battle);
 if (id === 'newworld') {
  if (!move) return battle.sample(NEW_WORLD_TYPES);
  return move.rebornCamouflageType ??= battle.sample(NEW_WORLD_TYPES);
 }
 const nativeTerrainTypes: Record<string, string> = {
  electricterrain: 'ELECTRIC', grassyterrain: 'GRASS', mistyterrain: 'FAIRY', psychicterrain: 'PSYCHIC',
 };
 const type = id === 'none' ? nativeTerrainTypes[battle.field.terrain] :
  FIELD_DATA[id]?.mimicry;
 return type === 'QMARKS' ? '???' : battle.dex.types.get(type || 'NORMAL').name;
}

export function sinkWaterSpikes(battle: Battle, side: Side): boolean {
	let removed = false;
	for (const hazard of ['spikes', 'toxicspikes']) {
		if (!side.removeSideCondition(hazard)) continue;
		battle.add('-sideend', side, 'move: ' + battle.dex.moves.get(hazard).name, '[silent]');
		removed = true;
	}
	return removed;
}

export function setField(battle: Battle, id: keyof typeof FIELDS, keepBackup = false, visualMode = 'permanent', counter = 0) {
	const state = battle.field.pseudoWeather.rebornfieldstate;
	if (!state || state.fieldId === id) return;
	const previous = state.fieldId;
	if (previous === 'chess') {
		for (const pokemon of battle.getAllActive()) chessPieceLabel(battle, pokemon, false);
	}
	const stage = flowerGardenStage(previous);
	if (!stage || !flowerGardenStage(id)) {
		state.backup = stage && (id === 'burning' || keepBackup) ? 'flowergarden1' :
			keepBackup ? (previous || 'none') : 'none';
	}
	state.counter = counter;
	state.fieldId = id;
	delete state.wastelandHazards;
	delete state.fieldPledge;
	delete state.conversion;
	delete state.mountainHailTurns;
	delete state.starlightGravity;
	state.cooling = 0;
	state.collapse = 0;
	state.darkCrystalSunlit = false;
	// Internal state event: the client updates scenery without a technical chat message.
	battle.add('rebornfield', FIELDS[id], visualMode, counter);
	if (['underwater', 'newworld'].includes(id)) battle.field.clearWeather();
	if (['watersurface', 'murkwatersurface'].includes(id)) {
		let spikesSank = false;
		for (const side of battle.sides) {
			if (sinkWaterSpikes(battle, side)) spikesSank = true;
		}
		if (spikesSank) battle.add('message', '...The spikes sank into the water and vanished!');
	}
	if (id === 'wasteland') {
		for (const side of battle.sides) {
			for (const condition of Object.values(side.sideConditions)) {
				swallowWastelandHazard(battle, side, condition.id, condition.source);
			}
		}
	}
	if (id === 'chess') {
		for (const pokemon of battle.getAllActive()) chessPieceLabel(battle, pokemon, true);
	}
	battle.eachEvent('Update');
}
/** Sunlight is a reversible field change, unlike moves that break the crystals. */
export function updateDarkCrystalSunlight(battle: Battle) {
 const current = fieldId(battle);
 const state = battle.field.pseudoWeather.rebornfieldstate;
 const sunny = battle.field.isWeather(['sunnyday', 'desolateland']);
 if (sunny && current === 'darkcrystalcavern') {
  battle.add('message', 'The sun lit up the crystal cavern!');
  setField(battle, 'crystalcavern', true);
  state.darkCrystalSunlit = true;
 } else if (!sunny && current === 'crystalcavern' && state.darkCrystalSunlit) {
  battle.add('message', 'Darkness is gathering...');
  setField(battle, 'darkcrystalcavern');
 }
}
export function seed(battle: Battle, pokemon: Pokemon) {
	if (!pokemon.hp || !pokemon.isActive || !pokemon.hasItem('genesisseed')) return;
	// A standard terrain takes priority for the seed while it is active.
	const terrain = battle.field.terrain;
	const terrainStat = ['electricterrain', 'grassyterrain'].includes(terrain) ? 'def' :
		['mistyterrain', 'psychicterrain'].includes(terrain) ? 'spd' : null;
	if (terrainStat) {
		if (pokemon.useItem()) battle.boost({[terrainStat]: 1}, pokemon, pokemon, battle.dex.items.get('genesisseed'));
		return;
	}
	const id = fieldId(battle);
	if (id !== 'dragonsden' && id !== 'cave') { genericSeed(battle, pokemon, id); return; }
	if (!pokemon.useItem()) return;
	if (id === 'dragonsden') {
		battle.boost({spa: 1}, pokemon, pokemon, battle.dex.items.get('genesisseed'));
		pokemon.addVolatile('genesisfire');
	} else {
		battle.boost({def: 2}, pokemon, pokemon, battle.dex.items.get('genesisseed'));
		// Reborn Cave's seed uses doubled Stealth Rock damage, even on airborne users.
		if (!pokemon.hasAbility('magicguard')) {
			battle.damage(pokemon.baseMaxhp * Math.pow(2, battle.dex.getEffectiveness('Rock', pokemon)) / 4,
				pokemon, pokemon, battle.dex.items.get('genesisseed'));
		}
	}
}

/** Temporary Reborn fields replace the active scenery and restore its previous state. */
export function startTimedField(b: Battle, id: string, source: Pokemon, turns: number, extendable = true, refresh = false, weather?: ID) {
 const current = fieldId(b);
 if (['underwater', 'newworld'].includes(current)) return false;
 const sameField = current === id;
 if (sameField && !refresh) return false;
 const state = b.field.pseudoWeather.rebornfieldstate;
 if (!state) return false;
 const oldTimer = b.field.pseudoWeather.rebornfieldduration;
 const restore = oldTimer?.restore || Object.fromEntries(
  ['fieldId', 'backup', 'counter', 'cooling', 'collapse', 'darkCrystalSunlit', 'starlightGravity'].map(key => [key, state[key]]));
 if (sameField && !oldTimer) restore.fieldId = state.backup || 'none';
 if (flowerGardenStage(restore.fieldId)) restore.fieldId = 'flowergarden1';
 b.add('rebornfieldtransaction', 'begin');
 if (oldTimer) { oldTimer.replacing = true; b.field.removePseudoWeather('rebornfieldduration'); }
 if (b.field.terrain) b.field.clearTerrain();
 b.field.addPseudoWeather('rebornfieldduration', source);
 const timer = b.field.pseudoWeather.rebornfieldduration;
 timer.duration = extendable && source.hasItem('terrainextender') && ['electerrain', 'grassy', 'misty', 'psyterrain'].includes(id) ? 8 : turns + (extendable && source.hasItem('amplifieldrock') ? 3 : 0);
 timer.restore = restore;
 timer.rebornWeather = weather;
 timer.initialDuration = timer.duration;
 timer.minDuration = turns;
 timer.maxDuration = extendable ? (b.gen >= 9 && ['electerrain', 'grassy', 'misty', 'psyterrain'].includes(id) ? 8 : turns + 3) : 0;
 const creationMessages: Record<string, string> = {electerrain: 'The terrain became electrified!', grassy: 'The terrain became grassy!', misty: 'The terrain became misty!', psyterrain: 'The terrain became misterious!'};
 const messages = creationMessages[id] ? [creationMessages[id]] : FIELD_DATA[id].fieldMessage;
 // Announce creation before setField triggers Update and consumes seeds.
 for (const msg of messages) if (!sameField && msg) b.add('message', msg);
 setField(b, id, true, 'temporary');
 if (turns > 0) b.add('rebornfieldtimer', 'start', FIELDS[id], turns, timer.maxDuration);
 b.add('rebornfieldtransaction', 'end');
 return true;
}
export function fieldPledgeAfterMove(b: Battle, source: Pokemon, move: ActiveMove) {
 if (!['firepledge', 'grasspledge', 'waterpledge'].includes(move.id) || !move.totalDamage) return false;
 const state = b.field.pseudoWeather.rebornfieldstate;
 const current = fieldId(b);
 const pairs = [
  {field: 'burning', moves: ['grasspledge', 'firepledge']},
  {field: 'swamp', moves: ['grasspledge', 'waterpledge']},
  {field: 'rainbow', moves: ['firepledge', 'waterpledge']},
 ];
 const refresh = pairs.find(pair => current === pair.field && pair.moves.includes(move.id));
 const combo = refresh || pairs.find(pair => pair.moves.includes(move.id) &&
  [move.sourceEffect, state.fieldPledge].some(id => id && id !== move.id && pair.moves.includes(id)));
 if (combo) {
  delete state.fieldPledge;
  return startTimedField(b, combo.field, source, 4, true, true);
 }
 state.fieldPledge = move.id;
 return false;
}

export function endTimedRebornField(b: Battle) {
 if (b.field.pseudoWeather.rebornfieldduration) b.field.removePseudoWeather('rebornfieldduration');
 else {
  const backup = b.field.pseudoWeather.rebornfieldstate?.backup;
  const gardenReturns = fieldId(b) === 'burning' && backup === 'flowergarden1';
  setField(b, gardenReturns ? 'flowergarden1' : 'none', false, gardenReturns ? 'restore' : 'permanent');
 }
}

export function fieldCreationAfterMove(b: Battle, source: Pokemon, move: ActiveMove) {
 if (move.id === 'bloomdoom' && move.totalDamage) {
  const current = fieldId(b);
  if (current !== 'forest' && !current.startsWith('flowergarden')) startTimedField(b, 'grassy', source, 3, false);
  return;
 }
 if (['plasmafists', 'stokedsparksurfer'].includes(move.id) && move.totalDamage) {
  startTimedField(b, 'electerrain', source, 3, move.id !== 'stokedsparksurfer'); return;
 }
 if (move.id === 'iondeluge' && source.moveThisTurnResult) {
  if (fieldId(b) !== 'shortcircuit') startTimedField(b, 'electerrain', source, 3);
  return;
 }
 if (move.category !== 'Status' || !source.moveThisTurnResult) return;
 if (!['conversion', 'conversion2'].includes(move.id)) return;
 const state = b.field.pseudoWeather.rebornfieldstate;
 if (source.item === 'everstone') {
  delete state.conversion;
  return;
 }
 const n = move.id === 'conversion' ? 1 : 2;
 if (state.conversion && state.conversion !== n) {
  delete state.conversion;
  startTimedField(b, 'glitch', source, 5, true, true);
 } else {
  state.conversion = n;
  b.add('message', 'Some rogue data remains...');
 }
}
