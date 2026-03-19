/// <reference path="./ws.d.ts" />
import { WebSocketServer, WebSocket } from "ws";

type Role = "screen" | "controller";
type GameMode = "classic" | "turbo";

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

type InputMessage = {
    type: "input";
    left: boolean;
    right: boolean;
    jump: boolean;
};

type ClientMessage = JoinMessage | InputMessage | SetModeMessage | StartGameMessage;

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
    };
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

function getTileUnderPlayer(p: Player): Tile | null {
    // check tiles whose top is <= player.y+radius and player.x within tile bounds
    for (const t of tiles) {
        const left = t.x;
        const right = t.x + t.w;
        const top = t.y;
        const bottom = t.y + t.h;
        const px = p.x;
        const py = p.y + p.vy * 0; // current position

        if (px + PLAYER_RADIUS > left && px - PLAYER_RADIUS < right) {
            // consider landing if player's feet are at or below tile top and above tile bottom
            if (p.y + PLAYER_RADIUS >= top && p.y - PLAYER_RADIUS <= bottom) {
                return t;
            }
        }
    }
    return null;
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

const MODE_CONFIG: Record<GameMode, {
    label: string;
    speed: number;
    gravity: number;
    jumpForce: number;
    roundDurationMs: number;
}> = {
    classic: {
        label: "Classique",
        speed: 220,
        gravity: 1100,
        jumpForce: 460,
        roundDurationMs: 60_000,
    },
    turbo: {
        label: "Turbo",
        speed: 280,
        gravity: 1250,
        jumpForce: 500,
        roundDurationMs: 45_000,
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
    const mode = MODE_CONFIG[gameMode];
    return Math.max(0, mode.roundDurationMs - (Date.now() - roundStartTs));
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
        },
    };
}

function resetRoundIfNeeded() {
    if (!gameStarted) {
        return;
    }

    if (getRemainingMs() > 0) {
        return;
    }

    const loserId = tagPlayerId;
    const loserName = loserId ? players.get(loserId)?.name ?? "Inconnu" : "Inconnu";
    broadcast({
        type: "game_over",
        message: `${loserName} est TAG à la fin du temps !`,
    });

    players.forEach((player) => {
        player.x = 120 + ((Math.random() * 600) | 0);
        player.y = FLOOR_Y;
        player.vx = 0;
        player.vy = 0;
        player.onGround = true;
        player.jumpsLeft = MAX_JUMPS;
    });

    roundStartTs = Date.now();
    const first = players.values().next().value as Player | undefined;
    tagPlayerId = first?.id ?? null;
    lastTagTs = Date.now();
}

function updateGame(dt: number) {
    if (!gameStarted) {
        return;
    }

    const mode = MODE_CONFIG[gameMode];

    players.forEach((player) => {
        const horizontal = Number(player.input.right) - Number(player.input.left);
        player.vx = horizontal * mode.speed;

        if (player.input.jump && !player.jumpLatch && player.jumpsLeft > 0) {
            player.vy = -mode.jumpForce;
            player.onGround = false;
            player.jumpsLeft -= 1;
            player.jumpLatch = true;
        } else if (!player.input.jump) {
            player.jumpLatch = false;
        }

        player.vy += mode.gravity * dt;
        player.x += player.vx * dt;
        player.y += player.vy * dt;

        if (player.x < PLAYER_RADIUS) player.x = PLAYER_RADIUS;
        if (player.x > ARENA_WIDTH - PLAYER_RADIUS) player.x = ARENA_WIDTH - PLAYER_RADIUS;

        // tile collision
        const tile = getTileUnderPlayer(player);
        if (tile && tile.type !== 'passable') {
            const top = tile.y;
            if (player.y + PLAYER_RADIUS > top && player.vy >= 0) {
                player.y = top - PLAYER_RADIUS;
                player.vy = 0;
                player.onGround = true;
                player.jumpsLeft = MAX_JUMPS;

                // apply tile effects
                if (tile.type === 'jumpBoost') {
                    player.vy = -mode.jumpForce * 1.25;
                }
                if (tile.type === 'speedUp') {
                    // temporarily increase speed while on tile
                    player.vx *= 1.1;
                }
                if (tile.type === 'speedDown') {
                    player.vx *= 0.9;
                }
            }
        } else {
            // fall to floor
            if (player.y >= FLOOR_Y) {
                player.y = FLOOR_Y;
                player.vy = 0;
                player.onGround = true;
                player.jumpsLeft = MAX_JUMPS;
            }
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
                    tagPlayerId = candidate.id;
                    lastTagTs = Date.now();
                    broadcast({
                        type: "tag_event",
                        from: tagger.name,
                        to: candidate.name,
                    });
                    break;
                }
            }
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
            tagPlayerId = players.values().next().value?.id ?? null;

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
            });

            broadcast({
                type: "game_started",
                mode: gameMode,
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
        }
    });

    ws.on("close", () => {
        const meta = clients.get(ws);
        clients.delete(ws);

        if (meta?.playerId) {
            const removedId = meta.playerId;
            players.delete(removedId);

            if (tagPlayerId === removedId) {
                const next = players.values().next().value as Player | undefined;
                tagPlayerId = next?.id ?? null;
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