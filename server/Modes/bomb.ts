export const BOMB_CONFIG = {
    label: "Bombe",
    baseSpeed: 240,
    tagSpeedBonus: 14,
    gravity: 1250,
    jumpForce: 500,
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