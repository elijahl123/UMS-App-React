// Maps a course's stored color key (e.g. "course-green") to background/text colors for UI chips.
const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  'course-green': { bg: 'var(--course-green)', text: '#24553D', border: '#9ecbb0' },
  'course-blue': { bg: 'var(--course-blue)', text: '#1F3A66', border: '#9fb6e6' },
  'course-yellow': { bg: 'var(--course-yellow)', text: '#6B5A1E', border: '#e0c874' },
  'course-gray': { bg: 'var(--course-gray)', text: '#3A3A3E', border: '#b9b9c0' },
};

const fallback = { bg: 'var(--course-gray)', text: '#3A3A3E', border: '#b9b9c0' };

export function getCourseColor(colorKey: string | undefined): { bg: string; text: string; border: string } {
  if (!colorKey) return fallback;
  return colorMap[colorKey] ?? fallback;
}
