const colorBackgroundMap: Record<string, string> = {
  yellow: 'rgba(255, 255, 0, 0.08)',
  red: 'rgba(245, 187, 187, 0.75)',
  green: 'rgba(25, 240, 79, 0.08)',
  blue: 'rgba(12, 51, 92, 0.56)',
  purple: 'rgba(46, 14, 46, 0.7)',
};

export const getReadableBackground = (color: string) => {
  return colorBackgroundMap[color];
};

const colorMap: Record<string, string> = {
  yellow: 'yellow',
  red: '#b90707',
  green: '#3deb08',
  blue: '#00aeff',
  purple: '#9615ff',
};

export const getReadableColor= (color: string) => {
  return colorMap[color];
};

export const getFrenchColor = (color: string) => {
  if (color === 'yellow') return "Jaune"
  else if (color === 'red') return "Rouge"
  else if (color === 'green') return "Vert"
  else if (color === 'blue') return "Bleu"
  else return "Violet"
}
