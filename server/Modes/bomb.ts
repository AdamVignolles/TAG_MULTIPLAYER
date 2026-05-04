import type { Player } from "../index.ts";
import type { GameOverResult } from "./GameOverResult.ts";

export const BOMB_CONFIG = {
    label: "Bombe",
    baseSpeed: 240,
    tagSpeedBonus: 20,
    gravity: 1100,
    jumpForce: 480,
    minPlayers: 2,
};

export const BOMB_GROUP = [
    { minPlayers: 2, maxPlayers: 3, initialTags: 1, initialCounter: 10 },
    { minPlayers: 4, maxPlayers: 5, initialTags: 1, initialCounter: 35 },
    { minPlayers: 6, maxPlayers: 8, initialTags: 2, initialCounter: 30 },
    { minPlayers: 9, maxPlayers: 12, initialTags: 2, initialCounter: 25 },
    { minPlayers: 13, maxPlayers: 20, initialTags: 3, initialCounter: 20 },
    { minPlayers: 21, maxPlayers: 50, initialTags: 3, initialCounter: 15 },
    { minPlayers: 51, maxPlayers: 100, initialTags: 4, initialCounter: 15 },
    { minPlayers: 101, maxPlayers: 200, initialTags: 5, initialCounter: 12 },
] as const;

function getBombGroupConfig(playerCount: number) {
    return BOMB_GROUP.find((group) => playerCount >= group.minPlayers && playerCount <= group.maxPlayers) || BOMB_GROUP[BOMB_GROUP.length - 1];
}

export function getBombCounterForPlayerCount(playerCount: number): number {
    const config = getBombGroupConfig(playerCount);
    return config.initialCounter;
}

export function getInitialTagCountForPlayerCount(playerCount: number): number {
    const config = getBombGroupConfig(playerCount);
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

const AURA_TRANSITION_DURATION_MS = 1500; // 1.5 seconds for aura animation

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
            
            // Send death animation event
            broadcast({
                type: "player_death",
                playerId: tagPlayer.id,
                playerName: tagPlayer.name,
            });
            
            // After elimination, check if we need to assign a new TAG
            const nonEliminatedPlayers = [...players.values()].filter(p => !p.isEliminated);
            const nonTagPlayers = nonEliminatedPlayers.filter(p => !p.isTag);
            const tagPlayers = nonEliminatedPlayers.filter(p => p.isTag);
            
            // Check if only one player left (immediate win condition)
            if (nonEliminatedPlayers.length === 1) {
                const survivor = nonEliminatedPlayers[0];
                const winnersList = [{
                    id: survivor.id,
                    name: survivor.name,
                }];
                const winnerIds = new Set(winnersList.map((winner) => winner.id));
                const losersList = [...players.values()]
                    .filter((player) => !winnerIds.has(player.id))
                    .map((player) => ({
                        id: player.id,
                        name: player.name,
                    }));
                const gameOverResult: GameOverResult = {
                    mode: 'bomb',
                    reason: `${survivor.name} est le dernier survivant!`,
                    winners: winnersList,
                    winnersList,
                    losersList,
                };
                return gameOverResult;
            }

            // If non-TAG > TAG, assign a new TAG to a random non-TAG player
            if (nonTagPlayers.length > tagPlayers.length && nonTagPlayers.length > 0) {
                bombTagPlayerIds.delete(tagId);
                const newTagPlayer = nonTagPlayers[Math.floor(Math.random() * nonTagPlayers.length)];

                bombTagPlayerIds.add(newTagPlayer.id);
                
                // Start aura transition animation
                // Store transition info in custom properties (we'll extend Player type)
                (tagPlayer as any).transitionEndPlayerId = newTagPlayer.id;
                (tagPlayer as any).transitionStartTime = Date.now();
                (newTagPlayer as any).isAwaitingTag = true;

                // Send aura transition event to start animation on client
                // Note: We don't send positions as they're dynamic - the client will follow the players
                broadcast({
                    type: "aura_transfer",
                    fromPlayerId: tagPlayer.id,
                    toPlayerId: newTagPlayer.id,
                    duration: AURA_TRANSITION_DURATION_MS,
                });

                // Schedule the actual tag assignment after animation completes
                setTimeout(() => {
                    if (!newTagPlayer.isEliminated) {
                        newTagPlayer.isTag = true;
                        const newBombCounter = getBombCounterForPlayerCount(nonEliminatedPlayers.length);
                        newTagPlayer.bombCounter = newBombCounter;
                        newTagPlayer.bombCounterPersonal = newBombCounter;
                        newTagPlayer.bombCounterStartTime = Date.now();
                        (newTagPlayer as any).isAwaitingTag = false;
                        broadcast({
                            type: "tag_event",
                            from: "Système",
                            to: newTagPlayer.name,
                        });
                    }
                }, AURA_TRANSITION_DURATION_MS);
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
        const winnersList = nonEliminatedPlayers.map((player) => ({
            id: player.id,
            name: player.name,
        }));
        const winnerIds = new Set(winnersList.map((entry) => entry.id));
        const losersList = [...players.values()]
            .filter((player) => !winnerIds.has(player.id))
            .map((player) => ({
                id: player.id,
                name: player.name,
            }));

        return {
            mode: 'bomb',
            reason: 'Tous les joueurs ont été éliminés!',
            winners: winnersList,
            winnersList,
            losersList,
        };
    }

    return null;
}

export function handleBombRoundEnd(
    players: Map<string, Player>,
): GameOverResult {
    const nonEliminatedPlayers = [...players.values()].filter(p => !p.isEliminated);
    const nonTagPlayers = nonEliminatedPlayers.filter(p => !p.isTag);
    const winnersList = nonTagPlayers.length > 0
        ? nonTagPlayers.map((player) => ({
            id: player.id,
            name: player.name,
        }))
        : nonEliminatedPlayers.map((player) => ({
            id: player.id,
            name: player.name,
        }));

    const winnerIds = new Set(winnersList.map((entry) => entry.id));
    const losersList = [...players.values()]
        .filter((player) => !winnerIds.has(player.id))
        .map((player) => ({
            id: player.id,
            name: player.name,
        }));

    return {
        mode: 'bomb',
        reason: winnersList.length === 1
            ? `${winnersList[0].name} est le dernier survivant!`
            : 'Fin de partie.',
        winners: winnersList,
        winnersList,
        losersList,
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
