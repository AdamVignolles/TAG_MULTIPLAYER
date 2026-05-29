import type { Player } from "../index.ts";
import type { Tile } from "../BlocMap.ts";
import type { GameOverResult } from "./GameOverResult.ts";

export type AreaTeam = "green" | "blue";
export type AreaFlagPower = "boost_control" | "slow_enemy" | "deny_capture" | "tag_self";

export const AREA_CONFIG = {
    label: "Conquete d'equipe",
    baseSpeed: 220,
    tagSpeedBonus: 0,
    gravity: 1100,
    jumpForce: 480,
    baseRoundDurationMs: 150000,
    minPlayers: 2,
};

export type AreaZone = {
    id: string;
    homeSide: AreaTeam;
    x: number;
    y: number;
    w: number;
    h: number;
    control: number;
    controllingTeam: AreaTeam | null;
};

export type AreaFlag = {
    id: string;
    power: AreaFlagPower;
    x: number;
    y: number;
    w: number;
    h: number;
    spawnedAt: number;
    expiresAt: number;
    collectedByTeam: AreaTeam | null;
};

export type AreaTeamBuffs = {
    controlBoostUntil: number;
    enemySlowUntil: number;
    enemyCaptureBlockedUntil: number;
};

export type AreaTeamState = {
    team: AreaTeam;
    members: string[];
    tagPlayerId: string | null;
    score: number;
    buffs: AreaTeamBuffs;
};

export type AreaStateSnapshot = {
    zones: AreaZone[];
    flag: AreaFlag | null;
    teams: Record<AreaTeam, AreaTeamState>;
    nextFlagSpawnAt: number;
    nextTagRotationAt: number;
};

const FLAG_DURATION_MS = 15000;
export const AREA_TAG_DURATION_MS = 10000;
const FLAG_BUFF_DURATION_MS = 10000;
const CONTROL_THRESHOLD = 100;
const CONTROL_RATE_PER_PLAYER = 18;
const CONTROL_SCORE_PER_SECOND = 1;
const FLAG_SIZE = 28;
const PLAYER_RADIUS = 16;
const FLAG_POWER_LIST: AreaFlagPower[] = ["boost_control", "slow_enemy", "deny_capture", "tag_self"];

type AreaRuntime = {
    arenaWidth: number;
    floorY: number;
    playerTeams: Map<string, AreaTeam>;
    teamOrders: Record<AreaTeam, string[]>;
    teamTagIndex: Record<AreaTeam, number>;
};

const emptyTeamBuffs = (): AreaTeamBuffs => ({
    controlBoostUntil: 0,
    enemySlowUntil: 0,
    enemyCaptureBlockedUntil: 0,
});

const emptyTeamState = (team: AreaTeam): AreaTeamState => ({
    team,
    members: [],
    tagPlayerId: null,
    score: 0,
    buffs: emptyTeamBuffs(),
});

const emptySnapshot = (): AreaStateSnapshot => ({
    zones: [],
    flag: null,
    teams: {
        green: emptyTeamState("green"),
        blue: emptyTeamState("blue"),
    },
    nextFlagSpawnAt: 0,
    nextTagRotationAt: 0,
});

let runtime: AreaRuntime = {
    arenaWidth: 0,
    floorY: 0,
    playerTeams: new Map(),
    teamOrders: { green: [], blue: [] },
    teamTagIndex: { green: 0, blue: 0 },
};

let snapshot: AreaStateSnapshot = emptySnapshot();

function shuffleArray<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function oppositeTeam(team: AreaTeam): AreaTeam {
    return team === "green" ? "blue" : "green";
}

function createZones(tiles: Tile[], arenaWidth: number, floorY: number): AreaZone[] {
    const zoneWidth = 120;
    const zoneHeight = 100;
    const verticalMargin = 70;

    const candidates = tiles.filter((tile) => !tile.id.startsWith("g"));

    const pickTile = (minX: number, maxX: number): Tile => {
        const regionTiles = candidates.filter((tile) => {
            const centerX = tile.x + tile.w / 2;
            return centerX >= minX && centerX <= maxX;
        });

        const pool = regionTiles.length > 0 ? regionTiles : candidates;
        return pool[Math.floor(Math.random() * pool.length)] ?? tiles[0] ?? {
            id: "fallback",
            x: 0,
            y: floorY - zoneHeight,
            w: zoneWidth,
            h: zoneHeight,
            type: "solid",
        };
    };

    const placeZone = (id: string, homeSide: AreaTeam, minX: number, maxX: number): AreaZone => {
        const tile = pickTile(minX, maxX);
        const maxZoneX = Math.max(tile.x, tile.x + tile.w - zoneWidth);
        const minZoneX = Math.min(tile.x, maxZoneX);
        const x = clamp(randomBetween(minZoneX, maxZoneX), 0, arenaWidth - zoneWidth);
        const y = clamp(tile.y - zoneHeight, verticalMargin, floorY - zoneHeight - 20);

        return { id, homeSide, x, y, w: zoneWidth, h: zoneHeight, control: 0, controllingTeam: null };
    };

    return [
        placeZone("G1", "green", 0, arenaWidth * 0.25),
        placeZone("G2", "green", arenaWidth * 0.25, arenaWidth * 0.5),
        placeZone("B1", "blue", arenaWidth * 0.5, arenaWidth * 0.75),
        placeZone("B2", "blue", arenaWidth * 0.75, arenaWidth),
    ];
}

function createFlagSpawnPoint(): { x: number; y: number } {
    return {
        x: clamp(randomBetween(90, runtime.arenaWidth - 90), 90, runtime.arenaWidth - 90),
        y: clamp(randomBetween(110, runtime.floorY - 120), 110, runtime.floorY - 120),
    };
}

function syncTeamState(players: Map<string, Player>): void {
    snapshot.teams.green.members = [...runtime.teamOrders.green];
    snapshot.teams.blue.members = [...runtime.teamOrders.blue];

    snapshot.teams.green.tagPlayerId = null;
    snapshot.teams.blue.tagPlayerId = null;

    players.forEach((player) => {
        const team = runtime.playerTeams.get(player.id) ?? null;
        player.areaTeam = team;
        player.areaTag = false;
        player.areaTagUntil = 0;
        player.areaFrozenUntil = 0;
        player.areaFrozenMinUntil = 0;
    });
}

function clearAreaTagState(players: Map<string, Player>): void {
    snapshot.teams.green.tagPlayerId = null;
    snapshot.teams.blue.tagPlayerId = null;

    players.forEach((player) => {
        player.areaTag = false;
        player.areaTagUntil = 0;
    });
}

function setAreaTagger(players: Map<string, Player>, player: Player, now: number): void {
    clearAreaTagState(players);
    player.areaTag = true;
    player.areaTagUntil = now + AREA_TAG_DURATION_MS;
    player.areaFrozenUntil = 0;
    player.areaFrozenMinUntil = 0;

    const team = player.areaTeam;
    if (team) {
        snapshot.teams[team].tagPlayerId = player.id;
    }
}

function spawnFlag(now: number): AreaFlag {
    const power = FLAG_POWER_LIST[Math.floor(Math.random() * FLAG_POWER_LIST.length)];
    const spawnPoint = createFlagSpawnPoint();

    return {
        id: `flag-${now}-${Math.random().toString(16).slice(2)}`,
        power,
        x: spawnPoint.x,
        y: spawnPoint.y,
        w: FLAG_SIZE,
        h: FLAG_SIZE,
        spawnedAt: now,
        expiresAt: now + FLAG_DURATION_MS,
        collectedByTeam: null,
    };
}

function teamState(team: AreaTeam): AreaTeamState {
    return snapshot.teams[team];
}

function buildStateSnapshot(): AreaStateSnapshot {
    return {
        zones: snapshot.zones.map((zone) => ({ ...zone })),
        flag: snapshot.flag ? { ...snapshot.flag } : null,
        teams: {
            green: {
                ...snapshot.teams.green,
                members: [...snapshot.teams.green.members],
                buffs: { ...snapshot.teams.green.buffs },
            },
            blue: {
                ...snapshot.teams.blue,
                members: [...snapshot.teams.blue.members],
                buffs: { ...snapshot.teams.blue.buffs },
            },
        },
        nextFlagSpawnAt: snapshot.nextFlagSpawnAt,
        nextTagRotationAt: snapshot.nextTagRotationAt,
    };
}

function playerTeam(playerId: string): AreaTeam | null {
    return runtime.playerTeams.get(playerId) ?? null;
}

function isPlayerInZone(player: Player, zone: AreaZone): boolean {
    return player.x >= zone.x && player.x <= zone.x + zone.w && player.y >= zone.y && player.y <= zone.y + zone.h;
}

function isPlayerTouchingFlag(player: Player, flag: AreaFlag): boolean {
    const dx = player.x - (flag.x + flag.w / 2);
    const dy = player.y - (flag.y + flag.h / 2);
    // Augmente légèrement la tolérance de collision pour faciliter la collecte
    return dx * dx + dy * dy <= PLAYER_RADIUS ** 2 * 2.5;
}

function applyPower(team: AreaTeam, power: AreaFlagPower, now: number): void {
    const ally = teamState(team);
    const enemy = teamState(oppositeTeam(team));

    if (power === "tag_self") {
        return;
    }

    if (power === "boost_control") {
        ally.buffs.controlBoostUntil = Math.max(ally.buffs.controlBoostUntil, now + FLAG_BUFF_DURATION_MS);
        return;
    }

    if (power === "slow_enemy") {
        enemy.buffs.enemySlowUntil = Math.max(enemy.buffs.enemySlowUntil, now + FLAG_BUFF_DURATION_MS);
        return;
    }

    enemy.buffs.enemyCaptureBlockedUntil = Math.max(enemy.buffs.enemyCaptureBlockedUntil, now + FLAG_BUFF_DURATION_MS);
}

function collectFlag(players: Map<string, Player>, now: number, broadcast: (msg: any) => void): void {
    if (!snapshot.flag) {
        return;
    }

    for (const player of players.values()) {
        if (!isPlayerTouchingFlag(player, snapshot.flag)) {
            continue;
        }

        const team = playerTeam(player.id);
        snapshot.flag.collectedByTeam = team;
        if (team) {
            applyPower(team, snapshot.flag.power, now);
        }
        if (snapshot.flag.power === "tag_self") {
            setAreaTagger(players, player, now);
        }
        broadcast({
            type: "area_flag_collected",
            flagId: snapshot.flag.id,
            power: snapshot.flag.power,
            collectedByTeam: team,
            collectedByPlayerId: player.id,
            collectedByPlayerName: player.name,
        });

        snapshot.flag = null;
        snapshot.nextFlagSpawnAt = now + FLAG_DURATION_MS;
        return;
    }
}

export function updateAreaTagLifecycle(players: Map<string, Player>, now: number): void {
    players.forEach((player) => {
        if (!player.areaTag || player.areaTagUntil <= 0 || now < player.areaTagUntil) {
            return;
        }

        player.areaTag = false;
        player.areaTagUntil = 0;

        if (player.areaTeam && snapshot.teams[player.areaTeam].tagPlayerId === player.id) {
            snapshot.teams[player.areaTeam].tagPlayerId = null;
        }
    });
}

function updateZones(dt: number, players: Map<string, Player>, now: number): void {
    for (const zone of snapshot.zones) {
        let greenCount = 0;
        let blueCount = 0;

        for (const player of players.values()) {
            if (!isPlayerInZone(player, zone)) {
                continue;
            }

            const team = playerTeam(player.id);
            if (team === "green") {
                greenCount += 1;
            } else if (team === "blue") {
                blueCount += 1;
            }
        }

        const diff = greenCount - blueCount;

        // determine controlling team based on current control value
        zone.controllingTeam = zone.control >= CONTROL_THRESHOLD ? "green" : zone.control <= -CONTROL_THRESHOLD ? "blue" : null;

        // If there is at least one player influencing the zone, update control accordingly
        if (diff !== 0) {
            const leadingTeam: AreaTeam = diff > 0 ? "green" : "blue";
            const leadingCount = Math.max(greenCount, blueCount);
            const totalCount = greenCount + blueCount;
            const buffs = teamState(leadingTeam).buffs;

            if (now >= buffs.enemyCaptureBlockedUntil) {
                let captureRate = CONTROL_RATE_PER_PLAYER * Math.abs(diff);
                captureRate *= 1 + Math.max(0, totalCount - 2) * 0.12;
                if (now < buffs.controlBoostUntil) {
                    captureRate *= 1.8;
                }

                const controlDelta = captureRate * dt;
                zone.control = leadingTeam === "green"
                    ? clamp(zone.control + controlDelta, -CONTROL_THRESHOLD, CONTROL_THRESHOLD)
                    : clamp(zone.control - controlDelta, -CONTROL_THRESHOLD, CONTROL_THRESHOLD);

                zone.controllingTeam = zone.control >= CONTROL_THRESHOLD ? "green" : zone.control <= -CONTROL_THRESHOLD ? "blue" : null;
            }
        }

        // Award points to any team that currently controls the zone, even if no player is inside
        if (zone.controllingTeam) {
            const controlledTeam = zone.controllingTeam;
            teamState(controlledTeam).score += dt * CONTROL_SCORE_PER_SECOND;
        }
    }
}

function updateFlagCycle(players: Map<string, Player>, broadcast: (msg: any) => void, now: number): void {
    if (snapshot.flag && now >= snapshot.flag.expiresAt) {
        broadcast({
            type: "area_flag_expired",
            flagId: snapshot.flag.id,
            power: snapshot.flag.power,
        });
        snapshot.flag = null;
        snapshot.nextFlagSpawnAt = now + FLAG_DURATION_MS;
    }

    if (!snapshot.flag && now >= snapshot.nextFlagSpawnAt) {
        snapshot.flag = spawnFlag(now);
        broadcast({
            type: "area_flag_spawned",
            flag: { ...snapshot.flag },
        });
    }

}

export function initAreaMode(players: Map<string, Player>, tiles: Tile[], arenaWidth: number, floorY: number): void {
    runtime = {
        arenaWidth,
        floorY,
        playerTeams: new Map(),
        teamOrders: { green: [], blue: [] },
        teamTagIndex: { green: 0, blue: 0 },
    };

    snapshot = emptySnapshot();
    snapshot.zones = createZones(tiles, arenaWidth, floorY);

    const playerList = [...players.values()];
    const totalPlayers = playerList.length;
    const targetTeamSize = Math.ceil(totalPlayers / 2);

    // Separate players by preference
    const wantGreen = playerList.filter(p => p.wantedTeam === "green");
    const wantBlue = playerList.filter(p => p.wantedTeam === "blue");
    const noPreference = playerList.filter(p => !p.wantedTeam);

    // Start with preferred assignments
    const greenIds: string[] = [];
    const blueIds: string[] = [];

    // Add players who want green (up to team size limit)
    for (const player of wantGreen) {
        if (greenIds.length < targetTeamSize) {
            greenIds.push(player.id);
        }
    }

    // Add players who want blue (up to team size limit)
    for (const player of wantBlue) {
        if (blueIds.length < targetTeamSize) {
            blueIds.push(player.id);
        }
    }

    // Handle overflow: players who wanted a team but it's full go to no preference pool
    const rejectedPlayers = [
        ...wantGreen.filter(p => !greenIds.includes(p.id)),
        ...wantBlue.filter(p => !blueIds.includes(p.id)),
        ...noPreference
    ];

    // Shuffle rejected players for fair distribution
    const shuffled = shuffleArray(rejectedPlayers);

    // Fill teams with remaining players
    for (const player of shuffled) {
        if (greenIds.length < targetTeamSize) {
            greenIds.push(player.id);
        } else {
            blueIds.push(player.id);
        }
    }

    // Shuffle each team's order
    const finalGreenIds = shuffleArray(greenIds);
    const finalBlueIds = shuffleArray(blueIds);

    runtime.teamOrders.green = finalGreenIds;
    runtime.teamOrders.blue = finalBlueIds;

    const now = Date.now();
    snapshot.teams.green = {
        team: "green",
        members: [...finalGreenIds],
        tagPlayerId: null,
        score: 0,
        buffs: emptyTeamBuffs(),
    };
    snapshot.teams.blue = {
        team: "blue",
        members: [...finalBlueIds],
        tagPlayerId: null,
        score: 0,
        buffs: emptyTeamBuffs(),
    };

    runtime.playerTeams.clear();
    for (const playerId of finalGreenIds) {
        runtime.playerTeams.set(playerId, "green");
        const player = players.get(playerId)!;
        player.areaTeam = "green";
        player.areaTag = false;
    }
    for (const playerId of finalBlueIds) {
        runtime.playerTeams.set(playerId, "blue");
        const player = players.get(playerId)!;
        player.areaTeam = "blue";
        player.areaTag = false;
    }

    snapshot.nextFlagSpawnAt = now + FLAG_DURATION_MS;
    snapshot.nextTagRotationAt = 0;
}

export function resetAreaMode(players: Map<string, Player>): void {
    players.forEach((player) => {
        player.areaTeam = null;
        player.areaTag = false;
        player.areaTagUntil = 0;
        player.areaFrozenUntil = 0;
        player.areaFrozenMinUntil = 0;
    });

    runtime.playerTeams.clear();
    runtime.teamOrders = { green: [], blue: [] };
    runtime.teamTagIndex = { green: 0, blue: 0 };
    snapshot = emptySnapshot();
}

export function updateAreaMode(
    dt: number,
    players: Map<string, Player>,
    broadcast: (msg: any) => void,
): GameOverResult | null {
    const now = Date.now();

    updateFlagCycle(players, broadcast, now);
    collectFlag(players, now, broadcast);
    updateZones(dt, players, now);

    return null;
}

export function handleAreaRoundEnd(players: Map<string, Player>): GameOverResult {
    const greenScore = snapshot.teams.green.score;
    const blueScore = snapshot.teams.blue.score;

    if (greenScore === blueScore) {
        return {
            mode: "area",
            reason: "Égalité parfaite entre les équipes.",
            winners: [
                { id: 'green', name: 'Équipe verte' },
                { id: 'blue', name: 'Équipe bleue' },
            ],
            winnersList: [
                { id: 'green', name: 'Équipe verte' },
                { id: 'blue', name: 'Équipe bleue' },
            ],
            losersList: [],
        };
    }

    const winningTeam = greenScore > blueScore ? "green" : "blue";
    const winnerTeamId = winningTeam === "green" ? 'green' : 'blue';
    const loserTeamId = winningTeam === "green" ? 'blue' : 'green';

    return {
        mode: "area",
        reason: winningTeam === "green"
            ? "L'équipe verte remporte la partie au score."
            : "L'équipe bleue remporte la partie au score.",
        winners: [{ id: winnerTeamId, name: winnerTeamId === 'green' ? 'Équipe verte' : 'Équipe bleue' }],
        winnersList: [{ id: winnerTeamId, name: winnerTeamId === 'green' ? 'Équipe verte' : 'Équipe bleue' }],
        losersList: [{ id: loserTeamId, name: loserTeamId === 'green' ? 'Équipe verte' : 'Équipe bleue' }],
    };
}

export function getAreaScores(): Record<AreaTeam, number> {
    return {
        green: Math.floor(snapshot.teams.green.score),
        blue: Math.floor(snapshot.teams.blue.score),
    };
}

export function getAreaState(): AreaStateSnapshot {
    return buildStateSnapshot();
}

export function getAreaPlayerTeam(playerId: string): AreaTeam | null {
    return playerTeam(playerId);
}

export function getAreaPlayerSpeedMultiplier(playerId: string): number {
    const team = playerTeam(playerId);
    if (!team) {
        return 1;
    }

    return Date.now() < snapshot.teams[team].buffs.enemySlowUntil ? 0.75 : 1;
}

export function getAreaTagPlayerIds(): { green: string | null; blue: string | null } {
    return {
        green: snapshot.teams.green.tagPlayerId,
        blue: snapshot.teams.blue.tagPlayerId,
    };
}

export function moveAreaFlagTo(x: number, y: number): void {
    if (!snapshot.flag) return;
    const half = Math.floor(snapshot.flag.w / 2) || Math.floor(FLAG_SIZE / 2);
    snapshot.flag.x = clamp(x, half, runtime.arenaWidth - half);
    snapshot.flag.y = clamp(y, 40, runtime.floorY - half);
}
