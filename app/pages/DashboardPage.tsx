import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import UpcomingAssignmentsWidget from '@/app/components/widgets/UpcomingAssignmentsWidget';
import ClassesTodayWidget from '@/app/components/widgets/ClassesTodayWidget';
import LateAssignmentsWidget from '@/app/components/widgets/LateAssignmentsWidget';
import UpcomingEventsWidget from '@/app/components/widgets/UpcomingEventsWidget';
import { mapCourse, mapAssignment, mapClassSession, mapEvent } from '@/app/data/mappers';
import type { Assignment, CalendarEvent } from '@/app/data/types';
import { todayDayName } from '@/app/data/classSchedule';
import { toIsoDate } from '@/app/data/calendarUtils';
import { getCourseColor } from '@/app/data/courseColors';
import { useAuth } from '@/app/lib/auth/AuthContext';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  NotebookPen,
  StickyNote,
} from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatStudyDate, formatStudyMinutes, studyPlanProgress } from '@/app/data/studyPlans';
import { openStudyTaskNote, setStudyTaskCompleted } from '@/app/lib/studyPlans/client';
import { useStudyPlanDashboard } from '@/app/lib/studyPlans/useStudyPlans';
import { openExternalUrl } from '@/app/lib/externalLinks';

function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dashboardToday = toIsoDate(new Date());
  const dashboardEndDate = new Date();
  dashboardEndDate.setFullYear(dashboardEndDate.getFullYear() + 2);
  const [courseRows, coursesLoading] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows, assignmentsLoading, , refreshAssignments] = useLoadAction('loadAssignments', [], {
    userId: user?.id,
  });
  const [sessionRows, sessionsLoading] = useLoadAction('loadClassSessions', [], { userId: user?.id });
  const [eventRows, eventsLoading, , refreshEvents] = useLoadAction('loadEvents', [], {
    userId: user?.id,
    from: dashboardToday,
    to: toIsoDate(dashboardEndDate),
  });
  const [studyDashboard, studyPlansLoading, , refreshStudyDashboard, setStudyDashboard] =
    useStudyPlanDashboard(user?.id);
  const [busyStudyTask, setBusyStudyTask] = useState<string | null>(null);
  const [busyStudyNote, setBusyStudyNote] = useState<string | null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);

  const [addAssignment] = useMutateAction('createAssignment');
  const [addEvent] = useMutateAction('createEvent');

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);
  const sessions = (sessionRows ?? []).map(mapClassSession);
  const events = (eventRows ?? []).map(mapEvent);

  const upcoming = assignments.filter((a) => a.status === 'upcoming' || a.status === 'due_today');
  const late = assignments.filter((a) => a.status === 'late');
  const todaysSessions = sessions.filter((s) => s.day === todayDayName());
  const todayIso = toIsoDate(new Date());
  const upcomingEvents = events
    .filter((event) => event.date >= todayIso)
    .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
  const todaysStudyMinutes = studyDashboard.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);

  const handleAddAssignment = async (values: Omit<Assignment, 'id' | 'status'>) => {
    await addAssignment({
      courseId: values.courseId,
      name: values.name,
      dueDate: values.dueDate,
      dueTime: values.dueTime ?? null,
      dueTimeZone: values.dueTimeZone,
      description: values.description ?? null,
      userId: user?.id,
    });
    refreshAssignments();
  };

  const handleAddEvent = async (values: Omit<CalendarEvent, 'id'>) => {
    await addEvent({
      title: values.title,
      date: values.date,
      time: values.time ?? null,
      endTime: values.endTime ?? null,
      timeZone: values.timeZone,
      description: values.description ?? null,
      userId: user?.id,
    });
    refreshEvents();
  };

  const completeStudyTask = async (planId: string, taskId: string) => {
    setBusyStudyTask(taskId);
    setStudyError(null);
    try {
      await setStudyTaskCompleted(planId, taskId, true, user?.id);
      setStudyDashboard((current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== taskId),
      }));
      await refreshStudyDashboard();
    } catch (error) {
      setStudyError(error instanceof Error ? error.message : 'Could not update the study task.');
    } finally {
      setBusyStudyTask(null);
    }
  };

  const openTopicNote = async (planId: string, taskId: string) => {
    setBusyStudyNote(taskId);
    setStudyError(null);
    try {
      const result = await openStudyTaskNote(planId, taskId, user?.id);
      navigate(`/notes/${result.noteId}`, { state: result.created ? { focusEditor: true } : undefined });
    } catch (error) {
      setStudyError(error instanceof Error ? error.message : 'Could not open the topic note.');
    } finally {
      setBusyStudyNote(null);
    }
  };

  const isLoading = coursesLoading || assignmentsLoading || sessionsLoading || eventsLoading || studyPlansLoading;
  const statCards = [
    {
      label: 'Upcoming Assignments',
      displayLabel: 'Upcoming',
      value: upcoming.length,
      icon: NotebookPen,
      to: '/homework?status=upcoming',
      className: 'bg-[color-mix(in_srgb,var(--main-color)_18%,white)] text-[var(--main-accent)]',
    },
    {
      label: 'Class Today',
      displayLabel: 'Classes',
      value: todaysSessions.length,
      icon: GraduationCap,
      to: '/class-schedule',
      className: 'bg-[color-mix(in_srgb,var(--course-yellow)_44%,white)] text-[color-mix(in_srgb,var(--course-yellow)_62%,var(--secondary-accent))]',
    },
    {
      label: 'Late Assignments',
      displayLabel: 'Late',
      value: late.length,
      icon: CheckCircle2,
      to: '/homework?status=late',
      className: 'bg-[color-mix(in_srgb,var(--course-green)_42%,white)] text-[color-mix(in_srgb,var(--course-green)_66%,var(--secondary-accent))]',
    },
    {
      label: 'Upcoming Events',
      displayLabel: 'Events',
      value: upcomingEvents.length,
      icon: CalendarDays,
      to: '/calendar',
      className: 'bg-[color-mix(in_srgb,var(--course-blue)_42%,white)] text-[color-mix(in_srgb,var(--course-blue)_58%,var(--secondary-accent))]',
    },
  ];

  if (isLoading && courses.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="mobile-page-stack md:flex md:h-full md:flex-col md:gap-5 md:overflow-y-auto xl:gap-6">
      <div className="mobile-page-header !pr-1 md:hidden">
        <h1 className="mobile-page-title whitespace-nowrap text-[1.65rem] sm:text-[2rem]">Welcome to UMS</h1>
        <p className="mobile-page-kicker whitespace-nowrap text-[0.8125rem]">
          Stay on top of your classes and assignments.
        </p>
      </div>

      <div className="mobile-surface grid grid-cols-4 gap-2 p-2 md:hidden">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              to={stat.to}
              aria-label={`Open ${stat.label}`}
              className={`min-h-[5.9rem] rounded-lg border border-white/70 px-2.5 py-3 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring ${stat.className}`}
            >
              <div className="mb-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface)]/70">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-lg font-bold leading-none text-[var(--secondary-accent)]">{stat.value}</p>
              <p className="mt-1 text-[9.5px] font-semibold leading-[1.08] text-[var(--secondary-accent)]">{stat.displayLabel}</p>
            </Link>
          );
        })}
      </div>

      <Card
        aria-labelledby="study-focus-heading"
        className="mobile-surface h-auto shrink-0 !border !border-[var(--border-light)] md:rounded-lg md:!border-2 md:!border-primary md:shadow-none"
      >
          <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0 p-4 pb-3 sm:p-4 sm:pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary md:hidden">
                <CalendarClock className="h-5 w-5" />
              </span>
              <CardTitle id="study-focus-heading" className="whitespace-nowrap text-[0.98rem] text-primary md:text-lg xl:text-xl">
                Study Focus
              </CardTitle>
            </div>
            {studyDashboard.activePlanCount > 0 && (
              <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                {studyDashboard.activePlanCount} active
              </span>
            )}
          </CardHeader>

          <CardContent className="min-h-0 flex-none space-y-3 overflow-visible px-4 pb-4">
            {studyDashboard.urgentPlan && (
              <Link
                to={`/courses/${studyDashboard.urgentPlan.courseId}/study-plans/${studyDashboard.urgentPlan.id}`}
                className="mobile-list-item flex min-h-12 items-center gap-3 border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm hover:bg-destructive/10 focus-visible:ring-[var(--main-color)]"
              >
                <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-[var(--secondary-accent)]">
                    {studyDashboard.overduePlanCount} {studyDashboard.overduePlanCount === 1 ? 'plan needs' : 'plans need'} attention
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {studyDashboard.urgentPlan.courseCode} has {studyDashboard.urgentPlan.overdueTasks} overdue tasks
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-destructive" />
              </Link>
            )}

            <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.8fr)] md:divide-x md:divide-[var(--border-light)]">
              <div className="order-2 min-w-0 space-y-2 md:order-1 md:pr-4">
                <div className="flex items-start justify-between gap-3 px-1">
                  <div>
                    <h3 className="text-sm font-bold text-primary">Today&apos;s tasks</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {todaysStudyMinutes > 0
                        ? `${formatStudyMinutes(todaysStudyMinutes)} remaining`
                        : studyDashboard.nextStudyDate
                          ? `Clear today · next ${formatStudyDate(studyDashboard.nextStudyDate, { month: 'short', day: 'numeric' })}`
                          : 'You are clear today'}
                    </p>
                  </div>
                </div>
                {studyDashboard.tasks.length === 0 ? (
                  <div className="rounded-lg border border-[color-mix(in_srgb,var(--course-green)_64%,white)] bg-[color-mix(in_srgb,var(--course-green)_34%,white)] px-4 py-5 text-center">
                    <CheckCircle2 className="mx-auto h-6 w-6 text-[color-mix(in_srgb,var(--course-green)_72%,var(--secondary-accent))]" />
                    <p className="mt-2 text-sm font-bold text-[var(--secondary-accent)]">Today is clear</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {studyDashboard.plans[0]
                        ? `${studyDashboard.plans[0].courseCode} is your nearest exam.`
                        : 'Create a plan from a course when you are ready.'}
                    </p>
                  </div>
                ) : studyDashboard.tasks.slice(0, 5).map((task, index) => {
                  const colors = getCourseColor(task.courseColor);
                  const theme = {
                    '--focus-course-bg': colors.bg,
                    '--focus-course-border': colors.border,
                    '--focus-course-text': colors.text,
                    '--mobile-item-bg': colors.bg,
                    '--mobile-item-border': colors.border,
                    '--mobile-item-text': colors.text,
                  } as CSSProperties;
                  return (
                    <div
                      key={task.id}
                      style={theme}
                      className={`${index >= 3 ? 'hidden md:flex' : 'flex'} mobile-list-item min-h-12 w-full items-center gap-3 text-left`}
                    >
                      <span className="mobile-list-rail h-12 w-1" />
                      <button
                        type="button"
                        title={`Complete ${task.title}`}
                        aria-label={`Complete ${task.title} for ${task.courseCode}`}
                        disabled={busyStudyTask === task.id}
                        onClick={() => completeStudyTask(task.planId, task.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--focus-course-border)] bg-[color-mix(in_srgb,var(--focus-course-bg)_38%,white)] text-[var(--focus-course-text)] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] disabled:opacity-60 md:h-9 md:w-9"
                      >
                        <Check className="h-4 w-4 opacity-35" />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--secondary-accent)]">{task.title}</span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--focus-course-text)]">
                          {task.courseCode} · {formatStudyMinutes(task.estimatedMinutes)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          title={`Open notes for ${task.title}`}
                          aria-label={`Open notes for ${task.title}`}
                          disabled={busyStudyNote === task.id}
                          onClick={() => void openTopicNote(task.planId, task.id)}
                          className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-light)] bg-white text-[var(--focus-course-text)] transition-colors hover:border-[var(--focus-course-border)] hover:bg-[var(--focus-course-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] disabled:opacity-60 md:h-9 md:w-9"
                        >
                          <StickyNote className="h-4 w-4" />
                        </button>
                        {task.courseHomepageUrl && (
                          <button
                            type="button"
                            title={`Open ${task.courseCode} homepage`}
                            aria-label={`Open ${task.courseCode} homepage`}
                            onClick={() => void openExternalUrl(task.courseHomepageUrl!)}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-light)] bg-white text-[var(--focus-course-text)] transition-colors hover:border-[var(--focus-course-border)] hover:bg-[var(--focus-course-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] md:h-9 md:w-9"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
                {studyDashboard.tasks.length > 3 && (
                  <Button asChild variant="ghost" className="h-12 w-full rounded-lg md:hidden">
                    <Link to={`/calendar?date=${todayIso}`}>View all today <ChevronRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                )}
                {studyDashboard.tasks.length > 5 && (
                  <Button asChild variant="ghost" className="hidden h-11 w-full rounded-lg md:flex">
                    <Link to={`/calendar?date=${todayIso}`}>View all today <ChevronRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                )}
                {studyError && <p role="alert" className="px-1 text-xs font-semibold text-destructive">{studyError}</p>}
              </div>

              <div className="order-1 min-w-0 space-y-2 md:order-2 md:pl-4">
                <div className="px-1">
                  <h3 className="text-sm font-bold text-primary">Upcoming exams</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">The three nearest active plans</p>
                </div>
                {studyDashboard.plans.length === 0 ? (
                  <p className="rounded-lg border border-[var(--border-light)] bg-[var(--secondary-color)]/45 px-4 py-5 text-sm text-muted-foreground">
                    No active exam plans yet.
                  </p>
                ) : studyDashboard.plans.map((plan, index) => {
                  const colors = getCourseColor(plan.courseColor);
                  const progress = studyPlanProgress(plan);
                  const theme = {
                    '--focus-course-bg': colors.bg,
                    '--focus-course-border': colors.border,
                    '--focus-course-text': colors.text,
                    '--mobile-item-bg': colors.bg,
                    '--mobile-item-border': colors.border,
                    '--mobile-item-text': colors.text,
                  } as CSSProperties;
                  return (
                    <Link
                      key={plan.id}
                      to={`/courses/${plan.courseId}/study-plans/${plan.id}`}
                      style={theme}
                      className={`${index > 0 ? 'hidden md:flex' : 'flex'} mobile-list-item min-h-12 items-center gap-3`}
                    >
                      <span className="mobile-list-rail h-12 w-1" />
                      <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--secondary-accent)]">
                            {plan.courseCode} {plan.examType === 'final' ? 'Final' : 'Midterm'}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-[var(--focus-course-text)]">
                            {formatStudyDate(plan.examDate, { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-[var(--focus-course-text)]">{progress.percent}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-[var(--focus-course-border)]" style={{ width: `${progress.percent}%` }} />
                      </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </CardContent>
      </Card>

      <div
        data-testid="dashboard-widget-grid"
        className="grid gap-5 md:min-h-[28rem] md:flex-1 md:grid-cols-2 md:grid-rows-2 xl:min-h-[30rem] xl:gap-6"
      >
        <div className="md:min-h-0 md:overflow-hidden">
          <UpcomingAssignmentsWidget assignments={upcoming} courses={courses} onAdd={handleAddAssignment} compact />
        </div>
        <div className="md:min-h-0 md:overflow-hidden">
          <ClassesTodayWidget sessions={todaysSessions} courses={courses} compact />
        </div>
        <div className="md:min-h-0 md:overflow-hidden">
          <LateAssignmentsWidget assignments={late} courses={courses} compact />
        </div>
        <div className="md:min-h-0 md:overflow-hidden">
          <UpcomingEventsWidget events={upcomingEvents} onAdd={handleAddEvent} compact />
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
