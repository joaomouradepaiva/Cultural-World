// Camarins e hospitalidade: rider de acolhimento de cada artista, catering e satisfação do artista.

import { artistOf, type ArtistDef } from '../content/artists';
import { HOSPITALITY, type HospitalityId } from '../content/equipment';
import { log, type Ctx } from './core';
import { upgradeValue } from './state';
import type { Booking, GameState, RoomId } from './types';

/** Nível de acolhimento pedido (0–4), derivado do estatuto (cachet). Cena local e eventos externos não pedem. */
export function hospitalityRider(a: ArtistDef, custom: boolean): number {
  if (custom || a.id.startsWith('scene-')) return 0;
  const c = a.cachet;
  return c < 120 ? 0 : c < 300 ? 1 : c < 800 ? 2 : c < 2000 ? 3 : 4;
}

export const RIDER_LABEL = ['Nenhum', 'Camarim simples', 'Camarim equipado', 'Camarim profissional', 'Camarim premium'];

/** Nível de acolhimento oferecido: camarim da sala + bónus do catering. */
export function hospitalityOffered(s: GameState, room: RoomId, opt: HospitalityId = s.hospitality): number {
  return upgradeValue(s, room, 'dressing') + HOSPITALITY[opt].bonus;
}

export function hospitalityCost(s: GameState, a: ArtistDef, opt: HospitalityId = s.hospitality): number {
  return a.members * HOSPITALITY[opt].perMember;
}

/** Satisfação do artista com o acolhimento (0–100). */
export function artistSatisfaction(s: GameState, room: RoomId, a: ArtistDef, custom: boolean): number {
  const req = hospitalityRider(a, custom);
  return Math.max(0, Math.min(100, 70 + (hospitalityOffered(s, room) - req) * 15));
}

/** Acolhimento muito abaixo do pedido: o artista recusa a data. */
export function hospitalityError(s: GameState, room: RoomId, a: ArtistDef, custom: boolean): string | null {
  const req = hospitalityRider(a, custom);
  if (hospitalityOffered(s, room) < req - 1) return `${a.name} exige ${RIDER_LABEL[req].toLowerCase()}: melhora os camarins ou o catering.`;
  return null;
}

export function setHospitality(ctx: Ctx, opt: HospitalityId): void {
  ctx.state.hospitality = opt;
  log(ctx, `Hospitalidade nos camarins: ${HOSPITALITY[opt].name}.`, 'info', false);
}

/** Efeito do acolhimento no fim do evento. Devolve a satisfação do artista e o delta de relação. */
export function applyArtistSatisfaction(ctx: Ctx, b: Booking): { artistSat: number; relDelta: number } {
  const s = ctx.state;
  const a = artistOf(b);
  const artistSat = artistSatisfaction(s, b.roomId, a, !!b.custom);
  let relDelta = (artistSat - 50) / 8;
  if (!b.custom) {
    if (artistSat >= 80 && hospitalityRider(a, false) > 0) {
      s.rep.general = Math.min(100, s.rep.general + 0.3);
      s.flags.artistRecommendation = true;
      log(ctx, `${a.name} adorou o acolhimento e vai recomendar-nos a outros artistas.`, 'good', false);
    } else if (artistSat < 40) {
      relDelta -= 5;
      log(ctx, `${a.name} queixou-se dos camarins e do acolhimento.`, 'bad', false);
    }
  }
  return { artistSat, relDelta };
}
