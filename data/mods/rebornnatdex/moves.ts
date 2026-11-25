import {Moves as RebornMoves} from '../reborn/moves';
import {fieldId} from '../reborn/field-engine';

const terrainTypes: Record<string, string> = {
 electerrain: 'Electric', grassy: 'Grass', misty: 'Fairy', psyterrain: 'Psychic',
};

export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
 ...RebornMoves,
 expandingforce: {inherit: true,
  onBasePower(basePower, source) {
   if (fieldId(this) === 'psyterrain' && source.isGrounded()) return this.chainModify(1.5);
  },
  onModifyMove(move, source) {
   if (fieldId(this) === 'psyterrain' && source.isGrounded()) move.target = 'allAdjacentFoes';
  },
 },
 grassyglide: {inherit: true,
  onModifyPriority(priority, source) {
   if (fieldId(this) === 'grassy' && source.isGrounded()) return priority + 1;
  },
 },
 mistyexplosion: {inherit: true,
  onBasePower(basePower, source) {
   if (fieldId(this) === 'misty' && source.isGrounded()) return this.chainModify(1.5);
  },
 },
 psyblade: {inherit: true,
  onBasePower() {
   if (fieldId(this) === 'electerrain') return this.chainModify(1.5);
  },
 },
 risingvoltage: {inherit: true,
  basePowerCallback(source, target, move) {
   if (fieldId(this) === 'electerrain' && target.isGrounded()) return move.basePower * 2;
   return move.basePower;
  },
 },
 terrainpulse: {inherit: true,
  onModifyType(move, source) {
   const type = terrainTypes[fieldId(this)];
   if (type && source.isGrounded()) move.type = type;
  },
  onModifyMove(move, source) {
   if (terrainTypes[fieldId(this)] && source.isGrounded()) move.basePower *= 2;
  },
 },
};
