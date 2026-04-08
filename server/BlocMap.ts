export type TileType = 'solid' | 'jumpBoost' | 'jumpDown' | 'passable' | 'speedUp' | 'speedDown';

export type Tile = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    type: TileType;
    className?: string;
};

export const TILE_SIZE = 64;
export const ARENA_WIDTH = 1984;
export const ARENA_HEIGHT = 1100;
export const GROUND_ROW_HEIGHT = 50;
export const FLOOR_Y = ARENA_HEIGHT - GROUND_ROW_HEIGHT;

export function createSimpleMap(playerRadius: number): Tile[] {
    const tiles: Tile[] = [];

    // ground row
    for (let i = 0; i < Math.floor(ARENA_WIDTH / TILE_SIZE); i++) {
        tiles.push({ id: `g${i}`, x: i * TILE_SIZE, y: FLOOR_Y, w: TILE_SIZE, h: GROUND_ROW_HEIGHT, type: 'solid', className: 'ground' });
    }

    // Left bottom left side of the map
    tiles.push({ id: 'p1', x: 60, y: FLOOR_Y - 60, w: 150, h: 16, type: 'solid' });
    tiles.push({ id: 'p2', x: 0, y: FLOOR_Y - 230, w: 110, h: 16, type: 'jumpBoost' });
    tiles.push({ id: 'p3', x: 130, y: FLOOR_Y - 120, w: 210, h: 16, type: 'speedUp' });
    tiles.push({ id: 'p4', x: 430, y: FLOOR_Y - 65, w: 16, h: 65, type: 'solid' });
    tiles.push({ id: 'p5', x: 446, y: FLOOR_Y - 65, w: 150, h: 16, type: 'passable' });
    tiles.push({ id: 'p6', x: 596, y: FLOOR_Y - 65, w: 16, h: 65, type: 'solid' });
    tiles.push({ id: 'p7', x: 612, y: FLOOR_Y - 230, w: 110, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'p8', x: 750, y: FLOOR_Y - 120, w: 210, h: 16, type: 'speedDown' });
    tiles.push({ id: 'p9', x: 94, y: FLOOR_Y - 394, w: 16, h: 74, type: 'solid' });
    tiles.push({ id: 'p10', x: 110, y: FLOOR_Y - 394, w: 150, h: 16, type: 'solid' });
    tiles.push({ id: 'p11', x: 94, y: FLOOR_Y - 540, w: 16, h: 111, type: 'solid' });
    tiles.push({ id: 'p12', x: 110, y: FLOOR_Y - 540, w: 150, h: 16, type: 'passable' });
    tiles.push({ id: 'p13', x: 110, y: FLOOR_Y - 445, w: 150, h: 16, type: 'solid' });
    tiles.push({ id: 'p14', x: 300, y: FLOOR_Y - 540, w: 70, h: 16, type: 'jumpDown' });

    // Left bottom right side of the map


    return tiles;
}
