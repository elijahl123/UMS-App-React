// Maps a course's stored color key (e.g. "course-emerald") to background/text colors for UI chips.
export interface CourseColor {
  bg: string;
  text: string;
  border: string;
}

const colorMap: Record<string, CourseColor> = {
  'course-amethyst': { bg: 'var(--course-amethyst)', text: 'var(--course-amethyst-text)', border: 'var(--course-amethyst-border)' },
  'course-diamond': { bg: 'var(--course-diamond)', text: 'var(--course-diamond-text)', border: 'var(--course-diamond-border)' },
  'course-emerald': { bg: 'var(--course-emerald)', text: 'var(--course-emerald-text)', border: 'var(--course-emerald-border)' },
  'course-ruby': { bg: 'var(--course-ruby)', text: 'var(--course-ruby-text)', border: 'var(--course-ruby-border)' },
  'course-peridot': { bg: 'var(--course-peridot)', text: 'var(--course-peridot-text)', border: 'var(--course-peridot-border)' },
  'course-sapphire': { bg: 'var(--course-sapphire)', text: 'var(--course-sapphire-text)', border: 'var(--course-sapphire-border)' },
  'course-tourmaline': { bg: 'var(--course-tourmaline)', text: 'var(--course-tourmaline-text)', border: 'var(--course-tourmaline-border)' },
  'course-citrine': { bg: 'var(--course-citrine)', text: 'var(--course-citrine-text)', border: 'var(--course-citrine-border)' },
};

const fallback = { bg: 'var(--course-diamond)', text: 'var(--course-diamond-text)', border: 'var(--course-diamond-border)' };

export const courseColorOptions = [
  { key: 'course-amethyst', label: 'Amethyst' },
  { key: 'course-diamond', label: 'Diamond' },
  { key: 'course-emerald', label: 'Emerald' },
  { key: 'course-ruby', label: 'Ruby' },
  { key: 'course-peridot', label: 'Peridot' },
  { key: 'course-sapphire', label: 'Sapphire' },
  { key: 'course-tourmaline', label: 'Tourmaline' },
  { key: 'course-citrine', label: 'Citrine' },
];

export function getCourseColor(colorKey: string | undefined): CourseColor {
  if (!colorKey) return fallback;
  return colorMap[colorKey] ?? fallback;
}
