import { NavLink, useNavigate } from 'react-router-dom';
import { Gauge, Calendar, Clock, BookOpen, FileText, GraduationCap, ChevronDown, LogOut, MessageSquare, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useLoadAction } from '@/app/lib/api/hooks';
import { cn } from '@/lib/utils';
import { mapCourse, mapAssignment } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import { useAuth } from '@/app/lib/auth/AuthContext';

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-4 py-2.5 text-base font-semibold text-primary transition-colors duration-150 hover:bg-primary hover:text-primary-foreground',
    isActive ? 'bg-primary/25' : 'bg-primary/10'
  );

interface Props {
  onClose?: () => void;
}

function Sidebar({ onClose }: Props) {
  const [coursesOpen, setCoursesOpen] = useState(false);
  const { user, logout } = useAuth();
  const [courseRows] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows] = useLoadAction('loadAssignments', [], { userId: user?.id });
  const navigate = useNavigate();

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);
  const lateCount = assignments.filter((a) => a.status === 'late').length;

  const handleNavClick = () => {
    onClose?.();
  };

  const handleLogout = () => {
    logout();
    onClose?.();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r-2 border-[var(--border-light)] bg-[var(--secondary-color)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-light)] p-4 sm:p-6">
        <img
          src="/storages/zwD6Awu5SX/static/UMSLogo.svg"
          alt="Untitled Management Software logo"
          className="h-12 w-12 shrink-0 sm:h-14 sm:w-14"
        />
        <h1 className="text-lg font-bold leading-tight text-primary sm:text-xl">UMS</h1>
      </div>

      {/* Navigation - grows to fill available space */}
      <nav className="flex flex-grow flex-col gap-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <NavLink
          to="/"
          end
          className={navItemClass}
          onClick={handleNavClick}
        >
          <Gauge className="h-5 w-5 shrink-0" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink
          to="/calendar"
          className={navItemClass}
          onClick={handleNavClick}
        >
          <Calendar className="h-5 w-5 shrink-0" />
          <span>Calendar</span>
        </NavLink>
        <NavLink
          to="/class-schedule"
          className={navItemClass}
          onClick={handleNavClick}
        >
          <Clock className="h-5 w-5 shrink-0" />
          <span>Class Schedule</span>
        </NavLink>
        <NavLink
          to="/homework"
          className={navItemClass}
          onClick={handleNavClick}
        >
          <BookOpen className="h-5 w-5 shrink-0" />
          <span className="flex items-center gap-2">
            Homework
            {lateCount > 0 && (
              <Badge variant="destructive" className="ml-auto text-xs">
                {lateCount}
              </Badge>
            )}
          </span>
        </NavLink>
        <NavLink
          to="/notes"
          className={navItemClass}
          onClick={handleNavClick}
        >
          <FileText className="h-5 w-5 shrink-0" />
          <span>Notes</span>
        </NavLink>

        <div className="my-2 border-t border-[var(--border-light)]" />

        <div className="group flex items-center gap-1 rounded-lg bg-primary/10 pr-2 transition-colors hover:bg-primary">
          <NavLink
            to="/courses"
            onClick={handleNavClick}
            className="flex flex-1 items-center gap-3 px-4 py-2.5 font-semibold text-primary transition-colors group-hover:text-primary-foreground"
          >
            <GraduationCap className="h-5 w-5 shrink-0" />
            <span>Courses</span>
          </NavLink>
          <button
            type="button"
            onClick={() => setCoursesOpen((v) => !v)}
            className="shrink-0 rounded-md p-1 text-primary transition-colors hover:bg-primary-foreground/20 group-hover:text-primary-foreground"
            title="Toggle course list"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', coursesOpen && 'rotate-180')} />
          </button>
        </div>
        {coursesOpen && (
          <div className="ml-3 flex flex-col gap-1 border-l-2 border-primary/20 py-1">
            {courses.map((course) => {
              const colors = getCourseColor(course.color);
              return (
                <NavLink
                  key={course.id}
                  to={`/courses/${course.id}`}
                  className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                  onClick={handleNavClick}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }} />
                  {course.code}
                </NavLink>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer - action buttons */}
      <div className="shrink-0 border-t border-[var(--border-light)] p-4 sm:p-6">
        {user && (
          <NavLink
            to="/account"
            onClick={handleNavClick}
            className="group mb-3 flex items-center gap-2.5 rounded-lg bg-primary/10 px-3 py-2.5 transition-colors hover:bg-primary"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary transition-colors group-hover:bg-primary-foreground/20 group-hover:text-primary-foreground">
              {user.firstName.charAt(0)}
              {user.lastName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary-foreground">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground transition-colors group-hover:text-primary-foreground/80">{user.email}</p>
            </div>
          </NavLink>
        )}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleNavClick}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Feedback</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="w-full justify-start gap-2"
            onClick={() => {
              navigate('/account');
              handleNavClick();
            }}
          >
            <User className="h-4 w-4" />
            <span>Account</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start gap-2 border-[var(--border-light)] text-[var(--text-secondary)]"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            <span>Log Out</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
