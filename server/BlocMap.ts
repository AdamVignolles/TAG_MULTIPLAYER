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
    tiles.push({ id: 'btlf0', x: 60, y: FLOOR_Y - 60, w: 150, h: 16, type: 'solid' });
    tiles.push({ id: 'btlf1', x: 0, y: FLOOR_Y - 230, w: 110, h: 16, type: 'jumpBoost' });
    tiles.push({ id: 'btlf2', x: 130, y: FLOOR_Y - 150, w: 210, h: 16, type: 'speedUp' });
    tiles.push({ id: 'btlf3', x: 430, y: FLOOR_Y - 65, w: 16, h: 65, type: 'solid' });
    tiles.push({ id: 'btlf4', x: 446, y: FLOOR_Y - 65, w: 150, h: 16, type: 'passable' });
    tiles.push({ id: 'btlf5', x: 596, y: FLOOR_Y - 65, w: 16, h: 65, type: 'solid' });
    tiles.push({ id: 'btlf6', x: 612, y: FLOOR_Y - 230, w: 110, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'btlf7', x: 750, y: FLOOR_Y - 120, w: 210, h: 16, type: 'speedDown' });
    tiles.push({ id: 'btlf8', x: 94, y: FLOOR_Y - 394, w: 16, h: 74, type: 'solid' });
    tiles.push({ id: 'btlf9', x: 110, y: FLOOR_Y - 394, w: 150, h: 16, type: 'solid' });
    tiles.push({ id: 'btlf10', x: 94, y: FLOOR_Y - 540, w: 16, h: 111, type: 'solid' });
    tiles.push({ id: 'btlf11', x: 110, y: FLOOR_Y - 445, w: 150, h: 16, type: 'solid' });
    tiles.push({ id: 'btlf12', x: 507, y: FLOOR_Y - 270, w: 36, h: 16, type: 'jumpBoost'});

    // Left top left side of the map
    tiles.push({ id: 'tplf0', x: 110, y: FLOOR_Y - 540, w: 150, h: 16, type: 'passable' });
    tiles.push({ id: 'tplf1', x: 260, y: FLOOR_Y - 540, w: 70, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'tplf2', x: 410, y: FLOOR_Y - 540, w: 70, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'tplf3', x: 560, y: FLOOR_Y - 540, w: 70, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'tplf4', x: 110, y: FLOOR_Y - 635, w: 150, h: 16, type: 'passable' });
    tiles.push({ id: 'tplf5', x: 165, y: FLOOR_Y - 820, w: 40, h: 16, type: 'passable' });
    tiles.push({ id: 'tplf6', x: 34, y: FLOOR_Y - 820, w: 131, h: 16, type: 'solid' });
    tiles.push({ id: 'tplf7', x: 205, y: FLOOR_Y - 820, w: 131, h: 16, type: 'solid' });
    tiles.push({ id: 'tplf8', x: 149, y: FLOOR_Y - 804, w: 16, h: 100, type: 'solid' });
    tiles.push({ id: 'tplf9', x: 205, y: FLOOR_Y - 804, w: 16, h: 100, type: 'solid' });
    tiles.push({ id: 'tplf10', x: 34, y: FLOOR_Y - 635, w: 76, h: 16, type: 'solid' });
    tiles.push({ id: 'tplf11', x: 260, y: FLOOR_Y - 635, w: 300, h: 16, type: 'speedUp' });
    tiles.push({ id: 'tplf12', x: 34, y: FLOOR_Y - 804, w: 16, h: 67, type: 'solid' });
    tiles.push({ id: 'tplf13', x: 34, y: FLOOR_Y - 702, w: 16, h: 67, type: 'solid' });
    tiles.push({ id: 'tplf14', x: 50, y: FLOOR_Y - 753, w: 18, h: 16, type: 'solid' });
    tiles.push({ id: 'tplf15', x: 50, y: FLOOR_Y - 702, w: 18, h: 16, type: 'solid' });
    tiles.push({ id: 'tplf16', x: 68, y: FLOOR_Y - 753, w: 16, h: 67, type: 'solid' });


    
    // Left bottom right side of the map


    return tiles;
}
