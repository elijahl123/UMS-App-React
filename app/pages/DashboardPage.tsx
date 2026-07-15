import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import UpcomingAssignmentsWidget from '@/app/components/widgets/UpcomingAssignmentsWidget';
import ClassesTodayWidget from '@/app/components/widgets/ClassesTodayWidget';
import LateAssignmentsWidget from '@/app/components/widgets/LateAssignmentsWidget';
import UpcomingEventsWidget from '@/app/components/widgets/UpcomingEventsWidget';
import { mapCourse, mapAssignment, mapClassSession, mapEvent } from '@/app/data/mappers';
import type { Assignment, CalendarEvent } from '@/app/data/types';
import { todayDayName } from '@/app/data/classSchedule';
import { useAuth } from '@/app/lib/auth/AuthContext';

function DashboardPage() {
  const { user } = useAuth();
  const [courseRows, coursesLoading] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows, assignmentsLoading, , refreshAssignments] = useLoadAction('loadAssignments', [], {
    userId: user?.id,
  });
  const [sessionRows, sessionsLoading] = useLoadAction('loadClassSessions', [], { userId: user?.id });
  const [eventRows, eventsLoading, , refreshEvents] = useLoadAction('loadEvents', [], { userId: user?.id });

  const [addAssignment] = useMutateAction('createAssignment');
  const [addEvent] = useMutateAction('createEvent');

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);
  const sessions = (sessionRows ?? []).map(mapClassSession);
  const events = (eventRows ?? []).map(mapEvent);

  const upcoming = assignments.filter((a) => a.status === 'upcoming' || a.status === 'due_today');
  const late = assignments.filter((a) => a.status === 'late');
  const todaysSessions = sessions.filter((s) => s.day === todayDayName());

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
      description: values.description ?? null,
      userId: user?.id,
    });
    refreshEvents();
  };

  const isLoading = coursesLoading || assignmentsLoading || sessionsLoading || eventsLoading;

  if (isLoading && courses.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 sm:gap-4 md:grid md:h-full md:grid-cols-2 md:grid-rows-2 md:gap-5 md:overflow-hidden xl:gap-6">
      <div className="min-h-[18rem] overflow-hidden md:min-h-0">
        <UpcomingAssignmentsWidget assignments={upcoming} courses={courses} onAdd={handleAddAssignment} compact />
      </div>
      <div className="min-h-[18rem] overflow-hidden md:min-h-0">
        <ClassesTodayWidget sessions={todaysSessions} courses={courses} compact />
      </div>
      <div className="min-h-[18rem] overflow-hidden md:min-h-0">
        <LateAssignmentsWidget assignments={late} courses={courses} compact />
      </div>
      <div className="min-h-[18rem] overflow-hidden md:min-h-0">
        <UpcomingEventsWidget events={events} onAdd={handleAddEvent} compact />
      </div>
    </div>
  );
}

export default DashboardPage;
