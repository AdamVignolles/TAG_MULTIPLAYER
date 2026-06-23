/// <reference path="./ws.d.ts" />
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { ARENA_HEIGHT, ARENA_WIDTH, FLOOR_Y, createSimpleMap } from "./BlocMap.ts";
import type { Tile } from "./BlocMap.ts";
import { applyTileEffects } from "./EffectsBlocs.ts";
import { handleClassicRoundEnd, getClassicSpeed, handleClassicTag, CLASSIC_CONFIG } from "./Modes/classic.ts";
import {
    handleZombieRoundEnd,
    handleZombieAllTagsGameOver,
    getZombieSpeed,
    initZombieMode,
    handleZombieTag,
    handleZombieTransformationCleanup,
    checkZombieAllTagsGameOver,
    ZOMBIE_TRANSFORMATION_TIME_MS,
    ZOMBIE_CONFIG,
} from "./Modes/zombie.ts";
import { BOMB_CONFIG, getBombCounterForPlayerCount, getInitialTagCountForPlayerCount, initBombMode, updateBombMode, handleBombRoundEnd, handleBombTransfer } from "./Modes/bomb.ts";
import {
    AREA_CONFIG,
    initAreaMode,
    updateAreaMode,
    updateAreaTagLifecycle,
    handleAreaRoundEnd,
    getAreaScores,
    getAreaState,
    getAreaPlayerSpeedMultiplier,
    resetAreaMode,
    moveAreaFlagTo,
} from "./Modes/area.ts";
import type { AreaTeam } from "./Modes/area.ts";
import type { GameOverResult } from "./Modes/GameOverResult.ts";

type Role = "screen" | "controller";
type GameMode = "classic" | "zombie" | "bomb" | "area";
type CharacterType = "blue" | "yellow" | "green" | "purple" | "red";

type JoinMessage = {
    type: "join";
    role: Role;
    name?: string;
    sessionId?: string;
    roomCode?: string;
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

type SetAreaTeamMessage = {
    type: "set_area_team";
    team: AreaTeam;
};

type InputMessage = {
    type: "input";
    left: boolean;
    right: boolean;
    jump: boolean;
    down: boolean;
};

type ClientMessage = JoinMessage | InputMessage | SetModeMessage | StartGameMessage | StopGameMessage | SetCharacterMessage | SetAreaTeamMessage;

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
    // Area mode properties
    areaTeam: AreaTeam | null;
    wantedTeam: AreaTeam | null;
    areaTag: boolean;
    areaTagUntil: number;
    areaFrozenUntil: number;
    areaFrozenMinUntil: number;
    areaFrozenGraceUntil: number;
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

type ClientMeta = {
    role?: Role;
    playerId?: string;
    sessionId?: string;
    roomCode?: string;
};

const TICK_MS = 33;
const PLAYER_RADIUS = 16;
const AREA_FREEZE_MIN_MS = 2000;
const AREA_FREEZE_MAX_MS = 7000;
const AREA_RELEASE_GRACE_MS = 500;
const MAX_JUMPS = 2;
const TAG_COOLDOWN_MS = 800;
const MAX_CONNECTED_PLAYERS = 200;
const GAME_START_COUNTDOWN_MS = 3000;

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
    area: AREA_CONFIG,
};

const CHARACTERS: CharacterType[] = ["blue", "yellow", "green", "purple", "red"];

function getRandomCharacter(): CharacterType {
    return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
}

function shuffleArray<T>(items: T[]): T[] {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

function getSpawnPointFromTile(tile: Tile) {
    return {
        x: Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, tile.x + tile.w / 2)),
        y: tile.y - PLAYER_RADIUS,
    };
}

const PORT = Number(process.env.PORT) || 3001;
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIST = join(__dirname, "..", "client", "dist");

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".webp": "image/webp",
};

const httpServer = createServer((req, res) => {
    const url = req.url?.split("?")[0] ?? "/";

    // Try to serve static file from client/dist
    let filePath = join(CLIENT_DIST, url === "/" ? "index.html" : url);

    if (existsSync(filePath) && statSync(filePath).isFile()) {
        const ext = extname(filePath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(readFileSync(filePath));
        return;
    }

    // SPA fallback: serve index.html for unmatched routes
    const indexPath = join(CLIENT_DIST, "index.html");
    if (existsSync(indexPath)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(readFileSync(indexPath));
        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const clients = new Map<WebSocket, ClientMeta>();

// --- Multi-session support ---
const ROOM_CODE_LENGTH = 4;
const SESSION_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes without any connected client

function generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function getUniqueRoomCode(): string {
    let code = generateRoomCode();
    while (sessions.has(code)) {
        code = generateRoomCode();
    }
    return code;
}

type GameSession = {
    roomCode: string;
    players: Map<string, Player>;
    disconnectedPlayerTimers: Map<string, ReturnType<typeof setTimeout>>;
    playerCounter: number;
    tagPlayerId: string | null;
    bombTagPlayerIds: Set<string>;
    lastTagTs: number;
    roundStartTs: number;
    roundDurationMs: number;
    roundHasBegun: boolean;
    gameStartCountdownEndTs: number;
    gameMode: GameMode;
    gameStarted: boolean;
    areaTeamSelectionActive: boolean;
    tiles: Tile[];
    // Timeout for session cleanup
    cleanupTimer: ReturnType<typeof setTimeout> | null;
    lastActivityTs: number;
};

const sessions = new Map<string, GameSession>();

function createSession(): GameSession {
    const roomCode = getUniqueRoomCode();
    const session: GameSession = {
        roomCode,
        players: new Map(),
        disconnectedPlayerTimers: new Map(),
        playerCounter: 1,
        tagPlayerId: null,
        bombTagPlayerIds: new Set(),
        lastTagTs: 0,
        roundStartTs: Date.now(),
        roundDurationMs: 180000,
        roundHasBegun: false,
        gameStartCountdownEndTs: 0,
        gameMode: "classic",
        gameStarted: false,
        areaTeamSelectionActive: false,
        tiles: createSimpleMap(PLAYER_RADIUS),
        cleanupTimer: null,
        lastActivityTs: Date.now(),
    };
    sessions.set(roomCode, session);
    return session;
}

function getClientsForSession(roomCode: string): WebSocket[] {
    const result: WebSocket[] = [];
    for (const [ws, meta] of clients.entries()) {
        if (meta.roomCode === roomCode && ws.readyState === WebSocket.OPEN) {
            result.push(ws);
        }
    }
    return result;
}

function getConnectedCountForSession(roomCode: string): number {
    let count = 0;
    for (const [ws, meta] of clients.entries()) {
        if (meta.roomCode === roomCode && ws.readyState === WebSocket.OPEN) {
            count++;
        }
    }
    return count;
}

function broadcastToSession(session: GameSession, payload: unknown) {
    const json = JSON.stringify(payload);
    for (const [ws, meta] of clients.entries()) {
        if (meta.roomCode === session.roomCode && ws.readyState === WebSocket.OPEN) {
            ws.send(json);
        }
    }
}

function scheduleSessionCleanup(session: GameSession) {
    if (session.cleanupTimer) {
        clearTimeout(session.cleanupTimer);
    }
    session.cleanupTimer = setTimeout(() => {
        // Check if anyone is still connected
        const count = getConnectedCountForSession(session.roomCode);
        if (count === 0) {
            // Clean up all disconnected player timers
            for (const timer of session.disconnectedPlayerTimers.values()) {
                clearTimeout(timer);
            }
            sessions.delete(session.roomCode);
        } else {
            // Someone reconnected, reschedule
            session.cleanupTimer = null;
        }
    }, SESSION_TIMEOUT_MS);
}

function checkSessionActivity(session: GameSession) {
    const count = getConnectedCountForSession(session.roomCode);
    if (count === 0 && !session.cleanupTimer) {
        scheduleSessionCleanup(session);
    } else if (count > 0 && session.cleanupTimer) {
        clearTimeout(session.cleanupTimer);
        session.cleanupTimer = null;
    }
}

// --- Per-session game helpers (adapted from globals) ---

function sendSession(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function getRemainingMsForSession(session: GameSession) {
    if (!session.roundHasBegun) {
        return session.roundDurationMs;
    }
    return Math.max(0, session.roundDurationMs - (Date.now() - session.roundStartTs));
}

function getCountdownMsForSession(session: GameSession) {
    if (!session.gameStarted || session.roundHasBegun || session.gameStartCountdownEndTs <= 0) {
        return 0;
    }
    return Math.max(0, session.gameStartCountdownEndTs - Date.now());
}

function broadcastLobbyForSession(session: GameSession) {
    broadcastToSession(session, {
        type: "lobby",
        mode: session.gameMode,
        modeLabel: MODE_CONFIG[session.gameMode].label,
        connectedPlayers: session.players.size,
        started: session.gameStarted,
        roomCode: session.roomCode,
    });
}

function broadcastStateForSession(session: GameSession) {
    const now = Date.now();
    const stateMsg: any = {
        type: "state",
        mode: session.gameMode,
        arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT, floorY: FLOOR_Y },
        remainingMs: 0,
        tagPlayerId: null,
        players: [...session.players.values()].map((p) => ({
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            radius: PLAYER_RADIUS,
            character: p.character,
            areaTeam: session.areaTeamSelectionActive ? p.wantedTeam : p.areaTeam,
            areaTag: p.areaTag,
            areaFrozen: false,
        })),
    };

    if (session.gameMode === "area") {
        stateMsg.areaState = getAreaState();
        stateMsg.areaTeamSelectionActive = session.areaTeamSelectionActive;
    }

    broadcastToSession(session, stateMsg);
}

function spawnPlayerInSession(session: GameSession, id: string, name: string, sessionId: string): Player {
    const player: Player = {
        id,
        sessionId,
        name,
        character: getRandomCharacter(),
        x: 120,
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
        areaTeam: null,
        wantedTeam: null,
        areaTag: false,
        areaTagUntil: 0,
        areaFrozenUntil: 0,
        areaFrozenMinUntil: 0,
        areaFrozenGraceUntil: 0,
        bombCounter: 0,
        bombCounterStartTime: 0,
        bombCounterPersonal: 0,
        isEliminated: false,
    };

    const spawnTiles = getSpawnTilesForSession(session);
    const spawnTile = spawnTiles[0];
    if (spawnTile) {
        const spawnPoint = getSpawnPointFromTile(spawnTile);
        player.x = spawnPoint.x;
        player.y = spawnPoint.y;
    } else {
        player.x = 120;
        player.y = FLOOR_Y - PLAYER_RADIUS;
    }

    return player;
}

function getSpawnTilesForSession(session: GameSession): Tile[] {
    const nonGroundTiles = session.tiles.filter((tile) => !tile.id.startsWith("g"));
    const groundTiles = session.tiles.filter((tile) => tile.id.startsWith("g"));
    return [...shuffleArray(nonGroundTiles), ...shuffleArray(groundTiles)];
}

function removePlayerFromSession(session: GameSession, playerId: string) {
    const timer = session.disconnectedPlayerTimers.get(playerId);
    if (timer) {
        clearTimeout(timer);
        session.disconnectedPlayerTimers.delete(playerId);
    }

    if (!session.players.has(playerId)) {
        return;
    }

    session.players.delete(playerId);

    if (session.tagPlayerId === playerId) {
        session.tagPlayerId = pickRandomPlayerIdInSession(session);
        session.lastTagTs = Date.now();
    }

    if (session.players.size === 0) {
        session.gameStarted = false;
        session.roundStartTs = Date.now();
        session.tagPlayerId = null;
    }
}

function schedulePlayerRemovalInSession(session: GameSession, playerId: string) {
    if (session.disconnectedPlayerTimers.has(playerId)) {
        return;
    }

    const timer = setTimeout(() => {
        session.disconnectedPlayerTimers.delete(playerId);
        removePlayerFromSession(session, playerId);
        broadcastLobbyForSession(session);
    }, 15000);

    session.disconnectedPlayerTimers.set(playerId, timer);
}

function pickRandomPlayerIdInSession(session: GameSession): string | null {
    const ids = [...session.players.keys()];
    if (ids.length === 0) {
        return null;
    }
    return ids[Math.floor(Math.random() * ids.length)] ?? null;
}

function isAreaTagActive(player: Player, now: number): boolean {
    return player.areaTag && player.areaTagUntil > now;
}

function clearAreaFreeze(player: Player, now: number): void {
    player.areaFrozenUntil = 0;
    player.areaFrozenMinUntil = 0;
    player.areaFrozenGraceUntil = now + AREA_RELEASE_GRACE_MS;
}

function freezeAreaPlayer(player: Player, now: number): void {
    player.areaFrozenUntil = now + AREA_FREEZE_MAX_MS;
    player.areaFrozenMinUntil = now + AREA_FREEZE_MIN_MS;
}

function handleAreaTagInteractionsForSession(session: GameSession, now: number): void {
    const activeTaggers = [...session.players.values()].filter((player) => isAreaTagActive(player, now));

    if (activeTaggers.length === 0) {
        return;
    }

    const touchRangeSq = (PLAYER_RADIUS * 2) ** 2;

    for (const candidate of session.players.values()) {
        let touchedByTagger = false;
        let rescueTouch = false;

        for (const tagger of activeTaggers) {
            if (tagger.id === candidate.id) {
                continue;
            }

            const dx = candidate.x - tagger.x;
            const dy = candidate.y - tagger.y;
            if (dx * dx + dy * dy >= touchRangeSq) {
                continue;
            }

            touchedByTagger = true;

            if (
                now < candidate.areaFrozenGraceUntil ||
                candidate.areaFrozenUntil > now &&
                candidate.areaTeam &&
                tagger.areaTeam === candidate.areaTeam &&
                now >= candidate.areaFrozenMinUntil
            ) {
                rescueTouch = true;
            }
        }

        if (candidate.areaFrozenUntil > now) {
            if (now >= candidate.areaFrozenUntil || rescueTouch) {
                clearAreaFreeze(candidate, now);
            }
            continue;
        }

        if (touchedByTagger && now >= candidate.areaFrozenGraceUntil) {
            freezeAreaPlayer(candidate, now);
        }
    }
}

function resetRoundIfNeededForSession(session: GameSession) {
    if (!session.gameStarted || !session.roundHasBegun) {
        return;
    }

    if (getRemainingMsForSession(session) > 0) {
        return;
    }

    let gameOverResult: GameOverResult;
    if (session.gameMode === "zombie") {
        gameOverResult = handleZombieRoundEnd(session.players);
    } else if (session.gameMode === "bomb") {
        gameOverResult = handleBombRoundEnd(session.players);
    } else if (session.gameMode === "area") {
        gameOverResult = handleAreaRoundEnd(session.players);
    } else {
        gameOverResult = handleClassicRoundEnd(session.tagPlayerId, session.players);
    }

    broadcastToSession(session, {
        type: "game_over_result",
        result: gameOverResult,
    });
    session.gameStarted = false;
    session.roundStartTs = Date.now();
}

function updateGameForSession(session: GameSession, dt: number) {
    if (!session.gameStarted) {
        return;
    }

    const now = Date.now();
    const countdownMs = getCountdownMsForSession(session);
    if (!session.roundHasBegun) {
        if (countdownMs > 0) {
            broadcastToSession(session, {
                type: "state",
                mode: session.gameMode,
                arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT, floorY: FLOOR_Y },
                remainingMs: session.roundDurationMs,
                countdownMs,
                tagPlayerId: session.tagPlayerId,
                areaState: session.gameMode === "area" ? getAreaState() : undefined,
                areaScores: session.gameMode === "area" ? getAreaScores() : undefined,
                players: [...session.players.values()].map((p) => ({
                    id: p.id,
                    name: p.name,
                    character: p.character,
                    x: p.x,
                    y: p.y,
                    vx: p.vx,
                    vy: p.vy,
                    onGround: p.onGround,
                    radius: PLAYER_RADIUS,
                    isTag: session.gameMode === "zombie" ? p.isTag : (session.gameMode === "bomb" ? p.isTag : undefined),
                    areaTeam: session.gameMode === "area" ? p.areaTeam : undefined,
                    areaTag: session.gameMode === "area" ? p.areaTag : undefined,
                    areaFrozen: session.gameMode === "area" ? p.areaFrozenUntil > now : undefined,
                    bombCounter: session.gameMode === "bomb" ? p.bombCounter : undefined,
                    isEliminated: session.gameMode === "bomb" ? p.isEliminated : undefined,
                })),
            });
            return;
        }

        session.roundHasBegun = true;
        session.roundStartTs = Date.now();
        session.lastTagTs = Date.now();
    }

    if (session.gameMode === "area") {
        updateAreaTagLifecycle(session.players, now);
    }

    const mode = MODE_CONFIG[session.gameMode];
    const sessionTiles = session.tiles;

    session.players.forEach((player) => {
        const prevY = player.y;
        const wasOnGround = player.onGround;
        let jumpedThisTick = false;

        if (session.gameMode === "area" && player.areaFrozenUntil > now) {
            player.vx = 0;
            player.vy = 0;
            return;
        }

        // In zombie mode, immobilize during transformation
        if (session.gameMode === "zombie" && player.transformationStartTime) {
            player.vx = 0;
            player.vy = 0;
        } else {
            const horizontal = Number(player.input.right) - Number(player.input.left);
            let speed = mode.baseSpeed;
            if (session.gameMode === "zombie") {
                speed = getZombieSpeed(player, mode.baseSpeed, mode.tagSpeedBonus);
            } else if (session.gameMode === "classic") {
                speed = getClassicSpeed(player, session.tagPlayerId, mode.baseSpeed, mode.tagSpeedBonus);
            } else if (session.gameMode === "area") {
                speed = mode.baseSpeed * getAreaPlayerSpeedMultiplier(player.id);
            }
            player.vx = horizontal * speed;

            // Apply speed modifiers from tiles the player is currently standing on
            if (player.onGround) {
                const currentTile = getTileUnderPlayerInSession(player, sessionTiles);
                if (currentTile) {
                    applyTileEffects(player, currentTile, mode, 'ground');
                }
            }
        }

        if (!player.transformationStartTime || session.gameMode !== "zombie") {
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
        for (const tile of sessionTiles) {
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

        for (const tile of sessionTiles) {
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

    if (session.gameMode === "area") {
        handleAreaTagInteractionsForSession(session, now);
    } else if (Date.now() - session.lastTagTs > TAG_COOLDOWN_MS) {
        const taggers: Player[] = [];

        if (session.gameMode === "zombie") {
            for (const player of session.players.values()) {
                if (player.isTag) {
                    taggers.push(player);
                }
            }
        } else if (session.gameMode === "bomb") {
            for (const tagId of session.bombTagPlayerIds) {
                const tagPlayer = session.players.get(tagId);
                if (tagPlayer && !tagPlayer.isEliminated) {
                    taggers.push(tagPlayer);
                }
            }
        } else if (session.tagPlayerId) {
            const tagger = session.players.get(session.tagPlayerId);
            if (tagger) {
                taggers.push(tagger);
            }
        }

        const broadcastFn = (payload: unknown) => broadcastToSession(session, payload);

        tagOuterLoop: for (const tagger of taggers) {
            for (const candidate of session.players.values()) {
                if (candidate.id === tagger.id) continue;
                const dx = candidate.x - tagger.x;
                const dy = candidate.y - tagger.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < (PLAYER_RADIUS * 2) ** 2) {
                    if (session.gameMode === "zombie" && !candidate.isTag && !candidate.transformationStartTime) {
                        handleZombieTag(tagger, candidate, broadcastFn);
                    } else if (session.gameMode === "bomb" && tagger.isTag && !candidate.isTag && !candidate.isEliminated) {
                        handleBombTransfer(tagger, candidate, session.bombTagPlayerIds, broadcastFn);
                        session.lastTagTs = Date.now();
                        break tagOuterLoop;
                    } else if (session.gameMode === "classic") {
                        session.tagPlayerId = candidate.id;
                        session.lastTagTs = Date.now();
                        broadcastToSession(session, {
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
    if (session.gameMode === "zombie") {
        handleZombieTransformationCleanup(session.players);

        if (checkZombieAllTagsGameOver(session.players)) {
            session.gameStarted = false;
            const gameOverResult = handleZombieAllTagsGameOver(session.players);
            broadcastToSession(session, {
                type: "game_over_result",
                result: gameOverResult,
            });
        }
    }

    // Bomb mode
    if (session.gameMode === "bomb") {
        const broadcastFn = (payload: unknown) => broadcastToSession(session, payload);
        const bombGameOver = updateBombMode(dt, session.players, session.bombTagPlayerIds, broadcastFn);
        if (bombGameOver) {
            session.gameStarted = false;
            broadcastToSession(session, {
                type: "game_over_result",
                result: bombGameOver,
            });
        }
    }

    // Area mode
    if (session.gameMode === "area") {
        const broadcastFn = (payload: unknown) => broadcastToSession(session, payload);
        const areaGameOver = updateAreaMode(dt, session.players, broadcastFn);
        if (areaGameOver) {
            session.gameStarted = false;
            broadcastToSession(session, { type: "game_over_result", result: areaGameOver });
        }
        try {
            const areaState = getAreaState();
            if (areaState.flag) {
                const fx = areaState.flag.x;
                const fy = areaState.flag.y;
                let best: Tile | null = null;
                let bestDist = Infinity;
                for (const tile of sessionTiles) {
                    const cx = tile.x + tile.w / 2;
                    const cy = tile.y - PLAYER_RADIUS;
                    const dx = fx - cx;
                    const dy = fy - cy;
                    const d = dx * dx + dy * dy;
                    if (d < bestDist) {
                        bestDist = d;
                        best = tile;
                    }
                }

                if (best) {
                    const cx = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, best.x + best.w / 2));
                    const cy = best.y - PLAYER_RADIUS;
                    moveAreaFlagTo(cx, cy);
                    broadcastToSession(session, { type: 'area_flag_snapped', flagId: areaState.flag.id, x: cx, y: cy });
                }
            }
        } catch (err) {
            // ignore snapping errors
        }
    }

    resetRoundIfNeededForSession(session);

    broadcastToSession(session, {
        type: "state",
        mode: session.gameMode,
        arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT, floorY: FLOOR_Y },
        remainingMs: getRemainingMsForSession(session),
        countdownMs: 0,
        tagPlayerId: session.tagPlayerId,
        areaState: session.gameMode === "area" ? getAreaState() : undefined,
        areaScores: session.gameMode === "area" ? getAreaScores() : undefined,
        players: [...session.players.values()].map((p) => ({
            id: p.id,
            name: p.name,
            character: p.character,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            onGround: p.onGround,
            radius: PLAYER_RADIUS,
            isTag: session.gameMode === "zombie" ? p.isTag : (session.gameMode === "bomb" ? p.isTag : undefined),
            areaTeam: session.gameMode === "area" ? p.areaTeam : undefined,
            areaTag: session.gameMode === "area" ? p.areaTag : undefined,
            areaFrozen: session.gameMode === "area" ? p.areaFrozenUntil > now : undefined,
            bombCounter: session.gameMode === "bomb" ? p.bombCounter : undefined,
            isEliminated: session.gameMode === "bomb" ? p.isEliminated : undefined,
        })),
    });
}

function getTileUnderPlayerInSession(player: Player, sessionTiles: Tile[]): Tile | null {
    for (const tile of sessionTiles) {
        if (!overlapsOnX(player.x, tile)) {
            continue;
        }
        const tileTop = tile.y;
        if (Math.abs((player.y + PLAYER_RADIUS) - tileTop) < 2) {
            return tile;
        }
    }
    return null;
}

wss.on("connection", (ws: WebSocket) => {
    clients.set(ws, {});

    sendSession(ws, {
        type: "hello",
        message: "Connecté au serveur TAG multisession",
    });

    ws.on("message", (raw: { toString(): string }) => {
        let msg: ClientMessage;

        try {
            msg = JSON.parse(raw.toString()) as ClientMessage;
        } catch {
            sendSession(ws, { type: "error", message: "Message JSON invalide" });
            return;
        }

        const meta = clients.get(ws);
        if (!meta) return;

        if (msg.type === "join") {
            meta.role = msg.role;
            meta.sessionId = msg.sessionId;

            if (msg.role === "screen") {
                // Try to rejoin an existing session if roomCode provided and session still exists
                const requestedCode = msg.roomCode?.trim().toUpperCase();
                let session: GameSession;

                if (requestedCode && sessions.has(requestedCode)) {
                    session = sessions.get(requestedCode)!;
                    // Cancel cleanup timer since screen reconnected
                    if (session.cleanupTimer) {
                        clearTimeout(session.cleanupTimer);
                        session.cleanupTimer = null;
                    }
                } else {
                    session = createSession();
                }

                meta.roomCode = session.roomCode;
                sendSession(ws, { type: "joined", role: "screen", roomCode: session.roomCode });
                broadcastLobbyForSession(session);
                return;
            }

            if (msg.role === "controller") {
                const roomCode = msg.roomCode?.trim().toUpperCase();
                if (!roomCode || !sessions.has(roomCode)) {
                    sendSession(ws, { type: "error", message: "Code de session invalide" });
                    return;
                }

                const session = sessions.get(roomCode)!;
                meta.roomCode = roomCode;

                const sessionId = msg.sessionId?.trim() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                const trimmedName = msg.name?.trim();
                const existingPlayer = [...session.players.values()].find((player) => player.sessionId === sessionId);

                if (!existingPlayer && session.players.size >= MAX_CONNECTED_PLAYERS) {
                    sendSession(ws, { type: "error", message: `Le serveur est plein (${MAX_CONNECTED_PLAYERS} joueurs maximum)` });
                    return;
                }

                if (existingPlayer) {
                    const timer = session.disconnectedPlayerTimers.get(existingPlayer.id);
                    if (timer) {
                        clearTimeout(timer);
                        session.disconnectedPlayerTimers.delete(existingPlayer.id);
                    }

                    if (trimmedName) {
                        existingPlayer.name = trimmedName;
                    }

                    meta.playerId = existingPlayer.id;
                } else {
                    const id = `P${session.playerCounter++}`;
                    const name = trimmedName || id;
                    const player = spawnPlayerInSession(session, id, name, sessionId);

                    // Initialize bomb mode properties for new players joining during a bomb game
                    if (session.gameStarted && session.gameMode === "bomb") {
                        const bombCounter = getBombCounterForPlayerCount(session.players.size + 1);
                        player.bombCounter = bombCounter;
                        player.bombCounterPersonal = bombCounter;
                        player.bombCounterStartTime = 0;
                    }

                    session.players.set(id, player);
                    meta.playerId = id;

                    if (!session.tagPlayerId) {
                        session.tagPlayerId = id;
                        session.lastTagTs = Date.now();
                    }
                }

                // Cancel cleanup timer since someone connected
                if (session.cleanupTimer) {
                    clearTimeout(session.cleanupTimer);
                    session.cleanupTimer = null;
                }

                sendSession(ws, {
                    type: "joined",
                    role: "controller",
                    playerId: meta.playerId,
                    name: meta.playerId ? session.players.get(meta.playerId)?.name : trimmedName,
                });

                broadcastLobbyForSession(session);
                return;
            }

            return;
        }

        // All other messages require a roomCode
        const session = meta.roomCode ? sessions.get(meta.roomCode) : undefined;
        if (!session) return;

        if (msg.type === "set_mode") {
            if (meta.role !== "screen") {
                return;
            }

            if (!(msg.mode in MODE_CONFIG)) {
                sendSession(ws, { type: "error", message: "Mode invalide" });
                return;
            }

            session.gameMode = msg.mode;
            broadcastLobbyForSession(session);
            return;
        }

        if (msg.type === "start_game") {
            if (meta.role !== "screen") {
                return;
            }

            if (session.players.size > MAX_CONNECTED_PLAYERS) {
                sendSession(ws, { type: "error", message: `Maximum ${MAX_CONNECTED_PLAYERS} joueurs autorisés` });
                return;
            }

            if (session.players.size === 0) {
                sendSession(ws, { type: "error", message: "Aucun joueur connecté" });
                return;
            }

            if (session.gameMode === "area" && session.players.size % 2 !== 0) {
                sendSession(ws, { type: "error", message: "Le mode Conquete d'equipe requiert un nombre pair de joueurs" });
                return;
            }

            const minPlayersRequired = MODE_CONFIG[session.gameMode].minPlayers;
            if (session.players.size < minPlayersRequired) {
                sendSession(ws, { type: "error", message: `Minimum ${minPlayersRequired} joueurs requis pour ce mode (actuellement ${session.players.size})` });
                return;
            }

            if (session.gameMode === "area" && !session.areaTeamSelectionActive) {
                session.areaTeamSelectionActive = true;
                broadcastStateForSession(session);
                return;
            }

            if (session.gameMode === "area" && session.areaTeamSelectionActive) {
                session.areaTeamSelectionActive = false;
                initAreaMode(session.players, session.tiles, ARENA_WIDTH, FLOOR_Y);
            }

            session.gameStarted = true;
            session.roundHasBegun = false;
            session.gameStartCountdownEndTs = Date.now() + GAME_START_COUNTDOWN_MS;
            session.roundStartTs = session.gameStartCountdownEndTs;
            session.lastTagTs = Date.now();

            if (session.gameMode === "bomb") {
                session.roundDurationMs = Number.POSITIVE_INFINITY;
            } else {
                const modeConfig = MODE_CONFIG[session.gameMode];
                session.roundDurationMs = modeConfig.baseRoundDurationMs ?? session.roundDurationMs;
            }

            session.tagPlayerId = pickRandomPlayerIdInSession(session);

            const spawnTiles = getSpawnTilesForSession(session);
            const playerIds = shuffleArray([...session.players.keys()]);

            playerIds.forEach((playerId, index) => {
                const player = session.players.get(playerId);
                if (!player) {
                    return;
                }

                const spawnTile = spawnTiles[index % spawnTiles.length];
                const spawnPoint = getSpawnPointFromTile(spawnTile);

                player.x = spawnPoint.x;
                player.y = spawnPoint.y;
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

                if (session.gameMode === "zombie" && player.id === session.tagPlayerId) {
                    player.isTag = true;
                }
            });

            if (session.gameMode === "zombie") {
                initZombieMode(session.players);
            }

            if (session.gameMode === "bomb") {
                initBombMode(session.players, session.bombTagPlayerIds);
            }

            if (session.gameMode === "area") {
                initAreaMode(session.players, session.tiles, ARENA_WIDTH, FLOOR_Y);
            }

            broadcastToSession(session, {
                type: "game_started",
                mode: session.gameMode,
                arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT, floorY: FLOOR_Y },
                tiles: session.tiles.map(t => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, type: t.type, className: t.className })),
            });
            broadcastLobbyForSession(session);
            return;
        }

        if (msg.type === "stop_game") {
            if (meta.role !== "screen") {
                return;
            }

            session.gameStarted = false;
            session.areaTeamSelectionActive = false;
            session.roundHasBegun = false;
            session.gameStartCountdownEndTs = 0;
            session.roundStartTs = Date.now();
            session.tagPlayerId = null;

            session.players.forEach((player) => {
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
                player.areaTeam = null;
                player.wantedTeam = null;
                player.areaTag = false;
                player.areaTagUntil = 0;
                player.areaFrozenUntil = 0;
                player.areaFrozenMinUntil = 0;
                player.areaFrozenGraceUntil = 0;
            });

            resetAreaMode(session.players);

            broadcastLobbyForSession(session);
            return;
        }

        if (msg.type === "set_character") {
            if (meta.role !== "controller" || !meta.playerId) {
                return;
            }
            const player = session.players.get(meta.playerId);
            if (!player) return;
            player.character = msg.character;
            return;
        }

        if (msg.type === "set_area_team") {
            if (meta.role !== "controller" || !meta.playerId) {
                return;
            }
            const player = session.players.get(meta.playerId);
            if (!player) return;
            player.wantedTeam = msg.team;
            broadcastStateForSession(session);
            return;
        }

        if (msg.type === "input") {
            if (meta.role !== "controller" || !meta.playerId) {
                return;
            }
            const player = session.players.get(meta.playerId);
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

        if (meta?.playerId && meta.roomCode) {
            const session = sessions.get(meta.roomCode);
            if (session) {
                const player = session.players.get(meta.playerId);

                if (player) {
                    player.input.left = false;
                    player.input.right = false;
                    player.input.jump = false;
                    player.input.down = false;
                    schedulePlayerRemovalInSession(session, meta.playerId);
                }

                broadcastLobbyForSession(session);
                checkSessionActivity(session);
            }
        }
    });
});

setInterval(() => {
    for (const session of sessions.values()) {
        updateGameForSession(session, TICK_MS / 1000);
    }
}, TICK_MS);

httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
