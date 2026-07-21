import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  Clock,
  FileText,
  Gauge,
  GraduationCap,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Shield,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AssignmentFormDialog from '@/app/components/widgets/AssignmentFormDialog';
import AddEventDialog from '@/app/components/widgets/AddEventDialog';
import ClassSessionFormDialog from '@/app/components/widgets/ClassSessionFormDialog';
import CourseFormDialog from '@/app/components/widgets/CourseFormDialog';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { mapCourse } from '@/app/data/mappers';
import { cn } from '@/lib/utils';
import type { Assignment, CalendarEvent, ClassSession, Course } from '@/app/data/types';

type AddTarget = 'assignment' | 'event' | 'course' | 'class' | null;

const baseNavClass =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-primary';
const mobileSheetClass =
  'top-auto bottom-0 max-h-[calc(100dvh-1rem)] translate-y-0 overflow-y-auto rounded-b-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom md:bottom-auto md:top-[50%] md:max-h-[85vh] md:translate-y-[-50%] md:rounded-lg md:pb-6';

function MobileBottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, stagingAccess, isStagingAccessControlEnabled } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [activeAddTarget, setActiveAddTarget] = useState<AddTarget>(null);

  const [courseRows] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [addAssignment] = useMutateAction('createAssignment');
  const [addEvent] = useMutateAction('createEvent');
  const [addCourse] = useMutateAction('createCourse');
  const [addSession] = useMutateAction('createClassSession');

  const courses = (courseRows ?? []).map(mapCourse);
  const hasCourses = courses.length > 0;
  const isMoreActive = /^\/(notes|courses|class-schedule|account|admin)\b/.test(location.pathname);

  const openAddTarget = (target: Exclude<AddTarget, null>) => {
    setAddOpen(false);
    setActiveAddTarget(target);
  };

  const handleNoteAdd = () => {
    setAddOpen(false);
    navigate('/notes/new');
  };

  const handleMoreNavigate = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    setMoreOpen(false);
    navigate('/login', { replace: true });
  };

  const handleAssignmentSubmit = async (values: Omit<Assignment, 'id'> & { id?: string }) => {
    await addAssignment({
      courseId: values.courseId,
      name: values.name,
      dueDate: values.dueDate,
      dueTime: values.dueTime ?? null,
      dueTimeZone: values.dueTimeZone,
      description: values.description ?? null,
      userId: user?.id,
    });
  };

  const handleEventSubmit = async (values: Omit<CalendarEvent, 'id'>) => {
    await addEvent({
      title: values.title,
      date: values.date,
      time: values.time ?? null,
      timeZone: values.timeZone,
      description: values.description ?? null,
      userId: user?.id,
    });
  };

  const handleCourseSubmit = async (values: Omit<Course, 'id'> & { id?: string }) => {
    await addCourse({
      code: values.code,
      name: values.name,
      color: values.color,
      userId: user?.id,
    });
  };

  const handleSessionSubmit = async (values: Omit<ClassSession, 'id'> & { id?: string }) => {
    await addSession({
      courseId: values.courseId,
      day: values.day,
      startTime: values.startTime,
      endTime: values.endTime,
      location: values.location?.trim() || null,
      userId: user?.id,
    });
  };

  const renderMoreButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    variant: 'default' | 'secondary' | 'outline' = 'outline'
  ) => (
    <Button type="button" variant={variant} className="h-12 justify-start gap-3" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </Button>
  );

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-light)] bg-background/95 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgb(15_23_42/0.10)] backdrop-blur md:hidden"
        aria-label="Mobile primary navigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
          <NavLink to="/" end className={({ isActive }) => cn(baseNavClass, isActive && 'text-primary')}>
            <Gauge className="h-5 w-5" />
            <span>Home</span>
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => cn(baseNavClass, isActive && 'text-primary')}>
            <Calendar className="h-5 w-5" />
            <span>Calendar</span>
          </NavLink>
          <div className="flex justify-center">
            <Button
              type="button"
              size="icon"
              className="mb-1 h-16 w-16 rounded-full shadow-lg"
              aria-label="Add anything"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-8 w-8" />
            </Button>
          </div>
          <NavLink to="/homework" className={({ isActive }) => cn(baseNavClass, isActive && 'text-primary')}>
            <BookOpen className="h-5 w-5" />
            <span>Homework</span>
          </NavLink>
          <button type="button" className={cn(baseNavClass, isMoreActive && 'text-primary')} onClick={() => setMoreOpen(true)}>
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className={mobileSheetClass}>
          <DialogHeader>
            <DialogTitle>Add</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" className="h-12 justify-start gap-3" disabled={!hasCourses} onClick={() => openAddTarget('assignment')}>
              <BookOpen className="h-4 w-4" />
              <span>Add Assignment</span>
            </Button>
            <Button type="button" className="h-12 justify-start gap-3" variant="outline" onClick={() => openAddTarget('event')}>
              <Calendar className="h-4 w-4" />
              <span>Add Event</span>
            </Button>
            <Button type="button" className="h-12 justify-start gap-3" variant="outline" onClick={() => openAddTarget('course')}>
              <GraduationCap className="h-4 w-4" />
              <span>Add Course</span>
            </Button>
            <Button type="button" className="h-12 justify-start gap-3" variant="outline" disabled={!hasCourses} onClick={() => openAddTarget('class')}>
              <Clock className="h-4 w-4" />
              <span>Add Class</span>
            </Button>
            <Button type="button" className="h-12 justify-start gap-3" variant="outline" onClick={handleNoteAdd}>
              <FileText className="h-4 w-4" />
              <span>Add Note</span>
            </Button>
            {!hasCourses && <p className="px-1 text-xs text-muted-foreground">Add a course before creating assignments or classes.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className={mobileSheetClass}>
          <DialogHeader>
            <DialogTitle>More</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {renderMoreButton('Notes', <FileText className="h-4 w-4" />, () => handleMoreNavigate('/notes'))}
            {renderMoreButton('Courses', <GraduationCap className="h-4 w-4" />, () => handleMoreNavigate('/courses'))}
            {renderMoreButton('Class Schedule', <Clock className="h-4 w-4" />, () => handleMoreNavigate('/class-schedule'))}
            {isStagingAccessControlEnabled &&
              stagingAccess?.role === 'admin' &&
              renderMoreButton('Staging Access', <Shield className="h-4 w-4" />, () => handleMoreNavigate('/admin/staging-access'))}
            {renderMoreButton('Feedback', <MessageSquare className="h-4 w-4" />, () => setMoreOpen(false), 'secondary')}
            {renderMoreButton('Account', <User className="h-4 w-4" />, () => handleMoreNavigate('/account'), 'secondary')}
            {renderMoreButton('Log Out', <LogOut className="h-4 w-4" />, handleLogout, 'outline')}
          </div>
        </DialogContent>
      </Dialog>

      <AssignmentFormDialog
        open={activeAddTarget === 'assignment'}
        onOpenChange={(open) => setActiveAddTarget(open ? 'assignment' : null)}
        courses={courses}
        onSubmit={handleAssignmentSubmit}
      />
      <AddEventDialog
        open={activeAddTarget === 'event'}
        onOpenChange={(open) => setActiveAddTarget(open ? 'event' : null)}
        onSubmit={handleEventSubmit}
      />
      <CourseFormDialog
        open={activeAddTarget === 'course'}
        onOpenChange={(open) => setActiveAddTarget(open ? 'course' : null)}
        onSubmit={handleCourseSubmit}
      />
      <ClassSessionFormDialog
        open={activeAddTarget === 'class'}
        onOpenChange={(open) => setActiveAddTarget(open ? 'class' : null)}
        courses={courses}
        onSubmit={handleSessionSubmit}
      />
    </>
  );
}

export default MobileBottomNavigation;
