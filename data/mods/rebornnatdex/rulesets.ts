import {Rulesets as BaseRules} from '../reborn/rulesets';
export const Rulesets: import('../../../sim/dex-formats').ModdedFormatDataTable = {
 ...BaseRules, rebornfield: {...BaseRules.rebornfield, banlist: []},
};
