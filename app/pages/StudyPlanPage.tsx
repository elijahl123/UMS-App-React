import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  ListChecks,
  LoaderCircle,
  NotebookPen,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PhasePreset } from '@/app/data/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  formatStudyDate,
  formatStudyMinutes,
  groupStudyDays,
  studyPhaseLabel,
  studyPlanProgress,
  targetDateLabel,
  targetTypeLabel,
  todayForTimeZone,
  topicWorkloadMinutes,
} from '@/app/data/studyPlans';
import {
  deleteStudyPlan,
  openStudyTaskNote,
  setStudyPlanArchived,
  setStudyTaskCompleted,
  studyPlanErrorMessage,
  updateStudyTask,
  undoStudyPlanRecovery,
} from '@/app/lib/studyPlans/client';
import { useStudyPlanDefinition, useStudyPlanRecoveryStatus, useStudyPlanTasks } from '@/app/lib/studyPlans/useStudyPlans';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { getCourseColor } from '@/app/data/courseColors';
import { openExternalUrl } from '@/app/lib/externalLinks';
import { RecoveryDialog } from '@/app/components/studyPlans/RecoveryDialog';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PHASE_GUIDE: Record<PhasePreset, Array<{ title: string; body: string }>> = {
  study: [
    {
      title: '1. Learn & Review',
      body: "First exposure to the material. Read the chapter, rewatch the lecture, or work through examples. Use the task's note to jot down key ideas, definitions, and anything confusing.",
    },
    {
      title: '2. Practice',
      body: 'Apply what you learned with problem sets, past assignments, or practice questions. Add worked examples or common mistakes to the same note so it becomes a working reference.',
    },
    {
      title: '3. Recall',
      body: 'Test yourself without looking anything up, then check against the note. This is where gaps show up. The closer this is to your target date, the more it tells you what still needs work.',
    },
  ],
  general: [
    {
      title: '1. First pass',
      body: "Get through the material once without stopping to perfect anything. Use the task's note to capture the shape of it: main ideas, terms, and open questions.",
    },
    {
      title: '2. Deepen',
      body: 'Go back to the parts that did not land. Work examples, follow references, or draft your own version. Add what you learn to the same note so it becomes a working reference.',
    },
    {
      title: '3. Review',
      body: 'Go over it once more from your note and check what you can reconstruct without looking. Whatever is still shaky is what to carry forward.',
    },
  ],
};
const WINDOW_DAYS = 28;

function addIsoDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function initialWindowStart(startDate: string, examDate: string, today: string): string {
  const anchor = today < startDate ? startDate : today >= examDate ? addIsoDays(examDate, -1) : today;
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const selected = new Date(`${anchor}T00:00:00.000Z`).getTime();
  const elapsedDays = Math.max(0, Math.floor((selected - start) / 86_400_000));
  return addIsoDays(startDate, Math.floor(elapsedDays / WINDOW_DAYS) * WINDOW_DAYS);
}

function StudyPlanPage() {
  const { courseId = '', planId = '' } = useParams<{ courseId: string; planId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plan, loading, , reloadPlan] = useStudyPlanDefinition(planId, user?.id);
  const [windowStart, setWindowStart] = useState('');
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [busyNoteTask, setBusyNoteTask] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [undoingRecovery, setUndoingRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = plan ? todayForTimeZone(plan.timeZone) : '';
  const scheduleEnd = plan?.targetDate ?? plan?.examDate ?? '';
  const windowEnd = plan && windowStart
    ? scheduleEnd <= plan.startDate ? addIsoDays(plan.startDate, 1) : [addIsoDays(windowStart, WINDOW_DAYS), scheduleEnd].sort()[0]
    : '';
  const [tasks, tasksLoading, , reloadTasks, setTasks] = useStudyPlanTasks(
    planId,
    windowStart,
    windowEnd,
    user?.id
  );
  const [recoveryStatus, , , reloadRecoveryStatus] = useStudyPlanRecoveryStatus(planId, user?.id);
  useEffect(() => {
    if (!plan) return;
    if (plan.targetDate <= plan.startDate) {
      if (windowStart !== plan.startDate) setWindowStart(plan.startDate);
    } else if (!windowStart || windowStart < plan.startDate || windowStart >= plan.targetDate) {
      setWindowStart(initialWindowStart(plan.startDate, plan.targetDate, todayForTimeZone(plan.timeZone)));
    }
  }, [plan, windowStart]);

  const days = useMemo(
    () => plan ? groupStudyDays({ id: plan.id, courseId: plan.courseId, tasks }) : [],
    [plan, tasks]
  );
  const progress = plan ? studyPlanProgress(plan) : { completed: 0, total: 0, percent: 0 };
  const recoveryNeeded = recoveryStatus?.needsRecovery ?? plan?.recoveryNeeded ?? false;

  const toggleTask = async (taskId: string, completed: boolean) => {
    if (!plan) return;
    setBusyTask(taskId);
    setError(null);
    try {
      const result = await setStudyTaskCompleted(plan.id, taskId, completed, user?.id);
      setTasks((current) => current.map((task) =>
        task.id === taskId ? { ...task, completedAt: result.completedAt } : task
      ));
      await reloadPlan();
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    } finally {
      setBusyTask(null);
    }
  };

  const reloadRecoveryData = async () => {
    await Promise.all([reloadPlan(), reloadTasks(), reloadRecoveryStatus()]);
  };

  const handleUndoRecovery = async () => {
    if (!plan) return;
    setUndoingRecovery(true);
    setError(null);
    try {
      await undoStudyPlanRecovery(plan.id, user?.id);
      await reloadRecoveryData();
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    } finally {
      setUndoingRecovery(false);
    }
  };

  const handleOpenTaskNote = async (taskId: string) => {
    if (!plan) return;
    setBusyNoteTask(taskId);
    setError(null);
    try {
      const result = await openStudyTaskNote(plan.id, taskId, user?.id);
      navigate(`/notes/${result.noteId}`, {
        state: result.created ? { focusEditor: true } : undefined,
      });
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    } finally {
      setBusyNoteTask(null);
    }
  };

  const handleEditTask = async (taskId: string) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!plan || !task) return;
    const title = window.prompt('Task title', task.title)?.trim();
    if (!title) return;
    const scheduledDate = window.prompt('Scheduled date (YYYY-MM-DD)', task.scheduledDate)?.trim();
    if (!scheduledDate) return;
    const minutesText = window.prompt('Estimated minutes (15-minute units)', String(task.estimatedMinutes));
    if (!minutesText) return;
    setBusyTask(taskId);
    setError(null);
    try {
      const result = await updateStudyTask(plan.id, taskId, {
        title,
        scheduledDate,
        estimatedMinutes: Math.round(Number(minutesText) / 15) * 15,
      }, user?.id);
      setTasks((current) => current.map((candidate) => candidate.id === taskId ? {
        ...candidate,
        title: result.title ?? title,
        scheduledDate: result.scheduledDate,
        estimatedMinutes: result.estimatedMinutes,
      } : candidate));
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    } finally {
      setBusyTask(null);
    }
  };

  const handleArchive = async () => {
    if (!plan) return;
    setError(null);
    try {
      await setStudyPlanArchived(plan.id, !plan.archived, user?.id);
      await reloadPlan();
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!plan || !confirm('Delete this plan and its completion history?')) return;
    setError(null);
    try {
      await deleteStudyPlan(plan.id, user?.id);
      navigate(`/courses/${courseId}`);
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    }
  };

  if (loading && !plan) return <div className="p-6 text-center text-muted-foreground">Loading plan...</div>;
  if (!plan) return <div className="p-6 text-center text-muted-foreground">Plan not found.</div>;

  const courseColors = getCourseColor(plan.courseColor);
  const courseTheme = {
    '--study-course-bg': courseColors.bg,
    '--study-course-border': courseColors.border,
    '--study-course-text': courseColors.text,
  } as CSSProperties;
  const activeTopics = plan.topics.filter((topic) => topic.active);
  const editPath = `/courses/${courseId}/study-plans/${plan.id}/edit`;
  const canGoEarlier = windowStart > plan.startDate;
  const canGoLater = windowEnd < plan.targetDate;
  const windowLastDate = windowEnd ? addIsoDays(windowEnd, -1) : windowStart;

  const topicList = (
    <div className="divide-y divide-[color-mix(in_srgb,var(--study-course-border)_42%,var(--surface))]">
      {activeTopics.map((topic) => {
        const total = topic.totalTasks ?? 0;
        const completed = topic.completedTasks ?? 0;
        return (
          <div key={topic.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-sm font-semibold leading-snug text-[var(--secondary-accent)]">
                {topic.title}
              </span>
              <span className="shrink-0 text-xs font-bold text-[var(--study-course-text)]">
                {completed}/{total}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="capitalize">{topic.difficulty}</span>
              {' · '}
              {formatStudyMinutes(topicWorkloadMinutes(topic.difficulty, plan.topicMode))}
            </p>
          </div>
        );
      })}
    </div>
  );

  const capacityList = (
    <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm lg:grid-cols-1">
      {plan.availability.map((entry) => (
        <div key={entry.weekday} className="flex items-center justify-between gap-3 border-b border-[var(--border-light)] py-1.5 last:border-0">
          <span className="text-muted-foreground">{DAY_NAMES[entry.weekday]}</span>
          <span className="font-bold text-[var(--secondary-accent)]">{formatStudyMinutes(entry.minutes)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="mobile-page-stack mx-auto w-full max-w-6xl pb-28 md:h-full md:overflow-y-auto md:pb-6 md:pr-1"
      style={courseTheme}
    >
      <button
        type="button"
        onClick={() => navigate(`/courses/${courseId}`)}
        className="flex w-fit items-center gap-1.5 rounded-lg py-1 text-xs font-bold text-muted-foreground transition-colors hover:text-[var(--study-course-text)] sm:text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {plan.courseCode}
      </button>

      <Card className="mobile-surface h-auto shrink-0 overflow-hidden border border-[var(--border-light)] border-l-4 border-l-[var(--study-course-border)] bg-card">
        <CardContent className="flex-none overflow-visible p-4 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[color-mix(in_srgb,var(--study-course-bg)_48%,var(--surface))] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--study-course-text)]">
                {plan.courseCode}
              </span>
              <Badge className="border-0 bg-[var(--study-course-border)] text-[var(--study-course-text)]">
                {targetTypeLabel(plan.targetType, plan.examType)}
              </Badge>
              {plan.archived && <Badge variant="secondary">Archived</Badge>}
              {recoveryNeeded && <Badge variant="secondary" className="bg-destructive/10 text-destructive">Needs replanning</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-[var(--secondary-accent)] sm:text-4xl">
              {plan.targetTitle}
            </h1>
            <p className="mt-1 text-sm font-semibold text-[var(--study-course-text)] sm:text-base">{plan.courseName}</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0" />
              {targetDateLabel(plan.targetType)} {formatStudyDate(plan.targetDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}{plan.targetTime ? ` at ${plan.targetTime}` : ''}
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 lg:mt-0 lg:flex lg:shrink-0">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-lg"
              aria-label="How this plan works"
              onClick={() => setInfoOpen(true)}
            >
              <Info className="h-4 w-4" />
            </Button>
            <Button asChild className="mobile-primary-action h-11 rounded-lg px-4">
              <Link to={editPath}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit plan
              </Link>
            </Button>
            <Button variant="outline" className="h-11 rounded-lg px-3" onClick={() => setRecoveryOpen(true)} disabled={!recoveryNeeded || plan.archived}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Recovery mode
            </Button>
            <Button variant="outline" className="h-11 rounded-lg px-3" onClick={handleArchive}>
              <Archive className="mr-1.5 h-4 w-4" /> {plan.archived ? 'Restore' : 'Archive'}
            </Button>
            <Button variant="outline" className="h-11 rounded-lg border-destructive/25 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {recoveryNeeded && !plan.archived && (
        <div className="mobile-list-item flex min-h-12 shrink-0 flex-col gap-3 border-destructive/25 bg-destructive/5 p-3 sm:flex-row sm:items-center">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-bold text-[var(--secondary-accent)]">This plan needs replanning</p>
                <p className="mt-1 text-sm text-muted-foreground">Preview how flexible work can be rebalanced. Completed and manually edited tasks stay fixed.</p>
              </div>
            </div>
            <Button className="h-12 shrink-0 rounded-lg sm:ml-auto sm:h-11" onClick={() => setRecoveryOpen(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Start Recovery Mode
            </Button>
        </div>
      )}

      {recoveryStatus?.latestRevision?.undoAvailable && (
        <div role="status" className="mobile-list-item flex min-h-12 shrink-0 items-center gap-3 border-primary/25 bg-primary/5 p-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[var(--secondary-accent)]">Recovery applied</p>
            <p className="mt-1 text-sm text-muted-foreground">You can undo the latest recovery until this plan changes again.</p>
          </div>
          <Button variant="outline" onClick={handleUndoRecovery} disabled={undoingRecovery} className="h-11 shrink-0">
            <RefreshCw className={`mr-2 h-4 w-4 ${undoingRecovery ? 'animate-spin' : ''}`} /> Undo
          </Button>
        </div>
      )}

      {plan.unscheduledMinutes > 0 && (
        <div role="status" className="mobile-list-item flex min-h-12 shrink-0 gap-3 border-[color-mix(in_srgb,var(--course-citrine)_64%,var(--surface))] bg-[color-mix(in_srgb,var(--course-citrine)_34%,var(--surface))] p-3 text-[color-mix(in_srgb,var(--course-citrine)_68%,var(--secondary-accent))]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-bold">Partial plan saved</p><p className="mt-1 text-sm">{formatStudyMinutes(plan.unscheduledMinutes)} remains unscheduled because the selected days do not have enough capacity.</p></div>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}

      <section aria-label="Plan progress" className="mobile-surface grid shrink-0 grid-cols-2 divide-x divide-y divide-[var(--border-light)] overflow-hidden sm:grid-cols-4 sm:divide-y-0">
        {[
          { label: 'Complete', value: `${progress.percent}%`, icon: CheckCircle2 },
          { label: 'Tasks', value: `${progress.completed}/${progress.total}`, icon: ListChecks },
          { label: 'Topics', value: activeTopics.length, icon: BookOpenCheck },
          { label: 'Work days left', value: plan.studyDaysLeft, icon: CalendarClock },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-card p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xl font-bold leading-none text-[var(--secondary-accent)] sm:text-3xl">{stat.value}</p>
                <Icon className="h-4 w-4 text-[var(--study-course-text)]" />
              </div>
              <p className="mt-2 text-xs font-semibold text-muted-foreground sm:text-sm">{stat.label}</p>
            </div>
          );
        })}
      </section>

      <div className="shrink-0 space-y-2.5 lg:hidden">
        <details className="group rounded-lg border border-[var(--study-course-border)] bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-lg bg-[color-mix(in_srgb,var(--study-course-bg)_48%,var(--surface))] px-4 py-3 marker:content-none">
            <span>
              <span className="block text-sm font-bold text-[var(--secondary-accent)]">Topics</span>
              <span className="block text-xs text-muted-foreground">{activeTopics.length} in this plan</span>
            </span>
            <span className="text-xs font-bold text-[var(--study-course-text)] group-open:hidden">Show</span>
            <span className="hidden text-xs font-bold text-[var(--study-course-text)] group-open:inline">Hide</span>
          </summary>
          <div className="max-h-80 overflow-y-auto p-4">{topicList}</div>
        </details>

        <details className="group rounded-lg border border-[var(--border-light)] bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
            <span className="flex items-center gap-2 text-sm font-bold text-[var(--secondary-accent)]">
              <CalendarDays className="h-4 w-4 text-[var(--study-course-text)]" /> Weekly capacity
            </span>
            <span className="text-xs font-bold text-[var(--study-course-text)] group-open:hidden">Show</span>
            <span className="hidden text-xs font-bold text-[var(--study-course-text)] group-open:inline">Hide</span>
          </summary>
          <div className="px-4 pb-4">{capacityList}</div>
        </details>
      </div>

      <div className="mobile-action-tray flex shrink-0 flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between sm:p-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-lg sm:h-11"
            disabled={!canGoEarlier || tasksLoading}
            onClick={() => {
              setTasks([]);
              setWindowStart((current) => {
                const previous = addIsoDays(current, -WINDOW_DAYS);
                return previous < plan.startDate ? plan.startDate : previous;
              });
            }}
          >
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Earlier 4 weeks
          </Button>
          <div className="text-center">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--study-course-text)]">
              Visible window
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--secondary-accent)]">
              {formatStudyDate(windowStart, { month: 'short', day: 'numeric' })}
              {' – '}
              {formatStudyDate(windowLastDate, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-lg sm:h-11"
            disabled={!canGoLater || tasksLoading}
            onClick={() => {
              setTasks([]);
              setWindowStart((current) => addIsoDays(current, WINDOW_DAYS));
            }}
          >
            Next 4 weeks
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
      </div>

      <div className="grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Daily schedule" className="min-w-0">
          {tasksLoading ? (
            <div className="mobile-surface py-10 text-center text-sm text-muted-foreground">Loading this four-week window...</div>
          ) : days.length === 0 ? (
            <div className="mobile-surface py-10 text-center text-sm text-muted-foreground">Nothing is scheduled in this four-week window.</div>
          ) : (
            <div className="mobile-surface overflow-hidden">
              {days.map((day) => (
                <section
                  key={day.date}
                  aria-labelledby={`study-day-${day.date}`}
                  className="border-b border-[var(--border-light)] last:border-b-0"
                >
                  <header className={`flex items-center justify-between gap-3 border-l-4 px-4 py-3 ${
                    day.date === today
                      ? 'border-l-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_42%,var(--surface))]'
                      : 'border-l-transparent bg-[var(--secondary-color)]/45'
                  }`}>
                    <div>
                      <h2 id={`study-day-${day.date}`} className="text-sm font-bold text-[var(--secondary-accent)] sm:text-base">
                        {formatStudyDate(day.date, { weekday: 'long', month: 'short', day: 'numeric' })}
                      </h2>
                      {day.date === today && <p className="mt-0.5 text-xs font-bold text-[var(--study-course-text)]">Today</p>}
                      {day.date < today && day.tasks.some((task) => !task.completedAt) && <p className="text-xs font-semibold text-destructive">Overdue</p>}
                    </div>
                    <Badge variant="outline" className="shrink-0 bg-card text-[var(--secondary-accent)]">{formatStudyMinutes(day.estimatedMinutes)}</Badge>
                  </header>
                  <div className="divide-y divide-[var(--border-light)]">
                {day.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex min-h-16 w-full items-center gap-2 bg-card px-3 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--study-course-bg)_22%,var(--surface))] sm:gap-3 sm:px-4 sm:py-3"
                  >
                    <button
                      type="button"
                      aria-label={`${task.completedAt ? 'Mark' : 'Complete'} ${task.title}${task.completedAt ? ' incomplete' : ''}`}
                      aria-pressed={Boolean(task.completedAt)}
                      disabled={busyTask === task.id || plan.archived}
                      onClick={() => toggleTask(task.id, !task.completedAt)}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] focus-visible:ring-offset-2 disabled:opacity-60 sm:h-9 sm:w-9 ${
                        task.completedAt
                          ? 'border-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))] bg-[color-mix(in_srgb,var(--course-emerald)_48%,var(--surface))] text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]'
                          : 'border-[var(--study-course-border)] bg-card text-[var(--study-course-text)]'
                      }`}
                    >
                      {task.completedAt && <Check className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`break-words text-sm font-semibold leading-snug text-[var(--secondary-accent)] ${task.completedAt ? 'line-through opacity-60' : ''}`}>{task.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{studyPhaseLabel(task.phase, plan.phasePreset)} · {formatStudyMinutes(task.estimatedMinutes)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={`Edit ${task.title}`}
                        aria-label={`Edit ${task.title}`}
                        disabled={Boolean(task.completedAt) || busyTask === task.id || plan.archived}
                        onClick={() => void handleEditTask(task.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-light)] bg-card text-[var(--study-course-text)] transition-colors hover:border-[var(--study-course-border)] hover:bg-[var(--study-course-bg)] disabled:opacity-50 sm:h-9 sm:w-9"
                      ><Pencil className="h-4 w-4" /></button>
                      <button
                        type="button"
                        title={`Open notes for ${task.title}`}
                        aria-label={`Open notes for ${task.title}`}
                        disabled={busyNoteTask === task.id}
                        onClick={() => handleOpenTaskNote(task.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-light)] bg-card text-[var(--study-course-text)] transition-colors hover:border-[var(--study-course-border)] hover:bg-[var(--study-course-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] disabled:opacity-60 sm:h-9 sm:w-9"
                      >
                        {busyNoteTask === task.id
                          ? <LoaderCircle className="h-4 w-4 animate-spin" />
                          : <NotebookPen className="h-4 w-4" />}
                      </button>
                      {plan.courseHomepageUrl && (
                        <button
                          type="button"
                          title={`Open ${plan.courseCode} homepage`}
                          aria-label={`Open ${plan.courseCode} homepage`}
                          onClick={() => void openExternalUrl(plan.courseHomepageUrl!)}
                          className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-light)] bg-card text-[var(--study-course-text)] transition-colors hover:border-[var(--study-course-border)] hover:bg-[var(--study-course-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] sm:h-9 sm:w-9"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-3 lg:sticky lg:top-0">
          <Card className="hidden h-auto overflow-hidden rounded-lg border border-[var(--study-course-border)] lg:block">
            <CardHeader className="flex flex-row items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--study-course-bg)_48%,var(--surface))] p-4">
              <div>
                <CardTitle className="text-base text-[var(--secondary-accent)]">Topics</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{activeTopics.length} in this plan</p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-9 rounded-lg bg-[color-mix(in_srgb,var(--card)_80%,transparent)]">
                <Link to={editPath}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Link>
              </Button>
            </CardHeader>
            <CardContent className="max-h-[25rem] flex-none overflow-y-auto p-4">{topicList}</CardContent>
          </Card>

          <Card className="hidden h-auto rounded-lg border border-[var(--border-light)] lg:block">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[var(--study-course-text)]" />
                <CardTitle className="text-base text-[var(--secondary-accent)]">Weekly capacity</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex-none p-4 pt-2">{capacityList}</CardContent>
          </Card>

        </aside>
      </div>
      <RecoveryDialog
        planId={plan.id}
        userId={user?.id}
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        onApplied={reloadRecoveryData}
      />
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-lg">
          {plan.topicMode === 'single' ? (
            <>
              <DialogHeader>
                <DialogTitle>How this plan works</DialogTitle>
                <DialogDescription>This plan gives each topic one task instead of three passes.</DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Each topic gets one task. Cover the material, work through examples, and check yourself in one sitting. Use the task's note to record what you covered and anything you want to come back to.
              </p>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  How to use {PHASE_GUIDE[plan.phasePreset].map((entry) => entry.title.replace(/^\d+\.\s*/, '')).join(', ')}
                </DialogTitle>
                <DialogDescription>Each topic moves through three passes. Here's how to approach each one.</DialogDescription>
              </DialogHeader>
              <ol className="grid gap-3">
                {PHASE_GUIDE[plan.phasePreset].map((entry) => (
                  <li key={entry.title} className="rounded-md border bg-muted/20 p-3">
                    <strong className="block text-sm">{entry.title}</strong>
                    <span className="text-sm text-muted-foreground">{entry.body}</span>
                  </li>
                ))}
              </ol>
              <p className="text-sm text-muted-foreground">
                The notebook icon on each task opens the <strong>same note</strong> for that topic across all three passes. Treat it as one running document instead of three separate ones. Tasks aren't locked to this order. You can complete them whenever, but the schedule places the first pass earliest and the last pass closest to your target date so the material gets revisited over time.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default StudyPlanPage;
