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
      'Le joueur qui est TAG à la fin du temps imparti perd',
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
      'Tous les survivants gagnents à la fin du temps imparti',
      'Si tous les joueurs sont transformés en ZOMBIES avant la fin du temps, les zombies ayant transformé au moins un joueur gagnent',
      'Ainsi, si un zombie transforme plusieurs joueurs en zombies, il réduit le nombre de gagnants finaux',
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
  area: {
    title: 'Contrôle de zone',
    description: 'Contrôlez des zones pour marquer des points',
    rules: [
      'Il y a deux équipes (Bleu et verte) qui s\'affrontent pour le contrôle de zones sur la carte',
      'Plusieurs zones apparaissent sur la carte',
      "Restez dans une zone pour la capturer et la contrôler",
      "Une zone contrôlée rapporte 1 point par seconde à l'équipe qui la contrôle",
      'Le meilleur temps à la fin de la partie gagne',
      'Des drapeaux apparaisent aléatoirement sur la carte, le joueur qui les capture apporte des bonus à son équipe ou des malus à l\'équipe adverse',
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
      duree: '1:30 min',
      gagnant: '1+',
      tag: '1+',
      minPlayers: 3,
    },
    bomb: {
      duree: '~ 3 min',
      gagnant: '1',
      tag: '1-11',
      minPlayers: 2,
    },
    area: {
      duree: '2:30 min',
      gagnant: '1 équipe',
      tag: '0',
      minPlayers: 2,
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
