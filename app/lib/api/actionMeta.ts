// Shared metadata about the generic `/api/actions/:name` RPC surface.
// Kept free of React and network imports so the offline layer can read it
// without creating a cycle through `@/app/lib/api/client`.

export const MUTATION_EVENT = 'ums-api-action-mutated';

/** Fired when a background revalidation found newer data than the cache held. */
export const REVALIDATED_EVENT = 'ums-offline-revalidated';

export const invalidatesByMutation: Record<string, string[]> = {
  createCourse: ['loadCourses'],
  updateCourse: ['loadCourses'],
  deleteCourse: ['loadCourses'],
  createAssignment: ['loadAssignments'],
  updateAssignment: ['loadAssignments'],
  deleteAssignment: ['loadAssignments'],
  createClassSession: ['loadClassSessions'],
  updateClassSession: ['loadClassSessions'],
  deleteClassSession: ['loadClassSessions'],
  createEvent: ['loadEvents'],
  updateEvent: ['loadEvents'],
  deleteEvent: ['loadEvents'],
  createNote: ['loadNotes'],
  updateNote: ['loadNotes'],
  deleteNote: ['loadNotes'],
  createCourseLink: ['loadCourseLinks'],
  updateCourseLink: ['loadCourseLinks'],
  deleteCourseLink: ['loadCourseLinks'],
};

export const notificationMutationActions = new Set([
  'createAssignment',
  'updateAssignment',
  'deleteAssignment',
  'createClassSession',
  'updateClassSession',
  'deleteClassSession',
  'createEvent',
  'updateEvent',
  'deleteEvent',
]);

export function isLoadAction(name: string): boolean {
  return name.startsWith('load');
}

export function isQueueableAction(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(invalidatesByMutation, name);
}
