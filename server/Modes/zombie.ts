import type { Player } from "../index.ts";
import type { GameOverResult } from "./GameOverResult.ts";

export const ZOMBIE_TRANSFORMATION_TIME_MS = 3000;

export const ZOMBIE_CONFIG = {
    label: "Zombie",
    baseSpeed: 200,
    tagSpeedBonus: 0, // No speed bonus for zombies in this mode
    gravity: 1100,
    jumpForce: 480,
    baseRoundDurationMs: 90000, // 1:30 min
    minPlayers: 3,
};

// Runtime state for zombie mode
let survivorSpeedBonus = 0;
let survivorSpeedIncrement = 0; // amount survivors gain when someone is infected
let tagSpeedPenalty = 0; // negative value applied to zombies initially based on player count

export function initZombieMode(players: Map<string, Player>) {
    survivorSpeedBonus = 0;
    survivorSpeedIncrement = computeSurvivorSpeedIncrement(players.size);
    tagSpeedPenalty = computeInitialTagPenalty(players.size);
}

export function computeInitialTagPenalty(playerCount: number): number {
    if (playerCount <= 4) return 5;
    return 0;
}

export function computeSurvivorSpeedIncrement(playerCount: number): number {
    if (playerCount <= 10) return 10;
    if (playerCount <= 20) return 5;
    if (playerCount <= 30) return 3;
    if (playerCount <= 50) return 2;
    return 1;
}

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
    if (player.isTag) {
        return baseSpeed + tagSpeedBonus + tagSpeedPenalty;
    }

    return baseSpeed + survivorSpeedBonus;
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
    // Increase survivors' speed when someone becomes a zombie
    survivorSpeedBonus += survivorSpeedIncrement;
    broadcast({
        type: "zombie_speed_update",
        survivorSpeedBonus,
        tagSpeedPenalty,
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
