import RandomGen7Teams from '../gen7/teams';
import type { PRNG, PRNGSeed } from '../../../sim/prng';

export default class RandomRebornTeams extends RandomGen7Teams {
	constructor(_format: Format | string, prng: PRNG | PRNGSeed | null) {
		super('[Gen 7] Random Battle', prng);
	}
}
