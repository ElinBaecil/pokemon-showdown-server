import {Pokemon} from '../../../sim/pokemon';
import {fieldId, gardenMoveRequests, rebornFieldScripts} from '../reborn/field-engine';
export const Scripts: ModdedBattleScriptsData = {inherit: 'gen7', gen: 7,
 field: rebornFieldScripts,
 pokemon: {
  getMoves(lockedMove, restrictData) {
   const moves = Pokemon.prototype.getMoves.call(this, lockedMove == null ? lockedMove : this.battle.toID(lockedMove), restrictData);
   return gardenMoveRequests(this.battle, moves);
  },
  ignoringAbility() {
   if (this.ability === 'comatose' && fieldId(this.battle) === 'electerrain') return true;
   return Pokemon.prototype.ignoringAbility.call(this);
  },
 },
};
