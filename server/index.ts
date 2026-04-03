/// <reference path="./ws.d.ts" />
import { WebSocketServer, WebSocket } from "ws";

type Role = "screen" | "controller";
type GameMode = "classic" | "zombie" | "bomb";

type JoinMessage = {
    type: "join";
    role: Role;
    name?: string;
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

type InputMessage = {
    type: "input";
    left: boolean;
    right: boolean;
    jump: boolean;
    down: boolean;
};

type ClientMessage = JoinMessage | InputMessage | SetModeMessage | StartGameMessage | StopGameMessage;

type Player = {
    id: string;
    name: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
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
};

type TileType = 'solid' | 'jumpBoost' | 'passable' | 'speedUp' | 'speedDown';

type Tile = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    type: TileType;
};

const TILE_SIZE = 64;

const tiles: Tile[] = [];

function createSimpleMap() {
    tiles.length = 0;
    // ground row
    for (let i = 0; i < Math.floor(ARENA_WIDTH / TILE_SIZE); i++) {
        tiles.push({ id: `g${i}`, x: i * TILE_SIZE, y: FLOOR_Y + PLAYER_RADIUS, w: TILE_SIZE, h: ARENA_HEIGHT - (FLOOR_Y + PLAYER_RADIUS), type: 'solid' });
    }

    // some platforms
    tiles.push({ id: 't1', x: 120, y: FLOOR_Y - 120, w: 160, h: 16, type: 'solid' });
    tiles.push({ id: 't2', x: 340, y: FLOOR_Y - 200, w: 160, h: 16, type: 'jumpBoost' });
    tiles.push({ id: 't3', x: 580, y: FLOOR_Y - 140, w: 120, h: 16, type: 'passable' });
    tiles.push({ id: 't4', x: 760, y: FLOOR_Y - 80, w: 80, h: 16, type: 'speedUp' });
    tiles.push({ id: 't5', x: 40, y: FLOOR_Y - 80, w: 80, h: 16, type: 'speedDown' });

}

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

function applyTileEffects(player: Player, tile: Tile, mode: { jumpForce: number }) {
    if (tile.type === 'jumpBoost') {
        player.vy = -mode.jumpForce * 1.25;
    }
}

type ClientMeta = {
    role?: Role;
    playerId?: string;
};

const TICK_MS = 33;
const ARENA_WIDTH = 900;
const ARENA_HEIGHT = 500;
const PLAYER_RADIUS = 16;
const FLOOR_Y = ARENA_HEIGHT - 50;
const MAX_JUMPS = 2;
const TAG_COOLDOWN_MS = 800;
const ZOMBIE_TRANSFORMATION_TIME_MS = 3000;
const ZOMBIE_MIN_DURATION_MS = 30000;
const ZOMBIE_MAX_DURATION_MS = 60000;

const MODE_CONFIG: Record<GameMode, {
    label: string;
    baseSpeed: number;
    tagSpeedBonus: number;
    gravity: number;
    jumpForce: number;
    baseRoundDurationMs: number;
}> = {
    classic: {
        label: "Classique",
        baseSpeed: 220,
        tagSpeedBonus: 18,
        gravity: 1100,
        jumpForce: 480,
        baseRoundDurationMs: 180000,
    },
    zombie: {
        label: "Zombie",
        baseSpeed: 200,
        tagSpeedBonus: -15,
        gravity: 1100,
        jumpForce: 460,
        baseRoundDurationMs: 45000,
    },
    bomb: {
        label: "Bombe",
        baseSpeed: 240,
        tagSpeedBonus: 14,
        gravity: 1250,
        jumpForce: 500,
        baseRoundDurationMs: 90000,
    },
};

// map depends on arena constants, create after they are defined
createSimpleMap();

const wss = new WebSocketServer({ port: 3001 });
const clients = new Map<WebSocket, ClientMeta>();
const players = new Map<string, Player>();

let playerCounter = 1;
let tagPlayerId: string | null = null;
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

function calculateZombieDuration(playerCount: number): number {
    // Scale duration linearly: fewer players = longer duration
    // 1 player: 60s, 5+ players: 30s
    if (playerCount <= 1) return ZOMBIE_MAX_DURATION_MS;
    const ratio = Math.max(0, Math.min(1, (playerCount - 1) / 4));
    return ZOMBIE_MAX_DURATION_MS - ratio * (ZOMBIE_MAX_DURATION_MS - ZOMBIE_MIN_DURATION_MS);
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

function spawnPlayer(id: string, name: string): Player {
    return {
        id,
        name,
        x: 120 + ((players.size * 120) % 600),
        y: FLOOR_Y,
        vx: 0,
        vy: 0,
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
    };
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

    if (gameMode === "zombie") {
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

        broadcast({
            type: "game_over",
            message,
        });
    } else {
        // Classic mode: tag loses, others win
        const loserId = tagPlayerId;
        const loserName = loserId ? players.get(loserId)?.name ?? "Inconnu" : "Inconnu";
        const winners = [...players.values()]
            .filter((player) => player.id !== loserId)
            .map((player) => player.name);
        const winnersText = winners.length > 0 ? winners.join(", ") : "personne";
        broadcast({
            type: "game_over",
            message: `${loserName} est TAG à la fin du temps : il perd. Gagnants: ${winnersText}.`,
        });
    }

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
        player.input.down = false;
        player.isTag = false;
        player.transformationStartTime = null;
        player.transformedFrom = null;
    });

    roundStartTs = Date.now();
    if (gameMode === "zombie") {
        roundDurationMs = calculateZombieDuration(players.size);
    }
    tagPlayerId = pickRandomPlayerId();
    if (tagPlayerId && gameMode === "zombie") {
        players.get(tagPlayerId)!.isTag = true;
    }
    lastTagTs = Date.now();
}

function updateGame(dt: number) {
    if (!gameStarted) {
        return;
    }

    const mode = MODE_CONFIG[gameMode];

    players.forEach((player) => {
        const prevY = player.y;

        // In zombie mode, immobilize during transformation
        if (gameMode === "zombie" && player.transformationStartTime) {
            player.vx = 0;
            player.vy = 0;
        } else {
            const horizontal = Number(player.input.right) - Number(player.input.left);
            let speed = mode.baseSpeed;
            if (gameMode === "zombie") {
                speed = player.isTag ? mode.baseSpeed + mode.tagSpeedBonus : mode.baseSpeed;
            } else if (gameMode === "classic") {
                speed = player.id === tagPlayerId ? mode.baseSpeed + mode.tagSpeedBonus : mode.baseSpeed;
            }
            player.vx = horizontal * speed;

            // Apply speed modifiers from tiles the player is currently standing on
            if (player.onGround) {
                const currentTile = getTileUnderPlayer(player);
                if (currentTile?.type === 'speedUp') {
                    player.vx *= 1.5;
                } else if (currentTile?.type === 'speedDown') {
                    player.vx *= 0.7;
                }
            }
        }

        if (!player.transformationStartTime || gameMode !== "zombie") {
            if (player.input.jump && !player.jumpLatch && player.jumpsLeft > 0) {
                player.vy = -mode.jumpForce;
                player.onGround = false;
                player.jumpsLeft -= 1;
                player.jumpLatch = true;
            } else if (!player.input.jump) {
                player.jumpLatch = false;
            }
        }

        player.vy += mode.gravity * dt;

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
        if (player.y >= FLOOR_Y) {
            player.y = FLOOR_Y;
            player.vy = 0;
            player.onGround = true;
            player.jumpsLeft = MAX_JUMPS;
            landedTile = null;
        }

        if (landedTile) {
            applyTileEffects(player, landedTile, mode);
        }
    });

    if (tagPlayerId && Date.now() - lastTagTs > TAG_COOLDOWN_MS) {
        const tagger = players.get(tagPlayerId);
        if (tagger) {
            for (const candidate of players.values()) {
                if (candidate.id === tagger.id) continue;
                const dx = candidate.x - tagger.x;
                const dy = candidate.y - tagger.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < (PLAYER_RADIUS * 2) ** 2) {
                    if (gameMode === "zombie" && !candidate.isTag && !candidate.transformationStartTime) {
                        // Start transformation
                        candidate.transformationStartTime = Date.now();
                        candidate.transformedFrom = tagger.id;
                        broadcast({
                            type: "tag_event",
                            from: tagger.name,
                            to: candidate.name,
                        });
                    } else if (gameMode !== "zombie") {
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

    // Zombie mode: handle transformation completion
    if (gameMode === "zombie") {
        players.forEach((player) => {
            if (player.transformationStartTime && Date.now() - player.transformationStartTime >= ZOMBIE_TRANSFORMATION_TIME_MS) {
                player.isTag = true;
                player.transformationStartTime = null;
            }
        });
        
        // Check if all players are tags - immediate game over
        const allTags = [...players.values()].every((p) => p.isTag);
        if (allTags && players.size > 0) {
            gameStarted = false;
            const winnersWithTransform = [...players.values()].filter(
                (t) => [...players.values()].some((p) => p.transformedFrom === t.id)
            );
            const winnerNames = winnersWithTransform.length > 0 
                ? winnersWithTransform.map((p) => p.name).join(", ")
                : "personne";
            broadcast({
                type: "game_over",
                message: `Apocalypse zombie! Tous sont devenus tags. Gagnants (qui ont transformé): ${winnerNames}.`,
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
            x: p.x,
            y: p.y,
            radius: PLAYER_RADIUS,
            isTag: gameMode === "zombie" ? p.isTag : undefined,
            })),
            tiles: tiles.map(t => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, type: t.type })),
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

            if (msg.role === "controller") {
                const id = `P${playerCounter++}`;
                const name = msg.name?.trim() || id;
                const player = spawnPlayer(id, name);
                players.set(id, player);
                meta.playerId = id;

                if (!tagPlayerId) {
                    tagPlayerId = id;
                    lastTagTs = Date.now();
                }

                send(ws, {
                    type: "joined",
                    role: "controller",
                    playerId: id,
                    name,
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

            if (players.size === 0) {
                send(ws, { type: "error", message: "Aucun joueur connecté" });
                return;
            }

            gameStarted = true;
            roundStartTs = Date.now();
            lastTagTs = Date.now();

            // Calculate round duration based on mode
            if (gameMode === "zombie") {
                roundDurationMs = calculateZombieDuration(players.size);
            } else {
                const mode = MODE_CONFIG[gameMode];
                roundDurationMs = mode.baseRoundDurationMs;
            }

            tagPlayerId = pickRandomPlayerId();

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
                player.input.down = false;
                player.isTag = false;
                player.transformationStartTime = null;
                player.transformedFrom = null;
                
                // Set initial tag for zombie mode
                if (gameMode === "zombie" && player.id === tagPlayerId) {
                    player.isTag = true;
                }
            });

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
            const removedId = meta.playerId;
            players.delete(removedId);

            if (tagPlayerId === removedId) {
                tagPlayerId = pickRandomPlayerId();
                lastTagTs = Date.now();
            }
        }

        if (players.size === 0) {
            gameStarted = false;
            roundStartTs = Date.now();
            tagPlayerId = null;
        }

        broadcastLobby();
    });
});

setInterval(() => {
    updateGame(TICK_MS / 1000);
}, TICK_MS);

console.log("Serveur TAG minimal lancé sur ws://localhost:3001");