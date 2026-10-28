import type { PetSpecies } from '../../shared/pet-species'

// Existing Lucide animals and small, original outline drawings share a 24px grid.
// Paths are bundled locally; selecting an animal never downloads another image.
export const petSpeciesIcons: Record<PetSpecies, { icon: string } | { paths: string[] }> = {
  dog: { icon: 'i-lucide-dog' },
  cat: { icon: 'i-lucide-cat' },
  rabbit: { icon: 'i-lucide-rabbit' },
  hamster: { paths: [
    'M6 9C2 7 4 3 7 5L9 7M18 9C22 7 20 3 17 5L15 7',
    'M5 12C5 5 19 5 19 12C23 17 19 22 15 20C13 22 11 22 9 20C5 22 1 17 5 12Z',
    'M8 12h.01M16 12h.01M10 15l2 2 2-2ZM12 17v2M6 16h1M17 16h1'
  ] },
  guineaPig: { paths: [
    'M6 8C3 4 7 2 9 6M16 6C18 2 22 5 19 9',
    'M5 9C8 4 17 4 20 10C23 16 19 21 12 21C4 21 1 16 5 9Z',
    'M8 11h.01M16 11h.01M10 14l2 2 2-2M12 16v2M7 18l2-1M17 18l-2-1'
  ] },
  rat: { icon: 'i-lucide-rat' },
  mouse: { paths: [
    'M9 10C2 11 1 3 6 3C9 3 11 5 11 8M15 10C22 11 23 3 18 3C15 3 13 5 13 8',
    'M7 11C7 7 17 7 17 11L15 18Q12 23 9 18Z',
    'M9 12h.01M15 12h.01M11 17h2M6 15l-3-1M6 17l-3 1M18 15l3-1M18 17l3 1'
  ] },
  chinchilla: { paths: [
    'M7 10C1 8 3 1 7 3Q10 4 10 8M17 10C23 8 21 1 17 3Q14 4 14 8',
    'M5 13C5 7 19 7 19 13C21 20 16 22 12 20C8 22 3 20 5 13Z',
    'M8 13h.01M16 13h.01M11 16h2M12 16v2M6 16l-3-1M6 18l-3 1M18 16l3-1M18 18l3 1'
  ] },
  ferret: { paths: [
    'M7 7C3 2 1 8 5 11M17 7C21 2 23 8 19 11',
    'M5 10C5 4 19 4 19 10L16 18Q12 23 8 18Z',
    'M6 11Q8 8 11 12M18 11Q16 8 13 12M8 12h.01M16 12h.01M10 16l2 2 2-2M12 18v1'
  ] },
  hedgehog: { paths: [
    'M3 16L2 12l3-1-1-4 4 1 1-5 3 3 3-3 1 5 4-1-1 4 3 1-1 4',
    'M5 16C5 10 19 10 19 16Q18 22 12 21Q6 22 5 16Z',
    'M8 16h.01M16 16h.01M11 19h2'
  ] },
  bird: { icon: 'i-lucide-bird' },
  parrot: { paths: [
    'M16 10C11 10 11 4 15 4C18 4 20 6 20 9H16L18 12L15 11',
    'M15 4C9 1 5 6 6 12L4 21l6-4C16 17 18 14 16 10',
    'M9 10Q7 15 12 14M10 17v4M8 21h5M15 7h.01'
  ] },
  fish: { icon: 'i-lucide-fish' },
  turtle: { icon: 'i-lucide-turtle' },
  snake: { paths: [
    'M14 4C14 1 21 2 21 5C21 9 16 9 12 10C6 11 5 14 10 15L15 16C22 18 17 23 8 21C4 20 2 18 3 15',
    'M14 5C14 8 8 7 6 10C2 14 6 18 11 18H15M19 5h.01M21 5h2M22 4v2'
  ] },
  lizard: { paths: [
    'M10 4Q12 1 14 4L15 8Q18 12 14 16C11 19 17 23 21 19M10 4L9 8Q6 12 10 16',
    'M9 8L5 6 3 8M15 8l4-2 2 2M9 14l-4 2-2-2M15 14l4 2 2-2M11 5h.01M13 5h.01'
  ] },
  frog: { paths: [
    'M5 10C1 6 7 2 9 7Q12 5 15 7C17 2 23 6 19 10C23 18 18 21 12 20C6 21 1 18 5 10Z',
    'M6 7h.01M18 7h.01M7 14Q12 18 17 14M5 18l-3 3M19 18l3 3'
  ] },
  axolotl: { paths: [
    'M6 10L3 7M6 13H2M6 16l-3 3M18 10l3-3M18 13h4M18 16l3 3',
    'M6 12C6 5 18 5 18 12V15C18 22 6 22 6 15Z',
    'M9 12h.01M15 12h.01M9 16Q12 18 15 16M3 7V4M21 7V4'
  ] },
  spider: { paths: [
    'M9 9C9 4 15 4 15 9M8 14C8 7 16 7 16 14C16 21 8 21 8 14Z',
    'M9 9L5 6V3M15 9l4-3V3M8 12l-5-2-1-3M16 12l5-2 1-3M8 15H4l-2 3M16 15h4l2 3M9 18l-3 2v2M15 18l3 2v2'
  ] },
  snail: { icon: 'i-lucide-snail' },
  pet: { icon: 'i-lucide-paw-print' }
}
