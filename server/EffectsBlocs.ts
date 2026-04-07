import type { Tile } from "./BlocMap.ts";

type Player = {
    vx: number;
    vy: number;
    gravityMultiplier: number;
};

type Mode = {
    jumpForce: number;
};

type TileEffectContext = 'landing' | 'ground';

export function applyTileEffects(player: Player, tile: Tile, mode: Mode, context: TileEffectContext) {
    switch (tile.type) {
        case 'jumpBoost':
            if (context === 'landing' || context === 'ground') {
                player.gravityMultiplier = 0.6;
            }
            break;

        case 'jumpDown':
            if (context === 'landing' || context === 'ground') {
                player.gravityMultiplier = 1.6;
            }
            break;

        case 'speedUp':
            if (context === 'ground') {
                player.vx *= 1.8;
            }
            if (context === 'ground' || context === 'landing') {
                player.gravityMultiplier = 1;
            }
            break;

        case 'speedDown':
            if (context === 'ground') {
                player.vx *= 0.7;
            }
            if (context === 'ground' || context === 'landing') {
                player.gravityMultiplier = 1;
            }
            break;

        case 'solid':

        case 'passable':
            if (context === 'landing' || context === 'ground') {
                player.gravityMultiplier = 1;
            }
            break;
    }
}