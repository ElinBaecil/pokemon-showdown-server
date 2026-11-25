import {Items as RebornItems} from '../reborn/items';
import {fieldId} from '../reborn/field-engine';

export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
 ...RebornItems,
 boosterenergy: {inherit: true,
  onUpdate(pokemon) {
   // The native handler checks the native terrain. Reborn Electric Terrain
   // supplies Quark Drive instead, so hold the item until that field ends.
   if (fieldId(this) === 'electerrain' && pokemon.hasAbility('quarkdrive')) return;
   this.dex.mod('gen9').data.Items.boosterenergy.onUpdate!.call(this, pokemon);
  },
 },
};
