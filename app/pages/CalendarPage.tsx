import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { mapCourse, mapAssignment, mapClassSession, mapEvent } from '@/app/data/mappers';
import { buildCalendarItems, type CalendarItem } from '@/app/data/calendarUtils';
import CalendarMonthGrid from '@/app/components/calendar/CalendarMonthGrid';
import DayDetailsDialog from '@/app/components/calendar/DayDetailsDialog';
import AddEventDialog from '@/app/components/widgets/AddEventDialog';
import EditEventDialog from '@/app/components/widgets/EditEventDialog';
import type { CalendarEvent } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';

function parseDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function CalendarPage() {
  const { user } = useAuth();
  const today = new Date();
  const [searchParams] = useSearchParams();
  const initialDate = parseDateParam(searchParams.get('date'));
  const [cursor, setCursor] = useState({
    year: (initialDate ?? today).getFullYear(),
    month: (initialDate ?? today).getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ? searchParams.get('date') : null);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<(CalendarEvent & { id: string }) | null>(null);
  const [editEventOpen, setEditEventOpen] = useState(false);

  const [courseRows, coursesLoading] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows, assignmentsLoading] = useLoadAction('loadAssignments', [], { userId: user?.id });
  const [sessionRows, sessionsLoading] = useLoadAction('loadClassSessions', [], { userId: user?.id });
  const [eventRows, eventsLoading, , refreshEvents] = useLoadAction('loadEvents', [], { userId: user?.id });
  const [addEvent] = useMutateAction('createEvent');
  const [updateEventMutation] = useMutateAction('updateEvent');
  const [deleteEventMutation] = useMutateAction('deleteEvent');

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);
  const sessions = (sessionRows ?? []).map(mapClassSession);
  const events = (eventRows ?? []).map(mapEvent);

  useEffect(() => {
    const linkedDate = parseDateParam(searchParams.get('date'));
    if (!linkedDate) return;
    setCursor({ year: linkedDate.getFullYear(), month: linkedDate.getMonth() });
    setSelectedDate(searchParams.get('date'));
  }, [searchParams]);

  const itemsByDate = useMemo(
    () => buildCalendarItems(cursor.year, cursor.month, assignments, sessions, events, courses),
    [cursor, assignments, sessions, events, courses]
  );

  const isLoading = coursesLoading || assignmentsLoading || sessionsLoading || eventsLoading;

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const goToMonth = (delta: number) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const goToToday = () => setCursor({ year: today.getFullYear(), month: today.getMonth() });

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

  const handleEventClick = (item: CalendarItem) => {
    if (item.type === 'event' && 'id' in item.raw) {
      const event = item.raw as CalendarEvent & { id: string };
      setEditingEvent({
        id: item.id.replace('event-', ''),
        title: event.title,
        date: event.date,
        time: event.time,
        description: event.description,
      });
      setEditEventOpen(true);
    }
  };

  const handleEditEvent = async (values: CalendarEvent & { id: string }) => {
    await updateEventMutation({
      id: values.id,
      title: values.title,
      date: values.date,
      time: values.time ?? null,
      description: values.description ?? null,
      userId: user?.id,
    });
    refreshEvents();
    setEditEventOpen(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    await deleteEventMutation({ id: eventId, userId: user?.id });
    refreshEvents();
    setEditEventOpen(false);
  };

  if (isLoading && courses.length === 0 && assignments.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">Loading calendar...</div>;
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <CardTitle>{monthLabel}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => goToMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={goToToday}>
            Today
          </Button>
          <Button size="icon" variant="outline" onClick={() => goToMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" className="bg-primary/15 text-primary hover:bg-primary/25" onClick={() => setAddEventOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Event
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden">
        <CalendarMonthGrid
          year={cursor.year}
          month={cursor.month}
          itemsByDate={itemsByDate}
          onDayClick={setSelectedDate}
        />
      </CardContent>
      <DayDetailsDialog
        open={selectedDate !== null}
        onOpenChange={(open) => !open && setSelectedDate(null)}
        date={selectedDate}
        items={selectedDate ? itemsByDate.get(selectedDate) ?? [] : []}
        onEventClick={handleEventClick}
      />
      <AddEventDialog open={addEventOpen} onOpenChange={setAddEventOpen} onSubmit={handleAddEvent} />
      <EditEventDialog open={editEventOpen} onOpenChange={setEditEventOpen} event={editingEvent} onSubmit={handleEditEvent} onDelete={handleDeleteEvent} />
    </Card>
  );
}

export default CalendarPage;
