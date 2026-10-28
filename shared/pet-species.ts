export const petSpecies = [
  'dog', 'cat', 'rabbit', 'hamster', 'guineaPig', 'rat', 'mouse', 'chinchilla',
  'ferret', 'hedgehog', 'bird', 'parrot', 'fish', 'turtle', 'snake', 'lizard',
  'frog', 'axolotl', 'spider', 'snail', 'pet'
] as const

export type PetSpecies = typeof petSpecies[number]
