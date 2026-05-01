import type { Player } from "../index.ts";
import type { GameOverResult } from "./GameOverResult.ts";

export const CLASSIC_CONFIG = {
    label: "Classique",
    baseSpeed: 220,
    tagSpeedBonus: 18,
    gravity: 1100,
    jumpForce: 480,
    baseRoundDurationMs: 150000,
    minPlayers: 2,
};

export function handleClassicRoundEnd(
    tagPlayerId: string | null,
    players: Map<string, Player>,
): GameOverResult {
    // Classic mode: tag loses, others win
    const loserId = tagPlayerId;
    const loser = loserId ? players.get(loserId) : null;
    const winnersList = [...players.values()]
        .filter((player) => player.id !== loserId)
        .map((player) => ({
            id: player.id,
            name: player.name,
        }));
    const losersList = loser ? [{ id: loser.id, name: loser.name }] : [];

    return {
        mode: 'classic',
        reason: 'Le TAG est le perdant à la fin du temps.',
        winners: winnersList,
        winnersList,
        losersList,
    };
}

export function getClassicSpeed(
    player: Player,
    tagPlayerId: string | null,
    baseSpeed: number,
    tagSpeedBonus: number,
): number {
    return player.id === tagPlayerId ? baseSpeed + tagSpeedBonus : baseSpeed;
}

export function handleClassicTag(
    tagger: Player,
    candidate: Player,
    broadcast: (msg: any) => void,
    lastTagTs: () => void,
): string {
    // Classic mode tag transfer
    broadcast({
        type: "tag_event",
        from: tagger.name,
        to: candidate.name,
    });
    return candidate.id;
}
