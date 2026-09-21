import { useState } from 'react';
import { ArrowLeft, BookOpenCheck, Check, LoaderCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { setStudyTaskCompleted, studyPlanErrorMessage } from '@/app/lib/studyPlans/client';
import type { StudyTaskNoteContext } from '@/app/lib/studyPlans/noteTaskContext';

type Props = {
  context: StudyTaskNoteContext;
  userId?: string;
  /** Navigates while honouring the editor's unsaved-changes prompt. */
  onNavigate: (to: string) => void;
};

/**
 * Shown when a note is opened from a study plan task, so the task can be ticked
 * off and the plan returned to without hunting for it again.
 */
export function StudyTaskNoteBanner({ context, userId, onNavigate }: Props) {
  const [completedAt, setCompletedAt] = useState(context.completedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completed = Boolean(completedAt);

  const toggleCompleted = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await setStudyTaskCompleted(context.planId, context.taskId, !completed, userId);
      setCompletedAt(result.completedAt);
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Study plan task"
      className="flex flex-col gap-3 rounded-lg border border-[var(--border-light)] bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--main-color)_18%,var(--surface))] text-[var(--main-accent)]">
          <BookOpenCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study plan task</p>
            {context.courseCode && (
              <Badge variant="outline" className="text-xs">{context.courseCode}</Badge>
            )}
          </div>
          <p className={`mt-0.5 break-words text-sm font-bold text-[var(--secondary-accent)] ${completed ? 'line-through opacity-70' : ''}`}>
            {context.taskTitle}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {completed ? 'Marked complete. Your note is saved separately.' : 'Take your notes, then check it off here.'}
          </p>
          {error && <p className="mt-1 text-xs font-semibold text-destructive">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant={completed ? 'success' : 'default'}
          aria-pressed={completed}
          aria-label={completed ? `Mark ${context.taskTitle} incomplete` : `Mark ${context.taskTitle} complete`}
          disabled={busy}
          onClick={() => void toggleCompleted()}
          className="w-full gap-2 sm:w-auto"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {completed ? 'Completed' : 'Mark complete'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onNavigate(context.returnPath)}
          className="w-full gap-2 sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to study plan
        </Button>
      </div>
    </section>
  );
}

export default StudyTaskNoteBanner;
