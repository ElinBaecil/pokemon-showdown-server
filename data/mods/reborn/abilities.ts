import {FIELD_DATA} from './field-data';
import {camouflageType, crystalType, fieldId, flowerGardenStage, startTimedField} from './field-engine';
import type {Battle} from '../../../sim/battle';
import type {Pokemon} from '../../../sim/pokemon';

function stanceChangeEvent(event: 'onBeforeMove' | 'onModifyMove') {
 return function (this: Battle, move: ActiveMove, source: Pokemon, target: Pokemon | null) {
  const original = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Abilities.stancechange;
  const previous = source.species.id;
  const result = event === 'onBeforeMove' ?
   original.onBeforeMove?.call(this, source, target!, move) :
   original.onModifyMove?.call(this, move, source, target);
  if (fieldId(this) === 'fairytale' && source.species.id !== previous) {
   const blade = source.species.id === 'aegislashblade';
   this.boost({atk: blade ? 1 : -1, def: blade ? -1 : 1}, source, source, this.effect);
  }
  return result;
 };
}

function prepareTypeChange(ability: 'protean' | 'libero') {
 return function (this: Battle, source: Pokemon, target: Pokemon, move: ActiveMove) {
  const prepareHit = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').abilities.get(ability).onPrepareHit;
  if (typeof prepareHit !== 'function') return;
  if (move.id !== 'camouflage') return prepareHit.call(this, source, target, move);

  // Keep the native ability's activation rules and use Camouflage's destination type.
  const type = camouflageType(this, move);
  const previous = source.getTypes().join();
  const result = prepareHit.call(this, source, target, {...move, type});
  if (previous !== source.getTypes().join()) {
   (move as ActiveMove & {rebornCamouflageTypeChanged?: boolean}).rebornCamouflageTypeChanged = true;
  }
  return result;
 };
}

function fieldStarterBoost(type: 'Grass' | 'Bug' | 'Water', field: string) {
 return function (this: Battle, stat: number, source: Pokemon, target: Pokemon, move: ActiveMove) {
  if (move.type !== type) return;
  const current = fieldId(this);
  const stage = flowerGardenStage(current);
  if (stage && type === 'Bug') return this.chainModify(stage === 5 ? 2 : stage >= 3 ? 1.8 : 1.5);
  if (stage >= 2 && type === 'Grass') {
   if (stage === 2 && source.hp * 3 > source.maxhp * 2) return;
   return this.chainModify(stage === 5 ? 2 : stage === 4 ? 1.8 : 1.5);
  }
  if (current === field || (type === 'Water' && current === 'underwater') || source.hp <= source.maxhp / 3) {
   return this.chainModify(1.5);
  }
 };
}

function updateSchooling(this: Battle, pokemon: Pokemon) {
 if (pokemon.baseSpecies.baseSpecies !== 'Wishiwashi' || pokemon.transformed || !pokemon.hp) return;
 const field = fieldId(this);
 const forced = ['underwater', 'murkwatersurface'].includes(field) || (field === 'watersurface' && pokemon.isGrounded());
 if (!forced && !pokemon.m.rebornWaterSchooling && pokemon.level < 20) return;
 pokemon.m.rebornWaterSchooling = forced;
 const school = forced || (pokemon.level >= 20 && pokemon.hp > pokemon.maxhp / 4);
 if (school && pokemon.species.id === 'wishiwashi') pokemon.formeChange('Wishiwashi-School');
 if (!school && pokemon.species.id === 'wishiwashischool') pokemon.formeChange('Wishiwashi');
}

function leafGuardActive(battle: Battle, pokemon: Pokemon) {
 return fieldId(battle) === 'forest' || flowerGardenStage(fieldId(battle)) >= 2 || ['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather());
}

function plusMinusBoost(this: Battle, spa: number, pokemon: Pokemon) {
 if (fieldId(this) === 'shortcircuit' || pokemon.allies().some(ally => ally.hasAbility(['plus', 'minus']))) {
  return this.chainModify(1.5);
 }
}

function activateGlitchForm(this: Battle, pokemon: Pokemon) {
 if (fieldId(this) === 'glitch' && pokemon.baseSpecies.baseSpecies === 'Silvally' && !pokemon.transformed &&
  !pokemon.volatiles.rebornsilvallyglitch) pokemon.addVolatile('rebornsilvallyglitch');
}

const fairyStanceBefore = stanceChangeEvent('onBeforeMove');
const fairyStanceModify = stanceChangeEvent('onModifyMove');

export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
 magicbounce: {
  inherit: true,
  onTryHit(target, source, move) {
   if (target === source || move.hasBounced || !move.flags.reflectable || target.isSemiInvulnerable()) return;
   if (fieldId(this) === 'mirror') this.boost({evasion: 1}, target, target, this.effect);
   const reflected = this.dex.getActiveMove(move.id);
   reflected.hasBounced = true;
   reflected.pranksterBoosted = false;
   this.actions.useMove(reflected, target, {target: source});
   return null;
  },
  onAllyTryHitSide(target, source, move) {
   if (target.isAlly(source) || move.hasBounced || !move.flags.reflectable || target.isSemiInvulnerable()) return;
   const bearer = this.effectState.target;
   if (fieldId(this) === 'mirror') this.boost({evasion: 1}, bearer, bearer, this.effect);
   const reflected = this.dex.getActiveMove(move.id);
   reflected.hasBounced = true;
   reflected.pranksterBoosted = false;
   this.actions.useMove(reflected, bearer, {target: source});
   move.hasBounced = true;
   return null;
  },
 },

 rkssystem: {inherit: true,
  onStart(pokemon) {
   if (fieldId(this) === 'holy' && pokemon.baseSpecies.baseSpecies === 'Silvally' && !pokemon.transformed) {
    pokemon.addVolatile('rebornsilvallyholy');
   }
   activateGlitchForm.call(this, pokemon);
  },
  onResidual: activateGlitchForm,
 },
 justified: {inherit: true,
  onDamagingHit(damage, target, source, move) {
   if (move.type === 'Dark') this.boost({atk: fieldId(this) === 'holy' ? 2 : 1});
  },
 },
 cursedbody: {inherit: true,
  onDamagingHit(damage, target, source, move) {
   if (fieldId(this) === 'holy' || source.volatiles.disable || move.isMax || move.flags.futuremove || move.id === 'struggle') return;
   if (this.randomChance(3, 10)) source.addVolatile('disable', target);
  },
 },
 protean: {inherit: true, onPrepareHit: prepareTypeChange('protean')},
 libero: {inherit: true, onPrepareHit: prepareTypeChange('libero')},
 icebody: {inherit: true,
  onResidualOrder: 5,
  onResidualSubOrder: 2,
  onResidual(pokemon) {
   if (['icy', 'snowymountain'].includes(fieldId(this)) && !['hail', 'snowscape'].includes(pokemon.effectiveWeather())) {
    this.heal(pokemon.baseMaxhp / 16, pokemon, pokemon, this.effect);
   }
  },
 },
 slushrush: {inherit: true,
  onModifySpe() {
   if (['icy', 'snowymountain'].includes(fieldId(this)) || this.field.isWeather(['hail', 'snowscape'])) return this.chainModify(2);
  },
 },
 snowcloak: {inherit: true,
  onModifyAccuracy(accuracy) {
   if (typeof accuracy === 'number' &&
    (['icy', 'snowymountain'].includes(fieldId(this)) || this.field.isWeather(['hail', 'snowscape']))) return this.chainModify([3277, 4096]);
  },
 },
 aerilate: {inherit: true,
  onBasePower(basePower, source, target, move) {
   if (move.typeChangerBoosted === this.effect) {
    return this.chainModify(['mountain', 'snowymountain'].includes(fieldId(this)) ? 1.5 : [4915, 4096]);
   }
  },
 },
 galewings: {inherit: true,
  onModifyPriority(priority, pokemon, target, move) {
   if (move?.type === 'Flying' && (pokemon.hp === pokemon.maxhp ||
    (['mountain', 'snowymountain'].includes(fieldId(this)) && this.field.isWeather('deltastream')))) return priority + 1;
  },
 },
 deltastream: {inherit: true,
  onStart(pokemon) {
   if (this.field.weather === 'deltastream' && this.field.weatherState.duration) {
    this.field.weatherState.duration = 0;
    this.field.weatherState.source = pokemon;
    this.field.weatherState.sourceSlot = pokemon.getSlot();
    this.add('-weather', 'DeltaStream', '[from] ability: Delta Stream', `[of] ${pokemon}`);
   } else {
    this.field.setWeather('deltastream');
   }
  },
 },
 longreach: {inherit: true,
  onModifyDamage() {
   if (['mountain', 'snowymountain'].includes(fieldId(this))) return this.chainModify(1.5);
  },
  onSourceModifyAccuracy(accuracy) {
   if (['rocky', 'forest'].includes(fieldId(this)) && typeof accuracy === 'number') return this.chainModify([3686, 4096]);
  },
 },
 effectspore: {inherit: true,
  onDamagingHit(damage, target, source, move) {
   if (!this.checkMoveMakesContact(move, source, target) || !source.runStatusImmunity('powder')) return;
   const factor = ['forest', 'wasteland'].includes(fieldId(this)) ? 2 : 1;
   const roll = this.random(100);
   if (roll < 11 * factor) source.trySetStatus('slp', target);
   else if (roll < 21 * factor) source.trySetStatus('par', target);
   else if (roll < 30 * factor) source.trySetStatus('psn', target);
  },
 },
 chlorophyll: {inherit: true,
  onModifySpe(spe, pokemon) {
   if (flowerGardenStage(fieldId(this)) >= 4 || ['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
    return this.chainModify(2);
   }
  },
 },
 harvest: {inherit: true,
  onResidual(pokemon) {
   if (flowerGardenStage(fieldId(this)) < 2) {
    this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Abilities.harvest.onResidual?.call(this, pokemon, pokemon, this.effect);
    return;
   }
   if (pokemon.hp && !pokemon.item && this.dex.items.get(pokemon.lastItem).isBerry) {
    pokemon.setItem(pokemon.lastItem);
    pokemon.lastItem = '';
    this.add('-item', pokemon, pokemon.getItem(), '[from] ability: Harvest');
   }
  },
 },
 flowergift: {inherit: true,
  onUpdate(pokemon) {
   if (flowerGardenStage(fieldId(this)) || pokemon.species.id === 'cherrimsunshine') {
    this.singleEvent('WeatherChange', this.effect, this.effectState, pokemon);
   }
  },
  onWeatherChange(pokemon, source, sourceEffect) {
   if (!flowerGardenStage(fieldId(this))) {
    this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Abilities.flowergift.onWeatherChange?.call(this, pokemon, source, sourceEffect);
    return;
   }
   if (pokemon.hp && pokemon.isActive && pokemon.baseSpecies.baseSpecies === 'Cherrim' &&
    !pokemon.transformed && pokemon.species.id !== 'cherrimsunshine') {
    pokemon.formeChange('Cherrim-Sunshine', this.effect, false, '0', '[msg]');
   }
  },
  onAllyModifyAtk(atk, pokemon) {
   if (this.effectState.target.baseSpecies.baseSpecies !== 'Cherrim') return;
   if (flowerGardenStage(fieldId(this)) || ['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
    return this.chainModify(1.5);
   }
  },
  onAllyModifySpD(spd, pokemon) {
   if (this.effectState.target.baseSpecies.baseSpecies !== 'Cherrim') return;
   if (flowerGardenStage(fieldId(this)) || ['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
    return this.chainModify(1.5);
   }
  },
 },
 leafguard: {inherit: true,
  onSetStatus(status, target, source, effect) {
   if (!leafGuardActive(this, target)) return;
   if ((effect as Move)?.status) this.add('-immune', target, '[from] ability: Leaf Guard');
   return false;
  },
  onTryAddVolatile(status, target) {
   if (status.id === 'yawn' && leafGuardActive(this, target)) {
    this.add('-immune', target, '[from] ability: Leaf Guard');
    return null;
   }
  },
 },
 overgrow: {inherit: true, onModifyAtk: fieldStarterBoost('Grass', 'forest'), onModifySpA: fieldStarterBoost('Grass', 'forest')},
 swarm: {inherit: true, onModifyAtk: fieldStarterBoost('Bug', 'forest'), onModifySpA: fieldStarterBoost('Bug', 'forest')},
 sapsipper: {inherit: true,
  onResidualOrder: 5,
  onResidualSubOrder: 2,
  onResidual(pokemon) {
   if (fieldId(this) === 'forest') this.heal(pokemon.baseMaxhp / 16, pokemon, pokemon, this.effect);
  },
 },
 refrigerate: {inherit: true,
  onBasePower(basePower, pokemon, target, move) {
   if (move.typeChangerBoosted === this.effect) return this.chainModify(['icy', 'snowymountain'].includes(fieldId(this)) ? 1.5 : [4915, 4096]);
  },
 },
 liquidvoice: {inherit: true,
  onModifyType(move, pokemon) {
   if (move.flags.sound && !pokemon.volatiles.dynamax) move.type = fieldId(this) === 'icy' ? 'Ice' : 'Water';
  },
 },
 aftermath: {inherit: true,
  onDamagingHit(damage, target, source, move) {
   if (!target.hp && this.checkMoveMakesContact(move, source, target, true)) {
    this.damage(source.baseMaxhp / (fieldId(this) === 'corrosivemist' ? 2 : 4), source, target);
   }
  },
 },
 poisonpoint: {inherit: true,
  onDamagingHit(damage, target, source, move) {
   if (this.checkMoveMakesContact(move, source, target) &&
    this.randomChance(fieldId(this) === 'wasteland' ? 6 : 3, 10)) source.trySetStatus('psn', target);
  },
 },
 stench: {inherit: true,
  onModifyMove(move) {
   if (move.category === 'Status' || move.secondaries?.some(secondary => secondary.volatileStatus === 'flinch')) return;
   (move.secondaries ??= []).push({chance: ['wasteland', 'murkwatersurface'].includes(fieldId(this)) ? 20 : 10, volatileStatus: 'flinch'});
  },
 },
 liquidooze: {inherit: true,
  onSourceTryHeal(damage, target, source, effect) {
   if (!['drain', 'leechseed', 'strengthsap'].includes(effect.id)) return;
   this.damage(['wasteland', 'murkwatersurface'].includes(fieldId(this)) ? damage * 2 : damage);
   return 0;
  },
 },
 corrosion: {inherit: true,
  onModifyDamage(damage, source, target, move) {
   if (['corrosive', 'corrosivemist'].includes(fieldId(this))) return this.chainModify(1.5);
  },
 },
 merciless: {inherit: true,
  onModifyCritRatio(critRatio, source, target) {
   if (target && (['corrosive', 'corrosivemist', 'wasteland', 'murkwatersurface'].includes(fieldId(this)) || ['psn', 'tox'].includes(target.status))) return 5;
  },
 },
 toxicboost: {inherit: true,
  onBasePower(basePower, source, target, move) {
   if (move.category === 'Physical' && (['corrosive', 'wasteland', 'murkwatersurface'].includes(fieldId(this)) || ['psn', 'tox'].includes(source.status))) {
    return this.chainModify(1.5);
   }
  },
 },
 poisonheal: {inherit: true,
  onResidualOrder: 5,
  onResidualSubOrder: 2,
  onResidual(pokemon) {
   const field = fieldId(this);
   if (pokemon.isGrounded() && (field === 'corrosive' ||
    (['wasteland', 'murkwatersurface'].includes(field) && !['psn', 'tox'].includes(pokemon.status)))) this.heal(pokemon.maxhp / 8);
  },
 },
 wonderskin: {inherit: true,
  onModifyAccuracy(accuracy, target, source, move) {
   if (move.category !== 'Status' || source === target) return;
   if (fieldId(this) === 'rainbow') return 0;
   if (typeof accuracy === 'number') return 50;
  },
 },
 cloudnine: {inherit: true,
  onResidualOrder: 5,
  onResidualSubOrder: 2,
  onResidual(pokemon) {
   if (fieldId(this) !== 'rainbow') return;
   const stats: BoostID[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];
   this.boost({[this.sample(stats)]: 1}, pokemon, pokemon, this.effect);
  },
 },
 baddreams: {inherit: true,
  onResidual(pokemon) {
   if (fieldId(this) === 'rainbow' || !pokemon.hp) return;
   for (const target of pokemon.foes()) {
    if (target.status === 'slp' || target.hasAbility('comatose')) this.damage(target.baseMaxhp / 8, target, pokemon);
   }
  },
 },
 blaze: {inherit: true,
  onModifyAtk(atk, source, target, move) {
   if (move.type === 'Fire' && (fieldId(this) === 'burning' || source.hp <= source.maxhp / 3)) return this.chainModify(1.5);
  },
  onModifySpA(spa, source, target, move) {
   if (move.type === 'Fire' && (fieldId(this) === 'burning' || source.hp <= source.maxhp / 3)) return this.chainModify(1.5);
  },
 },
 flareboost: {inherit: true,
  onBasePower(basePower, source, target, move) {
   if (move.category === 'Special' && (source.status === 'brn' || fieldId(this) === 'burning')) return this.chainModify(1.5);
  },
 },
 dancer: {inherit: true,
  onAfterMove(source, target, move) {
   if (fieldId(this) === 'bigtop' && move.flags.dance && move.sourceEffect !== 'dancer' &&
    this.lastSuccessfulMoveThisTurn === move.id) {
    this.boost({spa: 1, spe: 1}, source, source, this.effect);
   }
  },
 },
 prismarmor: {inherit: true,
  onSourceModifyDamage(damage, source, target, move) {
   let multiplier = target.getMoveHitData(move).typeMod > 0 ? 0.75 : 1;
   if (['darkcrystalcavern', 'crystalcavern', 'rainbow'].includes(fieldId(this))) multiplier *= 0.75;
   if (multiplier !== 1) return this.chainModify(multiplier);
  },
 },
 shadowshield: {inherit: true,
  onSourceModifyDamage(damage, source, target, move) {
   let multiplier = target.hp >= target.maxhp ? 0.5 : 1;
   if (['darkcrystalcavern', 'starlight', 'newworld'].includes(fieldId(this)) && target.getMoveHitData(move).typeMod > 0) multiplier *= 0.75;
   if (multiplier !== 1) return this.chainModify(multiplier);
  },
 },
 victorystar: {inherit: true,
  onAnyModifyDamage(damage, source) {
   if (['starlight', 'newworld'].includes(fieldId(this)) && source.isAlly(this.effectState.target)) return this.chainModify(1.5);
  },
 },
 purepower: {inherit: true,
  onModifyAtk() { if (fieldId(this) !== 'psyterrain') return this.chainModify(2); },
  onModifySpAPriority: 5,
  onModifySpA() { if (fieldId(this) === 'psyterrain') return this.chainModify(2); },
 },
 telepathy: {inherit: true, onModifySpe(spe) { if (fieldId(this) === 'psyterrain') return this.chainModify(2); }},
 anticipation: {inherit: true, onStart(pokemon) {
  const original = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').data.Abilities.anticipation.onStart;
  if (original) original.call(this, pokemon);
  if (fieldId(this) === 'psyterrain') this.boost({spa: 2}, pokemon, pokemon, this.effect);
 }},
 pixilate: {inherit: true,
  onBasePower(basePower, pokemon, target, move) {
   if (move.typeChangerBoosted === this.effect) return this.chainModify(fieldId(this) === 'misty' ? 1.5 : [4915, 4096]);
  },
 },
 gooey: {inherit: true,
  onDamagingHit(damage, target, source, move) {
   if (this.checkMoveMakesContact(move, source, target, true)) {
    this.add('-ability', target, 'Gooey');
    this.boost({spe: ['swamp', 'murkwatersurface'].includes(fieldId(this)) ? -2 : -1}, source, target, null, true);
    if (fieldId(this) === 'wasteland') source.trySetStatus('psn', target, this.effect);
   }
  },
 },
 watercompaction: {inherit: true,
  onDamagingHit(damage, target, source, move) {
   if (move.type === 'Water') this.boost(fieldId(this) === 'ashenbeach' ? {def: 2, spd: 2} : {def: 2});
  },
  onResidualOrder: 5,
  onResidualSubOrder: 2,
  onResidual(pokemon) {
   if (['swamp', 'watersurface', 'underwater', 'murkwatersurface'].includes(fieldId(this))) this.boost({def: 2}, pokemon, pokemon, this.effect);
  },
  onStart(pokemon) {
   if (['misty', 'corrosivemist'].includes(fieldId(this))) this.boost({def: 2}, pokemon, pokemon, this.effect);
  },
 },
 zenmode: {inherit: true,
  onUpdate(pokemon) {
   if (pokemon.baseSpecies.baseSpecies !== 'Darmanitan' || pokemon.transformed || !pokemon.hp) return;
   if (fieldId(this) === 'ashenbeach' && !pokemon.volatiles.zenmode) pokemon.addVolatile('zenmode');
   if (fieldId(this) !== 'ashenbeach' && pokemon.volatiles.zenmode?.ashenBeach &&
    pokemon.hp > pokemon.maxhp / 2) pokemon.removeVolatile('zenmode');
   if (fieldId(this) === 'ashenbeach' && pokemon.volatiles.zenmode) pokemon.volatiles.zenmode.ashenBeach = true;
  },
  onResidual(pokemon, source, effect) {
   if (fieldId(this) === 'ashenbeach') return;
   const native = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Abilities.zenmode;
   native.onResidual!.call(this, pokemon, source, effect);
  },
 },
 sandforce: {inherit: true,
  onBasePower(basePower, attacker, defender, move) {
   if (['Rock', 'Ground', 'Steel'].includes(move.type) &&
    (['desert', 'ashenbeach'].includes(fieldId(this)) || this.field.isWeather('sandstorm'))) return this.chainModify([5325, 4096]);
  },
 },
 sandrush: {inherit: true,
  onModifySpe() {
   if (['desert', 'ashenbeach'].includes(fieldId(this)) || this.field.isWeather('sandstorm')) return this.chainModify(2);
  },
 },
 sandveil: {inherit: true,
  onModifyAccuracy(accuracy) {
   if (typeof accuracy === 'number' &&
    (['desert', 'ashenbeach'].includes(fieldId(this)) || this.field.isWeather('sandstorm'))) return this.chainModify([3277, 4096]);
  },
 },
 dryskin: {inherit: true, onResidualOrder: 5, onResidualSubOrder: 2,
  onResidual(pokemon) {
   const field = fieldId(this);
   if ((field === 'underwater' || (field === 'watersurface' && pokemon.isGrounded()))) this.heal(pokemon.maxhp / 16, pokemon, pokemon, this.effect);
   if (field === 'murkwatersurface' && pokemon.isGrounded() && pokemon.hasType('Poison')) {
    this.heal(pokemon.maxhp / 8, pokemon, pokemon, this.effect);
   }
   if (['sunnyday', 'desolateland', 'raindance', 'primordialsea'].includes(pokemon.effectiveWeather())) return;
   if (['misty', 'swamp'].includes(field)) {
    this.heal(pokemon.baseMaxhp / 16, pokemon, pokemon, this.effect);
   } else if (field === 'desert') {
    this.damage(pokemon.maxhp / 8, pokemon, pokemon, this.effect);
   } else if (field === 'corrosivemist') {
    if (pokemon.hasType('Poison')) {
     this.heal(pokemon.maxhp / 8, pokemon, pokemon, this.effect);
    } else if (!pokemon.hasType('Steel')) {
     this.damage(pokemon.maxhp / 8, pokemon, pokemon, this.effect);
    }
   }
  },
 },
 fairyaura: {inherit: true,
  onModifyMove(move) {
   if (fieldId(this) === 'fairytale') move.alwaysHit = true;
  },
 },
 queenlymajesty: {inherit: true,
  onModifyDamage() {
   if (fieldId(this) === 'fairytale') return this.chainModify(1.5);
  },
 },
 stancechange: {inherit: true,
  onBeforeMovePriority: 11,
  onBeforeMove(source, target, move) {
   return fairyStanceBefore.call(this, move, source, target);
  },
  onModifyMovePriority: 1,
  onModifyMove: fairyStanceModify,
 },
 soulheart: {inherit: true,
  onAnyFaint() {
   this.boost(['misty', 'rainbow', 'fairytale'].includes(fieldId(this)) ? {spa: 1, spd: 1} : {spa: 1}, this.effectState.target);
  },
 },
 grasspelt: {inherit: true, onModifyDefPriority: 6,
  onResidualOrder: 5,
  onResidualSubOrder: 2,
  onResidual(pokemon) {
   if (fieldId(this) === 'corrosive' && !pokemon.hasType(['Poison', 'Steel'])) {
    this.damage(pokemon.maxhp / 8, pokemon, pokemon, this.effect);
   }
  },
  onModifyDef() {
   if (['grassy', 'forest'].includes(fieldId(this)) || this.field.isTerrain('grassyterrain')) return this.chainModify(1.5);
  },
 },
	electricsurge: {
  inherit: true,
  onStart(pokemon) {
   if (fieldId(this) !== 'electerrain') {
    this.add('-ability', pokemon, 'Electric Surge', '[then]');
    startTimedField(this, 'electerrain', pokemon, 5);
   }
  },
 },
 galvanize: {inherit: true,
  onBasePower(basePower, pokemon, target, move) {
   if (move.typeChangerBoosted === this.effect) {
    const field = fieldId(this);
    if (field === 'shortcircuit') return this.chainModify(2);
    return this.chainModify(['electerrain', 'factory'].includes(field) ? 1.5 : [4915, 4096]);
   }
  },
 },
 steelworker: {inherit: true,
  onModifyAtk(atk, source, target, move) {
   if (move.type === 'Steel') return this.chainModify(fieldId(this) === 'factory' ? 2 : 1.5);
  },
  onModifySpA(spa, source, target, move) {
   if (move.type === 'Steel') return this.chainModify(fieldId(this) === 'factory' ? 2 : 1.5);
  },
 },
 download: {inherit: true,
  onStart(pokemon) {
   let defense = 0;
   let specialDefense = 0;
   for (const foe of pokemon.foes()) {
    defense += foe.getStat('def', false, true);
    specialDefense += foe.getStat('spd', false, true);
   }
   const stages = fieldId(this) === 'factory' ? 2 : 1;
   if (defense && defense >= specialDefense) this.boost({spa: stages});
   else if (specialDefense) this.boost({atk: stages});
  },
 },
 technician: {inherit: true,
  onBasePower(basePower) {
   const inFactory = fieldId(this) === 'factory';
   const power = inFactory ? basePower : this.modify(basePower, this.event.modifier);
   this.debug(`Base Power: ${power}`);
   if (power <= (inFactory ? 80 : 60)) {
    this.debug('Technician boost');
    return this.chainModify(1.5);
   }
  },
 },
 static: {inherit: true,
  onDamagingHit(damage, target, source, move) {
   if (this.checkMoveMakesContact(move, source, target) && this.randomChance(fieldId(this) === 'shortcircuit' ? 6 : 3, 10)) {
    source.trySetStatus('par', target);
   }
  },
 },
 plus: {inherit: true, onModifySpA: plusMinusBoost},
 minus: {inherit: true, onModifySpA: plusMinusBoost},
 voltabsorb: {inherit: true, onResidualOrder: 5, onResidualSubOrder: 2,
  onResidual(pokemon) {
   if (fieldId(this) === 'shortcircuit') this.heal(pokemon.baseMaxhp / 16, pokemon, pokemon, this.effect);
  },
 },
 motordrive: {inherit: true, onResidualOrder: 5, onResidualSubOrder: 2,
  onTryHit(target, source, move) {
   if (target === source || move.type !== 'Electric') return;
   if (!this.boost({spe: fieldId(this) === 'shortcircuit' ? 2 : 1})) {
    this.add('-immune', target, '[from] ability: Motor Drive');
   }
   return null;
  },
  onResidual(pokemon) { if (fieldId(this) === 'electerrain') this.boost({spe: 1}, pokemon, pokemon, this.effect); },
 },
 slowstart: {inherit: true, onResidualOrder: 26,
  onResidual(pokemon) {
   if (pokemon.activeTurns && this.effectState.counter) {
    this.effectState.counter = Math.max(0, this.effectState.counter - (fieldId(this) === 'electerrain' ? 2 : 1));
    if (!this.effectState.counter) { this.add('-end', pokemon, 'Slow Start'); delete this.effectState.counter; }
   }
  },
 },

 torrent: {inherit: true, onModifyAtk: fieldStarterBoost('Water', 'watersurface'), onModifySpA: fieldStarterBoost('Water', 'watersurface')},
 swiftswim: {inherit: true,
  onModifySpe(spe, pokemon) {
   const field = fieldId(this);
   if (['underwater', 'murkwatersurface'].includes(field) || (field === 'watersurface' && pokemon.isGrounded()) ||
    ['raindance', 'primordialsea'].includes(pokemon.effectiveWeather())) return this.chainModify(2);
  },
 },
 surgesurfer: {inherit: true,
  onModifySpe(spe, pokemon) {
   const field = fieldId(this);
   if (['electerrain', 'shortcircuit', 'underwater', 'murkwatersurface'].includes(field) || (field === 'watersurface' && pokemon.isGrounded())) {
    return this.chainModify(2);
   }
  },
 },
 schooling: {inherit: true,
  onStart: updateSchooling,
  onUpdate(pokemon) {
   if (['watersurface', 'underwater', 'murkwatersurface'].includes(fieldId(this)) || pokemon.m.rebornWaterSchooling) updateSchooling.call(this, pokemon);
  },
  onResidual: updateSchooling,
 },
 hydration: {inherit: true,
  onResidual(pokemon) {
   if (pokemon.status && (['watersurface', 'underwater'].includes(fieldId(this)) ||
    ['raindance', 'primordialsea'].includes(pokemon.effectiveWeather()))) {
    this.add('-activate', pokemon, 'ability: Hydration');
    pokemon.cureStatus();
   }
  },
 },
 waterabsorb: {inherit: true,
  onResidualOrder: 5,
  onResidualSubOrder: 2,
  onResidual(pokemon) {
   const field = fieldId(this);
   if (field === 'underwater' || (field === 'watersurface' && pokemon.isGrounded())) this.heal(pokemon.maxhp / 16);
   if (field === 'murkwatersurface' && pokemon.isGrounded() && pokemon.hasType('Poison')) {
    this.heal(pokemon.maxhp / 8, pokemon, pokemon, this.effect);
   }
  },
 },
 waterveil: {inherit: true,
  onResidualOrder: 5,
  onResidualSubOrder: 3,
  onResidual(pokemon) {
   if (['watersurface', 'underwater'].includes(fieldId(this)) && pokemon.status) {
    this.add('-activate', pokemon, 'ability: Water Veil');
    pokemon.cureStatus();
   }
  },
 },
	flashfire: {
		inherit: true,
		onTryHit(target, source, move) {
			const field = fieldId(this);
			const added = (field === 'dragonsden' && ['smackdown', 'thousandarrows', 'tectonicrage', 'continentalcrush'].includes(move.id)) ||
				(field === 'burning' && FIELD_DATA.burning.typeMods.FIRE.includes(move.id.toUpperCase()));
			if (target !== source && (added || move.type === 'Fire')) {
				move.accuracy = true;
				if (!target.addVolatile('flashfire')) this.add('-immune', target, '[from] ability: Flash Fire');
				return null;
			}
		},
	},
	mimicry: {
		inherit: true,
		onStart(pokemon) {
   delete this.effectState.crystalMimicryType;
   this.singleEvent('TerrainChange', this.effect, this.effectState, pokemon);
  },
		onUpdate(pokemon) { this.singleEvent('TerrainChange', this.effect, this.effectState, pokemon); },
		onTerrainChange(pokemon, source, effect) {
			const field = fieldId(this);
   if (field !== 'crystalcavern') delete this.effectState.crystalMimicryType;
			if (field === 'none') return this.dex.mod('gen9').data.Abilities.mimicry.onTerrainChange!.call(this, pokemon, source, effect);
   const raw = FIELD_DATA[field]?.mimicry || 'NORMAL';
   const type = field === 'crystalcavern' ?
    (this.effectState.crystalMimicryType ??= crystalType(this, true)) :
    raw === 'QMARKS' ? '???' : raw[0] + raw.slice(1).toLowerCase();
			if (pokemon.getTypes().join() !== type && pokemon.setType(type)) this.add('-start', pokemon, 'typechange', type, '[from] ability: Mimicry');
		},
	},
	marvelscale: {
		inherit: true,
		onModifyDefPriority: 6,
		onModifyDef(def, pokemon) {
			if (pokemon.status || ['dragonsden', 'misty', 'rainbow', 'fairytale', 'starlight'].includes(fieldId(this))) return this.chainModify(1.5);
		},
	},
	magmaarmor: {
		inherit: true,
		onStart(pokemon) {
			if (fieldId(this) === 'dragonsden') this.boost({def: 1, spd: 1}, pokemon);
		},
		onTryHit(target, source, move) {
			if (fieldId(this) === 'dragonsden' && (move.type === 'Fire' || ['smackdown', 'thousandarrows', 'tectonicrage', 'continentalcrush'].includes(move.id)) && target !== source) {
				this.add('-immune', target, '[from] ability: Magma Armor'); return null;
			}
		},
	},
	multiscale: {
		inherit: true,
		onEffectiveness(mod, target, type) {
			if (fieldId(this) === 'dragonsden' && type === 'Dragon' && mod > 0) return 0;
		},
	},
	shedskin: {
		inherit: true, onResidualOrder: 5, onResidualSubOrder: 3,
		onResidual(pokemon) {
			if (!pokemon.status) return;
			if (fieldId(this) === 'dragonsden') {
				this.add('-activate', pokemon, 'ability: Shed Skin');
				pokemon.cureStatus();
				this.add('message', `${pokemon.name}'s scaled sheen glimmers brightly!`);
				this.heal(pokemon.baseMaxhp / 4, pokemon);
				this.boost({spa: 1, spe: 1, def: -1, spd: -1}, pokemon);
			} else if (this.randomChance(1, 3)) pokemon.cureStatus();
		},
	},
	levitate: {
		inherit: true,
		onImmunity(type) { if (type === 'Ground' && fieldId(this) !== 'cave') return false; },
	},
};
