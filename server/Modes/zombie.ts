import type { Player } from "../index.ts";

export const ZOMBIE_TRANSFORMATION_TIME_MS = 3000;

export const ZOMBIE_CONFIG = {
    label: "Zombie",
    baseSpeed: 200,
    tagSpeedBonus: -15,
    gravity: 1100,
    jumpForce: 480,
    baseRoundDurationMs: 45000,
    minPlayers: 5,
};

export interface ZombieRoundEndResult {
    message: string;
    allZombies: boolean;
}

export function handleZombieRoundEnd(
    players: Map<string, Player>,
): ZombieRoundEndResult {
    // Zombie mode: count tags and non-tags
    const tags = [...players.values()].filter((p) => p.isTag);
    const nonTags = [...players.values()].filter((p) => !p.isTag);

    let message: string;
    if (nonTags.length > 0) {
        // Non-tags win
        const winnerNames = nonTags.map((p) => p.name).join(", ");
        message = `Temps écoulé! Les survivants gagnent: ${winnerNames}.`;
    } else if (tags.length > 0) {
        // All are tags, those who transformed someone win
        const winnersWithTransform = tags.filter(
            (t) => [...players.values()].some((p) => p.transformedFrom === t.id)
        );
        if (winnersWithTransform.length > 0) {
            const winnerNames = winnersWithTransform.map((p) => p.name).join(", ");
            message = `Apocalypse zombie! Gagnants (qui ont transformé): ${winnerNames}.`;
        } else {
            message = `Apocalypse zombie! Mode de fin indéfini.`;
        }
    } else {
        message = `Fins de temps: pas de gagnants identifiés.`;
    }

    return { message, allZombies: false };
}

export function handleZombieAllTagsGameOver(
    players: Map<string, Player>,
): string {
    const winnersWithTransform = [...players.values()].filter(
        (t) => [...players.values()].some((p) => p.transformedFrom === t.id)
    );
    const winnerNames = winnersWithTransform.length > 0 
        ? winnersWithTransform.map((p) => p.name).join(", ")
        : "personne";
    return `Apocalypse zombie! Tous sont devenus tags. Gagnants (qui ont transformé): ${winnerNames}.`;
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
