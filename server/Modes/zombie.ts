import type { Player } from "../index.ts";
import type { GameOverResult } from "./GameOverResult.ts";

export const ZOMBIE_TRANSFORMATION_TIME_MS = 3000;

export const ZOMBIE_CONFIG = {
    label: "Zombie",
    baseSpeed: 200,
    tagSpeedBonus: -15,
    gravity: 1100,
    jumpForce: 480,
    baseRoundDurationMs: 45000,
    minPlayers: 3,
};

export function handleZombieRoundEnd(
    players: Map<string, Player>,
): GameOverResult {
    // Zombie mode: count tags and non-tags
    const nonTags = [...players.values()].filter((p) => !p.isTag);

    if (nonTags.length > 0) {
        // Non-tags win (time ran out)
        const winnersList = nonTags.map((p) => ({
            id: p.id,
            name: p.name,
        }));
        const winnerIds = new Set(winnersList.map((winner) => winner.id));
        const losersList = [...players.values()]
            .filter((player) => !winnerIds.has(player.id))
            .map((player) => ({
                id: player.id,
                name: player.name,
            }));
        return {
            mode: 'zombie',
            reason: 'Les survivants ont tenu jusqu\'à la fin du temps!',
            winners: winnersList,
            winnersList,
            losersList,
        };
    }

    // All are tags, those who transformed someone win
    const tags = [...players.values()];
    const winnersWithTransform = tags.filter(
        (t) => [...players.values()].some((p) => p.transformedFrom === t.id)
    );

    const winnersList = winnersWithTransform.map((p) => ({
        id: p.id,
        name: p.name,
    }));
    const winnerIds = new Set(winnersList.map((winner) => winner.id));
    const losersList = [...players.values()]
        .filter((player) => !winnerIds.has(player.id))
        .map((player) => ({
            id: player.id,
            name: player.name,
        }));

    return {
        mode: 'zombie',
        reason: winnersWithTransform.length > 0 
            ? 'Apocalypse zombie! Les infecteurs ont gagné!' 
            : 'Apocalypse zombie. Aucun infecteur ne pouvait être identifié.',
        winners: winnersList,
        winnersList,
        losersList,
    };
}

export function handleZombieAllTagsGameOver(
    players: Map<string, Player>,
): GameOverResult {
    const winnersWithTransform = [...players.values()].filter(
        (t) => [...players.values()].some((p) => p.transformedFrom === t.id)
    );
    
    const winnersList = winnersWithTransform.map((p) => ({
        id: p.id,
        name: p.name,
    }));
    const winnerIds = new Set(winnersList.map((winner) => winner.id));
    const losersList = [...players.values()]
        .filter((player) => !winnerIds.has(player.id))
        .map((player) => ({
            id: player.id,
            name: player.name,
        }));

    return {
        mode: 'zombie',
        reason: winnersWithTransform.length > 0
            ? 'Tous les joueurs sont devenus des zombies! Les infecteurs ont gagné!'
            : 'Tous les joueurs sont devenus des zombies!',
        winners: winnersList,
        winnersList,
        losersList,
    };
}

export function getZombieSpeed(
    player: Player,
    baseSpeed: number,
    tagSpeedBonus: number,
): number {
    return player.isTag ? baseSpeed + tagSpeedBonus : baseSpeed;
}

export function calculateZombieDuration(playerCount: number): number {
    // Scale duration linearly: fewer players = longer duration
    // 1 player: 60s, 5+ players: 30s
    const ZOMBIE_MIN_DURATION_MS = 30000;
    const ZOMBIE_MAX_DURATION_MS = 60000;
    
    if (playerCount <= 1) return ZOMBIE_MAX_DURATION_MS;
    const ratio = Math.max(0, Math.min(1, (playerCount - 1) / 4));
    return ZOMBIE_MAX_DURATION_MS - ratio * (ZOMBIE_MAX_DURATION_MS - ZOMBIE_MIN_DURATION_MS);
}

export function handleZombieTag(
    tagger: Player,
    candidate: Player,
    broadcast: (msg: any) => void,
): void {
    // Tag immediately in zombie mode
    candidate.isTag = true;
    candidate.transformedFrom = tagger.id;
    candidate.transformationStartTime = Date.now();
    broadcast({
        type: "tag_event",
        from: tagger.name,
        to: candidate.name,
    });
}

export function handleZombieTransformationCleanup(
    players: Map<string, Player>,
): void {
    players.forEach((player) => {
        if (player.transformationStartTime && Date.now() - player.transformationStartTime >= ZOMBIE_TRANSFORMATION_TIME_MS) {
            player.transformationStartTime = null;
        }
    });
}

export function checkZombieAllTagsGameOver(
    players: Map<string, Player>,
): boolean {
    return [...players.values()].every((p) => p.isTag) && players.size > 0;
}
