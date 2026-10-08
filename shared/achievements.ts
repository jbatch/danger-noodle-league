export const ACHIEVEMENTS = {
  'first-win': {
    label: 'First Bite',
    mark: 'Ⅰ',
    description: 'Win your first Survival round.',
  },
  'league-champion': {
    label: 'League Champion',
    mark: '★',
    description: 'Win a complete Survival match.',
  },
  'full-house': {
    label: 'Full House',
    mark: '8',
    description: 'Win a Survival round that started with eight players.',
  },
  'clean-sweep': {
    label: 'Clean Sweep',
    mark: '◇',
    description: 'Win a round without taking damage or losing a head.',
  },
  'fully-grown': {
    label: 'Fully Grown',
    mark: '◆',
    description: 'Reach the maximum tail length in one round.',
  },
  'egg-carton': {
    label: 'Egg Carton',
    mark: '●',
    description: 'Collect 12 eggs in one Survival round.',
  },
  'power-tour': {
    label: 'Power Tour',
    mark: 'ϟ',
    description: 'Activate all seven core power-ups in one round.',
  },
  'air-time': {
    label: 'Air Time',
    mark: '↑',
    description: 'Launch 20 jumps in one Survival round.',
  },
  'hard-headed': {
    label: 'Hard Headed',
    mark: '×',
    description: 'Lose three heads in one Survival round.',
  },
} as const;

export type AchievementId = keyof typeof ACHIEVEMENTS;

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];

export function normalizeAchievementIds(value: unknown): AchievementId[] {
  if (!Array.isArray(value)) return [];
  const requested = new Set(value.filter((id) => typeof id === 'string'));
  return ACHIEVEMENT_IDS.filter((id) => requested.has(id));
}
