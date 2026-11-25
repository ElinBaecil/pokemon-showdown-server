import {FIELD_DATA} from './field-data';
import {flowerGardenStage, camouflageType, crystalType, fieldId, setField, startTimedField} from './field-engine';
import type {Battle} from '../../../sim/battle';
import type {Pokemon} from '../../../sim/pokemon';

function darkCrystalHealing(move: 'moonlight' | 'morningsun' | 'synthesis', fraction: number) {
 return function (this: Battle, pokemon: Pokemon, source: Pokemon, activeMove: ActiveMove) {
  const id = fieldId(this);
 const dryDarkCrystal = id === 'darkcrystalcavern' && !pokemon.effectiveWeather(undefined, true);
 const clearStarlight = ['starlight', 'newworld'].includes(id) && move === 'moonlight' && !this.field.effectiveWeather();
 if (!dryDarkCrystal && !clearStarlight) {
   const onHit = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').moves.get(move).onHit;
   return typeof onHit === 'function' ? onHit.call(this, pokemon, source, activeMove) : onHit;
  }
  if (this.heal(this.modify(pokemon.maxhp, fraction))) return true;
  this.add('-fail', pokemon, 'heal');
  return this.NOT_FAIL;
 };
}

export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
 dive: {inherit: true,
  onTryMove(attacker, defender, move) {
   if (!['watersurface', 'underwater'].includes(fieldId(this))) {
    const original = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').moves.get('dive').onTryMove;
    return original?.call(this, attacker, defender, move);
   }
   if (attacker.removeVolatile(move.id)) return;
   if (attacker.hasAbility('gulpmissile') && attacker.species.name === 'Cramorant' && !attacker.transformed) {
    attacker.formeChange(attacker.hp <= attacker.maxhp / 2 ? 'cramorantgorging' : 'cramorantgulping', move);
   }
   // The water fields skip the charge turn and its separate submersion animation.
  },
 },
 metronome: {inherit: true,
  onHit(pokemon, source, move) {
   if (fieldId(this) !== 'glitch') {
    const original = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('metronome').onHit;
    return typeof original === 'function' ? original.call(this, pokemon, source, move) : original;
   }
   const moves = this.dex.moves.all().filter(candidate => candidate.basePower >= 70 && candidate.flags.metronome &&
    (!candidate.isNonstandard || candidate.isNonstandard === 'Unobtainable')).sort((a, b) => a.num - b.num);
   if (!moves.length) return false;
   this.actions.useMove(this.sample(moves).id, pokemon);
  },
 },
 rage: {inherit: true,
  condition: {inherit: true,
   onLockMove() { if (fieldId(this) === 'glitch') return 'rage'; },
   onBeforeMove(pokemon) {
    if (fieldId(this) !== 'glitch') pokemon.removeVolatile('rage');
   },
  },
 },
 curse: {inherit: true,
  condition: {inherit: true,
   onResidual(pokemon) {
    if (fieldId(this) === 'holy') {
     pokemon.removeVolatile('curse');
     this.add('-end', pokemon, 'Curse', '[silent]');
     this.add('message', `${pokemon.name}'s curse was lifted!`);
    }
    this.damage(pokemon.baseMaxhp / 4, pokemon, null, this.effect);
   },
  },
 },
 tailwind: {inherit: true,
  condition: {inherit: true,
   durationCallback(side, source) {
    if (['mountain', 'snowymountain'].includes(fieldId(this))) return 6;
    if (source?.hasAbility('persistent')) {
     this.add('-activate', source, 'ability: Persistent', '[move] Tailwind');
     return 6;
    }
    return 4;
   },
   onSideStart(side, source) {
    const mountain = ['mountain', 'snowymountain'].includes(fieldId(this));
    if (mountain || source?.hasAbility('persistent')) this.add('-sidestart', side, 'move: Tailwind', '[persistent]');
    else this.add('-sidestart', side, 'move: Tailwind');
    if (!mountain || !source || ['desolateland', 'primordialsea'].includes(this.field.weather)) return;
    if (this.field.weather === 'deltastream') {
     if (!this.field.weatherState.duration) return; // Delta Stream from an ability has no timer.
    } else if (!this.field.setWeather('deltastream', source, this.dex.getActiveMove('tailwind'))) {
     return;
    }
    this.field.weatherState.duration = 6;
    this.add('rebornweatherduration', 'deltastream', 6);
   },
  },
 },
 stealthrock: {inherit: true,
  condition: {inherit: true,
   onSwitchIn(pokemon) {
    if (pokemon.hasItem('heavydutyboots')) return;
    const hazard = this.dex.getActiveMove('stealthrock');
    if (fieldId(this) === 'crystalcavern') {
     hazard.type = crystalType(this, true);
     this.add('message', `The crystals gave Stealth Rock the ${hazard.type} type!`);
     if (!this.dex.getImmunity(hazard, pokemon)) return;
    }
    const typeMod = this.clampIntRange(pokemon.runEffectiveness(hazard), -6, 6);
    this.damage(pokemon.maxhp * (2 ** typeMod) / 8);
   },
  },
 },
 leechseed: {inherit: true,
  condition: {inherit: true,
   onResidual(pokemon) {
    const target = this.getAtSlot(this.effectState.sourceSlot);
    if (!target?.hp) return;
    const damage = this.damage(pokemon.baseMaxhp / (fieldId(this) === 'wasteland' ? 4 : 8), pokemon, target);
    if (damage) this.heal(damage, target, pokemon);
   },
  },
 },
 swallow: {inherit: true,
  onHit(pokemon, source, move) {
   if (fieldId(this) !== 'wasteland') {
    const original = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('swallow').onHit;
    return typeof original === 'function' ? original.call(this, pokemon, source, move) : original;
   }
   const layers = pokemon.volatiles.stockpile?.layers || 1;
   const healed = this.heal(pokemon.maxhp * (layers === 1 ? 0.5 : 1));
   const cured = layers === 3 && pokemon.status && pokemon.cureStatus();
   if (!healed && !cured) this.add('-fail', pokemon, 'heal');
   pokemon.removeVolatile('stockpile');
   return healed || cured ? true : this.NOT_FAIL;
  },
 },
 burnup: {inherit: true, self: {
  onHit(pokemon) {
   const originalTypes = pokemon.getTypes(true).slice();
   const addedType = pokemon.addedType;
   const burnedTypes = originalTypes.map(type => type === 'Fire' ? '???' : type);
   if (!pokemon.setType(burnedTypes)) return;
   this.add('-start', pokemon, 'typechange', pokemon.getTypes().join('/'), '[from] move: Burn Up');
   if (fieldId(this) === 'burning' && pokemon.addVolatile('burningburnup', pokemon)) {
    Object.assign(pokemon.volatiles.burningburnup, {originalTypes, addedType, burnedTypes: burnedTypes.join('/')});
   }
  },
 }},
 bellydrum: {inherit: true,
  onHit(target, source, move) {
   const original = this.dex.mod('gen9').data.Moves.bellydrum.onHit;
   const result = typeof original === 'function' ? original.call(this, target, source, move) : original;
   if (result !== false && result !== null && fieldId(this) === 'bigtop') {
    this.boost({def: 1, spd: 1}, target, target, move);
   }
   return result;
  },
 },
 spotlight: {inherit: true,
  onHit(target, source, move) {
   if (fieldId(this) !== 'bigtop') return;
   this.boost({atk: 1, spa: 1}, target, source, move);
   if (target !== source) this.boost({atk: 1, spa: 1}, source, source, move);
  },
 },
 teeterdance: {inherit: true,
  onHit(target, source, move) {
   if (fieldId(this) === 'bigtop') this.boost({def: -1}, target, source, move);
  },
 },
 encore: {inherit: true, condition: {inherit: true,
  durationCallback() {
   return fieldId(this) === 'bigtop' ? 6 : 3;
  },
 }},
 lunardance: {inherit: true, condition: {inherit: true,
  onStart() { this.effectState.rebornBigTop = fieldId(this) === 'bigtop'; },
  onSwitchIn(target) {
   if (!this.effectState.rebornBigTop || this.gen === 7) {
    const original = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Moves.lunardance.condition?.onSwitchIn;
    if (original) original.call(this, target);
   } else {
    this.singleEvent('Swap', this.effect, this.effectState, target);
   }
   if (this.gen === 7 && target.hp && !target.fainted) {
    if (this.effectState.rebornBigTop) this.boost({atk: 1, def: 1, spa: 1, spd: 1, spe: 1}, target);
    else if (fieldId(this) === 'newworld') this.boost({atk: 1, def: 1, spa: 1, spd: 1, spe: 1}, target, target, this.effect);
    else if (fieldId(this) === 'starlight') this.boost({atk: 1, spa: 1}, target, target, this.effect);
   }
  },
  onSwap(target, source) {
   const original = this.dex.mod('gen9').data.Moves.lunardance.condition?.onSwap;
   const slot = target.side.slotConditions[target.position];
   if (this.gen === 7) return;
   if (original) original.call(this, target, source);
   if (target.hp && !slot.lunardance && !this.effectState.rebornBigTop) {
    if (fieldId(this) === 'newworld') this.boost({atk: 1, def: 1, spa: 1, spd: 1, spe: 1}, target, target, this.effect);
    else if (fieldId(this) === 'starlight') this.boost({atk: 1, spa: 1}, target, target, this.effect);
   }
   if (this.effectState.rebornBigTop && target.hp && !target.fainted) {
    target.side.removeSlotCondition(target, 'lunardance');
    this.boost({atk: 1, def: 1, spa: 1, spd: 1, spe: 1}, target);
   }
  },
 }},
 kingsshield: {inherit: true, condition: {inherit: true,
  onTryHit(target, source, move) {
   if (!['chess', 'fairytale'].includes(fieldId(this))) {
    const original = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Moves.kingsshield.condition?.onTryHit;
    return typeof original === 'function' ? original.call(this, target, source, move) : original;
   }
   if (this.checkMoveBypassesProtect(move, source, target)) return;
   if (move.smartTarget) move.smartTarget = false;
   else this.add('-activate', target, 'move: Protect');
   if (source.volatiles.lockedmove?.duration === 2) delete source.volatiles.lockedmove;
   if (this.checkMoveMakesContact(move, source, target)) {
    this.boost({atk: this.gen === 7 ? -2 : -1, spa: -2}, source, target, this.dex.getActiveMove('kingsshield'));
   }
   return this.NOT_FAIL;
  },
  onHit(target, source, move) {
   if (move.isZOrMaxPowered && this.checkMoveMakesContact(move, source, target)) {
    this.boost({atk: this.gen === 7 ? -2 : -1}, source, target, this.dex.getActiveMove('kingsshield'));
   }
  },
 }},
 mirrormove: {inherit: true,
  onTryHit(target, pokemon) {
   const move = target.lastMove;
   if (!move?.flags.mirror || move.isZ || move.isMax) return false;
   if (fieldId(this) === 'mirror') this.boost({accuracy: 1, atk: 1, spa: 1}, pokemon, pokemon, this.effect);
   this.actions.useMove(move.id, pokemon, {target});
   return null;
  },
 },
 auroraveil: {inherit: true,
  onTry() { return ['darkcrystalcavern', 'crystalcavern', 'rainbow', 'icy', 'snowymountain', 'mirror', 'starlight'].includes(fieldId(this)) || this.field.isWeather(['hail', 'snowscape']); },
 },
 geomancy: {inherit: true,
  onTryMove(source, target, move) {
   if (fieldId(this) === 'starlight') {
    source.removeVolatile(move.id);
    return;
   }
   const native = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Moves.geomancy.onTryMove;
   if (typeof native === 'function') return native.call(this, source, target, move);
  },
 },
 moonlight: {inherit: true, onHit: darkCrystalHealing('moonlight', 0.75)},
 morningsun: {inherit: true, onHit: darkCrystalHealing('morningsun', 0.25)},
 synthesis: {inherit: true, onHit: darkCrystalHealing('synthesis', 0.25)},
 telekinesis: {inherit: true, volatileStatus: undefined, onHit(target, source) {
  if (!target.addVolatile('telekinesis', source)) return false;
  if (fieldId(this) === 'psyterrain') this.boost({def: -2, spd: -2}, target, source);
 }},
 genesissupernova: {inherit: true, secondary: {chance: 100, self: {onHit(source) { startTimedField(this, 'psyterrain', source, 5, false); }}}},
 mist: {inherit: true, sideCondition: undefined,
  onHitSide(side, source) {
   const protectedSide = side.addSideCondition('mist', source);
   const createdField = startTimedField(this, 'misty', source, 3);
   return protectedSide || createdField;
  },
 },
 poisongas: {inherit: true,
  onTryHit(target, source, move) {
   if (fieldId(this) === 'misty') (move as ActiveMove & {rebornMistyPollution?: boolean}).rebornMistyPollution = true;
  },
 },
 aquaring: {inherit: true, condition: {inherit: true,
  onResidual(pokemon) {
   const field = fieldId(this);
   if (field === 'corrosivemist' && !pokemon.hasType(['Poison', 'Steel'])) {
    this.damage(pokemon.maxhp / 16, pokemon, pokemon, this.effect);
   } else {
    this.heal(pokemon.baseMaxhp / (['misty', 'swamp', 'watersurface', 'underwater'].includes(field) ? 8 : 16));
   }
  },
 }},
 toxicspikes: {inherit: true, condition: {inherit: true,
  onSwitchIn(pokemon) {
   if (fieldId(this) === 'corrosive' && pokemon.hasType('Poison')) return;
   const hazard = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('toxicspikes').condition;
   hazard?.onSwitchIn?.call(this, pokemon);
  },
 }},
 venoshock: {inherit: true,
  onBasePower(basePower, source, target) {
   if (['corrosive', 'corrosivemist', 'wasteland', 'murkwatersurface'].includes(fieldId(this)) || ['psn', 'tox'].includes(target.status)) return this.chainModify(2);
  },
 },
 venomdrench: {inherit: true,
  onHit(target, source, move) {
   if (['corrosive', 'corrosivemist', 'wasteland', 'murkwatersurface'].includes(fieldId(this)) || ['psn', 'tox'].includes(target.status)) {
    return !!this.boost({atk: -1, spa: -1, spe: -1}, target, source, move);
   }
   return false;
  },
 },
 ingrain: {inherit: true, condition: {inherit: true,
  onResidual(pokemon) {
   const stage = flowerGardenStage(fieldId(this));
   if (stage >= 2) {
    this.heal(pokemon.maxhp / (stage >= 4 ? 4 : 8));
   } else if (['swamp', 'corrosive'].includes(fieldId(this)) && !pokemon.hasType(['Poison', 'Steel'])) {
    this.damage(pokemon.maxhp / 16, pokemon, pokemon, this.effect);
   } else {
    this.heal(pokemon.baseMaxhp / (fieldId(this) === 'forest' ? 8 : 16));
   }
  },
 }},
 strengthsap: {inherit: true,
  onHit(target, source) {
   if (target.boosts.atk === -6) return false;
   const atk = target.getStat('atk', false, true);
   const success = this.boost({atk: -1}, target, source, null, false, true);
   const healing = ['swamp', 'forest'].includes(fieldId(this)) ? Math.floor(atk * 1.3) : atk;
   return !!(this.heal(healing, source, target) || success);
  },
 },
 healingwish: {inherit: true, condition: {inherit: true,
  onSwitchIn(target) {
   if (this.gen === 7) {
    const receivesWish = !target.fainted;
    const original = this.dex.mod('gen7').data.Moves.healingwish.condition?.onSwitchIn;
    if (typeof original === 'function') original.call(this, target);
    if (receivesWish && ['fairytale', 'starlight'].includes(fieldId(this))) this.boost({atk: 1, spa: 1}, target, target, this.effect);
    return;
   }
   this.singleEvent('Swap', this.effect, this.effectState, target);
  },
  onSwap(target, source) {
   const receivesWish = !target.fainted && (target.hp < target.maxhp || !!target.status);
   const original = this.dex.mod('gen9').data.Moves.healingwish.condition?.onSwap;
   if (typeof original === 'function') original.call(this, target, source);
   if (receivesWish && ['fairytale', 'starlight'].includes(fieldId(this))) this.boost({atk: 1, spa: 1}, target, target, this.effect);
  },
 }},
 drainingkiss: {inherit: true,
  onHit(target) {
   if (fieldId(this) === 'fairytale' && target.hp && target.status === 'slp') target.cureStatus();
  },
 },
 sweetkiss: {inherit: true,
  onHit(target) {
   if (fieldId(this) === 'fairytale' && target.status === 'slp') return target.cureStatus();
  },
 },
 craftyshield: {inherit: true, condition: {inherit: true,
  onSideStart(side, source) {
   this.add('-singleturn', source, 'Crafty Shield');
   if (fieldId(this) === 'fairytale') this.boost({def: 1, spd: 1}, source, source, this.dex.getActiveMove('craftyshield'));
  },
 }},
 rototiller: {inherit: true,
  onHitField(target, source, move) {
   if (!flowerGardenStage(fieldId(this))) {
    const original = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Moves.rototiller.onHitField;
    if (typeof original === 'function') return original.call(this, target, source, move);
    return;
   }
   let affected = false;
   for (const pokemon of this.getAllActive()) {
    if (pokemon !== source && (!pokemon.hasType('Grass') || !pokemon.isGrounded())) continue;
    affected = this.boost({atk: 2, spa: 2}, pokemon, source, move) || affected;
   }
   return affected;
  },
 },
 flowershield: {inherit: true,
  onHitField(target, source, move) {
   const stage = flowerGardenStage(fieldId(this));
   if (stage >= 2) {
    const amount = stage >= 3 ? 2 : 1;
    let affected = false;
    for (const pokemon of this.getAllActive()) {
     if (pokemon !== source && (!pokemon.hasType('Grass') ||
      (pokemon.volatiles.maxguard && !this.runEvent('TryHit', pokemon, source, move)))) continue;
     affected = this.boost({def: amount, spd: amount}, pokemon, source, move) || affected;
    }
    return affected;
   }
   const original = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Moves.flowershield.onHitField;
   const affected = typeof original === 'function' && original.call(this, target, source, move);
   if (fieldId(this) === 'fairytale' && !source.hasType('Grass')) {
    return this.boost({def: 1, spd: 1}, source, source, move) || affected;
   }
   return affected;
  },
 },
 wish: {inherit: true, condition: {inherit: true,
  onStart(pokemon, source) {
   this.effectState.hp = source.maxhp / 2;
   this.effectState.rebornReceiverWish = ['rainbow', 'holy', 'fairytale', 'starlight'].includes(fieldId(this));
   this.effectState.rebornStartingTurn = this.turn;
  },
  onRestart() { return false; },
  onResidual(target) {
   if (this.turn <= this.effectState.rebornStartingTurn) return;
   target.side.removeSlotCondition(target, 'wish');
  },
  onEnd(target) {
   if (target && (['misty', 'rainbow', 'holy', 'fairytale', 'starlight'].includes(fieldId(this)) || this.effectState.rebornReceiverWish)) this.effectState.hp = target.maxhp * 0.75;
   if (target && !target.fainted) {
    const healed = this.heal(this.effectState.hp, target, target);
    if (healed) this.add('-heal', target, target.getHealth, '[from] move: Wish', '[wisher] ' + this.effectState.source.name);
   }
  },
 }},
 guardianofalola: {inherit: true,
  damageCallback(pokemon, target) {
   if (fieldId(this) !== 'newworld') {
    const native = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Moves.guardianofalola.damageCallback;
    return native!.call(this, pokemon, target);
   }
   const damage = Math.floor(target.baseMaxhp * 0.75);
   if (target.volatiles.protect || target.volatiles.banefulbunker || target.volatiles.kingsshield ||
    target.volatiles.spikyshield || target.side.getSideCondition('matblock')) {
    this.add('-zbroken', target);
    return this.clampIntRange(Math.ceil(damage / 4 - 0.5), 1);
   }
   return this.clampIntRange(damage, 1);
  },
 },
 naturesmadness: {inherit: true,
  damageCallback(pokemon, target) {
   const fraction = ['grassy', 'forest', 'holy', 'newworld'].includes(fieldId(this)) ? 0.75 : 0.5;
   return this.clampIntRange(Math.floor(target.getUndynamaxedHP() * fraction), 1);
  },
 },
 healorder: {inherit: true,
  onModifyMove(move) {
   if (fieldId(this) === 'forest') move.heal = [2, 3];
  },
 },
 stickyweb: {inherit: true, condition: {inherit: true,
  onSwitchIn(pokemon) {
   if (!pokemon.isGrounded() || pokemon.hasItem('heavydutyboots')) return;
   this.add('-activate', pokemon, 'move: Sticky Web');
   const forest = fieldId(this) === 'forest';
   const source = this.gen === 7 ? this.effectState.source : pokemon.side.foe.active[0];
   this.boost({spe: forest ? -2 : -1}, pokemon, source, this.dex.getActiveMove('stickyweb'));
  },
 }},
 forestscurse: {inherit: true,
  onHit(target, source, move) {
   const base = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').moves.get('forestscurse').onHit;
   if (!['forest', 'fairytale'].includes(fieldId(this))) return typeof base === 'function' ? base.call(this, target, source, move) : base;
   const alreadyGrass = target.hasType('Grass');
   if (!alreadyGrass && typeof base === 'function' && base.call(this, target, source, move) === false) return false;
   const cursed = target.addVolatile('curse', source, move);
   if (alreadyGrass && !cursed) return false;
  },
 },
 floralhealing: {inherit: true,
  onHit(target, source) {
   const fullHeal = fieldId(this) === 'fairytale' || flowerGardenStage(fieldId(this)) >= 3;
   if (!fullHeal && fieldId(this) !== 'grassy') {
    const handler = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('floralhealing').onHit;
    const result = typeof handler === 'function' ? handler.call(this, target, source, this.effect as ActiveMove) : handler;
    if (result === true && ['corrosive', 'corrosivemist'].includes(fieldId(this))) target.trySetStatus('psn', source, this.effect);
    return result;
   }
   const maxhp = fullHeal ? target.maxhp : target.baseMaxhp;
   if (!this.heal(maxhp, target, source)) {
    this.add('-fail', target, 'heal'); return this.NOT_FAIL;
   }
   if (!target.isAlly(source)) target.staleness = 'external';
  },
 },

 focuspunch: {inherit: true,
  priorityChargeCallback(pokemon) {
   if (fieldId(this) !== 'electerrain') pokemon.addVolatile('focuspunch');
  },
  beforeMoveCallback(pokemon, target, move) {
   if (fieldId(this) === 'electerrain') return;
   return this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('focuspunch').beforeMoveCallback!.call(this, pokemon, target, move);
  },
  onTryMove(pokemon) {
   if (fieldId(this) === 'electerrain') { this.attrLastMove('[still]'); this.add('-fail', pokemon, 'move: Focus Punch'); return null; }
  },
 },

 charge: {inherit: true, condition: {inherit: true,
  onAfterMove(pokemon, target, move) {
   if (this.effectState.rebornSeed) {
    if (move.type === 'Electric' && move.category !== 'Status') pokemon.removeVolatile('charge');
    return;
   }
   const fn = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('charge').condition?.onAfterMove;
   if (typeof fn === 'function') return fn.call(this, pokemon, target, move);
  },
  onMoveAborted(pokemon, target, move) {
   if (this.effectState.rebornSeed) return;
   const fn = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('charge').condition?.onMoveAborted;
   if (typeof fn === 'function') return fn.call(this, pokemon, target, move);
  },
 }},
 topsyturvy: {inherit: true,
  onHit(target, source) {
   const stats = Object.keys(target.boosts) as BoostID[];
   const hasBoosts = stats.some(stat => target.boosts[stat]);
   if (hasBoosts) {
    for (const stat of stats) target.boosts[stat] = -target.boosts[stat];
    this.add('-invertboost', target, '[from] move: Topsy-Turvy');
   }
   const created = !source.hasItem('everstone') && startTimedField(this, 'inverse', source, 3, true, true);
   return hasBoosts || created;
  },
 },
 electricterrain: {
  inherit: true, terrain: undefined,
  onHitField(target, source) { return startTimedField(this, 'electerrain', source, 5); },
 },
 laserfocus: {inherit: true, condition: {inherit: true,
  onRestart(pokemon) {
   delete this.effectState.rebornSeedFocusEndTurn;
   this.effectState.duration = 2;
   this.add('-start', pokemon, 'move: Laser Focus');
  },
  onResidual(pokemon) {
   const endTurn = this.effectState.rebornSeedFocusEndTurn;
   if (typeof endTurn === 'number' && this.turn >= endTurn) pokemon.removeVolatile('laserfocus');
  },
 }},
 magnetrise: {
  inherit: true,
  condition: {inherit: true,
   durationCallback(source) { return ['electerrain', 'factory', 'shortcircuit'].includes(fieldId(this)) ? 8 : 5; },
  },
 },
 gearup: {inherit: true,
  onHitSide(side, source, move) {
   const targets = side.allies().filter(target => target.hasAbility(['plus', 'minus']) &&
    (!target.volatiles.maxguard || this.runEvent('TryHit', target, source, move)));
   const stages = fieldId(this) === 'factory' ? 2 : 1;
   let boosted = false;
   for (const target of targets) {
    boosted = this.boost({atk: stages, spa: stages}, target, source, move, false, true) || boosted;
   }
   return boosted;
  },
 },
 grassyterrain: {inherit: true, condition: {inherit: true,
  onFieldStart(field, source, effect) {
   if (effect?.effectType === 'Ability') {
    this.add('-fieldstart', 'move: Grassy Terrain', '[from] ability: ' + effect.name, `[of] ${source}`, '[rebornterrain]');
   } else {
    this.add('-fieldstart', 'move: Grassy Terrain', '[rebornterrain]');
   }
   // A newly created terrain replaces the temporary Reborn field, preserving its base.
   if (this.field.pseudoWeather.rebornfieldduration) this.field.removePseudoWeather('rebornfieldduration');
  }, durationCallback(source) { return source.hasItem('amplifieldrock') ? 8 : 5; } } },
 mistyterrain: {inherit: true, condition: {inherit: true,
  onFieldStart(field, source, effect) {
   if (effect?.effectType === 'Ability') {
    this.add('-fieldstart', 'move: Misty Terrain', '[from] ability: ' + effect.name, `[of] ${source}`, '[rebornterrain]');
   } else {
    this.add('-fieldstart', 'move: Misty Terrain', '[rebornterrain]');
   }
   // A newly created terrain replaces the temporary Reborn field, preserving its base.
   if (this.field.pseudoWeather.rebornfieldduration) this.field.removePseudoWeather('rebornfieldduration');
  }, durationCallback(source) { return source.hasItem('amplifieldrock') ? 8 : 5; } } },
 psychicterrain: {inherit: true, condition: {inherit: true,
  onFieldStart(field, source, effect) {
   if (effect?.effectType === 'Ability') {
    this.add('-fieldstart', 'move: Psychic Terrain', '[from] ability: ' + effect.name, `[of] ${source}`, '[rebornterrain]');
   } else {
    this.add('-fieldstart', 'move: Psychic Terrain', '[rebornterrain]');
   }
   // A newly created terrain replaces the temporary Reborn field, preserving its base.
   if (this.field.pseudoWeather.rebornfieldduration) this.field.removePseudoWeather('rebornfieldduration');
  }, durationCallback(source) { return source.hasItem('amplifieldrock') ? 8 : 5; } } },
 heartswap: {inherit: true,
  onHit(target, source, move) {
   const native = this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').data.Moves;
   if (typeof native.heartswap.onHit === 'function') native.heartswap.onHit.call(this, target, source, move);
   if (fieldId(this) === 'newworld' && typeof native.painsplit.onHit === 'function') {
    native.painsplit.onHit.call(this, target, source, move);
   }
  },
 },
 magicroom: {inherit: true,
  onTry(source) { source.m.rebornAmplifield = source.hasItem('amplifieldrock'); source.m.rebornPsychicRoom = ['psyterrain', 'newworld'].includes(fieldId(this)); },
  condition: {inherit: true,
  onFieldStart(field, source, effect) {
   const original = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('magicroom').condition as import('../../../sim/dex-conditions').FieldConditionData | undefined;
   const start = original?.onFieldStart;
   if (typeof start === 'function') start.call(this, field, source, effect);
   if (source.m.rebornPsychicRoom) this.add('rebornroomduration', this.effect.id, 8);
  }, durationCallback(source) { return source.m.rebornPsychicRoom || source.m.rebornAmplifield ? 8 : 5; } },
 },
 trickroom: {inherit: true,
  onTry(source) { source.m.rebornAmplifield = source.hasItem('amplifieldrock'); source.m.rebornPsychicRoom = ['psyterrain', 'chess', 'newworld'].includes(fieldId(this)); },
  condition: {inherit: true,
  onFieldStart(field, source, effect) {
   const original = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('trickroom').condition as import('../../../sim/dex-conditions').FieldConditionData | undefined;
   const start = original?.onFieldStart;
   if (typeof start === 'function') start.call(this, field, source, effect);
   if (source.m.rebornPsychicRoom) this.add('rebornroomduration', this.effect.id, 8);
  }, durationCallback(source) { return source.m.rebornPsychicRoom || source.m.rebornAmplifield ? 8 : 5; } },
 },
 wonderroom: {inherit: true,
  onTry(source) { source.m.rebornAmplifield = source.hasItem('amplifieldrock'); source.m.rebornPsychicRoom = ['psyterrain', 'newworld'].includes(fieldId(this)); },
  condition: {inherit: true,
  onFieldStart(field, source, effect) {
   const original = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('wonderroom').condition as import('../../../sim/dex-conditions').FieldConditionData | undefined;
   const start = original?.onFieldStart;
   if (typeof start === 'function') start.call(this, field, source, effect);
   if (source.m.rebornPsychicRoom) this.add('rebornroomduration', this.effect.id, 8);
  }, durationCallback(source) { return source.m.rebornPsychicRoom || source.m.rebornAmplifield ? 8 : 5; } },
 },
 gravity: {inherit: true,
  onTry(source) { source.m.rebornAmplifield = source.hasItem('amplifieldrock'); source.m.rebornPsychicRoom = fieldId(this) === 'psyterrain'; },
  condition: {inherit: true,
  onFieldStart(field, source, effect) {
   const original = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('gravity').condition as import('../../../sim/dex-conditions').FieldConditionData | undefined;
   const start = original?.onFieldStart;
   if (typeof start === 'function') start.call(this, field, source, effect);
   if (source.m.rebornPsychicRoom) this.add('rebornroomduration', this.effect.id, 8);
  },
  onFieldEnd() {
   this.add('-fieldend', 'move: Gravity');
   const state = this.field.pseudoWeather.rebornfieldstate;
   if (fieldId(this) === 'starlight' && state?.starlightGravity === this.effectState.effectOrder) {
    this.add('message', 'The world returned to the void!');
    setField(this, 'newworld');
   }
  },
  durationCallback(source) { return source.m.rebornPsychicRoom || source.m.rebornAmplifield ? 8 : 5; } },
 },
	fly: {inherit: true,
		onTryMove(pokemon, target, move) {
			if (fieldId(this) === 'cave') { this.attrLastMove('[anim] Brave Bird'); return; }
			const handler = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('fly').onTryMove;
			return typeof handler === 'function' ? handler.call(this, pokemon, target, move) : handler;
		},
	},
	bounce: {inherit: true,
		onTryMove(pokemon, target, move) {
			if (fieldId(this) === 'cave') { return; /* No charge animation in Cave. */ }
			const handler = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('bounce').onTryMove;
			return typeof handler === 'function' ? handler.call(this, pokemon, target, move) : handler;
		},
	},
	skydrop: {inherit: true,
		onTryMove(pokemon, target, move) {
			if (fieldId(this) === 'cave') { this.attrLastMove('[still]'); this.add('-fail', pokemon, 'move: Sky Drop'); return null; }
			const handler = this.dex.mod(this.gen >= 9 ? 'gen9' : 'gen7').moves.get('skydrop').onTryMove;
			return typeof handler === 'function' ? handler.call(this, pokemon, target, move) : handler;
		},
	},
	naturepower: {inherit: true,
		onTryHit(target, pokemon) {
			const id = fieldId(this);
			let move = (FIELD_DATA[id]?.naturePower || 'TRIATTACK').toLowerCase();
			if (id === 'none') {
				if (this.field.isTerrain('electricterrain')) move = 'thunderbolt';
				if (this.field.isTerrain('grassyterrain')) move = 'energyball';
				if (this.field.isTerrain('mistyterrain')) move = 'moonblast';
				if (this.field.isTerrain('psychicterrain')) move = 'psychic';
			}
			this.actions.useMove(move, pokemon, {target}); return null;
		},
	},
	camouflage: {inherit: true,
		onHit(pokemon, source, move) {
			const type = fieldId(this) === 'crystalcavern' ? crystalType(this, true) : camouflageType(this, move);
			if (pokemon.getTypes().join() === type) {
				return (move as ActiveMove & {rebornCamouflageTypeChanged?: boolean}).rebornCamouflageTypeChanged === true;
			}
			if (!pokemon.setType(type)) return false;
			this.add('-start', pokemon, 'typechange', type);
		},
	},
 strength: {inherit: true,
  onModifyType(move) {
   if (fieldId(this) === 'ashenbeach') move.type = 'Fighting';
  },
 },
 focusenergy: {inherit: true,
  condition: {inherit: true,
   onStart(target, source, effect) {
    this.effectState.ashenBeach = fieldId(this) === 'ashenbeach';
    if (effect?.id === 'genesisseed' && this.effectState.ashenBeach) {
     if (target.volatiles.dragoncheer) return false;
     this.add('-start', target, 'move: Focus Energy', '[silent]');
     return;
    }
    return this.dex.mod(this.gen === 7 ? 'gen7' : 'gen9').conditions.get('focusenergy').onStart!.call(this, target, source, effect);
   },
   onModifyCritRatio(critRatio) { return critRatio + (this.effectState.ashenBeach ? 3 : 2); },
  },
 },
 whirlpool: {inherit: true,
  onHit(target, source, move) {
   if (['watersurface', 'underwater'].includes(fieldId(this))) target.addVolatile('confusion', source, move);
  },
 },
 splash: {inherit: true,
  onModifyMove(move) {
   if (fieldId(this) !== 'watersurface') return;
   move.target = 'allAdjacentFoes';
   move.boosts = {accuracy: -1};
   delete move.onTryHit;
  },
 },
 shoreup: {inherit: true,
  onModifyType(move) { if (fieldId(this) === 'watersurface') move.type = 'Water'; },
  onHit(pokemon) {
   const field = fieldId(this);
   const fraction = field === 'ashenbeach' ? 1 : (field === 'desert' || this.field.isWeather('sandstorm') ? 0.667 : 0.5);
   if (this.heal(this.modify(pokemon.maxhp, fraction))) {
    if (['watersurface', 'murkwatersurface'].includes(field) && pokemon.hasAbility('watercompaction')) {
     this.boost({def: 2}, pokemon, pokemon, pokemon.getAbility());
    }
    return true;
   }
   this.add('-fail', pokemon, 'heal');
   return this.NOT_FAIL;
  },
 },
	secretpower: {inherit: true,
		onPrepareHit() {
			if (fieldId(this) === 'cave') this.attrLastMove('[anim] Rock Wrecker');
			else if (fieldId(this) === 'dragonsden') this.attrLastMove('[anim] Dragon Pulse');
			else if (fieldId(this) === 'electerrain') this.attrLastMove('[anim] Shock Wave');
   else if (fieldId(this) === 'grassy') this.attrLastMove('[anim] Seed Bomb');
   else if (fieldId(this) === 'misty') this.attrLastMove('[anim] Mist Ball');
   else if (fieldId(this) === 'psyterrain') this.attrLastMove('[anim] Psychic');
   else if (fieldId(this) === 'darkcrystalcavern') this.attrLastMove('[anim] Dark Pulse');
   else if (fieldId(this) === 'chess') this.attrLastMove('[anim] Feint');
   else if (fieldId(this) === 'bigtop') this.attrLastMove('[anim] Dynamic Punch');
   else if (fieldId(this) === 'burning') this.attrLastMove('[anim] Flamethrower');
   else if (fieldId(this) === 'underwater') this.attrLastMove('[anim] Aqua Tail');
   else if (fieldId(this) === 'watersurface') this.attrLastMove('[anim] Aqua Jet');
   else if (fieldId(this) === 'murkwatersurface') this.attrLastMove('[anim] Sludge Bomb');
   else if (fieldId(this) === 'mountain') this.attrLastMove('[anim] Rock Blast');
   else if (fieldId(this) === 'snowymountain') this.attrLastMove('[anim] Ice Ball');
   else if (fieldId(this) === 'holy') this.attrLastMove('[anim] Dazzling Gleam');
   else if (fieldId(this) === 'mirror') this.attrLastMove('[anim] Mirror Shot');
   else if (fieldId(this) === 'fairytale') this.attrLastMove('[anim] Slash');
   else if (fieldId(this) === 'starlight') this.attrLastMove('[anim] Swift');
   else if (fieldId(this) === 'newworld') this.attrLastMove('[anim] Roar of Time');
   else if (fieldId(this) === 'inverse') this.attrLastMove('[anim] Confusion');
   else if (flowerGardenStage(fieldId(this))) {
    const stage = flowerGardenStage(fieldId(this));
    this.attrLastMove('[anim] ' + (stage === 1 ? 'Sweet Scent' : stage === 5 ? 'Petal Dance' : 'Petal Blizzard'));
   }
   else if (fieldId(this) === 'swamp') this.attrLastMove('[anim] Muddy Water');
   else if (fieldId(this) === 'wasteland') this.attrLastMove('[anim] Gunk Shot');
   else if (fieldId(this) === 'corrosive') this.attrLastMove('[anim] Acid');
   else if (fieldId(this) === 'corrosivemist') this.attrLastMove('[anim] Acid Spray');
   else if (fieldId(this) === 'ashenbeach') this.attrLastMove('[anim] Mud Shot');
   else if (fieldId(this) === 'desert') this.attrLastMove('[anim] Sand Tomb');
   else if (fieldId(this) === 'icy') this.attrLastMove('[anim] Ice Shard');
   else if (fieldId(this) === 'rocky') this.attrLastMove('[anim] Rock Throw');
   else if (fieldId(this) === 'forest') this.attrLastMove('[anim] Wood Hammer');
   else if (fieldId(this) === 'superheated') this.attrLastMove('[anim] Flame Burst');
   else if (fieldId(this) === 'factory') this.attrLastMove('[anim] Magnet Bomb');
   else if (fieldId(this) === 'shortcircuit') this.attrLastMove('[anim] Electro Ball');
   else if (fieldId(this) === 'rainbow') this.attrLastMove('[anim] Aurora Beam');
   else if (fieldId(this) === 'glitch') this.attrLastMove('[anim] Techno Blast');
   else if (fieldId(this) === 'crystalcavern') this.attrLastMove('[anim] Power Gem');
		},
		onModifyMove(move, pokemon, target) {
			const id = fieldId(this);
   const stage = flowerGardenStage(id);
   if (stage) {
    const boosts = stage <= 2 ? {evasion: -1} : stage <= 4 ?
     {evasion: -1, def: -1, spd: -1} : {evasion: -2, def: -2, spd: -2};
    move.secondaries = [{chance: 30, boosts}];
   } else if (id === 'electerrain' || id === 'shortcircuit') move.secondaries = [{chance: 30, status: 'par'}];
   else if (['grassy', 'forest', 'fairytale'].includes(id)) move.secondaries = [{chance: 30, status: 'slp'}];
   else if (id === 'misty' || id === 'holy') move.secondaries = [{chance: 30, boosts: {spa: -1}}];
   else if (id === 'psyterrain' || id === 'inverse') move.secondaries = [{chance: 30, volatileStatus: 'confusion'}];
   else if (id === 'darkcrystalcavern') move.secondaries = [{chance: 30, boosts: {accuracy: -1}}];
   else if (id === 'mirror') move.secondaries = [{chance: 30, boosts: {evasion: -1}}];
   else if (id === 'chess') move.secondaries = [{chance: 30, boosts: {def: -1}}];
   else if (id === 'factory') move.secondaries = [{chance: 30, boosts: {atk: -1}}];
   else if (id === 'rainbow') move.secondaries = [{chance: 30, status: this.sample(['par', 'psn', 'brn', 'frz', 'slp'])}];
   else if (['corrosive', 'corrosivemist', 'murkwatersurface'].includes(id)) move.secondaries = [{chance: 30, status: 'psn'}];
   else if (id === 'desert' || id === 'ashenbeach') move.secondaries = [{chance: 30, boosts: {accuracy: -1}}];
   else if (['icy', 'snowymountain'].includes(id)) move.secondaries = [{chance: 30, status: 'frz'}];
   else if (id === 'mountain') move.secondaries = [{chance: 30, volatileStatus: 'flinch'}];
   else if (id === 'underwater') move.secondaries = [{chance: 30, boosts: {atk: -1}}];
   else if (id === 'glitch') move.secondaries = [{chance: 30, boosts: {spe: -1}}];
   else if (id === 'crystalcavern') {
    move.secondaries = [{chance: 30, onHit(target, source, activeMove) {
     const status = this.sample(['brn', 'frz', 'slp', 'confusion']);
     if (status === 'confusion') target.addVolatile(status, source, activeMove);
     else target.trySetStatus(status, source, activeMove);
    }}];
   }
   else if (id === 'swamp' || id === 'watersurface') move.secondaries = [{chance: 30, boosts: {spe: -1}}];
   else if (id === 'newworld') move.secondaries = [{chance: 30, boosts: {atk: -1, def: -1, spa: -1, spd: -1, spe: -1}}];
   else if (id === 'bigtop' || id === 'starlight') move.secondaries = [{chance: 30, boosts: {spd: -1}}];
   else if (id === 'burning' || id === 'superheated') move.secondaries = [{chance: 30, status: 'brn'}];
			else if (id === 'dragonsden') move.secondaries = [{chance: 30, status: 'brn'}];
			else if (id === 'cave' || id === 'rocky') move.secondaries = [{chance: 30, volatileStatus: 'flinch'}];
			else this.dex.mod('gen7').moves.get('secretpower').onModifyMove!.call(this, move, pokemon, target);
		},
	},
};
