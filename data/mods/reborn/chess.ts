import type {Battle} from '../../../sim/battle';
import type {Pokemon} from '../../../sim/pokemon';

export const CHESS_ATTACKS = ['ancientpower', 'psychic', 'secretpower', 'strength', 'continentalcrush', 'shatteredpsyche'];
const VULNERABLE = ['oblivious', 'simple', 'unaware', 'klutz'];
const RESISTANT = ['adaptability', 'synchronize', 'anticipation', 'telepathy'];

export function assignChessPieces(battle: Battle) {
 for (const side of battle.sides) {
  const team = side.pokemon;
  if (!team.length) continue;
  // Preserve the submitted order for the Queen and King tie-break, even after Team Preview.
  const submitted = [...team].sort((a, b) => a.m.chessTeamSlot - b.m.chessTeamSlot);
  submitted[submitted.length - 1].m.chessPiece = 'queen';
  for (const lead of team.slice(0, side.active.length)) lead.m.chessPiece ??= 'pawn';

  const king = submitted.filter(p => !p.m.chessPiece).sort((a, b) =>
   Number(b.item === 'kingsrock') - Number(a.item === 'kingsrock') || a.maxhp - b.maxhp
  )[0];
  if (king) king.m.chessPiece = 'king';

  for (const p of team) {
   const {atk, def, spa, spd, spe} = p.storedStats;
   const best = Math.max(atk, def, spa, spd, spe);
   p.m.chessPiece ??= Math.max(def, spd) === best ? 'rook' : Math.max(atk, spa) === best ? 'bishop' : 'knight';
  }
 }
}

export function chessPieceLabel(battle: Battle, pokemon: Pokemon, show: boolean) {
 const piece = pokemon.m.chessPiece;
 if (piece && pokemon.hp) battle.add(show ? '-start' : '-end', pokemon, 'Chess ' + piece, '[silent]');
}

export function chessSwitchIn(battle: Battle, pokemon: Pokemon) {
 const piece = pokemon.m.chessPiece as string | undefined;
 if (!piece || !pokemon.hp) return;
 chessPieceLabel(battle, pokemon, true);
 battle.add('message', `${pokemon.name} entered as a ${piece[0].toUpperCase() + piece.slice(1)}!`);
 if (piece === 'queen' || piece === 'rook') battle.boost({def: 1, spd: 1}, pokemon, pokemon);
 if (piece === 'bishop') battle.boost({atk: 1, spa: 1}, pokemon, pokemon);
}

export function chessPower(battle: Battle, source: Pokemon, target: Pokemon, move: ActiveMove) {
 let multiplier = 1;
 if (CHESS_ATTACKS.includes(move.id)) {
  if (target.hasAbility(RESISTANT)) multiplier *= 0.5;
  if (target.volatiles.confusion || target.hasAbility(VULNERABLE)) multiplier *= 2;
 }
 if (source.m.chessPiece === 'queen' || source.hasAbility('queenlymajesty')) multiplier *= 1.5;
 if (source.m.chessPiece === 'knight' && target.m.chessPiece === 'queen') multiplier *= 3;
 return multiplier;
}
