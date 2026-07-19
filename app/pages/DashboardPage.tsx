import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import UpcomingAssignmentsWidget from '@/app/components/widgets/UpcomingAssignmentsWidget';
import ClassesTodayWidget from '@/app/components/widgets/ClassesTodayWidget';
import LateAssignmentsWidget from '@/app/components/widgets/LateAssignmentsWidget';
import UpcomingEventsWidget from '@/app/components/widgets/UpcomingEventsWidget';
import { mapCourse, mapAssignment, mapClassSession, mapEvent } from '@/app/data/mappers';
import type { Assignment, CalendarEvent } from '@/app/data/types';
import { todayDayName } from '@/app/data/classSchedule';
import { toIsoDate } from '@/app/data/calendarUtils';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { CalendarDays, CheckCircle2, GraduationCap, NotebookPen } from 'lucide-react';
import { Link } from 'react-router-dom';

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
  const todayIso = toIsoDate(new Date());
  const upcomingEvents = events
    .filter((event) => event.date >= todayIso)
    .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));

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
      timeZone: values.timeZone,
      description: values.description ?? null,
      userId: user?.id,
    });
    refreshEvents();
  };

  const isLoading = coursesLoading || assignmentsLoading || sessionsLoading || eventsLoading;
  const displayName = user?.firstName || user?.email?.split('@')[0] || 'Elijah';
  const statCards = [
    {
      label: 'Upcoming Assignments',
      value: upcoming.length,
      icon: NotebookPen,
      to: '/homework?status=upcoming',
      className: 'bg-[#fff2ef] text-[#f08080]',
    },
    {
      label: 'Class Today',
      value: todaysSessions.length,
      icon: GraduationCap,
      to: '/class-schedule',
      className: 'bg-[#fff8e8] text-[#d5a428]',
    },
    {
      label: 'Late Assignments',
      value: late.length,
      icon: CheckCircle2,
      to: '/homework?status=late',
      className: 'bg-[#edf9f3] text-[#43b977]',
    },
    {
      label: 'Upcoming Events',
      value: upcomingEvents.length,
      icon: CalendarDays,
      to: '/calendar',
      className: 'bg-[#f3f5ff] text-[#4f7fcb]',
    },
  ];

  if (isLoading && courses.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 md:grid md:h-full md:grid-cols-2 md:grid-rows-2 md:gap-5 md:overflow-hidden xl:gap-6">
      <div className="px-2 pb-1 pr-20 pt-3 md:hidden">
        <h1 className="text-[1.65rem] font-bold leading-tight text-[var(--secondary-accent)]">Good morning, {displayName}</h1>
        <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">Stay on top of your classes and assignments.</p>
      </div>

      <div className="grid grid-cols-4 gap-2 rounded-xl border border-[var(--border-light)] bg-card p-2 shadow-md md:hidden">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              to={stat.to}
              aria-label={`Open ${stat.label}`}
              className={`min-h-[5.9rem] rounded-lg px-2.5 py-3 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring ${stat.className}`}
            >
              <div className="mb-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface)]/70">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-lg font-bold leading-none text-[var(--secondary-accent)]">{stat.value}</p>
              <p className="mt-1 text-[9.5px] font-semibold leading-[1.08] text-[var(--secondary-accent)]">{stat.label}</p>
            </Link>
          );
        })}
      </div>

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
  );
}

export default DashboardPage;
