import {applyWastelandSecondaries} from './wasteland';
import {chessPower} from './chess';
/** Declarative Reborn field support. No Ruby expression is evaluated. */
import type {Battle} from '../../../sim/battle';
import type {Pokemon} from '../../../sim/pokemon';
import {STATUS_BOOSTS} from './field-status';
import {FIELD_DATA, type FieldData} from './field-data';
import {crystalType, fieldId, flowerGardenStage, gardenSpreadMove, growFlowerGarden, setField, endTimedRebornField} from './field-engine';
const toType = (s: string) => s === 'QMARKS' ? '???' : s[0] + s.slice(1).toLowerCase();
function entries(map: Record<string, string[]>, value: string) {
 return Object.entries(map).filter(([, values]) => values.includes(value.toUpperCase())).map(([key]) => key);
}
function condition(expr: string | undefined, source: Pokemon, target: Pokemon, move: ActiveMove): boolean {
 if (!expr) return true;
 switch (expr) {
 case '!attacker.isAirborne?': return !!source.isGrounded();
 case '!opponent.isAirborne?': return !!target?.isGrounded();
 case 'self.pbIsSpecial?(attacker, type)': return move.category === 'Special';
 case 'self.move!=:SCALD && self.move!=:STEAMERUPTION': return !['scald', 'steameruption'].includes(move.id);
 case '!self.contactMove?': return !move.flags.contact;
 default: return false;
 }
}
function announce(b: Battle, move: ActiveMove, messages: string[], target: Pokemon) {
 const m = move as ActiveMove & {rebornMessages?: string[]};
 const sent = m.rebornMessages || (m.rebornMessages = []);
 for (let msg of messages) {
  msg = msg.replace(/\{1\}/g, target?.name || 'The Pokémon');
  if (!sent.includes(msg)) { sent.push(msg); b.add('message', msg); }
 }
}
export function announceFieldMove(b: Battle, move: ActiveMove, target: Pokemon, fallbackMove?: string) {
 const data = FIELD_DATA[fieldId(b)];
 const messages = entries(data.moveMessages, move.id);
 announce(b, move, !messages.length && fallbackMove ? entries(data.moveMessages, fallbackMove) : messages, target);
}
function increment(data: FieldData, move: ActiveMove) {
 return entries(data.fieldCounterIncreases, move.id).reduce((n, key) => n + Number(key.split(',')[1]), 0);
}
function destination(b: Battle, data: FieldData, move: ActiveMove, counter: number): string | undefined {
 for (const dest of entries(data.fieldChange, move.id)) {
  const expr = data.changeCondition[dest];
  let ok = !expr;
  if (expr === '@battle.field.counter > 1') ok = counter > 1;
 if (expr === 'ignitecheck') ok = canIgniteField(b);
  if (expr === 'suncheck') ok = false; // This function explicitly returns false in Reborn 19.5.
  if (expr === '@battle.field.backup == :WATERSURFACE') {
   ok = b.field.pseudoWeather.rebornfieldstate.backup === 'watersurface';
  }
  if (ok) return dest === 'INDOOR' ? 'none' : dest.toLowerCase();
 }
}
export function canIgniteField(b: Battle) {
 return !b.field.pseudoWeather.watersport && !['raindance', 'primordialsea'].includes(b.field.weather);
}
const STRIKER_MOVES = new Set([
 'blazekick', 'bodyslam', 'bounce', 'brutalswing', 'bulldoze', 'crabhammer', 'dragonhammer', 'dragonrush',
 'dualchop', 'earthquake', 'gigaimpact', 'heatcrash', 'heavyslam', 'highhorsepower', 'icehammer',
 'iciclecrash', 'irontail', 'magnitude', 'meteormash', 'pound', 'skydrop', 'slam', 'smackdown',
 'stomp', 'stompingtantrum', 'strength', 'woodhammer',
]);
const STRIKER_WEIGHTS = [
 [8, 6, 0, 0, 0], [7, 6, 1, 0, 0], [6, 6, 2, 0, 0], [5, 6, 3, 0, 0],
 [4, 6, 4, 0, 0], [3, 6, 4, 1, 0], [2, 6, 4, 2, 0], [1, 6, 4, 2, 1],
 [0, 6, 4, 2, 2], [0, 5, 4, 2, 3], [0, 4, 4, 2, 4], [0, 3, 4, 2, 5], [0, 2, 4, 2, 6],
];
const STRIKER_ABILITY_WEIGHTS = [
 [0, 8, 6, 0, 0], [0, 0, 14, 0, 0], [0, 0, 14, 0, 0], [0, 0, 14, 0, 0],
 [0, 0, 8, 6, 0], [0, 0, 0, 14, 0], [0, 0, 0, 8, 6], [0, 0, 0, 0, 14],
];
const STRIKER_RESULTS = [
 [0.5, 'WEAK!'], [1, 'OK!'], [1.5, 'NICE!'], [2, 'POWERFUL!'], [3, 'OVER 9000!!!'],
] as const;

function isStriker(move: ActiveMove) {
 return STRIKER_MOVES.has(move.id) || (move.category === 'Physical' && move.type === 'Fighting');
}

function strikerPower(battle: Battle, source: Pokemon, move: ActiveMove & {rebornStrikerPower?: number}) {
 if (move.rebornStrikerPower !== undefined) return move.rebornStrikerPower;
 const stage = source.boosts.atk;
 const weights = source.hasAbility(['guts', 'sheerforce', 'hugepower', 'purepower']) ?
  STRIKER_ABILITY_WEIGHTS[Math.min(stage, 1) + 6] : STRIKER_WEIGHTS[stage + 6];
 let roll = battle.random(14);
 const index = weights.findIndex(weight => (roll -= weight) < 0);
 const [power, message] = STRIKER_RESULTS[index];
 battle.add('message', 'WHAMMO!');
 battle.add('message', '...' + message);
 return (move.rebornStrikerPower = power);
}

function gainsCrystalType(move: ActiveMove) {
 return move.category !== 'Status' &&
  (move.type === 'Rock' || ['judgment', 'multiattack', 'rockclimb', 'strength', 'prismaticlaser'].includes(move.id));
}

type CrystalMove = ActiveMove & {rebornCrystalType?: string};

const SHORT_CIRCUIT_ROLLS = [
 [0.8, 'Bzzt.'], [1.5, 'Bzzapp!'], [0.5, 'Bzt...'], [1.2, 'Bzap!'], [2, 'BZZZAPP!'],
] as const;

const MIRROR_REFLECTED_MOVES = new Set([
 'bubblebeam', 'chargebeam', 'fleurcannon', 'hyperbeam', 'icebeam', 'originpulse',
 'moongeistbeam', 'psybeam', 'solarbeam', 'triattack',
]);

const MIRROR_SHATTER_MOVES = new Set(
 (FIELD_DATA.mirror.changeEffects as Record<string, string[]>)['@battle.mirrorShatter(basemove, user)']
  .map(move => move.toLowerCase())
);
const mirrorShatterAttempts = new WeakSet<ActiveMove>();

export function prepareMirrorShatter(b: Battle, move: ActiveMove) {
 if (fieldId(b) === 'mirror' && MIRROR_SHATTER_MOVES.has(move.id)) mirrorShatterAttempts.add(move);
}

function shatterMirrors(b: Battle, source: Pokemon, move: ActiveMove) {
 b.add('message', 'The mirror arena shattered!');
 for (const p of b.getAllActive()) {
  if (!p.hp || p.isSemiInvulnerable() || p.hasAbility(['shellarmor', 'battlearmor'])) continue;
  if (['endure', 'protect', 'kingsshield', 'spikyshield', 'banefulbunker'].some(id => p.volatiles[id])) continue;
  const side = p.side;
  if (side.getSideCondition('wideguard') || side.getSideCondition('matblock') ||
   (move.priority > 0 && side.getSideCondition('quickguard'))) continue;
  b.directDamage(p.maxhp / 2, p, source, b.dex.conditions.get('mirrorarena'));
 }
 endTimedRebornField(b);
}

export function genericPower(b: Battle, basePower: number, source: Pokemon, target: Pokemon, move: ActiveMove) {
 const data = FIELD_DATA[fieldId(b)];
 if (data.id === 'starlight' && b.field.effectiveWeather()) return;
 const state = b.field.pseudoWeather.rebornfieldstate;
 let mult = data.id === 'chess' ? chessPower(b, source, target, move) : 1;
 if (data.id === 'bigtop') {
  if (move.flags.sound) mult *= 1.5;
  if (isStriker(move)) {
   mult *= strikerPower(b, source, move);
  }
 }
 for (const n of entries(data.damageMods, move.id)) mult *= Number(n);
 if (['mountain', 'snowymountain'].includes(data.id) && b.field.isWeather('deltastream')) {
  const flying = move.type === 'Flying' && move.category === 'Special';
  const windMove = ['fairywind', 'gust', 'icywind', 'ominouswind', 'razorwind', 'silverwind', 'twister'].includes(move.id);
  if (flying || windMove) {
   mult *= flying && windMove ? 2.25 : 1.5;
   announce(b, move, ['The strong winds strengthened the attack!'], target);
  }
 }
 if (data.id === 'mirror' && target.boosts.evasion > 0 && MIRROR_REFLECTED_MOVES.has(move.id)) {
  mult *= 2;
  announce(b, move, ['The beam was focused from the reflection!'], target);
 }
 if (data.id === 'forest' && move.id === 'cut' && target.hasType('Grass')) mult *= 2;
 if (data.id === 'shortcircuit' && move.type === 'Electric') {
  const index = state.shortCircuitIndex ?? 0;
  const [factor, message] = SHORT_CIRCUIT_ROLLS[index];
  mult *= factor;
  state.shortCircuitIndex = (index + 1) % SHORT_CIRCUIT_ROLLS.length;
  b.add('message', message);
 }
 if (data.id === 'crystalcavern' && gainsCrystalType(move)) {
  const type = crystalType(b, true);
  (move as CrystalMove).rebornCrystalType = type;
  announce(b, move, [`The crystals added the ${type} type!`], target);
 }
 const rainbowType = (move as ActiveMove & {rainbowType?: string}).rainbowType;
 if (data.id === 'rainbow' && rainbowType) {
  announce(b, move, [`The rainbow added the ${rainbowType} type!`], target);
 }
 announceFieldMove(b, move, data.id === 'darkcrystalcavern' && move.id === 'lightthatburnsthesky' ? source : target);
 if (condition(data.typeCondition[move.type.toUpperCase()], source, target, move)) {
  for (const n of entries(data.typeBoosts, move.type)) {
   const modernBoost = b.gen === 9 && (
    (data.id === 'electerrain' && move.type === 'Electric') ||
    (data.id === 'grassy' && move.type === 'Grass') ||
    (data.id === 'psyterrain' && move.type === 'Psychic')
   );
   mult *= modernBoost ? 1.3 : Number(n);
  }
  announce(b, move, entries(data.typeMessages, move.type), target);
 }
 const nextField = destination(b, data, move, (state.counter || 0) + increment(data, move));
 if (nextField && !flowerGardenStage(data.id) && !['burning', 'rainbow', 'corrosivemist', 'icy', 'watersurface', 'underwater', 'murkwatersurface', 'mountain', 'snowymountain', 'holy', 'mirror', 'starlight'].includes(data.id)) mult *= 1.3;
 if (mult !== 1) return b.chainModify(mult);
}
export function genericModifyMove(b: Battle, move: ActiveMove, source: Pokemon, target: Pokemon | null) {
 const data = FIELD_DATA[fieldId(b)];
 if ((['watersurface', 'murkwatersurface'].includes(data.id) && move.type === 'Ground' && move.category !== 'Status') ||
  (data.id === 'underwater' && (move.type === 'Fire' || move.weather))) move.onTryMove = undefined;
 if ((data.id === 'underwater' && move.type === 'Electric') || (['mountain', 'snowymountain'].includes(data.id) && move.id === 'thunder')) {
  move.alwaysHit = true;
 }
 if (['holy', 'fairytale'].includes(data.id) && move.id === 'miracleeye') move.self = {boosts: {spa: 2}};
 const stage = flowerGardenStage(data.id);
 if (gardenSpreadMove(b, move.id) && !move.isZ && !move.isMax) move.target = 'allAdjacentFoes';
 if (stage >= 3 && move.id === 'sweetscent') {
  const drop = 2 - stage;
  move.boosts = {evasion: drop, def: drop, spd: drop};
 }
 const boosts = STATUS_BOOSTS[data.id]?.[move.id];
 if (data.id === 'psyterrain' && move.id === 'shatteredpsyche') move.secondaries = [...(move.secondaries || []), {chance: 100, volatileStatus: 'confusion'}];
 if (boosts) { move.boosts = {...boosts}; if (move.id === 'growth') move.onModifyMove = undefined; }
 for (const acc of entries(data.accuracyMods, move.id)) {
  move.accuracy = Number(acc) || true;
  if (data.id === 'mirror' && move.accuracy === true) move.alwaysHit = true;
 }
 if (data.id === 'mirror' && move.id === 'mirrorshot') move.secondaries = [{chance: 100, boosts: {accuracy: -1}}];
 if (data.id === 'rainbow') {
  if (['solarbeam', 'solarblade'].includes(move.id)) move.onTryMove = undefined;
  if (move.id === 'sonicboom') move.damage = 140;
  if (move.self?.chance && !source.hasAbility('serenegrace')) {
   move.self = {...move.self, chance: Math.min(100, move.self.chance * 2)};
  }
 }
 const extra = [...new Set([...entries(data.typeMods, move.id), ...entries(data.typeAddOns, move.type)])].filter(t => toType(t) !== move.type);
 if (data.id === 'shortcircuit' && move.type === 'Steel' && move.category !== 'Status' &&
  source.hasAbility('steelworker') && !extra.includes('ELECTRIC')) extra.push('ELECTRIC');
 if (data.id === 'darkcrystalcavern' && ['solarbeam', 'solarblade'].includes(move.id)) {
  // Skip the move's charge handler so it cannot spend a Power Herb before the field rejects it.
  move.onTryMove = undefined;
 }
 if (data.id === 'bigtop' && isStriker(move) && (move.damageCallback || move.damage)) {
  const {damage, damageCallback} = move;
  move.damageCallback = function (attacker, defender) {
   const amount = damageCallback ? damageCallback.call(this, attacker, defender) :
    damage === 'level' ? attacker.level : damage;
   return typeof amount === 'number' && amount > 0 ?
    Math.max(1, Math.floor(amount * strikerPower(this, attacker, move))) : amount ?? false;
  };
 }
 if (data.id === 'bigtop' && move.id === 'acrobatics') {
  move.basePower = 110;
  move.basePowerCallback = undefined;
 }
 if (data.id === 'wasteland') applyWastelandSecondaries(move, source);
 if (data.id === 'electerrain' && move.id === 'wildcharge') move.recoil = undefined;
 if (['electerrain', 'shortcircuit'].includes(data.id) && extra.includes('ELECTRIC')) {
  const originalHit = move.onTryHit;
  move.onTryHit = function (target, source, activeMove) {
   const result = typeof originalHit === 'function' ? originalHit.call(this, target, source, activeMove) : originalHit;
   if (result === false || result === null) return result;
   if (!target.runImmunity('Electric', true)) return null;
   const ability = target.getAbility();
   if (['voltabsorb', 'motordrive', 'lightningrod'].includes(ability.id) && target.hasAbility(ability.id) && !this.suppressingAbility(target)) {
    return this.singleEvent('TryHit', ability, target.abilityState, target, source, {...activeMove, type: 'Electric'});
   }
  };
 }
 if (data.id === 'corrosivemist' && move.category === 'Special' && move.type === 'Flying' && !extra.includes('POISON')) {
  extra.push('POISON');
 }
 const poisonImmunity = ['corrosive', 'corrosivemist', 'wasteland'].includes(data.id) && extra.includes('POISON');
 const psychicImmunity = data.id === 'ashenbeach' && extra.includes('PSYCHIC');
 const dragonImmunity = data.id === 'fairytale' && extra.includes('DRAGON');
 if (move.category !== 'Status' && (poisonImmunity || psychicImmunity || dragonImmunity)) {
  const secondaryType = poisonImmunity ? 'Poison' : psychicImmunity ? 'Psychic' : 'Dragon';
  const originalHit = move.onTryHit;
  move.onTryHit = function (target, source, activeMove) {
   const result = typeof originalHit === 'function' ? originalHit.call(this, target, source, activeMove) : originalHit;
   if (result === false || result === null) return result;
   if (!target.runImmunity(secondaryType, true)) return null;
  };
 }
 if (data.id === 'rainbow' && move.type === 'Normal' && move.category === 'Special') {
  const types = b.dex.types.names().filter(type => type !== 'Stellar' && type !== '???');
  const chosen = b.sample(types);
  extra.push(chosen.toUpperCase());
  if (!move.damage) (move as ActiveMove & {rainbowType?: string}).rainbowType = chosen;
 }
 const waterNeutral = data.id === 'underwater' && move.type === 'Water';
 const crystallized = data.id === 'crystalcavern' && gainsCrystalType(move);
 if (extra.length || waterNeutral || crystallized) {
  const original = move.onEffectiveness;
  move.onEffectiveness = function (mod, pokemon, type, activeMove) {
   if (waterNeutral && type === 'Water') mod = 0;
   const base = original?.call(this, mod, pokemon, type, activeMove);
   const crystal = crystallized && (activeMove as CrystalMove).rebornCrystalType;
   const crystalMod = crystal ? this.dex.getEffectiveness(crystal, type) : 0;
   return (typeof base === 'number' ? base : mod) + crystalMod +
    extra.reduce((n, t) => n + this.dex.getEffectiveness(toType(t), type), 0);
  };
 }

 // A zero damage modifier means the move fails, not a one-HP damage roll.
 if (!['watersurface', 'underwater', 'murkwatersurface'].includes(data.id) && entries(data.damageMods, move.id).includes('0')) {
  move.onTry = function (pokemon) { this.add('-fail', pokemon); return null; };
 }
}
const ICY_SPEED_MOVES = new Set([
 'accelerock', 'aquajet', 'bulletpunch', 'extremespeed', 'fakeout', 'firstimpression', 'machpunch',
 'quickattack', 'shadowsneak', 'suckerpunch', 'defensecurl', 'feint', 'lunge', 'rollout', 'steamroller',
]);

export function applyIcySpeedBoost(b: Battle, source: Pokemon, move: ActiveMove) {
 if (fieldId(b) === 'icy' && source.hp && source.isGrounded() && ICY_SPEED_MOVES.has(move.id)) {
  b.boost({spe: 1}, source, source, move);
 }
}

export function applySuperheatedSteam(b: Battle, source: Pokemon, move: ActiveMove) {
 if (!move.totalDamage && !(move.id === 'watersport' && source.moveThisTurnResult)) return;
 if (!entries(FIELD_DATA.superheated.moveEffects as Record<string, string[]>, move.id).includes('@battle.fieldAccuracyDrop')) return;
 b.add('message', 'Steam shot up from the field!');
 for (const p of b.getAllActive()) {
  if (p.hp && !p.isSemiInvulnerable()) b.boost({accuracy: -1}, p, p);
 }
}

export function genericAfterMove(b: Battle, source: Pokemon, target: Pokemon, move: ActiveMove) {
 if (fieldId(b) === 'mirror' && mirrorShatterAttempts.has(move)) {
  shatterMirrors(b, source, move);
  return;
 }
 // Other field transitions generally require a successful move.
 const mistyGas = fieldId(b) === 'misty' && (move as ActiveMove & {rebornMistyPollution?: boolean}).rebornMistyPollution;
 if (!mistyGas && !move.totalDamage && (move.category !== 'Status' || !source.moveThisTurnResult)) return;
 const data = FIELD_DATA[fieldId(b)];
 if (data.id === 'psyterrain' && source.moveThisTurnResult && ['kinesis', 'psychup', 'mindreader', 'miracleeye'].includes(move.id)) {
  b.boost(move.id === 'kinesis' ? {atk: 2, spa: 2} : {spa: 2}, source, source, move);
 }
 if (data.id === 'mirror' && move.id === 'mirrorcoat') b.boost({evasion: 1, def: 1, spd: 1}, source, source, move);
 if (data.id === 'ashenbeach' && move.id === 'psychup' && source.moveThisTurnResult) source.cureStatus();
 const state = b.field.pseudoWeather.rebornfieldstate;
 state.counter = (state.counter || 0) + increment(data, move);
 if (state.counter === 1 && increment(data, move)) {
  const messages: Record<string, string> = {misty: 'Poison spread through the mist!', icy: 'Parts of the ice melted!'};
  if (messages[data.id]) b.add('message', messages[data.id]);
 }
 const effects = data.moveEffects as Record<string, string[]>;
 const drop = (data.id !== 'superheated' && entries(effects, move.id).includes('@battle.fieldAccuracyDrop')) ||
  (data.id === 'ashenbeach' && move.type === 'Flying' && move.category === 'Special');
 if (drop) {
  b.add('message', fieldId(b) === 'ashenbeach' ? 'The attack stirred up the ash on the ground!' : 'Steam shot up from the field!');
  for (const p of b.getAllActive()) {
   if (p.hp && !p.isSemiInvulnerable()) b.boost({accuracy: -1}, p, data.id === 'ashenbeach' ? p : source);
  }
 }
 if (entries(effects, move.id).includes('@battle.iceSpikes') && state.backup !== 'watersurface') {
  const sidesWithRoom = b.sides.filter(side => (side.getSideConditionData('spikes')?.layers || 0) < 3);
  if (sidesWithRoom.length) {
   b.add('message', 'The quake broke up the ice into spiky pieces!');
   for (const side of sidesWithRoom) side.addSideCondition('spikes', source);
  }
 }
 if (data.id === 'burning' && (move.id === 'splinteredstormshards' || destination(b, data, move, state.counter) === 'none')) {
  announce(b, move, entries(data.changeMessage, move.id), target);
  if (move.id === 'splinteredstormshards') b.add('message', 'The flames went out!');
  endTimedRebornField(b);
  return;
 }
 if (['holy', 'starlight'].includes(data.id) && ['lightthatburnsthesky', 'splinteredstormshards'].includes(move.id)) {
  announce(b, move, entries(data.changeMessage, move.id), target);
  endTimedRebornField(b);
  return;
 }
 if (data.id === 'rainbow' && ['lightthatburnsthesky', 'splinteredstormshards'].includes(move.id)) {
  announce(b, move, entries(data.changeMessage, move.id), target);
  if (move.id === 'splinteredstormshards') b.add('message', 'The rainbow faded!');
  endTimedRebornField(b);
  return;
 }
 if (data.id === 'corrosivemist' && (move.id === 'splinteredstormshards' || destination(b, data, move, state.counter) === 'none')) {
  announce(b, move, entries(data.changeMessage, move.id), target);
  if (move.id === 'splinteredstormshards') b.add('message', 'The toxic mist dispersed!');
  endTimedRebornField(b);
  return;
 }
 if ((move.id === 'splinteredstormshards' && ['corrosive', 'desert', 'icy', 'rocky', 'forest', 'superheated', 'shortcircuit', 'wasteland', 'ashenbeach', 'watersurface', 'glitch', 'crystalcavern', 'murkwatersurface', 'mountain', 'snowymountain', 'mirror', 'fairytale', 'inverse'].includes(data.id)) ||
  (data.id === 'superheated' && destination(b, data, move, state.counter) === 'none')) {
  if (data.id === 'superheated' && move.id !== 'splinteredstormshards') {
   announce(b, move, entries(data.changeMessage, move.id), target);
  }
  endTimedRebornField(b);
  return;
 }
 if (move.id === 'splinteredstormshards' && data.id === 'swamp') {
  b.add('message', 'The swamp dried up!');
  endTimedRebornField(b);
  return;
 }
 if (move.id === 'splinteredstormshards') {
  if (data.id === 'underwater') return;
  if (['electerrain', 'grassy', 'misty', 'psyterrain'].includes(data.id) && b.field.pseudoWeather.rebornfieldduration) b.field.removePseudoWeather('rebornfieldduration');
  else setField(b, 'none');
  return;
 }
 const dest = destination(b, data, move, state.counter);
 if (data.id === 'newworld' && dest === 'starlight') {
  announce(b, move, entries(data.changeMessage, move.id), target);
  const gravityOrder = move.id === 'gravity' ? b.field.pseudoWeather.gravity?.effectOrder : undefined;
  setField(b, 'starlight', gravityOrder !== undefined);
  if (gravityOrder !== undefined) state.starlightGravity = gravityOrder;
  return;
 }
 if (dest === 'burning' && b.field.pseudoWeather.rebornfieldduration) {
  b.field.pseudoWeather.rebornfieldduration.replacing = true;
  b.field.removePseudoWeather('rebornfieldduration');
 }
 if (dest) {
  if (['electerrain', 'misty'].includes(data.id) && dest === 'none' && b.field.pseudoWeather.rebornfieldduration) {
   announce(b, move, entries(data.changeMessage, move.id), target);
   b.field.removePseudoWeather('rebornfieldduration'); return;
  }
  fieldChangeEffect(b, source, move, entries(data.changeEffects as Record<string, string[]>, move.id));
  announce(b, move, entries(data.changeMessage, move.id), target);
  const timer = b.field.pseudoWeather.rebornfieldduration;
  if (timer && (['grassy', 'misty'].includes(data.id) || dest === 'corrosive' || ['corrosive', 'corrosivemist'].includes(data.id))) {
   const elapsed = (timer.initialDuration || timer.duration || 0) - (timer.duration || 0);
   b.add('rebornfieldtimer', 'start', FIELD_DATA[dest].name, Math.max(0, (timer.minDuration || 5) - elapsed), timer.maxDuration ? Math.max(0, timer.maxDuration - elapsed) : 0);
  }
  setField(b, dest === 'none' ? (state.backup || 'none') : dest, data.dontChangeBackup.includes(move.id.toUpperCase()));
 }
}
export function genericSeed(b: Battle, p: Pokemon, id: string) {
 const data = FIELD_DATA[id];
 if (!data?.seed.seedtype || !p.useItem()) return;
 const sd = data.seed;
 const stats: {[key: string]: string} = {ATTACK: 'atk', DEFENSE: 'def', SPATK: 'spa', SPDEF: 'spd', SPEED: 'spe', ACCURACY: 'accuracy', EVASION: 'evasion'};
 const boosts: SparseBoostsTable = {};
 for (const [stat, value] of Object.entries(sd.stats)) boosts[stats[stat] as BoostID] = value;
 if (Object.keys(boosts).length) b.boost(boosts, p, p, b.dex.items.get('genesisseed'));
 const volatiles: Record<string, string> = {Charge: 'charge', Ingrain: 'ingrain', MagicCoat: 'magiccoat', HelpingHand: 'genesishelp', LaserFocus: 'laserfocus', MagnetRise: 'magnetrise', FocusEnergy: 'genesisfocus', AquaRing: 'aquaring', HyperBeam: 'mustrecharge', ShellTrap: 'genesistrap'};
 if (sd.effect === 'Protect') {
  if (id === 'corrosive' && !p.volatiles.banefulbunker) b.add('-anim', p, 'Baneful Bunker', p);
  if (id === 'fairytale' && !p.volatiles.kingsshield) b.add('-anim', p, "King's Shield", p);
  if (id === 'forest' && !p.volatiles.spikyshield) b.add('-anim', p, 'Spiky Shield', p);
  p.addVolatile(String(sd.duration).toLowerCase(), p);
 }
 else if (sd.effect === 'MultiTurnAttack') {
  if (id === 'desert') p.addVolatile('genesissandtomb', p);
  else p.addVolatile(id === 'burning' ? 'genesisfirespin' : 'genesistrapped', p);
 } else if (sd.effect && volatiles[sd.effect]) {
  const ashenFocus = id === 'ashenbeach' && sd.effect === 'FocusEnergy';
  const key = ashenFocus ? 'focusenergy' : volatiles[sd.effect];
  if (ashenFocus && !p.volatiles.focusenergy && !p.volatiles.dragoncheer) b.add('-anim', p, 'Focus Energy', p);
  if ((id === 'swamp' || flowerGardenStage(id)) && sd.animation === 'INGRAIN' && !p.volatiles.ingrain) b.add('-anim', p, 'Ingrain', p);
  if (['watersurface', 'murkwatersurface'].includes(id) && key === 'aquaring' && !p.volatiles.aquaring) b.add('-anim', p, 'Aqua Ring', p);
  if (key === 'charge' && sd.animation === 'CHARGE') b.add('-anim', p, 'Charge', p, '[rebornseedcharge]');
  if (key === 'laserfocus' && id === 'factory') b.add('-anim', p, 'Laser Focus', p, '[rebornseedfocus]');
  const seedMagnetRise = key === 'magnetrise' && id === 'shortcircuit';
  const blockedMagnetRise = seedMagnetRise && b.field.getPseudoWeather('gravity');
  if (seedMagnetRise && !blockedMagnetRise && !p.volatiles.magnetrise) {
   b.add('-anim', p, 'Magnet Rise', p);
  }
  if (!blockedMagnetRise && p.addVolatile(key, p, ashenFocus ? b.dex.items.get('genesisseed') : undefined) && !ashenFocus && typeof sd.duration === 'number' && key !== 'genesisfocus') {
   const state = p.volatiles[key];
   if (key === 'laserfocus' && id === 'factory') {
    // A switch uses the slot's action. Give the seed one turn in which its holder can act.
    state.rebornSeedFocusEndTurn = b.turn + (b.queue.willMove(p) ? 0 : 1);
    delete state.duration;
   } else if (key === 'mustrecharge' && ['newworld', 'inverse'].includes(id)) {
    // The seed can be consumed on a switch or in the middle of a turn.
    delete state.duration;
    if (sd.message) b.add('message', sd.message.replace('{1}', p.name));
   } else {
    state.duration = sd.duration;
   }
  }
  if (key === 'charge' && p.volatiles[key]) p.volatiles[key].rebornSeed = true;
 }
 if (['misty', 'rainbow', 'starlight'].includes(id) && p.side.addSlotCondition(p, 'wish', p)) {
  if (['misty', 'rainbow', 'starlight'].includes(id)) {
   p.side.slotConditions[p.position].wish.rebornReceiverWish = true;
   b.add('-anim', p, 'Wish', p);
  }
  p.side.slotConditions[p.position].wish.hp = Math.floor((p.baseMaxhp + 1) * 0.75);
  b.add('message', `A wish was made for ${p.name}!`);
 }
 if (id === 'corrosivemist') p.trySetStatus('tox', p);
 if (id === 'murkwatersurface') p.trySetStatus('psn', p, b.dex.items.get('genesisseed'));
 if (id === 'psyterrain') p.addVolatile('confusion', p);
 if (id === 'underwater' && !p.hasAbility(['multitype', 'rkssystem']) &&
  p.getTypes().join() !== 'Water' && p.setType('Water')) {
  b.add('-anim', p, 'Soak', p);
  b.add('-start', p, 'typechange', 'Water');
 }
 if (id === 'glitch' && !p.hasAbility(['multitype', 'rkssystem']) &&
  p.getTypes().join() !== '???' && p.setType('???')) {
  b.add('-anim', p, 'Amnesia', p);
  b.add('-start', p, 'typechange', '???');
  if (sd.message) b.add('message', sd.message.replace('{1}', p.name));
 }
 if (id === 'wasteland') for (const side of b.sides) side.addSideCondition('stealthrock', p);
 if (!p.hasAbility('magicguard')) {
  if (id === 'rocky') b.damage(p.baseMaxhp * Math.pow(2, b.dex.getEffectiveness('Rock', p)) / 4, p, p, b.dex.items.get('genesisseed'));
  if (id === 'icy' && p.isGrounded()) {
   const layers = p.side.sideConditions.spikes?.layers || 1;
   b.damage(p.baseMaxhp / [8, 8, 6, 4][layers], p, p, b.dex.moves.get('spikes'));
  }
 }
 if (sd.animation === 'MAGICCOAT') b.add('-anim', p, 'Magic Coat', p);
 // Fire Spin already announces the trap through its activation event.
 if (sd.message && !['Charge', 'Ingrain', 'MagicCoat'].includes(sd.effect || '') &&
  !['underwater', 'glitch', 'burning', 'factory', 'shortcircuit', 'watersurface', 'murkwatersurface', 'newworld', 'inverse'].includes(id)) {
  b.add('message', sd.message.replace(/\{1\}/g, p.name).replace(/(?:Telluric|Magical|Synthetic|Elemental) Seed/g, 'Genesis Seed'));
 }
 if (flowerGardenStage(id)) growFlowerGarden(b);
}
export const seedConditions: import('../../../sim/dex-conditions').ModdedConditionDataTable = {
 genesisfocus: {
  name: 'Genesis Focus', noCopy: true,
  onModifyCritRatio(critRatio) { return critRatio + 3; },
 },
 genesishelp: {
  name: 'Genesis Help', noCopy: true, duration: 1,
  onStart(pokemon) {
   if (fieldId(this) === 'bigtop') this.add('-anim', pokemon, 'Helping Hand', pokemon);
   this.add('-singleturn', pokemon, 'Helping Hand', '[silent]');
  },
  onBasePowerPriority: 10,
  onBasePower() { return this.chainModify(1.5); },
 },
 genesisfirespin: {
  name: 'Genesis Fire Spin', duration: 5, noCopy: true,
  onStart(pokemon) {
   this.add('-anim', pokemon, 'Fire Spin', pokemon);
   this.add('-activate', pokemon, 'move: Fire Spin');
  },
  onTrapPokemon(pokemon) { pokemon.tryTrap(); },
  onResidualOrder: 13,
  onResidual(pokemon) {
   this.damage(pokemon.maxhp / (fieldId(this) === 'burning' ? 6 : 8), pokemon, pokemon, this.effect);
  },
  onEnd(pokemon) { this.add('-end', pokemon, 'move: Fire Spin', '[partiallytrapped]'); },
 },
 genesissandtomb: {
  // The residual engine removes the volatile before the final tick.
  name: 'Genesis Sand Tomb', duration: 5, noCopy: true,
  onStart(pokemon) {
   this.add('-anim', pokemon, 'Sand Tomb', pokemon);
   this.add('-activate', pokemon, 'move: Sand Tomb', `[of] ${pokemon}`);
  },
  onTrapPokemon(pokemon) { pokemon.tryTrap(); },
  onResidualOrder: 13,
  onResidual(pokemon) {
   this.damage(pokemon.maxhp / (fieldId(this) === 'desert' ? 6 : 8), pokemon, pokemon, this.dex.moves.get('sandtomb'));
  },
  onEnd(pokemon) { this.add('-end', pokemon, 'move: Sand Tomb', '[partiallytrapped]'); },
 },
 genesistrapped: {
  name: 'Genesis Trap', duration: 5, noCopy: true,
  onTrapPokemon(p) { p.tryTrap(); },
  onResidualOrder: 13,
  onResidual(p) { this.damage(p.baseMaxhp / 8, p, p, this.dex.conditions.get('partiallytrapped')); },
 },
 genesistrap: {
  // Keep the name in sync with the ID used to look up this volatile's events.
  name: 'genesistrap', noCopy: true, duration: 1,
  onStart(pokemon) {
   this.add('-start', pokemon, 'move: Shell Trap', '[from] item: Genesis Seed', '[silent]');
  },
  onEnd(pokemon) {
   if (this.effectState.duration === 0) {
    this.add('move', pokemon, 'Shell Trap', '', '[still]');
    this.add('cant', pokemon, 'Shell Trap', 'Shell Trap');
   }
   this.add('-end', pokemon, 'move: Shell Trap', '[silent]');
  },
  onDamagingHit(damage, p, source, move) {
   if (move.category === 'Physical' && p.hp && !p.isAlly(source)) this.effectState.triggerMove = move;
  },
  onAnyAfterMovePriority: -1,
  onAnyAfterMove(source, target, move) {
   const p = this.effectState.target as Pokemon;
   if (this.effectState.triggerMove !== move || !p.hp || !p.isActive) return;
   p.removeVolatile('genesistrap');
   const trap = this.dex.getActiveMove('shelltrap');
   delete trap.onTryMove;
   const {activeMove, activePokemon, activeTarget, lastMoveLine} = this;
   const {lastMoveUsed, moveThisTurnResult} = p;
   try {
    this.actions.useMove(trap, p, {target: source});
   } finally {
    this.setActiveMove(activeMove, activePokemon, activeTarget);
    this.lastMoveLine = lastMoveLine;
    p.lastMoveUsed = lastMoveUsed;
    p.moveThisTurnResult = moveThisTurnResult;
   }
  },
 },
};

function fieldChangeEffect(b: Battle, source: Pokemon, move: ActiveMove, effects: string[]) {
 for (const effect of effects) {
  if (effect === '@battle.waterPollution') {
   b.add('message', 'The water was polluted!');
   for (const p of b.getAllActive()) if (p.hp && !p.isSemiInvulnerable() && !p.hasType(['Poison', 'Steel'])) p.faint(source, move);
  }
 }
}

const MIST_IGNITION_MOVES = new Set(
 (FIELD_DATA.corrosivemist.changeEffects as Record<string, string[]>)['@battle.mistExplosion(basemove, user)']
  .map(move => move.toLowerCase())
);
type MistIgnitionMove = ActiveMove & {corrosiveMistIgnition?: 'damp' | 'ignite'};

export function prepareCorrosiveMistIgnition(b: Battle, move: MistIgnitionMove) {
 if (fieldId(b) !== 'corrosivemist' || !MIST_IGNITION_MOVES.has(move.id)) return;
 move.corrosiveMistIgnition = b.getAllActive().some(p => p.hp && p.hasAbility('damp')) ? 'damp' : 'ignite';
}

export function igniteCorrosiveMist(b: Battle, source: Pokemon, move: MistIgnitionMove) {
 if (fieldId(b) !== 'corrosivemist' || !move.corrosiveMistIgnition) return false;
 if (move.corrosiveMistIgnition === 'damp') {
  b.add('message', "A Pokémon's Damp ability prevented a complete explosion!");
  return false;
 }
 b.add('message', 'The toxic mist combusted!');
 const effect = b.dex.conditions.get('corrosivemistfield');
 for (const p of b.getAllActive()) {
  if (!p.hp || p.isSemiInvulnerable() || p.hasAbility('flashfire')) continue;
  if (['endure', 'protect', 'kingsshield', 'spikyshield', 'banefulbunker'].some(id => p.volatiles[id])) continue;
  const guards = p.side.sideConditions;
  if (guards.matblock || guards.wideguard || (move.priority > 0 && guards.quickguard)) continue;
  const sturdy = p.hp === p.maxhp && p.hasAbility('sturdy');
  if (sturdy) b.add('-activate', p, 'ability: Sturdy');
  b.directDamage(sturdy ? p.hp - 1 : p.hp, p, source, effect);
 }
 endTimedRebornField(b);
 return true;
}
