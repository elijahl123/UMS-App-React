import { NavLink, useNavigate } from 'react-router-dom';
import {
  Gauge,
  Calendar,
  Clock,
  BookOpen,
  FileText,
  GraduationCap,
  ChevronDown,
  LogOut,
  MessageSquare,
  User,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { cn } from '@/lib/utils';
import { mapCourse, mapAssignment, mapClassSession, mapNote } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { createDailyClassNoteTitle, findDailyClassNote, formatTimeDisplay, getTodayClassFocus } from '@/app/data/classSchedule';
import type { Course } from '@/app/data/types';

interface CreatedNoteRow {
  id: number | string;
}

const navItemClass = (collapsed: boolean) => ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-4 py-2.5 text-base font-semibold text-primary transition-colors duration-150 hover:bg-primary hover:text-primary-foreground md:h-11',
    collapsed && 'md:justify-center md:px-2',
    isActive ? 'bg-primary/25' : 'bg-primary/10'
  );

interface Props {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onClose?: () => void;
}

function Sidebar({ collapsed = false, onCollapsedChange, onClose }: Props) {
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const { user, logout, stagingAccess, isStagingAccessControlEnabled } = useAuth();
  const [courseRows] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows] = useLoadAction('loadAssignments', [], { userId: user?.id });
  const [sessionRows] = useLoadAction('loadClassSessions', [], { userId: user?.id });
  const [noteRows] = useLoadAction('loadNotes', [], { userId: user?.id });
  const [addNote, isCreatingNote] = useMutateAction<Record<string, unknown>, CreatedNoteRow[]>('createNote');
  const navigate = useNavigate();

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);
  const sessions = (sessionRows ?? []).map(mapClassSession);
  const notes = (noteRows ?? []).map(mapNote);
  const lateCount = assignments.filter((a) => a.status === 'late').length;
  const dueTodayCount = assignments.filter((a) => a.status === 'due_today').length;
  const classFocus = getTodayClassFocus(sessions, courses, now);
  const classFocusColors = getCourseColor(classFocus?.course?.color);
  const displayEmail = user?.loginEmail ?? user?.email;

  useEffect(() => {
    let intervalId: number | undefined;
    const syncNow = () => setNow(new Date());
    const currentTime = new Date();
    const nextMinuteDelay = 60_000 - currentTime.getSeconds() * 1000 - currentTime.getMilliseconds();

    const timeoutId = window.setTimeout(() => {
      syncNow();
      intervalId = window.setInterval(syncNow, 60_000);
    }, nextMinuteDelay);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  const handleNavClick = () => {
    onClose?.();
  };

  const handleLogout = () => {
    logout();
    onClose?.();
    navigate('/login', { replace: true });
  };

  const handleOpenNotes = async (course: Course | undefined) => {
    if (!course) return;
    const existingNote = findDailyClassNote(notes, course, now);
    if (existingNote) {
      onClose?.();
      navigate(`/notes/${existingNote.id}`);
      return;
    }

    const createdNotes = await addNote({
      courseId: course.id,
      title: createDailyClassNoteTitle(course, now),
      content: '',
      userId: user?.id,
    });
    const noteId = createdNotes[0]?.id;
    onClose?.();
    navigate(noteId ? `/notes/${noteId}` : `/notes?courseId=${course.id}`);
  };

  const textClass = collapsed ? 'md:sr-only' : '';
  const collapsedOnlyClass = collapsed ? 'md:hidden' : '';

  return (
    <aside
      className={cn(
        'flex h-[100dvh] max-h-[100dvh] w-72 shrink-0 flex-col overflow-hidden border-r-2 border-[var(--border-light)] bg-[var(--secondary-color)] transition-[width] duration-200',
        collapsed && 'md:w-20'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-3 border-b border-[var(--border-light)] p-4 sm:p-6 md:px-4',
          collapsed && 'md:flex-col md:justify-center md:p-3'
        )}
      >
        <img
          src="/app-icons/android/launchericon-192x192.png"
          alt="Untitled Management Software logo"
          className={cn('h-12 w-12 shrink-0 sm:h-14 sm:w-14', collapsed && 'md:h-10 md:w-10')}
        />
        <h1 className={cn('text-lg font-bold leading-tight text-primary sm:text-xl', textClass)}>UMS</h1>
        <Button
          size="icon"
          variant="ghost"
          className={cn('ml-auto hidden h-9 w-9 text-primary md:flex', collapsed && 'md:ml-0 md:h-8 md:w-8')}
          onClick={() => onCollapsedChange?.(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto h-9 w-9 text-primary md:hidden"
          onClick={onClose}
          title="Close menu"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation - grows to fill available space */}
      <nav className={cn('flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 md:px-3', collapsed && 'md:px-2')}>
        <NavLink
          to="/"
          end
          className={navItemClass(collapsed)}
          onClick={handleNavClick}
          title="Dashboard"
        >
          <Gauge className="h-5 w-5 shrink-0" />
          <span className={textClass}>Dashboard</span>
        </NavLink>
        <NavLink
          to="/calendar"
          className={navItemClass(collapsed)}
          onClick={handleNavClick}
          title="Calendar"
        >
          <Calendar className="h-5 w-5 shrink-0" />
          <span className={textClass}>Calendar</span>
        </NavLink>
        <NavLink
          to="/class-schedule"
          className={navItemClass(collapsed)}
          onClick={handleNavClick}
          title="Class Schedule"
        >
          <Clock className="h-5 w-5 shrink-0" />
          <span className={textClass}>Class Schedule</span>
        </NavLink>
        <NavLink
          to="/homework"
          className={navItemClass(collapsed)}
          onClick={handleNavClick}
          title="Homework"
        >
          <BookOpen className="h-5 w-5 shrink-0" />
          <span className={cn('flex min-w-0 flex-1 items-center gap-2', textClass)}>
            <span className="min-w-0 flex-1 truncate">Homework</span>
            <span className="flex shrink-0 items-center gap-1">
              {lateCount > 0 && (
                <Badge variant="destructive" className="px-1.5 text-xs" title={`${lateCount} late assignment${lateCount === 1 ? '' : 's'}`}>
                  {lateCount}
                </Badge>
              )}
              {dueTodayCount > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-[#fff2cf] px-1.5 text-xs text-[#6B5A1E] hover:bg-[#fff2cf]"
                  title={`${dueTodayCount} assignment${dueTodayCount === 1 ? '' : 's'} due today`}
                >
                  {dueTodayCount}
                </Badge>
              )}
            </span>
          </span>
        </NavLink>
        <NavLink
          to="/notes"
          className={navItemClass(collapsed)}
          onClick={handleNavClick}
          title="Notes"
        >
          <FileText className="h-5 w-5 shrink-0" />
          <span className={textClass}>Notes</span>
        </NavLink>

        <div className="my-2 border-t border-[var(--border-light)]" />

        <div className="group flex items-center gap-1 rounded-lg bg-primary/10 pr-2 transition-colors hover:bg-primary">
          <NavLink
            to="/courses"
            onClick={handleNavClick}
            className={cn(
              'flex flex-1 items-center gap-3 px-4 py-2.5 font-semibold text-primary transition-colors group-hover:text-primary-foreground md:h-11',
              collapsed && 'md:justify-center md:px-2'
            )}
            title="Courses"
          >
            <GraduationCap className="h-5 w-5 shrink-0" />
            <span className={textClass}>Courses</span>
          </NavLink>
          <button
            type="button"
            onClick={() => setCoursesOpen((v) => !v)}
            className={cn(
              'shrink-0 rounded-md p-1 text-primary transition-colors hover:bg-primary-foreground/20 group-hover:text-primary-foreground',
              collapsedOnlyClass
            )}
            title="Toggle course list"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', coursesOpen && 'rotate-180')} />
          </button>
        </div>
        {coursesOpen && (
          <div className={cn('ml-3 flex flex-col gap-1 border-l-2 border-primary/20 py-1', collapsedOnlyClass)}>
            {courses.map((course) => {
              const colors = getCourseColor(course.color);
              return (
                <NavLink
                  key={course.id}
                  to={`/courses/${course.id}`}
                  className="flex items-center gap-2 rounded-md border px-4 py-2 text-xs font-bold transition-all hover:shadow-sm"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  onClick={handleNavClick}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors.border }} />
                  {course.code}
                </NavLink>
              );
            })}
          </div>
        )}

        <div className="my-2 border-t border-[var(--border-light)]" />

        {isStagingAccessControlEnabled && stagingAccess?.role === 'admin' && (
          <>
            <NavLink
              to="/admin/staging-access"
              className={navItemClass(collapsed)}
              onClick={handleNavClick}
              title="Staging Access"
            >
              <Shield className="h-5 w-5 shrink-0" />
              <span className={textClass}>Staging Access</span>
            </NavLink>
            <div className="my-2 border-t border-[var(--border-light)]" />
          </>
        )}

        <div
          className={cn('rounded-lg border p-3 shadow-sm', collapsedOnlyClass)}
          style={{
            backgroundColor: classFocusColors.bg,
            borderColor: classFocusColors.border,
            color: classFocusColors.text,
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/50"
              style={{ color: classFocus ? classFocusColors.text : undefined }}
            >
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase opacity-75">
                {classFocus?.status === 'current' ? 'Current Class' : 'Next Class'}
              </p>
              <p className="truncate text-sm font-bold">
                {classFocus?.course?.code ?? (classFocus ? 'Class' : 'No more classes today')}
              </p>
            </div>
          </div>

          {classFocus ? (
            <>
              <p className="truncate text-xs font-medium opacity-85">
                {classFocus.course?.name ?? 'Course details unavailable'}
              </p>
              <p className="mt-1 text-xs opacity-85">
                {formatTimeDisplay(classFocus.session.startTime)} - {formatTimeDisplay(classFocus.session.endTime)}
              </p>
              <Button
                size="sm"
                className="mt-3 h-8 w-full gap-2 text-xs"
                disabled={!classFocus.course || isCreatingNote}
                onClick={() => handleOpenNotes(classFocus.course)}
              >
                <NotebookPen className="h-3.5 w-3.5" />
                <span>{isCreatingNote ? 'Opening...' : 'Open Notes'}</span>
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Your schedule is clear for the rest of the day.</p>
          )}
        </div>
      </nav>

      {/* Footer - action buttons */}
      <div
        className={cn(
          'shrink-0 border-t border-[var(--border-light)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 md:px-3 md:pb-4',
          collapsed && 'md:px-2'
        )}
      >
        {user && (
          <NavLink
            to="/account"
            onClick={handleNavClick}
            className={cn(
              'group mb-3 flex items-center gap-2.5 rounded-lg bg-primary/10 px-3 py-2.5 transition-colors hover:bg-primary',
              collapsed && 'md:justify-center md:px-2'
            )}
            title={`${user.firstName} ${user.lastName}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary transition-colors group-hover:bg-primary-foreground/20 group-hover:text-primary-foreground">
              {user.firstName.charAt(0)}
              {user.lastName.charAt(0)}
            </div>
            <div className={cn('min-w-0', textClass)}>
              <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary-foreground">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground transition-colors group-hover:text-primary-foreground/80">{displayEmail}</p>
            </div>
          </NavLink>
        )}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            className={cn('w-full justify-start gap-2', collapsed && 'md:justify-center md:px-2')}
            onClick={handleNavClick}
            title="Feedback"
          >
            <MessageSquare className="h-4 w-4" />
            <span className={textClass}>Feedback</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={cn('w-full justify-start gap-2', collapsed && 'md:justify-center md:px-2')}
            onClick={() => {
              navigate('/account');
              handleNavClick();
            }}
            title="Account"
          >
            <User className="h-4 w-4" />
            <span className={textClass}>Account</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              'w-full justify-start gap-2 border-[var(--border-light)] text-[var(--text-secondary)]',
              collapsed && 'md:justify-center md:px-2'
            )}
            onClick={handleLogout}
            title="Log Out"
          >
            <LogOut className="h-4 w-4" />
            <span className={textClass}>Log Out</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
