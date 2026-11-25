import {seed, fieldId} from './field-engine';
export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
 shellbell: {inherit: true,
  onAfterMoveSecondarySelf(pokemon, target, move) {
   if (move.totalDamage && !pokemon.forceSwitchFlag) {
    this.heal(move.totalDamage / (fieldId(this) === 'ashenbeach' ? 4 : 8), pokemon);
   }
  },
 },
 psychicseed: {inherit: true, onStart(pokemon) { this.singleEvent('Update', this.effect, this.effectState, pokemon); }, onUpdate(pokemon) {
  if (!pokemon.ignoringItem() && fieldId(this) === 'psyterrain') pokemon.useItem();
 }},
 mistyseed: {inherit: true, onStart(pokemon) { this.singleEvent('Update', this.effect, this.effectState, pokemon); }, onUpdate(pokemon) {
  if (!pokemon.ignoringItem() && fieldId(this) === 'misty') pokemon.useItem();
 }},
 grassyseed: {inherit: true, onStart(pokemon) { this.singleEvent('Update', this.effect, this.effectState, pokemon); }, onUpdate(pokemon) {
  if (!pokemon.ignoringItem() && fieldId(this) === 'grassy') pokemon.useItem();
 }},
 electricseed: {inherit: true, onStart(pokemon) { this.singleEvent('Update', this.effect, this.effectState, pokemon); }, onUpdate(pokemon) {
  if (!pokemon.ignoringItem() && fieldId(this) === 'electerrain') pokemon.useItem();
 }},
	buggem: {inherit: true, isNonstandard: null},
	darkgem: {inherit: true, isNonstandard: null},
	dragongem: {inherit: true, isNonstandard: null},
	electricgem: {inherit: true, isNonstandard: null},
	fairygem: {inherit: true, isNonstandard: null},
	fightinggem: {inherit: true, isNonstandard: null},
	firegem: {inherit: true, isNonstandard: null},
	flyinggem: {inherit: true, isNonstandard: null},
	ghostgem: {inherit: true, isNonstandard: null},
	grassgem: {inherit: true, isNonstandard: null},
	groundgem: {inherit: true, isNonstandard: null},
	icegem: {inherit: true, isNonstandard: null},
	normalgem: {inherit: true, isNonstandard: null},
	poisongem: {inherit: true, isNonstandard: null},
	psychicgem: {inherit: true, isNonstandard: null},
	rockgem: {inherit: true, isNonstandard: null},
	steelgem: {inherit: true, isNonstandard: null},
	watergem: {inherit: true, isNonstandard: null},
	amplifieldrock: {
		name: 'Amplifield Rock', num: -2002, gen: 7, spritenum: 0,
		desc: 'Extends the duration of the area-altering moves.',
		shortDesc: 'Extends the duration of the area-altering moves.',
		fling: {basePower: 60},
	},
	genesisseed: {
		name: 'Genesis Seed', num: -2001, gen: 7,
		desc: 'Grants a boost depending on the current field.',
		shortDesc: 'Grants a boost depending on the current field.',
		onSwitchInPriority: -1,
		spritenum: 666, fling: {basePower: 10},
		onStart(pokemon) { seed(this, pokemon); },
		onTerrainChange(pokemon) { seed(this, pokemon); },
		onUpdate(pokemon) { seed(this, pokemon); },
	},
};
