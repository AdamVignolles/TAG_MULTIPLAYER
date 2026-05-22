export interface GameOverResult {
    mode: 'classic' | 'zombie' | 'bomb' | 'area';
    reason: string;
    winners: {
        id: string;
        name: string;
    }[];
    winnersList: {
        id: string;
        name: string;
    }[];
    losersList: {
        id: string;
        name: string;
    }[];
}
