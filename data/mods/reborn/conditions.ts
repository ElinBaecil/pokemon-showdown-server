import {FIELD_DATA} from './field-data';
import {releaseWastelandHazards, swallowWastelandHazard} from './wasteland';
import {chessSwitchIn} from './chess';
import {announceFieldMove, genericPower, genericModifyMove, genericAfterMove, seedConditions, prepareCorrosiveMistIgnition, igniteCorrosiveMist, applyIcySpeedBoost, applySuperheatedSteam, canIgniteField, prepareMirrorShatter} from './field-generic';
import {fieldId, setField, fieldCreationAfterMove, updateDarkCrystalSunlight, fieldPledgeAfterMove, endTimedRebornField, flowerGardenStage, growFlowerGarden, rollNewWorldForm, sinkWaterSpikes} from './field-engine';
import type {Pokemon} from '../../../sim/pokemon';

const GLITCH_SPECIAL_TYPES = new Set(['Grass', 'Fire', 'Water', 'Electric', 'Ice', 'Dragon', 'Psychic']);

const MIRROR_SINGLE_TARGETS = new Set(['normal', 'any', 'adjacentFoe', 'randomNormal', 'scripted']);
const mirrorScreens = new Set(['lightscreen', 'reflect', 'auroraveil']);

const FAIRY_TALE_STEEL_MOVES = new Set(['cut', 'sacredsword', 'secretsword', 'slash']);
const FAIRY_TALE_ENTRY_BOOSTS: Record<string, SparseBoostsTable> = {
 battlearmor: {def: 1}, shellarmor: {def: 1}, stancechange: {def: 1},
 magicbounce: {spd: 1}, magicguard: {spd: 1}, powerofalchemy: {def: 1, spd: 1},
 magician: {spa: 1},
};

const fieldMisses = new WeakSet<ActiveMove>();

function takesPoisonFieldDamage(pokemon: Pokemon) {
 return pokemon.isGrounded() && !pokemon.hasType(['Poison', 'Steel']) &&
  !pokemon.hasAbility(['immunity', 'magicguard', 'poisonheal', 'toxicboost', 'wonderguard']);
}

export const Conditions: import('../../../sim/dex-conditions').ModdedConditionDataTable = {
	...seedConditions,
 arceus: {
  inherit: true,
  onType(types, pokemon) {
   if (fieldId(this) === 'newworld' && pokemon.volatiles.rebornnewworldforme) return types;
   const native = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Conditions.arceus.onType;
   if (typeof native === 'function') return native.call(this, types, pokemon);
  },
 },
 rebornnewworldforme: {
  name: 'Reborn New World Forme', noCopy: true,
  onUpdate(pokemon) {
   if (fieldId(this) === 'newworld') return;
   pokemon.removeVolatile('rebornnewworldforme');
   if (!pokemon.transformed && pokemon.species.id !== pokemon.baseSpecies.id) pokemon.formeChange(pokemon.baseSpecies);
  },
 },
 silvally: {
  inherit: true,
  onType(types, pokemon) {
   if (pokemon.ability === 'rkssystem' && !pokemon.transformed) {
    if (fieldId(this) === 'newworld' && pokemon.volatiles.rebornnewworldforme) return types;
    if (pokemon.volatiles.rebornsilvallyglitch) return ['???'];
    if (pokemon.volatiles.rebornsilvallyholy) return ['Dark'];
   }
   if (pokemon.transformed || (pokemon.ability !== 'rkssystem' && this.gen >= 8)) return types;
   return [pokemon.ability === 'rkssystem' ? (pokemon.getItem().onMemory || 'Normal') : 'Normal'];
  },
 },
 rebornsilvallyglitch: {
  name: 'Reborn Silvally Glitch', noCopy: true,
  onStart(pokemon) {
   this.add('-start', pokemon, 'typechange', '???', '[from] ability: RKS System');
  },
  onUpdate(pokemon) {
   if (fieldId(this) === 'glitch') return;
   pokemon.removeVolatile('rebornsilvallyglitch');
   this.add('-start', pokemon, 'typechange', pokemon.getTypes().join('/'), '[silent]');
  },
 },
 rebornsilvallyholy: {
  name: 'Reborn Silvally Holy', noCopy: true,
  onStart(pokemon) {
   if (pokemon.species.id !== 'silvallydark' && !pokemon.formeChange('Silvally-Dark', pokemon.getAbility())) return false;
  },
  onUpdate(pokemon) {
   if (fieldId(this) === 'holy') return;
   pokemon.removeVolatile('rebornsilvallyholy');
   if (pokemon.species.id !== pokemon.baseSpecies.id) pokemon.formeChange(pokemon.baseSpecies, null);
  },
 },
 burningfield: {name: 'Burning Field'},
 corrosivefield: {name: 'Corrosive Field'},
 corrosivemistfield: {name: 'Corrosive Mist Field'},
 swampfield: {name: 'Swamp Field'},
 rainbowfield: {name: 'Rainbow Field'},
 rockyfield: {name: 'Rocky Field'},
 underwaterfield: {name: 'Underwater'},
 murkwatersurface: {name: 'Murkwater Surface'},
 wastelandfield: {name: 'Wasteland'},
 deltastream: {
  inherit: true,
  onFieldStart(field, source, effect) {
   if (effect?.id === 'tailwind') this.add('-weather', 'DeltaStream');
   else this.add('-weather', 'DeltaStream', '[from] ability: ' + effect.name, `[of] ${source}`);
  },
 },
 partiallytrapped: {inherit: true,
  onResidual(pokemon, source, effect) {
   const native = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Conditions.partiallytrapped;
   const trap = this.effectState;
   native.onResidual!.call(this, pokemon, source, effect);
   if (fieldId(this) === 'ashenbeach' && trap.sourceEffect.id === 'sandtomb' &&
    pokemon.hp && pokemon.volatiles.partiallytrapped === trap) {
    this.boost({accuracy: -1}, pokemon, pokemon, this.dex.conditions.get('partiallytrapped'));
   }
  },
 },
 lockedmove: {
  inherit: true,
  onStart(target, source, effect) {
   this.effectState.move = effect.id;
   const fatiguesImmediately = fieldId(this) === 'superheated' && ['outrage', 'petaldance', 'thrash'].includes(effect.id);
   this.effectState.trueDuration = fatiguesImmediately ? 1 : this.random(2, 4);
   if (fatiguesImmediately) this.effectState.duration = 1;
  },
 },
 flinch: {
  inherit: true,
  onBeforeMove(pokemon) {
   if (fieldId(this) === 'rocky' && pokemon.boosts.def > 0) {
    this.add('message', `${pokemon.name} won't flinch because of its bolstered Defense!`);
    return;
   }
   this.add('cant', pokemon, 'flinch');
   this.runEvent('Flinch', pokemon);
   return false;
  },
 },
 chesspawnsturdy: {
  name: 'Chess Pawn Sturdy',
  onDamagePriority: -29,
  onDamage(damage, target, source, effect) {
   if (fieldId(this) === 'chess' && target.m.chessPiece === 'pawn' && !target.m.chessSturdyUsed &&
    target.hp === target.maxhp && damage >= target.hp && effect?.effectType === 'Move') {
    target.m.chessSturdyUsed = true;
    this.add('message', `${target.name} held on as a Pawn!`);
    return target.hp - 1;
   }
  },
 },
	rebornfieldduration: {
  name: 'Reborn Field Duration', duration: 5,
  onFieldResidualOrder: 27, onFieldResidualSubOrder: 8,
  onFieldEnd() {
   this.add('rebornfieldtimer', 'end');
   if (this.effectState.replacing) return;
   const restore = this.effectState.restore;
   if (!restore) return;
   if (restore.fieldId === 'starlight' && restore.starlightGravity !== undefined &&
    restore.starlightGravity !== this.field.pseudoWeather.gravity?.effectOrder) {
    restore.fieldId = 'newworld';
    restore.backup = 'none';
    delete restore.starlightGravity;
   }
   setField(this, restore.fieldId || 'none', false, 'restore', restore.counter || 0);
   if (flowerGardenStage(restore.fieldId) && fieldId(this) !== restore.fieldId) return;
   Object.assign(this.field.pseudoWeather.rebornfieldstate, restore);
   this.eachEvent('Update');
  },
 },
	rebornfieldstate: {
		name: 'Reborn Field State',
  onFieldResidualOrder: 28,
  onFieldResidual() {
   if (fieldId(this) === 'newworld') {
    for (const pokemon of this.getAllActive()) rollNewWorldForm(this, pokemon);
   }
   if (fieldId(this) === 'wasteland') releaseWastelandHazards(this);
   updateDarkCrystalSunlight(this);
   if (fieldId(this) === 'mountain' && this.field.isWeather(['hail', 'snowscape'])) {
    const state = this.effectState;
    state.mountainHailTurns = (state.mountainHailTurns || 0) + 1;
    if (state.mountainHailTurns === 3) {
     this.add('message', 'The mountain was covered in snow!');
     setField(this, 'snowymountain', true);
    }
   }
   if (fieldId(this) === 'superheated' && this.field.weather === 'hail') {
    this.add('message', 'The hail melted away!');
    this.field.clearWeather();
   }
   if (fieldId(this) === 'rainbow') {
    const weather = this.field.weather;
    const linkedWeather = this.field.pseudoWeather.rebornfieldduration?.rebornWeather;
    if (['sandstorm', 'hail', 'snowscape'].includes(weather) || (linkedWeather && linkedWeather !== weather)) {
     this.add('message', 'The rainbow faded!');
     endTimedRebornField(this);
    }
   }
   if (fieldId(this) !== 'burning') return;
   const weather = this.field.weather;
   if (['raindance', 'primordialsea', 'sandstorm'].includes(weather)) {
    this.add('message', weather === 'sandstorm' ? 'The sand snuffed out the flame!' : 'The water snuffed out the flame!');
    endTimedRebornField(this);
   }
  },
  onSideConditionStart(side, source, condition) {
   if (['watersurface', 'murkwatersurface'].includes(fieldId(this)) &&
       ['spikes', 'toxicspikes'].includes(condition.id) && sinkWaterSpikes(this, side)) {
    this.add('message', '...The spikes sank into the water and vanished!');
   }
   if (fieldId(this) === 'wasteland') swallowWastelandHazard(this, side, condition.id, source);
   if (fieldId(this) === 'mirror' && mirrorScreens.has(condition.id)) {
    const screen = side.getSideConditionData(condition.id);
    if (screen) screen.duration = 8;
    this.add('rebornscreenduration', side, condition.id, 8);
    if (this.activeMove?.id === condition.id) this.boost({evasion: 1}, source, source, this.activeMove);
   }
  },
  onSwitchIn(pokemon) {
   if (fieldId(this) === 'newworld') rollNewWorldForm(this, pokemon);
   if (fieldId(this) === 'chess') chessSwitchIn(this, pokemon);
   if (fieldId(this) === 'starlight' && pokemon.hasAbility('illuminate')) {
    this.boost({spa: 2}, pokemon, pokemon, pokemon.getAbility());
   }
   if (flowerGardenStage(fieldId(this)) && pokemon.hasAbility(['drizzle', 'drought', 'flowergift', 'flowerveil'])) {
    growFlowerGarden(this);
   }
   if (fieldId(this) === 'fairytale') {
    const ability = pokemon.getAbility();
    const boosts = FAIRY_TALE_ENTRY_BOOSTS[ability.id];
    if (boosts && pokemon.hasAbility(ability.id)) this.boost({...boosts}, pokemon, pokemon, ability);
   }
   if (fieldId(this) === 'mirror') {
    if (pokemon.hasItem(['brightpowder', 'laxincense'])) this.boost({evasion: 1}, pokemon, pokemon, pokemon.getItem());
    if (pokemon.hasAbility('illusion')) {
     this.boost({evasion: 2}, pokemon, pokemon, this.dex.conditions.get('mirrorarena'));
    } else if (pokemon.hasAbility(['colorchange', 'sandveil', 'snowcloak', 'tangledfeet', 'magicbounce'])) {
     this.boost({evasion: 1}, pokemon, pokemon, pokemon.getAbility());
    }
    const accuracyItem = pokemon.hasItem(['widelens', 'zoomlens']);
    const accuracyAbility = pokemon.hasAbility(['keeneye', 'compoundeyes']);
    if (accuracyItem) this.boost({accuracy: 1}, pokemon, pokemon, pokemon.getItem());
    if (accuracyAbility) this.boost({accuracy: 1}, pokemon, pokemon, pokemon.getAbility());
    if (accuracyItem || accuracyAbility) {
     pokemon.addVolatile('laserfocus', pokemon, accuracyAbility ? pokemon.getAbility() : pokemon.getItem());
    }
    if (pokemon.hasAbility('illuminate')) {
     for (const foe of pokemon.foes()) this.boost({accuracy: -1}, foe, pokemon, pokemon.getAbility());
    }
   }
   if (fieldId(this) === 'corrosive' && takesPoisonFieldDamage(pokemon)) {
    const damage = pokemon.maxhp * 2 ** this.dex.getEffectiveness('Poison', pokemon) / 4;
    this.damage(damage, pokemon, pokemon, this.dex.conditions.get('corrosivefield'));
   }
  },
  onPrepareHit(source, target, move) {
   prepareCorrosiveMistIgnition(this, move);
   prepareMirrorShatter(this, move);
  },
  onModifySecondaries(secondaries, target, source) {
   if (fieldId(this) !== 'rainbow' || source.hasAbility('serenegrace')) return;
   for (let i = 0; i < secondaries.length; i++) {
    const secondary = secondaries[i];
    if (typeof secondary.chance === 'number') {
     secondaries[i] = {...secondary, chance: Math.min(100, secondary.chance * 2)};
    }
   }
  },
  onModifyPriority(priority, pokemon) {
   if (fieldId(this) === 'chess' && pokemon.m.chessPiece === 'king') return priority + 1;
  },
  onModifySpreadModifier(modifier, source, target, move) {
   if (fieldId(this) === 'chess' && ['doubles', 'multi'].includes(this.gameType) &&
    source.m.chessPiece === 'knight' && move.target === 'allAdjacentFoes') return 1.25;
  },
  onTryHitPriority: 4,
  onTryHit(target, source, move) {
   if (fieldId(this) === 'holy' && target !== source && target.isAlly(source) && move.category !== 'Status') {
    this.add('-immune', target, '[silent]', '[then]');
    this.add('message', `The holy field protected ${target.name} from its ally!`);
    return null;
   }
   if (fieldId(this) === 'glitch' && move.category !== 'Status' && move.type === 'Ghost' && target.hasType('Psychic')) {
    this.add('-immune', target);
    return null;
   }
   if (fieldId(this) === 'rocky' && move.flags.bullet && (target.boosts.def > 0 || target.volatiles.substitute)) {
    this.add('-immune', target, '[msg]');
    this.add('message', `${target.name} took cover behind the rocks!`);
    return null;
   }
   if (fieldId(this) === 'chess' && target.m.chessPiece === 'pawn' && move.ohko) {
    this.add('-immune', target, '[msg]');
    return null;
   }
   if (fieldId(this) === 'psyterrain' && move.priority > 0.1 && move.target !== 'self' && !target.isAlly(source) && target.isGrounded() && !target.isSemiInvulnerable()) {
    this.add('-activate', target, 'move: Psychic Terrain'); return null;
   }
  },
  onResidualOrder: 5, onResidualSubOrder: 2,
  onResidual(pokemon) {
   if (fieldId(this) === 'underwater' && !pokemon.hasAbility(['magicguard', 'swiftswim']) &&
    this.dex.getImmunity('Water', pokemon)) {
    const weakness = this.dex.getEffectiveness('Water', pokemon);
    if (weakness > 0) {
     const multiplier = pokemon.hasAbility(['flamebody', 'magmaarmor']) ? 2 : 1;
     this.add('message', `${pokemon.name} struggled in the water!`);
     this.damage(pokemon.maxhp * 2 ** weakness * multiplier / 8, pokemon, pokemon, this.dex.conditions.get('underwaterfield'));
    }
   }
   if (fieldId(this) === 'murkwatersurface' && takesPoisonFieldDamage(pokemon)) {
    const underwater = !!pokemon.volatiles.dive;
    const weakness = this.dex.getEffectiveness('Poison', pokemon);
    const abilityMultiplier = pokemon.hasAbility(['dryskin', 'flamebody', 'magmaarmor', 'waterabsorb']) ? 2 : 1;
    const damage = pokemon.maxhp * 2 ** weakness * abilityMultiplier / (underwater ? 2 : 8);
    this.damage(damage, pokemon, pokemon, this.dex.conditions.get('murkwatersurface'));
   }
   if (fieldId(this) === 'corrosivemist' && !pokemon.status && pokemon.runStatusImmunity('psn')) {
    pokemon.trySetStatus('psn', pokemon, this.dex.conditions.get('corrosivemistfield'));
   }
   if (fieldId(this) === 'corrosive' && pokemon.status === 'slp' && takesPoisonFieldDamage(pokemon)) {
    this.damage(pokemon.maxhp / 16, pokemon, pokemon, this.dex.conditions.get('corrosivefield'));
   }
   if (fieldId(this) === 'rainbow' && pokemon.status === 'slp') {
    this.heal(pokemon.maxhp / 16, pokemon, pokemon, this.dex.conditions.get('rainbowfield'));
   }
   if (fieldId(this) === 'swamp') {
    const swamp = this.dex.conditions.get('swampfield');
    if (pokemon.isGrounded() && !pokemon.isSemiInvulnerable() &&
     !pokemon.hasAbility(['quickfeet', 'swiftswim', 'clearbody', 'whitesmoke'])) {
     this.boost({spe: -1}, pokemon, pokemon, swamp);
    }
    if (pokemon.status === 'slp' && !pokemon.hasAbility('magicguard')) {
     this.damage(pokemon.maxhp / 16, pokemon, pokemon, swamp);
    }
   }
   if (fieldId(this) === 'burning' && pokemon.isGrounded() && !pokemon.isSemiInvulnerable()) {
    if (pokemon.hasAbility('flashfire')) pokemon.addVolatile('flashfire', pokemon);
    if (!pokemon.hasType('Fire') && !pokemon.volatiles.aquaring &&
     !pokemon.hasAbility(['flamebody', 'flareboost', 'flashfire', 'heatproof', 'magmaarmor', 'waterbubble', 'waterveil'])) {
     let damage = pokemon.maxhp * 2 ** this.dex.getEffectiveness('Fire', pokemon) / 8;
     if (pokemon.hasAbility(['fluffy', 'grasspelt', 'icebody', 'leafguard'])) damage *= 2;
     this.damage(damage, pokemon, pokemon, this.dex.conditions.get('burningfield'));
    }
   }
   if (fieldId(this) === 'grassy' && pokemon.isGrounded() && !pokemon.isSemiInvulnerable()) {
    this.heal(pokemon.baseMaxhp / 16, pokemon, pokemon, this.dex.conditions.get('grassyterrain'));
   }
  },
  onSetStatus(status, target) {
   if (fieldId(this) === 'burning' && status.id === 'frz') return false;
   if (fieldId(this) === 'misty' && status.id !== 'fnt' && target.isGrounded() && !target.isSemiInvulnerable()) {
    this.add('-activate', target, 'move: Misty Terrain'); return false;
   }
   if (fieldId(this) === 'electerrain' && status.id === 'slp' && target.isGrounded() && !target.isSemiInvulnerable()) {
    this.add('-activate', target, 'move: Electric Terrain'); return false;
   }
  },
  onModifyAtk(atk, source, target, move) {
   if (fieldId(this) === 'underwater' && move.category === 'Physical' && move.type !== 'Water' &&
    !source.hasAbility(['swiftswim', 'steelworker'])) return this.chainModify(0.5);
  },
  onModifySpe(spe, pokemon) {
   if (fieldId(this) === 'newworld' && pokemon.isGrounded()) return this.chainModify(0.75);
   if (fieldId(this) === 'underwater' && !pokemon.hasType('Water') &&
    !pokemon.hasAbility(['swiftswim', 'steelworker'])) return this.chainModify(0.5);
   if (['watersurface', 'murkwatersurface'].includes(fieldId(this)) && pokemon.isGrounded() &&
    !pokemon.hasType('Water') && !pokemon.hasAbility(['surgesurfer', 'swiftswim'])) return this.chainModify(0.75);
  },
  onModifyBoost(boosts, pokemon) {
   if (fieldId(this) !== 'ashenbeach') return;
   const source = this.activePokemon;
   const target = this.activeTarget;
   if (!source || !target || target.hasAbility('unnerve') ||
    !source.hasAbility(['owntempo', 'purepower', 'sandveil', 'steadfast'])) return;
   if (pokemon === source) boosts.accuracy = 0;
   if (pokemon === target) boosts.evasion = 0;
  },
  onModifyTypePriority: -100,
  onModifyType(move) {
   const field = fieldId(this);
   if (field === 'starlight' && ['solarbeam', 'solarblade'].includes(move.id)) move.type = 'Fairy';
   if (field === 'fairytale' && !move.isZ && !move.isMax && FAIRY_TALE_STEEL_MOVES.has(move.id)) move.type = 'Steel';
   if (field === 'murkwatersurface' && !move.isZ && !move.isMax) {
    if (['mudbomb', 'mudshot', 'mudslap', 'thousandwaves'].includes(move.id)) move.type = 'Water';
    if (move.id === 'shoreup') move.type = 'Poison';
   }
   if (field !== 'glitch') return;
   if (['Dark', 'Steel', 'Fairy'].includes(move.type) && move.id !== 'struggle') move.type = 'Normal';
   if (move.category === 'Status') return;
   move.category = GLITCH_SPECIAL_TYPES.has(move.type) ? 'Special' : 'Physical';
   if (move.type === 'Dragon' && move.ignoreImmunity !== true) {
    move.ignoreImmunity = {...(move.ignoreImmunity || {}), Dragon: true};
   }
  },
  onAccuracy(accuracy, target, source, move) {
   if (fieldId(this) === 'fairytale' && move.flags.futuremove && source.hasAbility('fairyaura')) return true;
   if (fieldId(this) !== 'mirror') return;
   // The delayed hit of Doom Desire does not go through ModifyMove.
   if (move.id === 'doomdesire') return true;
   if (target.boosts.evasion > 0 && move.category === 'Special' && !move.flags.contact &&
    (MIRROR_SINGLE_TARGETS.has(move.target) || move.flags.futuremove)) return true;
  },
  onModifyCritRatio(crit, source, target) {
   if (fieldId(this) === 'mirror' && target) {
    return crit + Math.max(0, source.boosts.accuracy) + Math.max(0, source.boosts.evasion) -
     Math.min(0, target.boosts.accuracy) - Math.min(0, target.boosts.evasion);
   }
   if (fieldId(this) === 'glitch' && target && source.storedStats.spe > target.storedStats.spe) return crit + 1;
  },
  onTryAddVolatile(status, target, _source, effect) {
   if (status.id === 'mustrecharge' && fieldId(this) === 'glitch' && this.activeMove?.flags.recharge &&
    this.faintQueue.some(faint => faint.target !== target && faint.source === target && faint.effect === effect)) {
    return null;
   }
   if (status.id === 'confusion' && fieldId(this) === 'ashenbeach' &&
    (target.hasType('Fighting') || target.hasAbility('innerfocus'))) {
    this.add('-immune', target, '[msg]');
    return null;
   }
   if (fieldId(this) === 'misty' && ['confusion', 'yawn'].includes(status.id) && target.isGrounded() && !target.isSemiInvulnerable()) {
    this.add('-activate', target, 'move: Misty Terrain'); return null;
   }
   if (fieldId(this) === 'electerrain' && status.id === 'yawn' && target.isGrounded() && !target.isSemiInvulnerable()) {
    this.add('-activate', target, 'move: Electric Terrain'); return null;
   }
  },
		onNegateImmunity(pokemon, type) {
   const field = fieldId(this);
   if (field === 'inverse' && this.activeMove && this.activeMove.category !== 'Status') return false;
   if (field === 'holy' && type === 'Normal' && pokemon.hasType('Ghost')) return false;
  },
  onModifyDamage(damage, source, target, move) {
   const stage = flowerGardenStage(fieldId(this));
   if (stage < 2) return;
   if (move.id === 'cut' && target.hasType('Grass')) this.chainModify(2);
   if (stage >= 3 && (
    target.hasAbility('flowerveil') && !this.suppressingAbility(target) ||
    target.hasType('Grass') && target.allies().some(ally => ally.hasAbility('flowerveil'))
   )) this.chainModify(0.75);
  },
		onEffectivenessPriority: 1,
		onEffectiveness(mod, target, type, move) {
   // Doom Desire's scheduled strike is reconstructed after ModifyMove has already run.
   if (['starlight', 'newworld'].includes(fieldId(this)) && move?.id === 'doomdesire') return mod + this.dex.getEffectiveness('Fire', type);
   if (type === 'Grass' && mod > 0 && flowerGardenStage(fieldId(this)) >= 4) return 0;
   if (fieldId(this) === 'fairytale' && move?.type === 'Steel' && type === 'Dragon') return 1;
   if (fieldId(this) === 'holy' && move?.type === 'Normal' && ['Ghost', 'Dark'].includes(type)) return 1;
			if (fieldId(this) === 'glitch' && move) {
    if ((move.type === 'Bug' && type === 'Poison') || (move.type === 'Poison' && type === 'Bug')) return 1;
    if ((move.type === 'Ice' && type === 'Fire') || (move.type === 'Dragon' && ['Fairy', 'Steel', 'Dragon'].includes(type))) return 0;
   }
			if (fieldId(this) !== 'inverse') return;
			if (move?.id === 'freezedry' && type === 'Water') return;
			if (move && !this.dex.getImmunity(move, type)) return 1;
			if (mod) return -mod;
		},
		onFieldStart() { this.effectState.fieldId = 'none'; this.effectState.cooling = 0; this.effectState.collapse = 0; },
		onBasePower(basePower, source, target, move) {
			const id = fieldId(this);
			if (!['none', 'dragonsden', 'cave'].includes(id)) return genericPower(this, basePower, source, target, move);
			let mult = 1;
			if (id === 'dragonsden') {
				// Emit once per move, except target-specific lava messages in doubles.
				const active = move as typeof move & {rebornMessages?: string[]};
				const sent = active.rebornMessages || (active.rebornMessages = []);
				const announce = (message: string) => {
					if (!sent.includes(message)) { sent.push(message); this.add('message', message); }
				};
				if (move.type === 'Fire') announce("The lava's heat boosted the flame!");
				if (move.type === 'Dragon') announce('The draconic energy boosted the attack!');
				if (['Ice', 'Water'].includes(move.type)) announce("The lava's heat softened the attack...");
				if (move.id === 'megakick') announce('Trial of the Dragon!!!');
				if (['magmastorm', 'lavaplume'].includes(move.id)) announce('The lava strengthened the attack!');
				if (['smackdown', 'thousandarrows'].includes(move.id)) announce(`${target.name} was knocked into the lava!`);
				if (move.id === 'dragonascent') announce('The draconic energy boosted the attack!');
				if (move.id === 'payday') announce('money money money money money mothafucka');
				if (['Dragon', 'Fire'].includes(move.type)) mult *= 1.5;
				if (['Water', 'Ice'].includes(move.type)) mult *= 0.5;
				if (['megakick', 'magmastorm', 'lavaplume'].includes(move.id)) mult *= 1.5;
				if (['smackdown', 'thousandarrows', 'dragonascent', 'payday', 'tectonicrage', 'continentalcrush'].includes(move.id)) mult *= 2;
				const cooling = ['muddywater', 'surf', 'sparklingaria'].includes(move.id) ? 1 :
					['glaciate', 'subzeroslammer', 'oceanicoperetta', 'hydrovortex'].includes(move.id) ? 2 : 0;
				if (cooling && (this.effectState.cooling + cooling >= 2)) mult *= 1.3;
			} else if (id === 'cave') {
				const active = move as typeof move & {rebornCaveMessages?: string[]};
				const sent = active.rebornCaveMessages || (active.rebornCaveMessages = []);
				const announce = (message: string) => {
					if (!sent.includes(message)) { sent.push(message); this.add('message', message); }
				};
				if (move.type === 'Rock') announce('The cavern strengthened the attack!');
				if (move.type === 'Flying' && !move.flags.contact) announce('The cave choked out the air!');
				if (move.id === 'rocktomb') announce('...Piled on!');
				if (move.type === 'Rock') mult *= 1.5;
				if (move.type === 'Flying' && !move.flags.contact) mult *= 0.5;
				if (move.flags.sound) mult *= 1.5;
				if (move.id === 'rocktomb') mult *= 1.5;
			}
			if (mult !== 1) return this.chainModify(mult);
		},
		onModifyDef(def, pokemon) {
   if (fieldId(this) === 'newworld' && !pokemon.isGrounded()) return this.chainModify(0.9);
   if (['icy', 'snowymountain'].includes(fieldId(this)) && pokemon.hasType('Ice') && pokemon.effectiveWeather() === 'hail') {
    return this.chainModify(1.5);
   }
   if (fieldId(this) === 'darkcrystalcavern' && pokemon.hasType(['Dark', 'Ghost'])) return this.chainModify(1.5);
			if (fieldId(this) === 'dragonsden' && pokemon.hasType('Dragon')) return this.chainModify(1.3);
		},
		onModifySpD(spd, pokemon) {
   if (fieldId(this) === 'newworld' && !pokemon.isGrounded()) return this.chainModify(0.9);
   if (fieldId(this) === 'darkcrystalcavern' && pokemon.hasType(['Dark', 'Ghost'])) return this.chainModify(1.5);
   if (fieldId(this) === 'misty' && pokemon.hasType('Fairy')) return this.chainModify(1.5);
   if (fieldId(this) === 'desert' && pokemon.hasType('Ground')) return this.chainModify(1.5);
			if (fieldId(this) === 'dragonsden' && pokemon.hasType('Dragon')) return this.chainModify(1.3);
		},
		onModifyMove(move, source, target) {
			// The combined hit creates a Reborn field after damage, so skip the native side condition.
			if (move.flags.pledgecombo) {
				if (move.sideCondition === 'firepledge' || move.sideCondition === 'grasspledge') {
					delete move.sideCondition;
				}
				if (move.self?.sideCondition === 'waterpledge') {
					move.self = {...move.self, sideCondition: undefined};
				}
			}
			if (!['none', 'dragonsden', 'cave'].includes(fieldId(this))) genericModifyMove(this, move, source, target);
			if (fieldId(this) === 'dragonsden') {
				if (move.id === 'dragondance') move.boosts = {atk: 2, spe: 2};
				if (move.id === 'nobleroar') move.boosts = {atk: -2, spa: -2};
				// Added type affects effectiveness only; it does not replace STAB or immunities.
				if (['smackdown', 'thousandarrows', 'tectonicrage', 'continentalcrush'].includes(move.id)) {
					const original = move.onEffectiveness;
					move.onEffectiveness = function (mod, target, type, activeMove) {
						const base = original?.call(this, mod, target, type, activeMove);
						return (typeof base === 'number' ? base : mod) + this.dex.getEffectiveness('Fire', type);
					};
				}
			} else if (fieldId(this) === 'cave') {
				if (move.type === 'Ground') {
					move.ignoreImmunity = true;
					const original = move.onEffectiveness;
					move.onEffectiveness = function (mod, target, type, activeMove) {
						if (type === 'Flying') return 0;
						return original?.call(this, mod, target, type, activeMove);
					};
				}
			}
		},
		onChargeMove(pokemon, target, move) {
			if (fieldId(this) === 'cave' && ['fly', 'bounce'].includes(move.id)) return false;
		},
  onDamage(damage, target, source, effect) {
   const stage = flowerGardenStage(fieldId(this));
   if (stage >= 3 && effect.id === 'partiallytrapped' && target.volatiles.partiallytrapped?.sourceEffect?.id === 'infestation') {
    return target.maxhp / [6, 4, 3][stage - 3];
   }
   if (['watersurface', 'underwater'].includes(fieldId(this)) && effect.id === 'partiallytrapped' &&
    target.volatiles.partiallytrapped?.sourceEffect?.id === 'whirlpool') return target.maxhp / 6;
   if (fieldId(this) === 'icy' && effect.id === 'brn') return damage / 2;
   if (fieldId(this) === 'burning' && effect.id === 'partiallytrapped' &&
    target.volatiles.partiallytrapped?.sourceEffect?.id === 'firespin') return target.maxhp / 6;
   if (fieldId(this) === 'desert' && effect.id === 'partiallytrapped' &&
    target.volatiles.partiallytrapped?.sourceEffect?.id === 'sandtomb') return target.maxhp / 6;
   if (fieldId(this) === 'forest' && effect.id === 'partiallytrapped' &&
    target.volatiles.partiallytrapped?.sourceEffect?.id === 'infestation') return target.maxhp / 6;
			if (effect.id === 'stealthrock' && ['cave', 'rocky'].includes(fieldId(this))) return damage * 2;
			if (fieldId(this) === 'dragonsden' && effect.id === 'partiallytrapped' &&
				target.volatiles.partiallytrapped?.sourceEffect?.id === 'magmastorm') {
				return target.baseMaxhp / (target.volatiles.partiallytrapped.boundDivisor === 6 ? 4 : 6);
			}
		},
  onMoveMiss(pokemon, target, move) {
   if (!pokemon.hp || !move.flags.contact || fieldMisses.has(move)) return;
   if (fieldId(this) === 'mirror' && move.category === 'Physical' && this.checkMoveMakesContact(move, pokemon, target)) {
    fieldMisses.add(move);
    const effect = this.dex.conditions.get('mirrorarena');
    this.add('message', `${pokemon.name} hit a mirror instead!`);
    this.directDamage(pokemon.maxhp / 4, pokemon, pokemon, effect);
    if (pokemon.hp && pokemon.boosts.evasion > 0) this.boost({evasion: -1}, pokemon, pokemon, effect);
    return;
   }
   if (fieldId(this) !== 'rocky' || pokemon.hasAbility('rockhead')) return;
   fieldMisses.add(move);
   this.add('message', `${pokemon.name} hit a rock instead!`);
   this.directDamage(pokemon.maxhp / 8, pokemon, pokemon, this.dex.conditions.get('rockyfield'));
  },
  onFlinch(pokemon) {
   if (fieldId(this) !== 'rocky' || pokemon.hasAbility(['steadfast', 'sturdy', 'innerfocus'])) return;
   this.add('message', `${pokemon.name} was knocked into a rock!`);
   this.directDamage(pokemon.maxhp / 4, pokemon, pokemon, this.dex.conditions.get('rockyfield'));
  },
  onTryMove(source, target, move) {
   const field = fieldId(this);
   if (field === 'newworld' && (move.weather || move.terrain || FIELD_DATA.newworld.damageMods['0'].includes(move.id.toUpperCase()))) {
    this.attrLastMove('[still]');
    this.add('-fail', source);
    announceFieldMove(this, move, target, move.weather ? 'raindance' : move.terrain ? 'grassyterrain' : undefined);
    return null;
   }
   if (field === 'underwater' && (move.weather || move.type === 'Fire')) {
    this.attrLastMove('[still]');
    if (source.volatiles.twoturnmove?.move === move.id) source.removeVolatile('twoturnmove');
    this.add('message', move.weather ? "You're too deep to notice the weather!" : '...But the attack was doused instantly!');
    return null;
   }
   if (['watersurface', 'murkwatersurface'].includes(field) && move.type === 'Ground' && move.category !== 'Status') {
    this.attrLastMove('[still]');
    if (source.volatiles.twoturnmove?.move === move.id) source.removeVolatile('twoturnmove');
    this.add('-fail', source, '[silent]', '[then]');
    this.add('message', '...But there was no solid ground to attack from!');
    return null;
   }
   if (fieldId(this) === 'rainbow' && move.id === 'nightmare') {
    this.attrLastMove('[still]');
    this.add('-fail', source, 'move: Nightmare');
    return false;
   }
   if (fieldId(this) === 'darkcrystalcavern' && ['solarbeam', 'solarblade'].includes(move.id)) {
    this.attrLastMove('[still]');
    this.add('-fail', source, 'move: ' + move.name);
    this.add('message', "The cavern's darkness swallowed the light!");
    if (source.volatiles.twoturnmove?.move === move.id) source.removeVolatile('twoturnmove');
    return false;
   }
   if (['misty', 'swamp'].includes(fieldId(this)) && ['explosion', 'selfdestruct', 'mindblown'].includes(move.id)) {
    this.attrLastMove('[still]');
    this.add('-fail', source, 'move: ' + move.name);
    this.add('message', 'The dampness prevents the explosion!');
    return false;
   }
			if (fieldId(this) === 'cave' && move.id === 'skydrop') {
				this.add('-fail', source, 'move: Sky Drop'); return false;
			}
		},
		onAfterMove(source, target, move) {
			if (igniteCorrosiveMist(this, source, move)) return;
			if (this.lastSuccessfulMoveThisTurn === move.id) applyIcySpeedBoost(this, source, move);
			const field = fieldId(this);
			if (field === 'superheated') applySuperheatedSteam(this, source, move);
			const firePledgeChangesField = move.id === 'firepledge' &&
				(['icy', 'snowymountain'].includes(field) ||
     ((['forest', 'superheated'].includes(field) || flowerGardenStage(field) >= 3) && canIgniteField(this)));
			if (!firePledgeChangesField && fieldPledgeAfterMove(this, source, move)) return;
			fieldCreationAfterMove(this, source, move);
			if (!['none', 'dragonsden', 'cave'].includes(fieldId(this))) { genericAfterMove(this, source, target, move); return; }
			if (!move.totalDamage) return;
			if (fieldId(this) === 'cave' && ['powergem', 'diamondstorm'].includes(move.id)) {
				this.add('message', 'The cave was littered with crystals!');
				setField(this, 'crystalcavern', true);
				return;
			}
			if (fieldId(this) === 'dragonsden') {
				const n = ['muddywater', 'surf', 'sparklingaria'].includes(move.id) ? 1 :
					['glaciate', 'subzeroslammer', 'oceanicoperetta', 'hydrovortex'].includes(move.id) ? 2 : 0;
				if (n) {
					this.effectState.cooling += n;
					if (this.effectState.cooling >= 2) {
						this.add('message', ['glaciate', 'subzeroslammer'].includes(move.id) ?
							'The lava was frozen solid!' : 'The lava solidified!');
						setField(this, 'cave');
					}
					else this.add('message', 'The lava is beginning to solidify.');
				}
			} else if (fieldId(this) === 'cave' && ['earthquake', 'bulldoze', 'magnitude', 'fissure', 'tectonicrage', 'continentalcrush'].includes(move.id)) {
				if (!this.effectState.collapse) {
					this.effectState.collapse = 1;
					this.add('message', 'Fragments fall from the cave ceiling.');
				} else {
					this.effectState.collapse = 0;
					this.add('message', 'The cave ceiling collapses!');
					for (const p of this.getAllActive()) {
						if (!p.hp || p.hasAbility(['bulletproof', 'rockhead']) || p.isSemiInvulnerable() ||
						['protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'obstruct'].some(id => p.volatiles[id]) ||
							p.side.sideConditions.wideguard || p.side.sideConditions.matblock || p.side.sideConditions.quickguard) continue;
						let damage = p.maxhp;
						if (p.hp === p.maxhp && (p.volatiles.endure || p.hasAbility('sturdy'))) damage = p.hp - 1;
						if (p.hasAbility(['shellarmor', 'battlearmor'])) damage /= 2;
						if (p.hasAbility(['prismarmor', 'solidrock'])) damage /= 3;
						this.directDamage(damage, p, source);
					}
				}
			}
			if (move.id === 'splinteredstormshards') setField(this, 'none');
		},
	},
 burningburnup: {
  name: 'Burning Burn Up', noCopy: true, duration: 1, onResidualOrder: 5, onResidualSubOrder: 3,
  onEnd(pokemon) {
   if (!pokemon.hp || pokemon.types.join('/') !== this.effectState.burnedTypes) return;
   if (pokemon.setType(this.effectState.originalTypes)) {
    if (this.effectState.addedType) pokemon.addType(this.effectState.addedType);
    this.add('-start', pokemon, 'typechange', pokemon.getTypes(true).join('/'), '[silent]');
    if (pokemon.addedType) this.add('-start', pokemon, 'typeadd', pokemon.addedType, '[silent]');
   }
  },
 },
	genesisfire: {
		name: 'Genesis Fire', noCopy: true,
		onStart(pokemon) {
			this.add('-start', pokemon, 'Genesis Fire');
			this.add('message', `${pokemon.name} raised its Fire power!`);
		},
		onModifyAtkPriority: 5,
		onModifyAtk(atk, pokemon, target, move) {
			if (move.type === 'Fire' && !(pokemon.hasAbility('flashfire') && pokemon.volatiles.flashfire)) return this.chainModify(1.5);
		},
		onModifySpAPriority: 5,
		onModifySpA(spa, pokemon, target, move) {
			if (move.type === 'Fire' && !(pokemon.hasAbility('flashfire') && pokemon.volatiles.flashfire)) return this.chainModify(1.5);
		},
		onEnd(pokemon) { this.add('-end', pokemon, 'Genesis Fire', '[silent]'); },
	},
};
