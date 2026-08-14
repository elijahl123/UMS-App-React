// Maps a course's stored color key (e.g. "course-green") to background/text colors for UI chips.
export interface CourseColor {
  bg: string;
  text: string;
  border: string;
}

const colorMap: Record<string, CourseColor> = {
  'course-green': { bg: 'var(--course-green)', text: 'var(--course-green-text)', border: 'var(--course-green-border)' },
  'course-blue': { bg: 'var(--course-blue)', text: 'var(--course-blue-text)', border: 'var(--course-blue-border)' },
  'course-yellow': { bg: 'var(--course-yellow)', text: 'var(--course-yellow-text)', border: 'var(--course-yellow-border)' },
  'course-gray': { bg: 'var(--course-gray)', text: 'var(--course-gray-text)', border: 'var(--course-gray-border)' },
  'course-teal': { bg: 'var(--course-teal)', text: 'var(--course-teal-text)', border: 'var(--course-teal-border)' },
  'course-purple': { bg: 'var(--course-purple)', text: 'var(--course-purple-text)', border: 'var(--course-purple-border)' },
  'course-pink': { bg: 'var(--course-pink)', text: 'var(--course-pink-text)', border: 'var(--course-pink-border)' },
  'course-red': { bg: 'var(--course-red)', text: 'var(--course-red-text)', border: 'var(--course-red-border)' },
};

const fallback = { bg: 'var(--course-gray)', text: 'var(--course-gray-text)', border: 'var(--course-gray-border)' };

export const courseColorOptions = [
  { key: 'course-green', label: 'Green' },
  { key: 'course-blue', label: 'Blue' },
  { key: 'course-yellow', label: 'Yellow' },
  { key: 'course-gray', label: 'Gray' },
  { key: 'course-teal', label: 'Teal' },
  { key: 'course-purple', label: 'Purple' },
  { key: 'course-pink', label: 'Pink' },
  { key: 'course-red', label: 'Red' },
];

export function getCourseColor(colorKey: string | undefined): CourseColor {
  if (!colorKey) return fallback;
  return colorMap[colorKey] ?? fallback;
}
