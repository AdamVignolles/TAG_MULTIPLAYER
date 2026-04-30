import type { Player } from "../index.ts";
import type { GameOverResult } from "./GameOverResult.ts";

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
): GameOverResult | null {
    // Update bomb counters for TAG players and eliminate when counter reaches 0
    const tagsToProcess = [...bombTagPlayerIds];
    for (const tagId of tagsToProcess) {
        const tagPlayer = players.get(tagId);
        if (!tagPlayer || tagPlayer.isEliminated) continue;
        
        // TAGs have their personal counter tick down each frame
        tagPlayer.bombCounter = Math.max(0, tagPlayer.bombCounter - dt);
        
        // Check if bomb counter reaches 0
        if (tagPlayer.bombCounter <= 0) {
            tagPlayer.isEliminated = true;
            broadcast({
                type: "tag_event",
                from: "Bombe",
                to: tagPlayer.name,
            });
            
            // After elimination, check if we need to assign a new TAG
            const nonEliminatedPlayers = [...players.values()].filter(p => !p.isEliminated);
            const nonTagPlayers = nonEliminatedPlayers.filter(p => !p.isTag);
            const tagPlayers = nonEliminatedPlayers.filter(p => p.isTag);
            
            // Check if only one player left (immediate win condition)
            if (nonEliminatedPlayers.length === 1) {
                const survivor = nonEliminatedPlayers[0];
                const gameOverResult: GameOverResult = {
                    mode: 'bomb',
                    reason: `${survivor.name} est le dernier survivant!`,
                    winners: [{
                        id: survivor.id,
                        name: survivor.name,
                    }],
                    winnerId: survivor.id,
                };
                return gameOverResult;
            }
            
            // If non-TAG > TAG, assign a new TAG to a random non-TAG player
            if (nonTagPlayers.length > tagPlayers.length && nonTagPlayers.length > 0) {
                bombTagPlayerIds.delete(tagId);
                const newTagPlayer = nonTagPlayers[Math.floor(Math.random() * nonTagPlayers.length)];
                
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
            } else {
                // No new TAG assigned, just remove the eliminated TAG from the set
                bombTagPlayerIds.delete(tagId);
            }
        }
    }
    
    // Check loss condition: all non-TAG players eliminated
    const nonEliminatedPlayers = [...players.values()].filter(p => !p.isEliminated);
    const nonTagPlayers = nonEliminatedPlayers.filter(p => !p.isTag);
    
    if (nonTagPlayers.length === 0 && nonEliminatedPlayers.length > 0) {
        broadcast({
            type: "game_over",
            message: "Tous les joueurs ont été éliminés!",
        });
    }
    
    return null;
}

export function handleBombRoundEnd(
    players: Map<string, Player>,
): GameOverResult {
    const nonEliminatedPlayers = [...players.values()].filter(p => !p.isEliminated);
    const nonTagPlayers = nonEliminatedPlayers.filter(p => !p.isTag);
    const winner = nonTagPlayers.length === 1 ? nonTagPlayers[0] : null;
    
    const winners = winner ? [{
        id: winner.id,
        name: winner.name,
    }] : [];

    return {
        mode: 'bomb',
        reason: winner ? `${winner.name} est le dernier survivant!` : 'Fin de partie.',
        winners,
    };
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
