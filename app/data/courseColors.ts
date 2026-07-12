// Maps a course's stored color key (e.g. "course-green") to background/text colors for UI chips.
export interface CourseColor {
  bg: string;
  text: string;
  border: string;
}

const colorMap: Record<string, CourseColor> = {
  'course-green': { bg: 'var(--course-green)', text: '#24553D', border: '#9ecbb0' },
  'course-blue': { bg: 'var(--course-blue)', text: '#1F3A66', border: '#9fb6e6' },
  'course-yellow': { bg: 'var(--course-yellow)', text: '#6B5A1E', border: '#e0c874' },
  'course-gray': { bg: 'var(--course-gray)', text: '#3A3A3E', border: '#b9b9c0' },
  'course-teal': { bg: 'var(--course-teal)', text: '#1F5753', border: '#7fc5bd' },
  'course-purple': { bg: 'var(--course-purple)', text: '#46316E', border: '#b8a2df' },
  'course-pink': { bg: 'var(--course-pink)', text: '#71324D', border: '#dc9ab8' },
  'course-red': { bg: 'var(--course-red)', text: '#7A2F2F', border: '#df8d8d' },
};

const fallback = { bg: 'var(--course-gray)', text: '#3A3A3E', border: '#b9b9c0' };

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
