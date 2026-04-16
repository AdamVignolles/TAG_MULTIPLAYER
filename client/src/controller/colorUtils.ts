export const getReadableBackground = (color: string) => {
  if (color === 'yellow' || color === 'green') {
    return "#000";
  }

  else {
    return "#FFF";
  }
};

export const getFrenchColor = (color: string) => {
  if (color === 'yellow') return "Jaune"
  else if (color === 'red') return "Rouge"
  else if (color === 'green') return "Vert"
  else if (color === 'blue') return "Bleu"
  else return "Violet"
}
