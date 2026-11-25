import {Abilities as RebornAbilities} from '../reborn/abilities';
import {fieldId} from '../reborn/field-engine';

export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
 ...RebornAbilities,
 quarkdrive: {inherit: true,
  onUpdate(pokemon) {
   this.singleEvent('TerrainChange', this.effect, this.effectState, pokemon);
  },
  onTerrainChange(pokemon) {
   if (fieldId(this) === 'electerrain') {
    pokemon.addVolatile('quarkdrive');
   } else if (!pokemon.volatiles.quarkdrive?.fromBooster) {
    pokemon.removeVolatile('quarkdrive');
   }
  },
 },
};
