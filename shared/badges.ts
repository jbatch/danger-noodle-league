export const COMMENDATIONS = {
  winner: {
    label: 'Winner',
    shortLabel: 'WIN',
    mark: '★',
    description: 'Be the last player alive in a Survival round.',
  },
  'longest-noodle': {
    label: 'Longest Noodle',
    shortLabel: 'LONGEST',
    mark: '〰',
    description: 'Finish the round with the longest remaining tail.',
  },
  'peak-noodle': {
    label: 'Peak Noodle',
    shortLabel: 'PEAK',
    mark: '▲',
    description: 'Reach the greatest tail length during the round.',
  },
  'maxed-out': {
    label: 'Maxed Out',
    shortLabel: 'MAX',
    mark: '◆',
    description: 'Reach the maximum tail length during the round.',
  },
  'egg-lord': {
    label: 'Egg Lord',
    shortLabel: 'EGGS',
    mark: '●',
    description: 'Collect the most eggs during the round.',
  },
  untouchable: {
    label: 'Untouchable',
    shortLabel: 'CLEAN',
    mark: '◇',
    description: 'Win without taking damage or losing a head.',
  },
  'frequent-flyer': {
    label: 'Frequent Flyer',
    shortLabel: 'JUMPS',
    mark: '↑',
    description: 'Launch the most jumps during the round.',
  },
  'power-player': {
    label: 'Power Player',
    shortLabel: 'POWERS',
    mark: 'ϟ',
    description: 'Activate the most power-ups during the round.',
  },
  survivor: {
    label: 'Survivor',
    shortLabel: 'RUNNER-UP',
    mark: 'Ⅰ',
    description: 'Be the last eliminated player who did not win.',
  },
  'crash-test': {
    label: 'Crash Test',
    shortLabel: 'HEADS',
    mark: '×',
    description: 'Lose the most heads during the round.',
  },
} as const;

export type CommendationId = keyof typeof COMMENDATIONS;
export type CommendationCounts = Partial<Record<CommendationId, number>>;

export const COMMENDATION_IDS = Object.keys(COMMENDATIONS) as CommendationId[];

export function normalizeCommendationCounts(
  value: unknown,
): CommendationCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    COMMENDATION_IDS.flatMap((id) => {
      const count = source[id];
      return Number.isSafeInteger(count) && (count as number) > 0
        ? [[id, count as number]]
        : [];
    }),
  ) as CommendationCounts;
}
