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
    tiles.push({ id: 'tplf17', x: 336, y: FLOOR_Y - 820, w: 100, h:16, type: 'speedDown'})
    tiles.push({ id: 'tplf18', x: 630, y: FLOOR_Y - 572, w: 112, h: 48, type: 'jumpDown' });
    tiles.push({ id: 'tplf19', x: 742, y: FLOOR_Y - 607, w: 112, h: 83, type: 'jumpDown' });
    tiles.push({ id: 'tplf20', x: 854, y: FLOOR_Y - 642, w: 76, h: 118, type: 'jumpDown' });
    tiles.push({ id: 'tplf21', x: 930, y: FLOOR_Y - 642, w: 40, h: 118, type: 'passable' });
    tiles.push({ id: 'tplf22', x: 970, y: FLOOR_Y - 642, w: 76, h: 118, type: 'jumpDown' });
    tiles.push({ id: 'tplf23', x: 1046, y: FLOOR_Y - 607, w: 112, h: 83, type: 'jumpDown' });
    tiles.push({ id: 'tplf24', x: 1158, y: FLOOR_Y - 572, w: 112, h: 48, type: 'jumpBoost' });

    // Top band across the map
    tiles.push({ id: 'top0', x: 0, y: FLOOR_Y - 930, w: 110, h: 16, type: 'solid' });
    tiles.push({ id: 'top2', x: 260, y: FLOOR_Y - 890, w: 130, h: 16, type: 'passable' });
    tiles.push({ id: 'top3', x: 430, y: FLOOR_Y - 945, w: 100, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'top4', x: 570, y: FLOOR_Y - 980, w: 153, h: 16, type: 'solid' });
    tiles.push({ id: 'top5', x: 760, y: FLOOR_Y - 980, w: 200, h: 16, type: 'speedUp' });
    tiles.push({ id: 'top6', x: 850, y: FLOOR_Y - 780, w: 120, h: 16, type: 'jumpBoost' });
    tiles.push({ id: 'top7', x: 1050, y: FLOOR_Y - 920, w: 110, h: 16, type: 'passable' });
    tiles.push({ id: 'top8', x: 1200, y: FLOOR_Y - 955, w: 160, h: 16, type: 'solid' });
    tiles.push({ id: 'top9', x: 1410, y: FLOOR_Y - 985, w: 90, h: 16, type: 'speedUp' });
    tiles.push({ id: 'top10', x: 1540, y: FLOOR_Y - 940, w: 130, h: 16, type: 'speedDown' });
    tiles.push({ id: 'top12', x: 1870, y: FLOOR_Y - 950, w: 114, h: 16, type: 'solid' });
    tiles.push({ id: 'top13', x: 600, y: FLOOR_Y - 710, w: 130, h: 16, type: 'solid' });

    // Right-side climb to reach the top band
    tiles.push({ id: 'rtop1', x: 1405, y: FLOOR_Y - 695, w: 350, h: 16, type: 'passable' });
    tiles.push({ id: 'rtop2', x: 1560, y: FLOOR_Y - 770, w: 110, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'rtop3', x: 1695, y: FLOOR_Y - 835, w: 100, h: 16, type: 'solid' });
    tiles.push({ id: 'rtop4', x: 1815, y: FLOOR_Y - 890, w: 90, h: 16, type: 'passable' });

    // Bottom right side of the map
    tiles.push({ id: 'btrgt0', x: 1300, y: FLOOR_Y - 80, w: 150, h: 16, type: 'jumpBoost' });
    tiles.push({ id: 'btrgt1', x: 1500, y: FLOOR_Y - 110, w: 120, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'btrgt2', x: 1650, y: FLOOR_Y - 166, w: 100, h: 16, type: 'speedUp' });
    tiles.push({ id: 'btrgt3', x: 1800, y: FLOOR_Y - 150, w: 140, h: 16, type: 'solid' });
    tiles.push({ id: 'btrgt4', x: 1750, y: FLOOR_Y - 235, w: 16, h: 85, type: 'solid' });
    tiles.push({ id: 'btrgt5', x: 1766, y: FLOOR_Y - 235, w: 130, h: 16, type: 'passable' });
    tiles.push({ id: 'btrgt6', x: 1896, y: FLOOR_Y - 235, w: 16, h: 85, type: 'solid' });

    // Top right side of the map
    tiles.push({ id: 'tprgt2', x: 1620, y: FLOOR_Y - 380, w: 120, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'tprgt3', x: 1780, y: FLOOR_Y - 430, w: 100, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'tprgt4', x: 1920, y: FLOOR_Y - 480, w: 40, h: 16, type: 'speedDown' });
    tiles.push({ id: 'tprgt5', x: 1960, y: FLOOR_Y - 600, w: 40, h: 16, type: 'jumpBoost' });

    // Central structure
    tiles.push({ id: 'ctr0', x: 950, y: FLOOR_Y - 300, w: 80, h: 16, type: 'solid' });
    tiles.push({ id: 'ctr1', x: 1050, y: FLOOR_Y - 350, w: 100, h: 16, type: 'speedDown' });
    tiles.push({ id: 'ctr2', x: 1180, y: FLOOR_Y - 400, w: 120, h: 16, type: 'speedUp' });
    tiles.push({ id: 'ctr3', x: 1340, y: FLOOR_Y - 350, w: 100, h: 16, type: 'passable' });
    tiles.push({ id: 'ctr4', x: 1460, y: FLOOR_Y - 315, w: 90, h: 16, type: 'jumpDown' });


    // Jumping columns on right-center
    tiles.push({ id: 'jcr0', x: 1350, y: FLOOR_Y - 500, w: 50, h: 16, type: 'jumpBoost' });
    tiles.push({ id: 'jcr1', x: 1350, y: FLOOR_Y - 600, w: 50, h: 16, type: 'passable' });
    tiles.push({ id: 'jcr2', x: 1450, y: FLOOR_Y - 550, w: 50, h: 16, type: 'jumpDown' });
    tiles.push({ id: 'jcr3', x: 1550, y: FLOOR_Y - 460, w: 50, h: 16, type: 'solid' });

    return tiles;
}
