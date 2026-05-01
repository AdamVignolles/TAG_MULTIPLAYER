export interface ModeDescription {
  title: string;
  description: string;
  rules: string[];
}

export interface GameStats {
  duree: string;
  gagnant: string | number;
  tag: string;
  minPlayers: number;
}

const modeDescriptions: Record<string, ModeDescription> = {
  classic: {
    title: 'Classique',
    description: 'Un contre tous dans une course poursuite effrénée!',
    rules: [
      'Jeu très similaire au jeu du chat',
      'Un seul joueur commence en tant que TAG (poursuivant)',
      'Le joueur TAG doit toucher un autre joueur pour lui transférer le statut.',
      'Le joueur qui est TAG à la fin du temps imparti (60 secondes) perd',
      'Les autres joueurs ont gagnés',
    ],
  },
  zombie: {
    title: 'Zombie',
    description: 'Un mode où les TAG se multiplient comme une épidémie!',
    rules: [
      'Un joueur commence en tant que ZOMBIE (TAG)',
      'Chaque joueur touché devient ZOMBIE',
      'Un joueur qui devient zombie est immobile pendant 3 secondes avant de pouvoir bouger à nouveau',
      'Les ZOMBIES restent ZOMBIES pendant toute la partie',
      'Tous les survivants gagnents à la fin du temps imparti (60 secondes)',
      'Pour qu\'un ZOMBIE gagne, il doit transformer un autre joueur en ZOMBIE et que tous les joueurs soient des ZOMBIES à la fin du temps imparti',
    ],
  },
  bomb: {
    title: 'Bombe',
    description: 'Passez-la avant qu\'elle n\'explose!',
    rules: [
      'Chaque joueur possède un compteur personnel de 12 à 40s selon le nombre de joueurs (visible sur son controleur)',
      'Au début de la partie, un à plusieurs joueurs sont désignés aléatoirement comme TAG (porteurs de la bombe) selon le nombre de joueurs',
      'Chaque seconde passée en tant que TAG réduit le compteur.',
      'Le joueur qui voit son compteur atteindre zéro perd la partie (la bombe explose)',
      'Si un joueur TAG touche un autre joueur, il lui transfère la bombe et son compteur personnel se met en pause pendant que le compteur du nouveau TAG commence à diminuer',
      'Tant que le nombre de joueurs non-TAG est supérieur au nombre de joueurs TAG, être éliminé va désigner un joueur aléatoire comme nouveau porteur de la bombe, et le compteur de ce joueur recommence à 10 secondes',
      'A la fin de la partie, il n\'y a qu\'un seul gagnant, le dernier joueur non-TAG restant',
    ],
  },
};

export const getModeDescription = (mode: string) => {
  return modeDescriptions[mode];
};

export const getModeRules = (mode: string) => {
  const description = modeDescriptions[mode];
  return description?.rules || [];
};

export const getGameStats = (mode: string, playerCount: number): GameStats => {
  const statsMap: Record<string, GameStats> = {
    classic: {
      duree: '2:30 min',
      gagnant: playerCount <= 2 ? '1+' : playerCount - 1,
      tag: '1',
      minPlayers: 2,
    },
    zombie: {
      duree: '30/60 sec',
      gagnant: '1+',
      tag: '1+',
      minPlayers: 4,
    },
    bomb: {
      duree: '~ 3 min',
      gagnant: '1',
      tag: '1-11',
      minPlayers: 3,
    },
  };
  return statsMap[mode] || { duree: '', gagnant: '', tag: '', minPlayers: 0 };
};

export const isMinPlayersReached = (playerCount: number, minPlayers: number): boolean => {
  return playerCount >= minPlayers;
};

export const getFrenchMode = (mode: string) => {
  const description = modeDescriptions[mode];
  return description?.title.toLowerCase() || mode;
}
