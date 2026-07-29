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
  ListChecks,
  LoaderCircle,
  NotebookPen,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatStudyDate,
  formatStudyMinutes,
  groupStudyDays,
  isStudyPlanBehind,
  studyPlanProgress,
  todayForTimeZone,
} from '@/app/data/studyPlans';
import {
  deleteStudyPlan,
  openStudyTaskNote,
  refreshStudyPlan,
  setStudyPlanArchived,
  setStudyTaskCompleted,
  studyPlanErrorMessage,
} from '@/app/lib/studyPlans/client';
import { useStudyPlanDefinition, useStudyPlanTasks } from '@/app/lib/studyPlans/useStudyPlans';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { getCourseColor } from '@/app/data/courseColors';
import { openExternalUrl } from '@/app/lib/externalLinks';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = plan ? todayForTimeZone(plan.timeZone) : '';
  const windowEnd = plan && windowStart ? [addIsoDays(windowStart, WINDOW_DAYS), plan.examDate].sort()[0] : '';
  const [tasks, tasksLoading, , reloadTasks, setTasks] = useStudyPlanTasks(
    planId,
    windowStart,
    windowEnd,
    user?.id
  );
  useEffect(() => {
    if (!plan) return;
    if (!windowStart || windowStart < plan.startDate || windowStart >= plan.examDate) {
      setWindowStart(initialWindowStart(plan.startDate, plan.examDate, todayForTimeZone(plan.timeZone)));
    }
  }, [plan, windowStart]);

  const days = useMemo(
    () => plan ? groupStudyDays({ id: plan.id, courseId: plan.courseId, tasks }) : [],
    [plan, tasks]
  );
  const progress = plan ? studyPlanProgress(plan) : { completed: 0, total: 0, percent: 0 };
  const behind = plan ? isStudyPlanBehind(plan, today) : false;

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

  const handleRefresh = async () => {
    if (!plan || !confirm('Rebalance all incomplete work from today through the day before the exam?')) return;
    setRefreshing(true);
    setError(null);
    try {
      await refreshStudyPlan(plan.id, user?.id);
      await Promise.all([reloadPlan(), reloadTasks()]);
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    } finally {
      setRefreshing(false);
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
    if (!plan || !confirm('Delete this study plan and its completion history?')) return;
    setError(null);
    try {
      await deleteStudyPlan(plan.id, user?.id);
      navigate(`/courses/${courseId}`);
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    }
  };

  if (loading && !plan) return <div className="p-6 text-center text-muted-foreground">Loading study plan...</div>;
  if (!plan) return <div className="p-6 text-center text-muted-foreground">Study plan not found.</div>;

  const courseColors = getCourseColor(plan.courseColor);
  const courseTheme = {
    '--study-course-bg': courseColors.bg,
    '--study-course-border': courseColors.border,
    '--study-course-text': courseColors.text,
  } as CSSProperties;
  const activeTopics = plan.topics.filter((topic) => topic.active);
  const editPath = `/courses/${courseId}/study-plans/${plan.id}/edit`;
  const canGoEarlier = windowStart > plan.startDate;
  const canGoLater = windowEnd < plan.examDate;
  const windowLastDate = windowEnd ? addIsoDays(windowEnd, -1) : windowStart;

  const topicList = (
    <div className="divide-y divide-[color-mix(in_srgb,var(--study-course-border)_42%,white)]">
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
            <p className="mt-1 text-xs capitalize text-muted-foreground">{topic.difficulty}</p>
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

      <Card className="mobile-surface h-auto shrink-0 overflow-hidden border border-[var(--border-light)] border-l-4 border-l-[var(--study-course-border)] bg-white">
        <CardContent className="flex-none overflow-visible p-4 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[color-mix(in_srgb,var(--study-course-bg)_48%,white)] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--study-course-text)]">
                {plan.courseCode}
              </span>
              <Badge className="border-0 bg-[var(--study-course-text)] text-white">
                {plan.examType === 'final' ? 'Final' : 'Midterm'}
              </Badge>
              {plan.archived && <Badge variant="secondary">Archived</Badge>}
              {behind && <Badge variant="secondary" className="bg-destructive/10 text-destructive">Needs refresh</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-[var(--secondary-accent)] sm:text-4xl">
              {plan.examType === 'final' ? 'Final' : 'Midterm'} study plan
            </h1>
            <p className="mt-1 text-sm font-semibold text-[var(--study-course-text)] sm:text-base">{plan.courseName}</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0" />
              Exam {formatStudyDate(plan.examDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 lg:mt-0 lg:flex lg:shrink-0">
            <Button asChild className="mobile-primary-action h-11 rounded-lg px-4">
              <Link to={editPath}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit plan
              </Link>
            </Button>
            <Button variant="outline" className="h-11 rounded-lg px-3" onClick={handleRefresh} disabled={refreshing || plan.archived}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
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

      {behind && !plan.archived && (
        <div className="mobile-list-item flex min-h-12 shrink-0 flex-col gap-3 border-destructive/25 bg-destructive/5 p-3 sm:flex-row sm:items-center">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-bold text-[var(--secondary-accent)]">Some study work is overdue</p>
                <p className="mt-1 text-sm text-muted-foreground">Completed work stays fixed. Incomplete work can be rebalanced across the remaining days.</p>
              </div>
            </div>
            <Button className="h-12 shrink-0 rounded-lg sm:ml-auto sm:h-11" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh plan
            </Button>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}

      <section aria-label="Study plan progress" className="mobile-surface grid shrink-0 grid-cols-2 divide-x divide-y divide-[var(--border-light)] overflow-hidden sm:grid-cols-4 sm:divide-y-0">
        {[
          { label: 'Complete', value: `${progress.percent}%`, icon: CheckCircle2 },
          { label: 'Tasks', value: `${progress.completed}/${progress.total}`, icon: ListChecks },
          { label: 'Topics', value: activeTopics.length, icon: BookOpenCheck },
          { label: 'Study days left', value: plan.studyDaysLeft, icon: CalendarClock },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white p-3 sm:p-4">
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
        <details className="group rounded-lg border border-[var(--study-course-border)] bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-lg bg-[color-mix(in_srgb,var(--study-course-bg)_48%,white)] px-4 py-3 marker:content-none">
            <span>
              <span className="block text-sm font-bold text-[var(--secondary-accent)]">Topics</span>
              <span className="block text-xs text-muted-foreground">{activeTopics.length} in this plan</span>
            </span>
            <span className="text-xs font-bold text-[var(--study-course-text)] group-open:hidden">Show</span>
            <span className="hidden text-xs font-bold text-[var(--study-course-text)] group-open:inline">Hide</span>
          </summary>
          <div className="max-h-80 overflow-y-auto p-4">{topicList}</div>
        </details>

        <details className="group rounded-lg border border-[var(--border-light)] bg-white">
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
              Visible study window
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

      <div className="grid shrink-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Daily study schedule">
          {tasksLoading ? (
            <div className="mobile-surface py-10 text-center text-sm text-muted-foreground">Loading this four-week window...</div>
          ) : days.length === 0 ? (
            <div className="mobile-surface py-10 text-center text-sm text-muted-foreground">No study work is scheduled in this four-week window.</div>
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
                      ? 'border-l-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_42%,white)]'
                      : 'border-l-transparent bg-[var(--secondary-color)]/45'
                  }`}>
                    <div>
                      <h2 id={`study-day-${day.date}`} className="text-sm font-bold text-[var(--secondary-accent)] sm:text-base">
                        {formatStudyDate(day.date, { weekday: 'long', month: 'short', day: 'numeric' })}
                      </h2>
                      {day.date === today && <p className="mt-0.5 text-xs font-bold text-[var(--study-course-text)]">Today</p>}
                      {day.date < today && day.tasks.some((task) => !task.completedAt) && <p className="text-xs font-semibold text-destructive">Overdue</p>}
                    </div>
                    <Badge variant="outline" className="shrink-0 bg-white text-[var(--secondary-accent)]">{formatStudyMinutes(day.estimatedMinutes)}</Badge>
                  </header>
                  <div className="divide-y divide-[var(--border-light)]">
                {day.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex min-h-16 w-full items-center gap-2 bg-white px-3 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--study-course-bg)_22%,white)] sm:gap-3 sm:px-4 sm:py-3"
                  >
                    <button
                      type="button"
                      aria-label={`${task.completedAt ? 'Mark' : 'Complete'} ${task.title}${task.completedAt ? ' incomplete' : ''}`}
                      aria-pressed={Boolean(task.completedAt)}
                      disabled={busyTask === task.id || plan.archived}
                      onClick={() => toggleTask(task.id, !task.completedAt)}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] focus-visible:ring-offset-2 disabled:opacity-60 sm:h-9 sm:w-9 ${
                        task.completedAt
                          ? 'border-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))] bg-[color-mix(in_srgb,var(--course-green)_48%,white)] text-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))]'
                          : 'border-[var(--study-course-border)] bg-white text-[var(--study-course-text)]'
                      }`}
                    >
                      {task.completedAt && <Check className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`break-words text-sm font-semibold leading-snug text-[var(--secondary-accent)] ${task.completedAt ? 'line-through opacity-60' : ''}`}>{task.title}</p>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">{task.phase} · {formatStudyMinutes(task.estimatedMinutes)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={`Open notes for ${task.title}`}
                        aria-label={`Open notes for ${task.title}`}
                        disabled={busyNoteTask === task.id}
                        onClick={() => handleOpenTaskNote(task.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-light)] bg-white text-[var(--study-course-text)] transition-colors hover:border-[var(--study-course-border)] hover:bg-[var(--study-course-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] disabled:opacity-60 sm:h-9 sm:w-9"
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
                          className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-light)] bg-white text-[var(--study-course-text)] transition-colors hover:border-[var(--study-course-border)] hover:bg-[var(--study-course-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] sm:h-9 sm:w-9"
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

        <aside className="space-y-3 lg:sticky lg:top-0">
          <Card className="hidden h-auto overflow-hidden rounded-lg border border-[var(--study-course-border)] lg:block">
            <CardHeader className="flex flex-row items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--study-course-bg)_48%,white)] p-4">
              <div>
                <CardTitle className="text-base text-[var(--secondary-accent)]">Topics</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{activeTopics.length} in this plan</p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-9 rounded-lg bg-white/80">
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
    </div>
  );
}

export default StudyPlanPage;
