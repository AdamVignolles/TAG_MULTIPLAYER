export interface GameOverResult {
    mode: 'classic' | 'zombie' | 'bomb';
    reason: string;
    winners: {
        id: string;
        name: string;
    }[];
    loser?: {
        id: string;
        name: string;
    };
    winnerId?: string;
}
