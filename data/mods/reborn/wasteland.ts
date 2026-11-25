import type {Battle} from '../../../sim/battle';
import type {SecondaryEffect} from '../../../sim/dex-moves';
import type {Pokemon} from '../../../sim/pokemon';
import type {Side} from '../../../sim/side';

const HAZARDS = {
 stealthrock: ['pointed stones', 'Rocks spewed out from the ground below!'],
 spikes: ['spikes', 'Stalagmites burst up from the ground!'],
 toxicspikes: ['toxic spikes', 'Poison needles shot up from the ground!'],
 stickyweb: ['sticky web', 'Sticky string shot out of the ground!'],
} as const;

type Hazard = keyof typeof HAZARDS;
type PendingHazards = Partial<Record<Hazard, Pokemon>>;
const HAZARD_IDS = Object.keys(HAZARDS) as Hazard[];

export function swallowWastelandHazard(battle: Battle, side: Side, id: string, source: Pokemon) {
 if (!(id in HAZARDS) || !side.removeSideCondition(id)) return;
 const hazard = id as Hazard;
 const state = battle.field.pseudoWeather.rebornfieldstate;
 const pending: Record<number, PendingHazards> = state.wastelandHazards ??= {};
 (pending[side.n] ??= {})[hazard] = source;
 battle.add('-sideend', side, 'move: ' + battle.dex.moves.get(hazard).name, '[silent]', '[rebornburied]');
 battle.add('message', `The waste swallowed up the ${HAZARDS[hazard][0]}!`);
}

export function releaseWastelandHazards(battle: Battle) {
 const state = battle.field.pseudoWeather.rebornfieldstate;
 const pending: Record<number, PendingHazards> | undefined = state.wastelandHazards;
 if (!pending) return;
 delete state.wastelandHazards;
 const effect = battle.dex.conditions.get('wastelandfield');
 for (const side of battle.sides) {
  for (const id of HAZARD_IDS) {
   const source = pending[side.n]?.[id];
   if (!source) continue;
   battle.add('-sideend', side, 'move: ' + battle.dex.moves.get(id).name, '[silent]', '[rebornreleased]');
   battle.add('message', '...' + HAZARDS[id][1]);
   for (const pokemon of side.active) {
    if (!pokemon?.hp || pokemon.isSemiInvulnerable()) continue;
    if (id === 'stickyweb') {
     battle.boost({spe: -4}, pokemon, source, effect);
    } else if (id === 'stealthrock') {
     const typeMod = pokemon.runEffectiveness(battle.dex.getActiveMove('stealthrock'));
     battle.damage(pokemon.maxhp * 2 ** typeMod / 4, pokemon, source, effect);
    } else if (pokemon.isGrounded()) {
     if (id === 'spikes') {
      battle.damage(pokemon.maxhp / 3, pokemon, source, effect);
     } else if (!pokemon.hasType(['Poison', 'Steel'])) {
      battle.damage(pokemon.maxhp / 8, pokemon, source, effect);
      if (pokemon.hp) pokemon.trySetStatus('psn', pokemon, effect);
     }
    }
   }
  }
 }
}

const RANDOM_STATUSES = ['brn', 'psn', 'par', 'frz'] as const;
const MOVE_STATUS_CHANCES: Record<string, number> = {
 aciddownpour: 100, octazooka: 50, gunkshot: 30, sludge: 30, sludgebomb: 30, sludgewave: 10, secretpower: 30,
};

function wastelandStatusEffect(chance: number, canDropAccuracy = false): SecondaryEffect {
 return {
  chance,
  onHit(target, source, move) {
   if (canDropAccuracy && this.randomChance(1, 5)) {
    this.boost({accuracy: -1}, target, source, move);
    return;
   }
   if ((target.hasType(['Poison', 'Steel']) && !source.hasAbility('corrosion')) ||
    target.hasAbility(['poisonheal', 'toxicboost']) ||
    (target.hasAbility('immunity') && !this.suppressingAbility(target))) return;
   target.trySetStatus(this.sample(RANDOM_STATUSES), source, move);
  },
 };
}

export function applyWastelandSecondaries(move: ActiveMove, source: Pokemon) {
 if (move.category === 'Status' || move.hasSheerForce || move.hasSheerForceBoost) return;
 const chance = MOVE_STATUS_CHANCES[move.id];
 if (chance) move.secondaries = [wastelandStatusEffect(chance, move.id === 'octazooka')];
 if (source.hasAbility('corrosion')) {
  move.secondaries = [...(move.secondaries || []), wastelandStatusEffect(10)];
 }
}
