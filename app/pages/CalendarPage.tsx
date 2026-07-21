import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, FileText, Plus } from 'lucide-react';
import { mapCourse, mapAssignment, mapClassSession, mapEvent } from '@/app/data/mappers';
import { buildCalendarItems, toIsoDate, type CalendarItem } from '@/app/data/calendarUtils';
import CalendarMonthGrid from '@/app/components/calendar/CalendarMonthGrid';
import DayDetailsDialog from '@/app/components/calendar/DayDetailsDialog';
import AddEventDialog from '@/app/components/widgets/AddEventDialog';
import EditEventDialog from '@/app/components/widgets/EditEventDialog';
import type { Assignment, CalendarEvent, ClassSession } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';

function parseDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatSelectedDate(value: string): string {
  return dateFromIso(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value?: string): string | null {
  if (!value) return null;
  const [hours, minutes] = value.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatItemTime(item: CalendarItem): string {
  if (item.type === 'class') {
    const session = item.raw as ClassSession;
    const start = formatTime(session.startTime);
    const end = formatTime(session.endTime);
    const time = start && end ? `${start} - ${end}` : 'Class session';
    return session.location ? `${time} · ${session.location}` : time;
  }

  const time = formatTime(item.type === 'assignment' ? (item.raw as Assignment).dueTime : (item.raw as CalendarEvent).time);
  return time ?? (item.type === 'assignment' ? 'Due all day' : 'All day');
}

function itemTypeLabel(type: CalendarItem['type']): string {
  if (type === 'assignment') return 'Assignment';
  if (type === 'class') return 'Class';
  return 'Event';
}

function itemIcon(type: CalendarItem['type']) {
  if (type === 'assignment') return FileText;
  if (type === 'class') return BookOpen;
  return CalendarDays;
}

function useIsDesktopCalendar() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

function CalendarPage() {
  const { user } = useAuth();
  const isDesktopCalendar = useIsDesktopCalendar();
  const today = new Date();
  const todayIso = toIsoDate(today);
  const [searchParams] = useSearchParams();
  const initialDate = parseDateParam(searchParams.get('date'));
  const initialDateIso = initialDate ? searchParams.get('date') : todayIso;
  const [cursor, setCursor] = useState({
    year: (initialDate ?? today).getFullYear(),
    month: (initialDate ?? today).getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string>(initialDateIso ?? todayIso);
  const [dialogDate, setDialogDate] = useState<string | null>(null);
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
    setSelectedDate(searchParams.get('date') ?? todayIso);
  }, [searchParams, todayIso]);

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
      setSelectedDate(toIsoDate(next));
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const goToToday = () => {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedDate(todayIso);
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

  const handleEventClick = (item: CalendarItem) => {
    if (item.type === 'event' && 'id' in item.raw) {
      const event = item.raw as CalendarEvent & { id: string };
      setEditingEvent({
        id: item.id.replace('event-', ''),
        title: event.title,
        date: event.date,
        time: event.time,
        timeZone: event.timeZone,
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
      timeZone: values.timeZone,
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

  const selectedItems = itemsByDate.get(selectedDate) ?? [];
  const selectedDateLabel = formatSelectedDate(selectedDate);
  const itemCountLabel = `${selectedItems.length} ${selectedItems.length === 1 ? 'item' : 'items'}`;

  return (
    <>
      {!isDesktopCalendar && (
        <section className="-mx-3 -mt-[calc(0.75rem+env(safe-area-inset-top))] min-h-[calc(100dvh-6.25rem-env(safe-area-inset-bottom))] bg-background">
          <div className="relative overflow-hidden px-5 pb-4 pt-[calc(2.25rem+env(safe-area-inset-top))]">
            <div className="relative pr-20">
              <h1 className="whitespace-nowrap text-[clamp(1.55rem,8vw,3.05rem)] font-bold leading-none text-[var(--secondary-accent)]">{monthLabel}</h1>
            </div>
          </div>

          <div className="px-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-11 w-11 rounded-lg border-primary/30 bg-card text-primary"
                  onClick={() => goToMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-11 w-11 rounded-lg border-primary/30 bg-card text-primary"
                  onClick={() => goToMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-11 min-w-24 rounded-lg border-primary/35 bg-card px-6 text-sm text-primary"
                onClick={goToToday}
              >
                Today
              </Button>
              <Button
                size="sm"
                className="h-11 rounded-lg border-primary bg-primary px-3 text-sm text-primary-foreground shadow-[0_10px_20px_rgb(240_128_128/0.22)] hover:bg-[var(--main-color-shade)]"
                onClick={() => setAddEventOpen(true)}
              >
                <Plus className="h-5 w-5" />
                <span>Add Event</span>
              </Button>
            </div>

            <CalendarMonthGrid
              year={cursor.year}
              month={cursor.month}
              itemsByDate={itemsByDate}
              selectedDate={selectedDate}
              variant="mobile"
              onDayClick={setSelectedDate}
            />

            <div className="mt-4 flex items-center justify-between gap-4">
              <h2 className="min-w-0 text-xl font-bold text-[var(--secondary-accent)]">Events for {selectedDateLabel}</h2>
              <span className="shrink-0 text-sm font-medium text-[var(--text-secondary)]">{itemCountLabel}</span>
            </div>

            <div className="mt-4 grid gap-3 pb-4">
              {selectedItems.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-light)] bg-card px-4 py-5 text-sm text-[var(--text-secondary)]">
                  Nothing scheduled for this day.
                </div>
              ) : (
                selectedItems.map((item) => {
                  const Icon = itemIcon(item.type);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="grid min-h-20 grid-cols-[0.35rem_3.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-[0_10px_24px_rgb(47_47_47/0.05)]"
                      style={{ borderColor: item.borderColor, backgroundColor: item.color }}
                      onClick={() => handleEventClick(item)}
                    >
                      <span className="h-full min-h-12 rounded-full" style={{ backgroundColor: item.borderColor }} />
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white/50"
                        style={{ borderColor: item.borderColor, color: item.textColor }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-base font-bold text-[var(--secondary-accent)]">{item.title}</span>
                        <span className="block truncate text-sm text-[var(--text-secondary)]">{formatItemTime(item)}</span>
                      </span>
                      <span
                        className="rounded-lg border bg-white/35 px-3 py-1 text-xs font-semibold"
                        style={{ borderColor: item.borderColor, color: item.textColor }}
                      >
                        {itemTypeLabel(item.type)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {isDesktopCalendar && (
        <Card className="flex h-full min-h-[42rem] flex-col xl:min-h-0">
          <CardHeader className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div className="flex items-center gap-2">
              <CardTitle>{monthLabel}</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              onDayClick={setDialogDate}
            />
          </CardContent>
        </Card>
      )}
      <DayDetailsDialog
        open={dialogDate !== null}
        onOpenChange={(open) => !open && setDialogDate(null)}
        date={dialogDate}
        items={dialogDate ? itemsByDate.get(dialogDate) ?? [] : []}
        onEventClick={handleEventClick}
      />
      <AddEventDialog open={addEventOpen} onOpenChange={setAddEventOpen} onSubmit={handleAddEvent} />
      <EditEventDialog open={editEventOpen} onOpenChange={setEditEventOpen} event={editingEvent} onSubmit={handleEditEvent} onDelete={handleDeleteEvent} />
    </>
  );
}

export default CalendarPage;
