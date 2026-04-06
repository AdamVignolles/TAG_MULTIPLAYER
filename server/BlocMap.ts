export type TileType = 'solid' | 'jumpBoost' | 'passable' | 'speedUp' | 'speedDown';

export type Tile = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    type: TileType;
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
        tiles.push({ id: `g${i}`, x: i * TILE_SIZE, y: FLOOR_Y, w: TILE_SIZE, h: GROUND_ROW_HEIGHT, type: 'solid' });
    }

    // Low band
    tiles.push({ id: 'p1', x: 60, y: FLOOR_Y - 60, w: 150, h: 16, type: 'solid' });
    tiles.push({ id: 'p2', x: 0, y: FLOOR_Y - 230, w: 110, h: 16, type: 'jumpBoost' });
    tiles.push({ id: 'p3', x: 130, y: FLOOR_Y - 120, w: 210, h: 16, type: 'speedUp' });
    tiles.push({ id: 'p4', x: 430, y: FLOOR_Y - 65, w: 100, h: 65, type: 'passable' });


    /*
    tiles.push({ id: 'p3', x: 270, y: FLOOR_Y - 120, w: 210, h: 18, type: 'jumpBoost' });
    tiles.push({ id: 'p3', x: 530, y: FLOOR_Y - 120, w: 130, h: 14, type: 'passable' });
    tiles.push({ id: 'p4', x: 730, y: FLOOR_Y - 120, w: 190, h: 16, type: 'speedUp' });
    tiles.push({ id: 'p5', x: 970, y: FLOOR_Y - 120, w: 110, h: 16, type: 'speedDown' });
    tiles.push({ id: 'p6', x: 1140, y: FLOOR_Y - 120, w: 170, h: 20, type: 'solid' });
    tiles.push({ id: 'p7', x: 1370, y: FLOOR_Y - 120, w: 150, h: 16, type: 'passable' });
    tiles.push({ id: 'p8', x: 1580, y: FLOOR_Y - 120, w: 220, h: 18, type: 'jumpBoost' });

    // Middle band
    tiles.push({ id: 'p9', x: 120, y: FLOOR_Y - 300, w: 120, h: 16, type: 'speedUp' });
    tiles.push({ id: 'p10', x: 320, y: FLOOR_Y - 300, w: 180, h: 18, type: 'solid' });
    tiles.push({ id: 'p11', x: 560, y: FLOOR_Y - 300, w: 140, h: 16, type: 'passable' });
    tiles.push({ id: 'p12', x: 770, y: FLOOR_Y - 300, w: 240, h: 20, type: 'jumpBoost' });
    tiles.push({ id: 'p13', x: 1060, y: FLOOR_Y - 300, w: 100, h: 14, type: 'speedDown' });
    tiles.push({ id: 'p14', x: 1240, y: FLOOR_Y - 300, w: 160, h: 16, type: 'solid' });
    tiles.push({ id: 'p15', x: 1470, y: FLOOR_Y - 300, w: 210, h: 18, type: 'passable' });
    tiles.push({ id: 'p16', x: 1740, y: FLOOR_Y - 300, w: 120, h: 16, type: 'speedUp' });

    // Upper band
    tiles.push({ id: 'p17', x: 40, y: FLOOR_Y - 500, w: 170, h: 16, type: 'passable' });
    tiles.push({ id: 'p18', x: 290, y: FLOOR_Y - 500, w: 130, h: 18, type: 'solid' });
    tiles.push({ id: 'p19', x: 490, y: FLOOR_Y - 500, w: 220, h: 16, type: 'speedDown' });
    tiles.push({ id: 'p20', x: 790, y: FLOOR_Y - 500, w: 150, h: 20, type: 'jumpBoost' });
    tiles.push({ id: 'p21', x: 1010, y: FLOOR_Y - 500, w: 190, h: 16, type: 'solid' });
    tiles.push({ id: 'p22', x: 1260, y: FLOOR_Y - 500, w: 140, h: 14, type: 'speedUp' });
    tiles.push({ id: 'p23', x: 1470, y: FLOOR_Y - 500, w: 200, h: 18, type: 'passable' });
    tiles.push({ id: 'p24', x: 1730, y: FLOOR_Y - 500, w: 140, h: 16, type: 'solid' });

    // High band
    tiles.push({ id: 'p25', x: 80, y: FLOOR_Y - 700, w: 140, h: 16, type: 'speedDown' });
    tiles.push({ id: 'p26', x: 300, y: FLOOR_Y - 700, w: 200, h: 18, type: 'jumpBoost' });
    tiles.push({ id: 'p27', x: 560, y: FLOOR_Y - 700, w: 110, h: 14, type: 'solid' });
    tiles.push({ id: 'p28', x: 740, y: FLOOR_Y - 700, w: 170, h: 16, type: 'passable' });
    tiles.push({ id: 'p29', x: 980, y: FLOOR_Y - 700, w: 240, h: 20, type: 'speedUp' });
    tiles.push({ id: 'p30', x: 1280, y: FLOOR_Y - 700, w: 130, h: 16, type: 'solid' });
    tiles.push({ id: 'p31', x: 1500, y: FLOOR_Y - 700, w: 180, h: 18, type: 'passable' });
    tiles.push({ id: 'p32', x: 1740, y: FLOOR_Y - 700, w: 150, h: 16, type: 'jumpBoost' });

    // Very high band
    tiles.push({ id: 'p33', x: 140, y: FLOOR_Y - 900, w: 160, h: 16, type: 'solid' });
    tiles.push({ id: 'p34', x: 380, y: FLOOR_Y - 900, w: 120, h: 18, type: 'speedUp' });
    tiles.push({ id: 'p35', x: 560, y: FLOOR_Y - 900, w: 210, h: 16, type: 'passable' });
    tiles.push({ id: 'p36', x: 830, y: FLOOR_Y - 900, w: 140, h: 14, type: 'jumpBoost' });
    tiles.push({ id: 'p37', x: 1040, y: FLOOR_Y - 900, w: 180, h: 16, type: 'solid' });
    tiles.push({ id: 'p38', x: 1280, y: FLOOR_Y - 900, w: 250, h: 20, type: 'speedDown' });
    tiles.push({ id: 'p39', x: 1590, y: FLOOR_Y - 900, w: 120, h: 16, type: 'passable' });
    */
    return tiles;
}
