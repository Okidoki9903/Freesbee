// Dog catalogue. Stats go from 1 to 10 and are turned into physics by dogParams().
export const STAT_LABELS = {
  vitesse: 'Vitesse',
  accel: 'Démarrage',
  agilite: 'Agilité',
  saut: 'Saut',
  endurance: 'Endurance',
  gueule: 'Gueule',
};

export const BREEDS = [
  {
    id: 'collie', name: 'Border Collie',
    tag: 'Le génie du frisbee. Vif, endurant et précis.',
    stats: { vitesse: 7, accel: 8, agilite: 9, saut: 8, endurance: 8, gueule: 8 },
    look: { scale: 1, legLen: 1, bodyLen: 1, girth: 1, neck: 1, head: 1, snout: 1, ears: 'semi', tail: 'plume',
      coat: { base: 0x1c1c1f, second: 0xf4f1ea, pattern: 'collie' } },
  },
  {
    id: 'greyhound', name: 'Lévrier',
    tag: 'Le plus rapide du parc, mais il tourne large.',
    stats: { vitesse: 10, accel: 9, agilite: 4, saut: 5, endurance: 4, gueule: 5 },
    look: { scale: 1.08, legLen: 1.3, bodyLen: 1.12, girth: 0.78, neck: 1.3, head: 0.85, snout: 1.45, ears: 'rose', tail: 'thin',
      coat: { base: 0xa9a39b, second: 0xe9e4dc, pattern: 'chest' } },
  },
  {
    id: 'jack', name: 'Jack Russell',
    tag: 'Un petit ressort. Démarre et saute comme personne.',
    stats: { vitesse: 5, accel: 10, agilite: 10, saut: 9, endurance: 7, gueule: 4 },
    look: { scale: 0.66, legLen: 0.88, bodyLen: 0.92, girth: 1.02, neck: 0.85, head: 1.08, snout: 0.9, ears: 'fold', tail: 'stub',
      coat: { base: 0xf6f2ea, second: 0xb8732e, pattern: 'patches' } },
  },
  {
    id: 'malinois', name: 'Berger malinois',
    tag: 'Le roi du saut. Puissant et explosif.',
    stats: { vitesse: 8, accel: 8, agilite: 7, saut: 10, endurance: 7, gueule: 7 },
    look: { scale: 1.1, legLen: 1.06, bodyLen: 1.05, girth: 1, neck: 1.1, head: 1.05, snout: 1.15, ears: 'point', tail: 'long',
      coat: { base: 0xc58a45, second: 0x24190f, pattern: 'mask' } },
  },
  {
    id: 'labrador', name: 'Labrador',
    tag: 'Une gueule en or : rien ne lui échappe. Mais il est lourd.',
    stats: { vitesse: 6, accel: 5, agilite: 5, saut: 5, endurance: 9, gueule: 10 },
    look: { scale: 1.1, legLen: 0.94, bodyLen: 1.05, girth: 1.22, neck: 1, head: 1.15, snout: 1.05, ears: 'flop', tail: 'otter',
      coat: { base: 0xe0b56e, second: 0xeed3a0, pattern: 'solid' } },
  },
  {
    id: 'husky', name: 'Husky',
    tag: 'Infatigable. Il sprinte encore quand les autres soufflent.',
    stats: { vitesse: 8, accel: 6, agilite: 6, saut: 6, endurance: 10, gueule: 6 },
    look: { scale: 1.08, legLen: 1, bodyLen: 1, girth: 1.12, neck: 1, head: 1.05, snout: 1, ears: 'point', tail: 'curl',
      coat: { base: 0x5f636a, second: 0xf3f3f1, pattern: 'husky' }, eyes: 0x4aa8ff },
  },
  {
    id: 'corgi', name: 'Corgi',
    tag: 'Pattes courtes, cœur immense. Il tourne sur place.',
    stats: { vitesse: 4, accel: 8, agilite: 9, saut: 3, endurance: 8, gueule: 6 },
    look: { scale: 0.82, legLen: 0.5, bodyLen: 1.18, girth: 1.15, neck: 0.8, head: 1.12, snout: 0.95, ears: 'bat', tail: 'stub',
      coat: { base: 0xd9832f, second: 0xfaf3e6, pattern: 'corgi' } },
  },
  {
    id: 'dalmatian', name: 'Dalmatien',
    tag: 'Élégant et endurant. Bon partout, champion nulle part.',
    stats: { vitesse: 8, accel: 7, agilite: 6, saut: 7, endurance: 9, gueule: 6 },
    look: { scale: 1.08, legLen: 1.08, bodyLen: 1.02, girth: 0.95, neck: 1.1, head: 1, snout: 1.1, ears: 'flop', tail: 'long',
      coat: { base: 0xf7f5f0, second: 0x151515, pattern: 'spots' } },
  },
];

export function dogParams(breed) {
  const s = breed.stats;
  const run = 6.8 + s.vitesse * 0.48;
  return {
    run,                                   // m/s at a normal run
    sprint: run * (1.3 + s.vitesse * 0.01),
    accel: 9 + s.accel * 1.6,              // m/s²
    turnLow: 6 + s.agilite * 0.6,          // rad/s when slow
    turnHigh: 1.5 + s.agilite * 0.34,      // rad/s at full sprint
    jumpVy: 4.2 + s.saut * 0.26,           // take-off speed: ~1 m (corgi) to ~1.8 m (malinois) with a held jump
    leap: 1.0 + s.saut * 0.32,             // extra horizontal speed when leaping at the disc
    drain: 0.66 - s.endurance * 0.045,     // stamina per second while sprinting
    regen: 0.16 + s.endurance * 0.013,
    reach: 0.34 + s.gueule * 0.04,         // how far the head can snap (m)
    grip: 15 + s.gueule * 1.3,             // max disc/mouth closing speed that still holds
  };
}
