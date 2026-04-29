"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
/// <reference path="./ws.d.ts" />
var ws_1 = require("ws");
var BlocMap_ts_1 = require("./BlocMap.ts");
var EffectsBlocs_ts_1 = require("./EffectsBlocs.ts");
var classic_ts_1 = require("./Modes/classic.ts");
var zombie_ts_1 = require("./Modes/zombie.ts");
var bomb_ts_1 = require("./Modes/bomb.ts");
function overlapsOnX(px, tile) {
    return px + PLAYER_RADIUS > tile.x && px - PLAYER_RADIUS < tile.x + tile.w;
}
function overlapsOnY(py, tile) {
    return py + PLAYER_RADIUS > tile.y && py - PLAYER_RADIUS < tile.y + tile.h;
}
function getTileUnderPlayer(player) {
    for (var _i = 0, tiles_1 = tiles; _i < tiles_1.length; _i++) {
        var tile = tiles_1[_i];
        if (!overlapsOnX(player.x, tile)) {
            continue;
        }
        // Check if player feet are touching tile top (onGround condition)
        var tileTop = tile.y;
        if (Math.abs((player.y + PLAYER_RADIUS) - tileTop) < 2) {
            return tile;
        }
    }
    return null;
}
var TICK_MS = 33;
var PLAYER_RADIUS = 16;
var tiles = (0, BlocMap_ts_1.createSimpleMap)(PLAYER_RADIUS);
var MAX_JUMPS = 2;
var TAG_COOLDOWN_MS = 800;
var ZOMBIE_TRANSFORMATION_TIME_MS = 3000;
var MODE_CONFIG = {
    classic: classic_ts_1.CLASSIC_CONFIG,
    zombie: zombie_ts_1.ZOMBIE_CONFIG,
    bomb: bomb_ts_1.BOMB_CONFIG
};
var CHARACTERS = ["blue", "yellow", "green", "purple", "red"];
function getRandomCharacter() {
    return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
}
var wss = new ws_1.WebSocketServer({ port: 3001 });
var clients = new Map();
var players = new Map();
var disconnectedPlayerTimers = new Map();
var playerCounter = 1;
var tagPlayerId = null;
var bombTagPlayerIds = new Set();
var lastTagTs = 0;
var roundStartTs = Date.now();
var roundDurationMs = 180000;
var gameMode = "classic";
var gameStarted = false;
function send(ws, payload) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}
function broadcast(payload) {
    var json = JSON.stringify(payload);
    wss.clients.forEach(function (client) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
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
        started: gameStarted
    });
}
function spawnPlayer(id, name, sessionId) {
    return {
        id: id,
        sessionId: sessionId,
        name: name,
        character: getRandomCharacter(),
        x: 120 + ((players.size * 120) % 600),
        y: BlocMap_ts_1.FLOOR_Y - PLAYER_RADIUS,
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
            down: false
        },
        isTag: false,
        transformationStartTime: null,
        transformedFrom: null,
        bombCounter: 0,
        bombCounterStartTime: 0,
        isEliminated: false
    };
}
function removePlayer(playerId) {
    var timer = disconnectedPlayerTimers.get(playerId);
    if (timer) {
        clearTimeout(timer);
        disconnectedPlayerTimers["delete"](playerId);
    }
    if (!players.has(playerId)) {
        return;
    }
    players["delete"](playerId);
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
function schedulePlayerRemoval(playerId) {
    if (disconnectedPlayerTimers.has(playerId)) {
        return;
    }
    var timer = setTimeout(function () {
        disconnectedPlayerTimers["delete"](playerId);
        removePlayer(playerId);
        broadcastLobby();
    }, 15000);
    disconnectedPlayerTimers.set(playerId, timer);
}
function pickRandomPlayerId() {
    var _a;
    var ids = __spreadArray([], players.keys(), true);
    if (ids.length === 0) {
        return null;
    }
    var randomIndex = Math.floor(Math.random() * ids.length);
    return (_a = ids[randomIndex]) !== null && _a !== void 0 ? _a : null;
}
function initBombMode() {
    var playerCount = players.size;
    var initialTagCount = (0, bomb_ts_1.getInitialTagCountForPlayerCount)(playerCount);
    var bombCounter = (0, bomb_ts_1.getBombCounterForPlayerCount)(playerCount);
    var now = Date.now();
    bombTagPlayerIds.clear();
    var playerIds = __spreadArray([], players.keys(), true);
    // Shuffle and select initial TAGs
    var shuffled = __spreadArray([], playerIds, true).sort(function () { return Math.random() - 0.5; });
    for (var i = 0; i < Math.min(initialTagCount, shuffled.length); i++) {
        var selectedId = shuffled[i];
        bombTagPlayerIds.add(selectedId);
        var player = players.get(selectedId);
        player.isTag = true;
        player.bombCounter = bombCounter;
        player.bombCounterStartTime = now;
        player.isEliminated = false;
    }
    // Initialize non-TAGs
    for (var _i = 0, players_1 = players; _i < players_1.length; _i++) {
        var _a = players_1[_i], id = _a[0], player = _a[1];
        if (!bombTagPlayerIds.has(id)) {
            player.isTag = false;
            player.bombCounter = bombCounter;
            player.bombCounterStartTime = now;
            player.isEliminated = false;
        }
    }
}
function resetRoundIfNeeded() {
    if (!gameStarted) {
        return;
    }
    if (getRemainingMs() > 0) {
        return;
    }
    var message;
    if (gameMode === "zombie") {
        var result = (0, zombie_ts_1.handleZombieRoundEnd)(players);
        message = result.message;
    }
    else if (gameMode === "bomb") {
        var nonEliminatedPlayers = __spreadArray([], players.values(), true).filter(function (p) { return !p.isEliminated; });
        var nonTagPlayers = nonEliminatedPlayers.filter(function (p) { return !p.isTag; });
        var winner = nonTagPlayers.length === 1 ? nonTagPlayers[0] : null;
        message = winner ? "".concat(winner.name, " a gagn\u00E9!") : "Fin de partie";
    }
    else {
        message = (0, classic_ts_1.handleClassicRoundEnd)(tagPlayerId, players);
    }
    broadcast({
        type: "game_over",
        message: message
    });
    players.forEach(function (player) {
        player.x = 120 + ((Math.random() * 600) | 0);
        player.y = BlocMap_ts_1.FLOOR_Y;
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
        player.isEliminated = false;
    });
    roundStartTs = Date.now();
    if (gameMode === "zombie") {
        roundDurationMs = (0, zombie_ts_1.calculateZombieDuration)(players.size);
    }
    else if (gameMode === "bomb") {
        initBombMode();
    }
    tagPlayerId = pickRandomPlayerId();
    if (tagPlayerId && gameMode === "zombie") {
        players.get(tagPlayerId).isTag = true;
    }
    lastTagTs = Date.now();
}
function updateBombMode(dt) {
    var now = Date.now();
    var bombCounter = (0, bomb_ts_1.getBombCounterForPlayerCount)(players.size);
    // Update bomb counters for TAG players
    for (var _i = 0, bombTagPlayerIds_1 = bombTagPlayerIds; _i < bombTagPlayerIds_1.length; _i++) {
        var tagId = bombTagPlayerIds_1[_i];
        var tagPlayer = players.get(tagId);
        if (!tagPlayer || tagPlayer.isEliminated)
            continue;
        var elapsedSecs = (now - tagPlayer.bombCounterStartTime) / 1000;
        tagPlayer.bombCounter = Math.max(0, bombCounter - elapsedSecs);
        // Check if bomb counter reaches 0
        if (tagPlayer.bombCounter <= 0 && !tagPlayer.isEliminated) {
            tagPlayer.isEliminated = true;
            broadcast({
                type: "tag_event",
                from: "Bombe",
                to: tagPlayer.name
            });
        }
    }
    // Update bomb counters for non-TAG players (display full counter)
    for (var _a = 0, players_2 = players; _a < players_2.length; _a++) {
        var _b = players_2[_a], id = _b[0], player = _b[1];
        if (!bombTagPlayerIds.has(id) && !player.isEliminated) {
            player.bombCounter = bombCounter;
        }
    }
    // Check win/loss conditions
    var nonEliminatedPlayers = __spreadArray([], players.values(), true).filter(function (p) { return !p.isEliminated; });
    var nonTagPlayers = nonEliminatedPlayers.filter(function (p) { return !p.isTag; });
    var tagPlayers = nonEliminatedPlayers.filter(function (p) { return p.isTag; });
    // If non-TAG players > TAG players and a TAG is eliminated, reassign a new TAG
    if (nonTagPlayers.length > tagPlayers.length && nonTagPlayers.length > 0) {
        // Find an eliminated TAG
        var eliminatedTag = __spreadArray([], bombTagPlayerIds, true).find(function (id) { var _a; return (_a = players.get(id)) === null || _a === void 0 ? void 0 : _a.isEliminated; });
        if (eliminatedTag) {
            // Pick a random non-TAG to become TAG
            var newTagPlayer = nonTagPlayers[Math.floor(Math.random() * nonTagPlayers.length)];
            if (newTagPlayer) {
                bombTagPlayerIds["delete"](eliminatedTag);
                bombTagPlayerIds.add(newTagPlayer.id);
                newTagPlayer.isTag = true;
                newTagPlayer.bombCounter = bombCounter;
                newTagPlayer.bombCounterStartTime = now;
                broadcast({
                    type: "tag_event",
                    from: "Système",
                    to: newTagPlayer.name
                });
            }
        }
    }
    // Check loss condition: all non-TAG players eliminated
    if (nonTagPlayers.length === 0 && nonEliminatedPlayers.length > 0) {
        gameStarted = false;
        broadcast({
            type: "game_over",
            message: "Tous les joueurs ont été éliminés!"
        });
    }
}
function updateGame(dt) {
    if (!gameStarted) {
        return;
    }
    var mode = MODE_CONFIG[gameMode];
    players.forEach(function (player) {
        var prevY = player.y;
        var wasOnGround = player.onGround;
        var jumpedThisTick = false;
        // In zombie mode, immobilize during transformation
        if (gameMode === "zombie" && player.transformationStartTime) {
            player.vx = 0;
            player.vy = 0;
        }
        else {
            var horizontal = Number(player.input.right) - Number(player.input.left);
            var speed = mode.baseSpeed;
            if (gameMode === "zombie") {
                speed = (0, zombie_ts_1.getZombieSpeed)(player, mode.baseSpeed, mode.tagSpeedBonus);
            }
            else if (gameMode === "classic") {
                speed = (0, classic_ts_1.getClassicSpeed)(player, tagPlayerId, mode.baseSpeed, mode.tagSpeedBonus);
            }
            player.vx = horizontal * speed;
            // Apply speed modifiers from tiles the player is currently standing on
            if (player.onGround) {
                var currentTile = getTileUnderPlayer(player);
                if (currentTile) {
                    (0, EffectsBlocs_ts_1.applyTileEffects)(player, currentTile, mode, 'ground');
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
            }
            else if (!player.input.jump) {
                player.jumpLatch = false;
            }
        }
        var isFalling = !player.onGround && player.vy > 0;
        if (isFalling && player.input.down) {
            player.gravityMultiplier = 1.5;
        }
        else if (player.gravityMultiplier === 1.5) {
            player.gravityMultiplier = 1;
        }
        player.vy += mode.gravity * player.gravityMultiplier * dt;
        // Resolve horizontal movement first to block side traversal on solid tiles.
        player.x += player.vx * dt;
        for (var _i = 0, tiles_2 = tiles; _i < tiles_2.length; _i++) {
            var tile = tiles_2[_i];
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
            }
            else if (player.vx < 0) {
                player.x = tile.x + tile.w + PLAYER_RADIUS;
            }
            player.vx = 0;
        }
        // Resolve vertical movement with full collisions on solid tiles and one-way on passable tiles.
        player.y += player.vy * dt;
        player.onGround = false;
        var landedTile = null;
        for (var _a = 0, tiles_3 = tiles; _a < tiles_3.length; _a++) {
            var tile = tiles_3[_a];
            var tileTop = tile.y;
            var tileBottom = tile.y + tile.h;
            var prevTop = prevY - PLAYER_RADIUS;
            var prevBottom = prevY + PLAYER_RADIUS;
            var newTop = player.y - PLAYER_RADIUS;
            var newBottom = player.y + PLAYER_RADIUS;
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
        if (player.x < PLAYER_RADIUS)
            player.x = PLAYER_RADIUS;
        if (player.x > BlocMap_ts_1.ARENA_WIDTH - PLAYER_RADIUS)
            player.x = BlocMap_ts_1.ARENA_WIDTH - PLAYER_RADIUS;
        // fall to floor
        if (player.y >= BlocMap_ts_1.FLOOR_Y - PLAYER_RADIUS) {
            player.y = BlocMap_ts_1.FLOOR_Y - PLAYER_RADIUS;
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
            (0, EffectsBlocs_ts_1.applyTileEffects)(player, landedTile, mode, 'landing');
        }
    });
    if (Date.now() - lastTagTs > TAG_COOLDOWN_MS) {
        // Collect all taggers based on game mode
        var taggers = [];
        if (gameMode === "bomb") {
            for (var _i = 0, bombTagPlayerIds_2 = bombTagPlayerIds; _i < bombTagPlayerIds_2.length; _i++) {
                var tagId = bombTagPlayerIds_2[_i];
                var tagPlayer = players.get(tagId);
                if (tagPlayer && !tagPlayer.isEliminated) {
                    taggers.push(tagPlayer);
                }
            }
        }
        else if (tagPlayerId) {
            var tagger = players.get(tagPlayerId);
            if (tagger) {
                taggers.push(tagger);
            }
        }
        // Process collisions for each tagger
        tagOuterLoop: for (var _a = 0, taggers_1 = taggers; _a < taggers_1.length; _a++) {
            var tagger = taggers_1[_a];
            for (var _b = 0, _c = players.values(); _b < _c.length; _b++) {
                var candidate = _c[_b];
                if (candidate.id === tagger.id)
                    continue;
                var dx = candidate.x - tagger.x;
                var dy = candidate.y - tagger.y;
                var distSq = dx * dx + dy * dy;
                if (distSq < Math.pow((PLAYER_RADIUS * 2), 2)) {
                    if (gameMode === "zombie" && !candidate.isTag && !candidate.transformationStartTime) {
                        // Tag immediately
                        candidate.isTag = true;
                        candidate.transformedFrom = tagger.id;
                        candidate.transformationStartTime = Date.now();
                        broadcast({
                            type: "tag_event",
                            from: tagger.name,
                            to: candidate.name
                        });
                    }
                    else if (gameMode === "bomb" && tagger.isTag && !candidate.isTag && !candidate.isEliminated) {
                        // Transfer bomb in bomb mode
                        // Calculate elapsed time to maintain the countdown
                        var bombCounterInitial = (0, bomb_ts_1.getBombCounterForPlayerCount)(players.size);
                        var elapsedSecs = (Date.now() - tagger.bombCounterStartTime) / 1000;
                        var currentBombCounter = tagger.bombCounter;
                        bombTagPlayerIds["delete"](tagger.id);
                        bombTagPlayerIds.add(candidate.id);
                        tagger.isTag = false;
                        tagger.bombCounter = bombCounterInitial;
                        tagger.bombCounterStartTime = Date.now();
                        candidate.isTag = true;
                        candidate.bombCounter = currentBombCounter;
                        // Set the new TAG's start time so the countdown formula continues correctly
                        candidate.bombCounterStartTime = Date.now() - (elapsedSecs * 1000);
                        lastTagTs = Date.now();
                        broadcast({
                            type: "tag_event",
                            from: tagger.name,
                            to: candidate.name
                        });
                        break tagOuterLoop;
                    }
                    else if (gameMode !== "zombie" && gameMode !== "bomb") {
                        tagPlayerId = candidate.id;
                        lastTagTs = Date.now();
                        broadcast({
                            type: "tag_event",
                            from: tagger.name,
                            to: candidate.name
                        });
                    }
                    break;
                }
            }
        }
    }
    // Zombie mode: handle transformation cleanup after delay
    if (gameMode === "zombie") {
        players.forEach(function (player) {
            if (player.transformationStartTime && Date.now() - player.transformationStartTime >= ZOMBIE_TRANSFORMATION_TIME_MS) {
                player.transformationStartTime = null;
            }
        });
        // Check if all players are tags - immediate game over
        var allTags = __spreadArray([], players.values(), true).every(function (p) { return p.isTag; });
        if (allTags && players.size > 0) {
            gameStarted = false;
            var message = (0, zombie_ts_1.handleZombieAllTagsGameOver)(players);
            broadcast({
                type: "game_over",
                message: message
            });
        }
    }
    // Bomb mode: handle bomb counters and eliminations
    if (gameMode === "bomb") {
        updateBombMode(dt);
    }
    resetRoundIfNeeded();
    broadcast({
        type: "state",
        mode: gameMode,
        arena: { width: BlocMap_ts_1.ARENA_WIDTH, height: BlocMap_ts_1.ARENA_HEIGHT, floorY: BlocMap_ts_1.FLOOR_Y },
        remainingMs: getRemainingMs(),
        tagPlayerId: tagPlayerId,
        players: __spreadArray([], players.values(), true).map(function (p) { return ({
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
            isEliminated: gameMode === "bomb" ? p.isEliminated : undefined
        }); }),
        tiles: tiles.map(function (t) { return ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h, type: t.type, className: t.className }); })
    });
}
wss.on("connection", function (ws) {
    clients.set(ws, {});
    send(ws, {
        type: "hello",
        message: "Connecté au serveur TAG minimal"
    });
    ws.on("message", function (raw) {
        var _a, _b, _c, _d;
        var msg;
        try {
            msg = JSON.parse(raw.toString());
        }
        catch (_e) {
            send(ws, { type: "error", message: "Message JSON invalide" });
            return;
        }
        var meta = clients.get(ws);
        if (!meta)
            return;
        if (msg.type === "join") {
            meta.role = msg.role;
            meta.sessionId = msg.sessionId;
            if (msg.role === "controller") {
                var sessionId_1 = ((_a = msg.sessionId) === null || _a === void 0 ? void 0 : _a.trim()) || "session-".concat(Date.now(), "-").concat(Math.random().toString(16).slice(2));
                var trimmedName = (_b = msg.name) === null || _b === void 0 ? void 0 : _b.trim();
                var existingPlayer = __spreadArray([], players.values(), true).find(function (player) { return player.sessionId === sessionId_1; });
                if (existingPlayer) {
                    var timer = disconnectedPlayerTimers.get(existingPlayer.id);
                    if (timer) {
                        clearTimeout(timer);
                        disconnectedPlayerTimers["delete"](existingPlayer.id);
                    }
                    if (trimmedName) {
                        existingPlayer.name = trimmedName;
                    }
                    meta.playerId = existingPlayer.id;
                }
                else {
                    var id = "P".concat(playerCounter++);
                    var name_1 = trimmedName || id;
                    var player = spawnPlayer(id, name_1, sessionId_1);
                    // Initialize bomb mode properties for new players joining during a bomb game
                    if (gameStarted && gameMode === "bomb") {
                        var bombCounter = (0, bomb_ts_1.getBombCounterForPlayerCount)(players.size + 1);
                        var now = Date.now();
                        player.bombCounter = bombCounter;
                        player.bombCounterStartTime = now;
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
                    name: meta.playerId ? (_c = players.get(meta.playerId)) === null || _c === void 0 ? void 0 : _c.name : trimmedName
                });
            }
            else {
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
            var minPlayersRequired = MODE_CONFIG[gameMode].minPlayers;
            if (players.size < minPlayersRequired) {
                send(ws, { type: "error", message: "Minimum ".concat(minPlayersRequired, " joueurs requis pour ce mode (actuellement ").concat(players.size, ")") });
                return;
            }
            gameStarted = true;
            roundStartTs = Date.now();
            lastTagTs = Date.now();
            // Calculate round duration based on mode
            if (gameMode === "zombie") {
                roundDurationMs = (0, zombie_ts_1.calculateZombieDuration)(players.size);
            }
            else {
                var mode = MODE_CONFIG[gameMode];
                roundDurationMs = mode.baseRoundDurationMs;
            }
            tagPlayerId = pickRandomPlayerId();
            players.forEach(function (player) {
                player.x = 120 + ((Math.random() * 600) | 0);
                player.y = BlocMap_ts_1.FLOOR_Y;
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
                initBombMode();
            }
            broadcast({
                type: "game_started",
                mode: gameMode
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
            players.forEach(function (player) {
                player.x = 120 + ((Math.random() * 600) | 0);
                player.y = BlocMap_ts_1.FLOOR_Y;
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
            var player = players.get(meta.playerId);
            if (!player)
                return;
            player.character = msg.character;
            return;
        }
        if (msg.type === "input") {
            if (meta.role !== "controller" || !meta.playerId) {
                return;
            }
            var player = players.get(meta.playerId);
            if (!player)
                return;
            player.input.left = Boolean(msg.left);
            player.input.right = Boolean(msg.right);
            player.input.jump = Boolean(msg.jump);
            player.input.down = Boolean((_d = msg.down) !== null && _d !== void 0 ? _d : false);
        }
    });
    ws.on("close", function () {
        var meta = clients.get(ws);
        clients["delete"](ws);
        if (meta === null || meta === void 0 ? void 0 : meta.playerId) {
            var player = players.get(meta.playerId);
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
setInterval(function () {
    updateGame(TICK_MS / 1000);
}, TICK_MS);
console.log("Serveur TAG minimal lancé sur ws://localhost:3001");
