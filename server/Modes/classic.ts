import type { Player } from "../index.ts";

export function handleClassicRoundEnd(
    tagPlayerId: string | null,
    players: Map<string, Player>,
): string {
    // Classic mode: tag loses, others win
    const loserId = tagPlayerId;
    const loserName = loserId ? players.get(loserId)?.name ?? "Inconnu" : "Inconnu";
    const winners = [...players.values()]
        .filter((player) => player.id !== loserId)
        .map((player) => player.name);
    const winnersText = winners.length > 0 ? winners.join(", ") : "personne";
    return `${loserName} est TAG à la fin du temps : il perd. Gagnants: ${winnersText}.`;
}

export function getClassicSpeed(
    player: Player,
    tagPlayerId: string | null,
    baseSpeed: number,
    tagSpeedBonus: number,
): number {
    return player.id === tagPlayerId ? baseSpeed + tagSpeedBonus : baseSpeed;
}
