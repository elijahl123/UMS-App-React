import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  BookOpen,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Link2,
  ExternalLink,
  Plus,
  ClipboardList,
  CalendarDays,
  StickyNote,
  Target,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CourseFormDialog from '@/app/components/widgets/CourseFormDialog';
import CourseLinkFormDialog from '@/app/components/widgets/CourseLinkFormDialog';
import { mapCourse, mapAssignment, mapClassSession, mapNote, mapCourseLink } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import { formatAssignmentDue, formatIsoDate, normalizeDateString } from '@/app/data/assignmentDates';
import type { Course, CourseLink } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { useStudyPlanSummaries } from '@/app/lib/studyPlans/useStudyPlans';
import { formatStudyDate, isStudyPlanBehind, studyPlanProgress } from '@/app/data/studyPlans';
import { openExternalUrl } from '@/app/lib/externalLinks';

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDueDate(dueDate: string): string {
  return formatIsoDate(normalizeDateString(dueDate), { month: 'short', day: 'numeric' });
}

function formatTimeDisplay(time: string): string {
  // Convert HH:MM or HH:MM:SS to 12-hour format for display
  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time;
  const hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = hours < 12 ? 'a.m.' : 'p.m.';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutes} ${period}`;
}

const STATUS_STYLES: Record<string, string> = {
  late: 'bg-[color-mix(in_srgb,var(--main-accent)_18%,var(--surface))] text-[var(--main-accent)]',
  completed: 'bg-[color-mix(in_srgb,var(--course-green)_48%,var(--surface))] text-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))]',
  due_today: 'bg-[color-mix(in_srgb,var(--course-yellow)_50%,var(--surface))] text-[color-mix(in_srgb,var(--course-yellow)_62%,var(--secondary-accent))]',
  upcoming: 'bg-[color-mix(in_srgb,var(--course-yellow)_50%,var(--surface))] text-[color-mix(in_srgb,var(--course-yellow)_62%,var(--secondary-accent))]',
};

function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [courseRows, coursesLoading] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows, assignmentsLoading] = useLoadAction('loadAssignments', [], { userId: user?.id });
  const [sessionRows, sessionsLoading] = useLoadAction('loadClassSessions', [], { userId: user?.id });
  const [noteRows] = useLoadAction('loadNotes', [], { userId: user?.id });
  const [linkRows, , , reloadLinks] = useLoadAction('loadCourseLinks', [], { userId: user?.id });
  const [studyPlans] = useStudyPlanSummaries(courseId, user?.id);
  const [editCourse] = useMutateAction('updateCourse');
  const [removeCourse] = useMutateAction('deleteCourse');
  const [addLink] = useMutateAction('createCourseLink');
  const [editLink] = useMutateAction('updateCourseLink');
  const [removeLink] = useMutateAction('deleteCourseLink');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<CourseLink | null>(null);

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);
  const sessions = (sessionRows ?? []).map(mapClassSession);
  const notes = (noteRows ?? []).map(mapNote);
  const links = (linkRows ?? []).map(mapCourseLink);

  const course = courses.find((c) => c.id === courseId);
  const courseAssignments = assignments
    .filter((a) => a.courseId === courseId)
    .sort((a, b) => `${a.dueDate} ${a.dueTime ?? ''}`.localeCompare(`${b.dueDate} ${b.dueTime ?? ''}`));
  const openAssignments = courseAssignments.filter((a) => a.status !== 'completed');
  const lateCount = courseAssignments.filter((a) => a.status === 'late').length;
  const courseSessions = sessions
    .filter((s) => s.courseId === courseId)
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  const courseNotes = notes
    .filter((n) => n.courseId === courseId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const courseLinks = links
    .filter((l) => l.courseId === courseId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const isLoading = coursesLoading || assignmentsLoading || sessionsLoading;

  const handleSubmit = async (values: Omit<Course, 'id'> & { id?: string }) => {
    if (values.id) {
      await editCourse({
        id: values.id,
        code: values.code,
        name: values.name,
        color: values.color,
        homepageUrl: values.homepageUrl,
        userId: user?.id,
      });
    }
  };

  const handleDelete = async (id: string) => {
    await removeCourse({ id, userId: user?.id });
    navigate('/courses');
  };

  const handleAddLink = () => {
    setEditingLink(null);
    setLinkDialogOpen(true);
  };

  const handleEditLink = (link: CourseLink) => {
    setEditingLink(link);
    setLinkDialogOpen(true);
  };

  const handleLinkSubmit = async (values: { label: string; url: string; id?: string }) => {
    if (values.id) {
      await editLink({ id: values.id, label: values.label, url: values.url, userId: user?.id });
    } else if (course) {
      await addLink({ courseId: course.id, label: values.label, url: values.url, userId: user?.id });
    }
    setLinkDialogOpen(false);
    setEditingLink(null);
    await reloadLinks();
  };

  const handleDeleteLink = async (id: string) => {
    if (confirm('Delete this link?')) {
      await removeLink({ id, userId: user?.id });
      await reloadLinks();
    }
  };

  if (isLoading && !course) {
    return <div className="p-6 text-center text-muted-foreground">Loading course...</div>;
  }

  if (!course) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Course not found</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="gap-2" onClick={() => navigate('/courses')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Courses
          </Button>
        </CardContent>
      </Card>
    );
  }

  const colors = getCourseColor(course.color);
  const courseItemStyle = {
    '--mobile-item-bg': colors.bg,
    '--mobile-item-border': colors.border,
    '--mobile-item-text': colors.text,
  } as React.CSSProperties;

  return (
    <div className="mobile-page-stack mx-auto w-full max-w-6xl pb-28 md:h-full md:overflow-y-auto md:pb-6 md:pr-1">
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate('/courses')}
        className="flex w-fit shrink-0 items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Courses
      </button>

      {/* Header card */}
      <Card className="h-auto shrink-0 overflow-hidden border-l-4" style={{ borderLeftColor: colors.border }}>
        <CardContent className="flex flex-none flex-col gap-4 overflow-visible pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-base font-bold sm:h-14 sm:w-14 sm:text-lg"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {course.code.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <Badge style={{ backgroundColor: colors.bg, color: colors.text }} className="text-xs font-bold">
                {course.code}
              </Badge>
              <h2 className="mt-1 break-words text-lg font-bold leading-snug text-foreground sm:text-xl">{course.name}</h2>
            </div>
          </div>
          <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:w-auto sm:flex sm:items-center">
            {course.homepageUrl && (
              <Button
                variant="outline"
                size="sm"
                className="col-span-2 gap-2 sm:col-span-1"
                onClick={() => void openExternalUrl(course.homepageUrl!)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Homepage
              </Button>
            )}
            <Button variant="outline" size="sm" className="flex-1 gap-2 sm:flex-none" onClick={() => setDialogOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2 text-destructive sm:flex-none"
              onClick={() => {
                if (confirm('Deleting this course also removes its assignments and class sessions. Continue?')) {
                  handleDelete(course.id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="mobile-list-item flex items-center gap-3" style={courseItemStyle}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--card)_45%,transparent)]">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{openAssignments.length}</p>
            <p className="text-xs font-semibold opacity-80">Open Assignments</p>
          </div>
        </div>
        <div className="mobile-list-item flex items-center gap-3" style={courseItemStyle}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--card)_45%,transparent)]">
            <AlertTriangle className={`h-5 w-5 ${lateCount > 0 ? 'text-[var(--main-accent)]' : ''}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-2xl font-bold leading-none ${lateCount > 0 ? 'text-[var(--main-accent)]' : ''}`}>{lateCount}</p>
            <p className="text-xs font-semibold opacity-80">Late</p>
          </div>
        </div>
        <div className="mobile-list-item col-span-2 flex items-center gap-3 sm:col-span-1" style={courseItemStyle}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--card)_45%,transparent)]">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{courseSessions.length}</p>
            <p className="text-xs font-semibold opacity-80">Weekly Sessions</p>
          </div>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <BookOpen className="h-4 w-4" style={{ color: colors.text }} />
            <CardTitle className="text-base">Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {courseAssignments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No assignments for this course.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {courseAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="mobile-list-item flex items-center justify-between gap-3 sm:p-3"
                    style={courseItemStyle}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="mobile-list-icon h-8 w-8 rounded-md">
                        {a.status === 'late' ? (
                          <AlertTriangle className="h-4 w-4 text-[var(--main-accent)]" />
                        ) : a.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))]" />
                        ) : (
                          <ClipboardList className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-bold">{a.name}</p>
                        <p className="text-xs opacity-80">{formatAssignmentDue(a, { month: 'short', day: 'numeric' })}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className={`shrink-0 text-xs ${STATUS_STYLES[a.status]}`}>
                      {a.status === 'due_today' ? 'due today' : a.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Clock className="h-4 w-4" style={{ color: colors.text }} />
            <CardTitle className="text-base">Class Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {courseSessions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No scheduled sessions for this course.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {courseSessions.map((s) => (
                  <div
                    key={s.id}
                    className="mobile-list-item flex items-center justify-between gap-3 sm:p-3"
                    style={courseItemStyle}
                  >
                    <div className="flex min-w-0 shrink-0 items-center gap-2">
                      <div className="mobile-list-icon h-8 w-8 rounded-md">
                        <Clock className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-bold">{s.day}</span>
                    </div>
                    <span className="min-w-0 break-words text-right text-xs font-semibold opacity-80">
                      {formatTimeDisplay(s.startTime)} - {formatTimeDisplay(s.endTime)}
                      {s.location ? ` · ${s.location}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-auto shrink-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" style={{ color: colors.text }} />
            <CardTitle className="text-base">Study Plans</CardTitle>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => navigate(`/courses/${course.id}/study-plans/new`)}>
            <Plus className="h-3.5 w-3.5" />
            Create Plan
          </Button>
        </CardHeader>
        <CardContent>
          {studyPlans.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold">No study plan yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">Plan an exam, assignment, or project into a realistic daily schedule.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {studyPlans.map((plan) => {
                const progress = studyPlanProgress(plan);
                const behind = isStudyPlanBehind(plan);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => navigate(`/courses/${course.id}/study-plans/${plan.id}`)}
                    className="mobile-list-item text-left sm:p-4"
                    style={courseItemStyle}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold">{plan.targetTitle}</p>
                        <p className="text-xs opacity-80">{plan.targetType === 'exam' ? 'Exam' : 'Due'} {formatStudyDate(plan.targetDate)}</p>
                      </div>
                      <Badge variant="secondary" className={behind ? 'bg-destructive/10 text-destructive' : ''}>
                        {plan.archived ? 'Archived' : behind ? 'Refresh' : `${progress.percent}%`}
                      </Badge>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--card)_60%,transparent)]">
                      <div className="h-full rounded-full" style={{ width: `${progress.percent}%`, backgroundColor: colors.border }} />
                    </div>
                    <p className="mt-2 truncate text-xs opacity-80">
                      {plan.nextTaskTitle ? `Next: ${plan.nextTaskTitle}` : 'All study tasks complete'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid shrink-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: colors.text }} />
            <CardTitle className="text-base">Notes</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/notes')}>
            View All
          </Button>
        </CardHeader>
        <CardContent>
          {courseNotes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No notes for this course yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {courseNotes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => navigate(`/notes/${n.id}`)}
                  className="mobile-list-item w-full cursor-pointer text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] sm:p-3"
                  style={courseItemStyle}
                >
                  <div className="flex items-center gap-2">
                    <div className="mobile-list-icon h-8 w-8 rounded-md">
                      <StickyNote className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{n.title}</p>
                      <p className="text-xs opacity-80">{formatDueDate(n.updatedAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Quick Links</CardTitle>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAddLink}>
            <Plus className="h-3.5 w-3.5" />
            Add Link
          </Button>
        </CardHeader>
        <CardContent>
          {courseLinks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No quick links added yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {courseLinks.map((l) => {
                const linkColor = colors;
                return (
                  <div
                    key={l.id}
                    className="mobile-list-item group flex items-center justify-between gap-2 sm:p-3"
                    style={{
                      '--mobile-item-bg': linkColor.bg,
                      '--mobile-item-border': linkColor.border,
                      '--mobile-item-text': linkColor.text,
                    } as React.CSSProperties}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = linkColor.text;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = linkColor.text;
                    }}
                  >
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold transition-colors"
                      style={{ color: 'inherit' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = linkColor.border;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'inherit';
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" style={{ color: linkColor.border }} />
                      <span className="truncate">{l.label}</span>
                    </a>
                    <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity xl:opacity-0 xl:group-hover:opacity-100 xl:group-focus-within:opacity-100">
                      <button
                        type="button"
                        title="Edit link"
                        aria-label={`Edit ${l.label} link`}
                        onClick={() => handleEditLink(l)}
                        className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] md:h-9 md:w-9 xl:h-7 xl:w-7"
                        style={{ '--hover-color': linkColor.border } as React.CSSProperties}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = linkColor.border;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--color-text-muted-foreground)';
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete link"
                        aria-label={`Delete ${l.label} link`}
                        onClick={() => handleDeleteLink(l.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] md:h-9 md:w-9 xl:h-7 xl:w-7"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#dc2626';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--color-text-muted-foreground)';
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      <CourseFormDialog open={dialogOpen} onOpenChange={setDialogOpen} course={course} onSubmit={handleSubmit} />
      <CourseLinkFormDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        link={editingLink}
        onSubmit={handleLinkSubmit}
      />
    </div>
  );
}

export default CoursePage;
