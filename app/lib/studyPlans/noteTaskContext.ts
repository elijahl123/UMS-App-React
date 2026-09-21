/**
 * The study plan's "Open notes" buttons hand the note editor enough context to
 * finish the task in place: which task the note belongs to, whether it is
 * already ticked off, and where the user came from.
 */
export interface StudyTaskNoteContext {
  planId: string;
  taskId: string;
  taskTitle: string;
  courseCode: string | null;
  /** Where the "Back to study plan" button returns to. */
  returnPath: string;
  completedAt: string | null;
}

export interface StudyTaskNoteState {
  focusEditor?: boolean;
  studyTask: StudyTaskNoteContext;
}

export function studyTaskNoteState(
  context: StudyTaskNoteContext,
  focusEditor: boolean
): StudyTaskNoteState {
  return focusEditor ? { focusEditor: true, studyTask: context } : { studyTask: context };
}

/**
 * Router state survives reloads and back/forward, so it can be anything the
 * browser kept around. Only treat it as task context when every field the view
 * needs is really there.
 */
export function readStudyTaskNoteContext(state: unknown): StudyTaskNoteContext | null {
  const candidate = (state as { studyTask?: unknown } | null)?.studyTask as
    | Partial<StudyTaskNoteContext>
    | undefined;
  if (!candidate || typeof candidate !== 'object') return null;
  const { planId, taskId, taskTitle, returnPath } = candidate;
  if (typeof planId !== 'string' || !planId) return null;
  if (typeof taskId !== 'string' || !taskId) return null;
  if (typeof taskTitle !== 'string' || !taskTitle) return null;
  if (typeof returnPath !== 'string' || !returnPath.startsWith('/')) return null;
  return {
    planId,
    taskId,
    taskTitle,
    courseCode: typeof candidate.courseCode === 'string' ? candidate.courseCode : null,
    returnPath,
    completedAt: typeof candidate.completedAt === 'string' ? candidate.completedAt : null,
  };
}
