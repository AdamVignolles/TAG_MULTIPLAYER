import type { Player } from "../index.ts";

export const BOMB_CONFIG = {
    label: "Bombe",
    baseSpeed: 240,
    tagSpeedBonus: 14,
    gravity: 1100,
    jumpForce: 480,
    baseRoundDurationMs: 90000,
    minPlayers: 2,
};

export const BOMB_GROUP = {
    2: { initialTags: 1, initialCounter: 30 },
    4: { initialTags: 1, initialCounter: 35 },
    5: { initialTags: 1, initialCounter: 40 },
    6: { initialTags: 2, initialCounter: 25 },
    7: { initialTags: 2, initialCounter: 28 },
    8: { initialTags: 2, initialCounter: 30 },
    9: { initialTags: 2, initialCounter: 32 },
    10: { initialTags: 3, initialCounter: 25 },
} as const;

export function getBombCounterForPlayerCount(playerCount: number): number {
    const config = BOMB_GROUP[playerCount as keyof typeof BOMB_GROUP] || BOMB_GROUP[10];
    return config.initialCounter;
}

export function getInitialTagCountForPlayerCount(playerCount: number): number {
    const config = BOMB_GROUP[playerCount as keyof typeof BOMB_GROUP] || BOMB_GROUP[10];
    return config.initialTags;
}

export function initBombMode(
    players: Map<string, Player>,
    bombTagPlayerIds: Set<string>,
): void {
    const playerCount = players.size;
    const initialTagCount = getInitialTagCountForPlayerCount(playerCount);
    const bombCounter = getBombCounterForPlayerCount(playerCount);
    const now = Date.now();
    
    bombTagPlayerIds.clear();
    const playerIds = [...players.keys()];
    
    // Shuffle and select initial TAGs
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(initialTagCount, shuffled.length); i++) {
        const selectedId = shuffled[i];
        bombTagPlayerIds.add(selectedId);
        const player = players.get(selectedId)!;
        player.isTag = true;
        player.bombCounter = bombCounter;
        player.bombCounterPersonal = bombCounter;
        player.bombCounterStartTime = now;
        player.isEliminated = false;
    }
    
    // Initialize non-TAGs
    for (const [id, player] of players) {
        if (!bombTagPlayerIds.has(id)) {
            player.isTag = false;
            player.bombCounter = bombCounter;
            player.bombCounterPersonal = bombCounter;
            player.bombCounterStartTime = 0;
            player.isEliminated = false;
        }
    }
}

export function updateBombMode(
    dt: number,
    players: Map<string, Player>,
    bombTagPlayerIds: Set<string>,
    broadcast: (msg: any) => void,
): void {
    // Update bomb counters for TAG players
    for (const tagId of bombTagPlayerIds) {
        const tagPlayer = players.get(tagId);
        if (!tagPlayer || tagPlayer.isEliminated) continue;
        
        // TAGs have their personal counter tick down each frame
        tagPlayer.bombCounter = Math.max(0, tagPlayer.bombCounter - dt);
        
        // Check if bomb counter reaches 0
        if (tagPlayer.bombCounter <= 0 && !tagPlayer.isEliminated) {
            tagPlayer.isEliminated = true;
            broadcast({
                type: "tag_event",
                from: "Bombe",
                to: tagPlayer.name,
            });
        }
    }
    
    // Check win/loss conditions
    const nonEliminatedPlayers = [...players.values()].filter(p => !p.isEliminated);
    const nonTagPlayers = nonEliminatedPlayers.filter(p => !p.isTag);
    const tagPlayers = nonEliminatedPlayers.filter(p => p.isTag);
    
    // If non-TAG players > TAG players and a TAG is eliminated, reassign a new TAG
    if (nonTagPlayers.length > tagPlayers.length && nonTagPlayers.length > 0) {
        // Find an eliminated TAG
        const eliminatedTag = [...bombTagPlayerIds].find(id => players.get(id)?.isEliminated);
        if (eliminatedTag) {
            // Pick a random non-TAG to become TAG
            const newTagPlayer = nonTagPlayers[Math.floor(Math.random() * nonTagPlayers.length)];
            if (newTagPlayer) {
                bombTagPlayerIds.delete(eliminatedTag);
                bombTagPlayerIds.add(newTagPlayer.id);
                newTagPlayer.isTag = true;
                const newBombCounter = getBombCounterForPlayerCount(nonEliminatedPlayers.length);
                newTagPlayer.bombCounter = newBombCounter;
                newTagPlayer.bombCounterPersonal = newBombCounter;
                newTagPlayer.bombCounterStartTime = Date.now();
                broadcast({
                    type: "tag_event",
                    from: "Système",
                    to: newTagPlayer.name,
                });
            }
        }
    }
    
    // Check loss condition: all non-TAG players eliminated
    if (nonTagPlayers.length === 0 && nonEliminatedPlayers.length > 0) {
        broadcast({
            type: "game_over",
            message: "Tous les joueurs ont été éliminés!",
        });
    }
}

export interface BombRoundEndResult {
    message: string;
}

export function handleBombRoundEnd(
    players: Map<string, Player>,
): BombRoundEndResult {
    const nonEliminatedPlayers = [...players.values()].filter(p => !p.isEliminated);
    const nonTagPlayers = nonEliminatedPlayers.filter(p => !p.isTag);
    const winner = nonTagPlayers.length === 1 ? nonTagPlayers[0] : null;
    const message = winner ? `${winner.name} a gagné!` : "Fin de partie";
    return { message };
}

export function handleBombTransfer(
    tagger: Player,
    candidate: Player,
    bombTagPlayerIds: Set<string>,
    broadcast: (msg: any) => void,
): void {
    // Transfer bomb in bomb mode
    // TAG becomes non-TAG: freeze at current counter
    // Non-TAG becomes TAG: resume counting from their frozen counter
    const tagCurrentCounter = tagger.bombCounter;
    
    bombTagPlayerIds.delete(tagger.id);
    bombTagPlayerIds.add(candidate.id);
    
    tagger.isTag = false;
    tagger.bombCounter = tagCurrentCounter;
    tagger.bombCounterStartTime = 0;
    
    candidate.isTag = true;
    // Don't change candidate.bombCounter - it's already frozen at its current value
    // Just mark it as TAG to start the countdown
    candidate.bombCounterStartTime = Date.now();
    
    broadcast({
        type: "tag_event",
        from: tagger.name,
        to: candidate.name,
    });
}
