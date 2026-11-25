import {FIELDS, setField} from './field-engine';
import {assignChessPieces} from './chess';
import {FIELD_DATA} from './field-data';
export const Rulesets: import('../../../sim/dex-formats').ModdedFormatDataTable = {
	rebornfield: {
		effectType: 'Rule', name: 'Reborn Field', hasValue: true,
		banlist: ['Electric Seed', 'Grassy Seed', 'Misty Seed', 'Psychic Seed', 'Terrain Extender'],
		desc: 'Select the starting Reborn field.',
		onValidateRule(value) {
			const id = this.dex.toID(value);
			if (id !== 'random' && !Object.prototype.hasOwnProperty.call(FIELDS, id)) throw new Error('Unknown Reborn field. Choose a field from the selector.');
			return id;
		},
		onBattleStart() { assignChessPieces(this); },
		onBegin() {
			for (const side of this.sides) side.pokemon.forEach((p, i) => { p.m.chessTeamSlot = i; });
			this.field.addPseudoWeather('rebornfieldstate');
			this.field.addPseudoWeather('chesspawnsturdy');
			const selected = this.ruleTable.valueRules.get('rebornfield') || 'none';
			const id = selected === 'random' ? this.sample(Object.keys(FIELDS).filter(id => id !== 'none')) : selected;
			setField(this, id as keyof typeof FIELDS);
			for (const message of FIELD_DATA[id].fieldMessage) if (message) this.add('message', message);
		},
	},
};
