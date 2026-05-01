/// <reference path="./ws.d.ts" />
import { WebSocketServer, WebSocket } from "ws";
import { ARENA_HEIGHT, ARENA_WIDTH, FLOOR_Y, createSimpleMap } from "./BlocMap.ts";
import type { Tile } from "./BlocMap.ts";
import { applyTileEffects } from "./EffectsBlocs.ts";
import { handleClassicRoundEnd, getClassicSpeed, handleClassicTag, CLASSIC_CONFIG } from "./Modes/classic.ts";
import {
    handleZombieRoundEnd,
    handleZombieAllTagsGameOver,
    getZombieSpeed,
    calculateZombieDuration,
    handleZombieTag,
    handleZombieTransformationCleanup,
    checkZombieAllTagsGameOver,
    ZOMBIE_TRANSFORMATION_TIME_MS,
    ZOMBIE_CONFIG,
} from "./Modes/zombie.ts";
import { BOMB_CONFIG, getBombCounterForPlayerCount, getInitialTagCountForPlayerCount, initBombMode, updateBombMode, handleBombRoundEnd, handleBombTransfer } from "./Modes/bomb.ts";
import type { GameOverResult } from "./Modes/GameOverResult.ts";

type Role = "screen" | "controller";
type GameMode = "classic" | "zombie" | "bomb";
type CharacterType = "blue" | "yellow" | "green" | "purple" | "red";

type JoinMessage = {
    type: "join";
    role: Role;
    name?: string;
    sessionId?: string;
};

type SetModeMessage = {
    type: "set_mode";
    mode: GameMode;
};

type StartGameMessage = {
    type: "start_game";
};

type StopGameMessage = {
    type: "stop_game";
};

type SetCharacterMessage = {
    type: "set_character";
    character: CharacterType;
};

type InputMessage = {
    type: "input";
    left: boolean;
    right: boolean;
    jump: boolean;
    down: boolean;
};

type ClientMessage = JoinMessage | InputMessage | SetModeMessage | StartGameMessage | StopGameMessage | SetCharacterMessage;

export type Player = {
    id: string;
    sessionId: string;
    name: string;
    character: CharacterType;
    x: number;
    y: number;
    vx: number;
    vy: number;
    gravityMultiplier: number;
    onGround: boolean;
    jumpsLeft: number;
    jumpLatch: boolean;
    input: {
        left: boolean;
        right: boolean;
        jump: boolean;
        down?: boolean;
    };
    // Zombie mode properties
    isTag: boolean;
    transformationStartTime: number | null;
    transformedFrom: string | null;
    // Bomb mode properties
    bombCounter: number;
    bombCounterStartTime: number;
    bombCounterPersonal: number;
    isEliminated: boolean;
};

function overlapsOnX(px: number, tile: Tile): boolean {
    return px + PLAYER_RADIUS > tile.x && px - PLAYER_RADIUS < tile.x + tile.w;
}

function overlapsOnY(py: number, tile: Tile): boolean {
    return py + PLAYER_RADIUS > tile.y && py - PLAYER_RADIUS < tile.y + tile.h;
}

function getTileUnderPlayer(player: Player): Tile | null {
    for (const tile of tiles) {
        if (!overlapsOnX(player.x, tile)) {
            continue;
        }
        // Check if player feet are touching tile top (onGround condition)
        const tileTop = tile.y;
        if (Math.abs((player.y + PLAYER_RADIUS) - tileTop) < 2) {
            return tile;
        }
    }
    return null;
}

type ClientMeta = {
    role?: Role;
    playerId?: string;
    sessionId?: string;
};

const TICK_MS = 33;
const PLAYER_RADIUS = 16;
const tiles: Tile[] = createSimpleMap(PLAYER_RADIUS);
const MAX_JUMPS = 2;
const TAG_COOLDOWN_MS = 800;
const MAX_CONNECTED_PLAYERS = 200;

const MODE_CONFIG: Record<GameMode, {
    label: string;
    baseSpeed: number;
    tagSpeedBonus: number;
    gravity: number;
    jumpForce: number;
    baseRoundDurationMs?: number;
    minPlayers: number;
}> = {
    classic: CLASSIC_CONFIG,
    zombie: ZOMBIE_CONFIG,
    bomb: BOMB_CONFIG,
};

const CHARACTERS: CharacterType[] = ["blue", "yellow", "green", "purple", "red"];

function getRandomCharacter(): CharacterType {
    return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
}

const wss = new WebSocketServer({ port: 3001 });
const clients = new Map<WebSocket, ClientMeta>();
const players = new Map<string, Player>();
const disconnectedPlayerTimers = new Map<string, ReturnType<typeof setTimeout>>();

let playerCounter = 1;
let tagPlayerId: string | null = null;
let bombTagPlayerIds: Set<string> = new Set();
let lastTagTs = 0;
let roundStartTs = Date.now();
let roundDurationMs = 180000;
let gameMode: GameMode = "classic";
let gameStarted = false;

function send(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function broadcast(payload: unknown) {
    const json = JSON.stringify(payload);
    wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    });
}

function getRemainingMs() {
    return Math.max(0, roundDurationMs - (Date.now() - roundStartTs));
}

function broadcastLobby() {
    broadcast({
        type: "lobby",
        mode: gameMode,
        modeLabel: MODE_CONFIG[gameMode].label,
        connectedPlayers: players.size,
        started: gameStarted,
    });
}

function spawnPlayer(id: string, name: string, sessionId: string): Player {
    return {
        id,
        sessionId,
        name,
        character: getRandomCharacter(),
        x: 120 + ((players.size * 120) % 600),
        y: FLOOR_Y - PLAYER_RADIUS,
        vx: 0,
        vy: 0,
        gravityMultiplier: 1,
        onGround: true,
        jumpsLeft: MAX_JUMPS,
        jumpLatch: false,
        input: {
            left: false,
            right: false,
            jump: false,
            down: false,
        },
        isTag: false,
        transformationStartTime: null,
        transformedFrom: null,
        bombCounter: 0,
        bombCounterStartTime: 0,
        bombCounterPersonal: 0,
        isEliminated: false,
    };
}

function removePlayer(playerId: string) {
    const timer = disconnectedPlayerTimers.get(playerId);
    if (timer) {
        clearTimeout(timer);
        disconnectedPlayerTimers.delete(playerId);
    }

    if (!players.has(playerId)) {
        return;
    }

    players.delete(playerId);

    if (tagPlayerId === playerId) {
        tagPlayerId = pickRandomPlayerId();
        lastTagTs = Date.now();
    }

    if (players.size === 0) {
        gameStarted = false;
        roundStartTs = Date.now();
        tagPlayerId = null;
    }
}

function schedulePlayerRemoval(playerId: string) {
    if (disconnectedPlayerTimers.has(playerId)) {
        return;
    }

    const timer = setTimeout(() => {
        disconnectedPlayerTimers.delete(playerId);
        removePlayer(playerId);
        broadcastLobby();
    }, 15000);

    disconnectedPlayerTimers.set(playerId, timer);
}

function pickRandomPlayerId(): string | null {
    const ids = [...players.keys()];
    if (ids.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * ids.length);
    return ids[randomIndex] ?? null;
}

function resetRoundIfNeeded() {
    if (!gameStarted) {
        return;
    }

    if (getRemainingMs() > 0) {
        return;
    }

    let gameOverResult: GameOverResult;
    if (gameMode === "zombie") {
        gameOverResult = handleZombieRoundEnd(players);
    } else if (gameMode === "bomb") {
        gameOverResult = handleBombRoundEnd(players);
    } else {
        gameOverResult = handleClassicRoundEnd(tagPlayerId, players);
    }

    broadcast({
        type: "game_over_result",
        result: gameOverResult,
    });
    gameStarted = false;
    roundStartTs = Date.now();
}

function updateGame(dt: number) {
    if (!gameStarted) {
        return;
    }

    const mode = MODE_CONFIG[gameMode];

    players.forEach((player) => {
        const prevY = player.y;
        const wasOnGround = player.onGround;
        let jumpedThisTick = false;

        // In zombie mode, immobilize during transformation
        if (gameMode === "zombie" && player.transformationStartTime) {
            player.vx = 0;
            player.vy = 0;
        } else {
            const horizontal = Number(player.input.right) - Number(player.input.left);
            let speed = mode.baseSpeed;
            if (gameMode === "zombie") {
                speed = getZombieSpeed(player, mode.baseSpeed, mode.tagSpeedBonus);
            } else if (gameMode === "classic") {
                speed = getClassicSpeed(player, tagPlayerId, mode.baseSpeed, mode.tagSpeedBonus);
            }
            player.vx = horizontal * speed;

            // Apply speed modifiers from tiles the player is currently standing on
            if (player.onGround) {
                const currentTile = getTileUnderPlayer(player);
                if (currentTile) {
                    applyTileEffects(player, currentTile, mode, 'ground');
                }
            }
        }

        if (!player.transformationStartTime || gameMode !== "zombie") {
            if (player.input.jump && !player.jumpLatch && player.jumpsLeft > 0) {
                player.vy = -mode.jumpForce;
                player.onGround = false;
                player.jumpsLeft -= 1;
                player.jumpLatch = true;
                jumpedThisTick = true;
            } else if (!player.input.jump) {
                player.jumpLatch = false;
            }
        }

        const isFalling = !player.onGround && player.vy > 0;
        if (isFalling && player.input.down) {
            player.gravityMultiplier = 1.5;
        } else if (player.gravityMultiplier === 1.5) {
            player.gravityMultiplier = 1;
        }

        player.vy += mode.gravity * player.gravityMultiplier * dt;

        // Resolve horizontal movement first to block side traversal on solid tiles.
        player.x += player.vx * dt;
        for (const tile of tiles) {
            if (tile.type === 'passable') {
                continue;
            }

            if (!overlapsOnY(prevY, tile)) {
                continue;
            }

            if (!overlapsOnX(player.x, tile)) {
                continue;
            }

            if (player.vx > 0) {
                player.x = tile.x - PLAYER_RADIUS;
            } else if (player.vx < 0) {
                player.x = tile.x + tile.w + PLAYER_RADIUS;
            }
            player.vx = 0;
        }

        // Resolve vertical movement with full collisions on solid tiles and one-way on passable tiles.
        player.y += player.vy * dt;
        player.onGround = false;
        let landedTile: Tile | null = null;

        for (const tile of tiles) {
            const tileTop = tile.y;
            const tileBottom = tile.y + tile.h;
            const prevTop = prevY - PLAYER_RADIUS;
            const prevBottom = prevY + PLAYER_RADIUS;
            const newTop = player.y - PLAYER_RADIUS;
            const newBottom = player.y + PLAYER_RADIUS;

            if (!overlapsOnX(player.x, tile)) {
                continue;
            }

            if (tile.type === 'passable') {
                // Pink tile: can always be crossed from below, can stand on top,
                // and pressing down allows dropping through.
                if (player.input.down) {
                    continue;
                }

                if (player.vy >= 0 && prevBottom <= tileTop && newBottom > tileTop) {
                    player.y = tileTop - PLAYER_RADIUS;
                    player.vy = 0;
                    player.onGround = true;
                    player.jumpsLeft = MAX_JUMPS;
                    landedTile = tile;
                }
                continue;
            }

            if (!overlapsOnY(player.y, tile)) {
                continue;
            }

            if (player.vy >= 0 && prevBottom <= tileTop && newBottom > tileTop) {
                player.y = tileTop - PLAYER_RADIUS;
                player.vy = 0;
                player.onGround = true;
                player.jumpsLeft = MAX_JUMPS;
                landedTile = tile;
                continue;
            }

            if (player.vy < 0 && prevTop >= tileBottom && newTop < tileBottom) {
                player.y = tileBottom + PLAYER_RADIUS;
                player.vy = 0;
            }
        }

        if (player.x < PLAYER_RADIUS) player.x = PLAYER_RADIUS;
        if (player.x > ARENA_WIDTH - PLAYER_RADIUS) player.x = ARENA_WIDTH - PLAYER_RADIUS;

        // fall to floor
        if (player.y >= FLOOR_Y - PLAYER_RADIUS) {
            player.y = FLOOR_Y - PLAYER_RADIUS;
            player.vy = 0;
            player.gravityMultiplier = 1;
            player.onGround = true;
            player.jumpsLeft = MAX_JUMPS;
            landedTile = null;
        }

        if (wasOnGround && !player.onGround && !jumpedThisTick) {
            player.jumpsLeft = Math.min(player.jumpsLeft, MAX_JUMPS - 1);
            player.gravityMultiplier = 1;
        }

        if (landedTile) {
            applyTileEffects(player, landedTile, mode, 'landing');
        }
    });

    if (Date.now() - lastTagTs > TAG_COOLDOWN_MS) {
        // Collect all taggers based on game mode
        const taggers: Player[] = [];
        
        if (gameMode === "bomb") {
            for (const tagId of bombTagPlayerIds) {
                const tagPlayer = players.get(tagId);
                if (tagPlayer && !tagPlayer.isEliminated) {
                    taggers.push(tagPlayer);
                }
            }
        } else if (tagPlayerId) {
            const tagger = players.get(tagPlayerId);
            if (tagger) {
                taggers.push(tagger);
            }
        }
        
        // Process collisions for each tagger
        tagOuterLoop: for (const tagger of taggers) {
            for (const candidate of players.values()) {
                if (candidate.id === tagger.id) continue;
                const dx = candidate.x - tagger.x;
                const dy = candidate.y - tagger.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < (PLAYER_RADIUS * 2) ** 2) {
                    if (gameMode === "zombie" && !candidate.isTag && !candidate.transformationStartTime) {
                        handleZombieTag(tagger, candidate, broadcast);
                    } else if (gameMode === "bomb" && tagger.isTag && !candidate.isTag && !candidate.isEliminated) {
                        handleBombTransfer(tagger, candidate, bombTagPlayerIds, broadcast);
                        lastTagTs = Date.now();
                        break tagOuterLoop;
                    } else if (gameMode !== "zombie" && gameMode !== "bomb") {
                        tagPlayerId = candidate.id;
                        lastTagTs = Date.now();
                        broadcast({
                            type: "tag_event",
                            from: tagger.name,
                            to: candidate.name,
                        });
                    }
                    break;
                }
            }
        }
    }

     // Zombie mode: handle transformation cleanup after delay
    if (gameMode === "zombie") {
        handleZombieTransformationCleanup(players);
        
        // Check if all players are tags - immediate game over
        if (checkZombieAllTagsGameOver(players)) {
            gameStarted = false;
            const gameOverResult = handleZombieAllTagsGameOver(players);
            broadcast({
                type: "game_over_result",
                result: gameOverResult,
            });
        }
    }

    // Bomb mode: handle bomb counters and eliminations
        if (gameMode === "bomb") {
            const bombGameOver = updateBombMode(dt, players, bombTagPlayerIds, broadcast);
            if (bombGameOver) {
                gameStarted = false;
                broadcast({
                    type: "game_over_result",
                    result: bombGameOver,
                });
            }
        }

    resetRoundIfNeeded();

    broadcast({
        type: "state",
        mode: gameMode,
        arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT, floorY: FLOOR_Y },
        remainingMs: getRemainingMs(),
        tagPlayerId,
            players: [...players.values()].map((p) => ({
            id: p.id,
            name: p.name,
            character: p.character,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            onGround: p.onGround,
            radius: PLAYER_RADIUS,
            isTag: gameMode === "zombie" ? p.isTag : (gameMode === "bomb" ? p.isTag : undefined),
            bombCounter: gameMode === "bomb" ? p.bombCounter : undefined,
            isEliminated: gameMode === "bomb" ? p.isEliminated : undefined,
            })),
            tiles: tiles.map(t => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, type: t.type, className: t.className })),
    });
}

wss.on("connection", (ws: WebSocket) => {
    clients.set(ws, {});

    send(ws, {
        type: "hello",
        message: "Connecté au serveur TAG minimal",
    });

    ws.on("message", (raw: { toString(): string }) => {
        let msg: ClientMessage;

        try {
            msg = JSON.parse(raw.toString()) as ClientMessage;
        } catch {
            send(ws, { type: "error", message: "Message JSON invalide" });
            return;
        }

        const meta = clients.get(ws);
        if (!meta) return;

        if (msg.type === "join") {
            meta.role = msg.role;
            meta.sessionId = msg.sessionId;

            if (msg.role === "controller") {
                const sessionId = msg.sessionId?.trim() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                const trimmedName = msg.name?.trim();
                const existingPlayer = [...players.values()].find((player) => player.sessionId === sessionId);

                if (!existingPlayer && players.size >= MAX_CONNECTED_PLAYERS) {
                    send(ws, { type: "error", message: `Le serveur est plein (${MAX_CONNECTED_PLAYERS} joueurs maximum)` });
                    return;
                }

                if (existingPlayer) {
                    const timer = disconnectedPlayerTimers.get(existingPlayer.id);
                    if (timer) {
                        clearTimeout(timer);
                        disconnectedPlayerTimers.delete(existingPlayer.id);
                    }

                    if (trimmedName) {
                        existingPlayer.name = trimmedName;
                    }

                    meta.playerId = existingPlayer.id;
                } else {
                    const id = `P${playerCounter++}`;
                    const name = trimmedName || id;
                    const player = spawnPlayer(id, name, sessionId);
                    
                    // Initialize bomb mode properties for new players joining during a bomb game
                    if (gameStarted && gameMode === "bomb") {
                        const bombCounter = getBombCounterForPlayerCount(players.size + 1);
                        player.bombCounter = bombCounter;
                        player.bombCounterPersonal = bombCounter;
                        player.bombCounterStartTime = 0;
                    }
                    
                    players.set(id, player);
                    meta.playerId = id;

                    if (!tagPlayerId) {
                        tagPlayerId = id;
                        lastTagTs = Date.now();
                    }
                }

                send(ws, {
                    type: "joined",
                    role: "controller",
                    playerId: meta.playerId,
                    name: meta.playerId ? players.get(meta.playerId)?.name : trimmedName,
                });
            } else {
                send(ws, { type: "joined", role: "screen" });
            }

            broadcastLobby();

            return;
        }

        if (msg.type === "set_mode") {
            if (meta.role !== "screen") {
                return;
            }

            if (!(msg.mode in MODE_CONFIG)) {
                send(ws, { type: "error", message: "Mode invalide" });
                return;
            }

            gameMode = msg.mode;
            broadcastLobby();
            return;
        }

        if (msg.type === "start_game") {
            if (meta.role !== "screen") {
                return;
            }

            if (players.size > MAX_CONNECTED_PLAYERS) {
                send(ws, { type: "error", message: `Maximum ${MAX_CONNECTED_PLAYERS} joueurs autorisés` });
                return;
            }

            if (players.size === 0) {
                send(ws, { type: "error", message: "Aucun joueur connecté" });
                return;
            }

            const minPlayersRequired = MODE_CONFIG[gameMode].minPlayers;
            if (players.size < minPlayersRequired) {
                send(ws, { type: "error", message: `Minimum ${minPlayersRequired} joueurs requis pour ce mode (actuellement ${players.size})` });
                return;
            }

            gameStarted = true;
            roundStartTs = Date.now();
            lastTagTs = Date.now();

            // Calculate round duration based on mode
            if (gameMode === "zombie") {
                roundDurationMs = calculateZombieDuration(players.size);
            } else if (gameMode === "bomb") {
                roundDurationMs = Number.POSITIVE_INFINITY;
            } else {
                const mode = MODE_CONFIG[gameMode];
                roundDurationMs = mode.baseRoundDurationMs ?? roundDurationMs;
            }

            tagPlayerId = pickRandomPlayerId();

            players.forEach((player) => {
                player.x = 120 + ((Math.random() * 600) | 0);
                player.y = FLOOR_Y;
                player.vx = 0;
                player.vy = 0;
                player.gravityMultiplier = 1;
                player.onGround = true;
                player.jumpsLeft = MAX_JUMPS;
                player.input.left = false;
                player.input.right = false;
                player.input.jump = false;
                player.input.down = false;
                player.isTag = false;
                player.transformationStartTime = null;
                player.transformedFrom = null;
                player.isEliminated = false;
                
                // Set initial tag for zombie mode
                if (gameMode === "zombie" && player.id === tagPlayerId) {
                    player.isTag = true;
                }
            });

            // Initialize bomb mode
            if (gameMode === "bomb") {
                initBombMode(players, bombTagPlayerIds);
            }

            broadcast({
                type: "game_started",
                mode: gameMode,
            });
            broadcastLobby();
            return;
        }

        if (msg.type === "stop_game") {
            if (meta.role !== "screen") {
                return;
            }

            gameStarted = false;
            roundStartTs = Date.now();
            tagPlayerId = null;

            players.forEach((player) => {
                player.x = 120 + ((Math.random() * 600) | 0);
                player.y = FLOOR_Y;
                player.vx = 0;
                player.vy = 0;
                player.onGround = true;
                player.jumpsLeft = MAX_JUMPS;
                player.input.left = false;
                player.input.right = false;
                player.input.jump = false;
                player.isTag = false;
                player.transformationStartTime = null;
                player.transformedFrom = null;
            });

            broadcastLobby();
            return;
        }

        if (msg.type === "set_character") {
            if (meta.role !== "controller" || !meta.playerId) {
                return;
            }
            const player = players.get(meta.playerId);
            if (!player) return;
            player.character = msg.character;
            return;
        }

        if (msg.type === "input") {
            if (meta.role !== "controller" || !meta.playerId) {
                return;
            }
            const player = players.get(meta.playerId);
            if (!player) return;
            player.input.left = Boolean(msg.left);
            player.input.right = Boolean(msg.right);
            player.input.jump = Boolean(msg.jump);
            player.input.down = Boolean(msg.down ?? false);
        }
    });

    ws.on("close", () => {
        const meta = clients.get(ws);
        clients.delete(ws);

        if (meta?.playerId) {
            const player = players.get(meta.playerId);

            if (player) {
                player.input.left = false;
                player.input.right = false;
                player.input.jump = false;
                player.input.down = false;
                schedulePlayerRemoval(meta.playerId);
            }
        }

        broadcastLobby();
    });
});

setInterval(() => {
    updateGame(TICK_MS / 1000);
}, TICK_MS);

console.log("Serveur TAG lancé sur ws://localhost:3001");