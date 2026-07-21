import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { CalendarDays, ChevronDown, Clock, MapPin, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import ClassSessionFormDialog from '@/app/components/widgets/ClassSessionFormDialog';
import { mapCourse, mapClassSession } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import type { ClassSession } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { dayLabels, formatTimeDisplay, parseTimeToMinutes } from '@/app/data/classSchedule';

const days: ClassSession['day'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const HOUR_HEIGHT = 56; // px per hour row
const MOBILE_HOUR_HEIGHT = 56;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;

function useIsMobileSchedule() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}

function formatHourLabel(hour: number): string {
  const h = hour % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const mondayOffset = (date.getDay() + 6) % 7;
  result.setDate(date.getDate() - mondayOffset);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, daysToAdd: number) {
  const result = new Date(date);
  result.setDate(date.getDate() + daysToAdd);
  return result;
}

function formatDateChip(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatSelectedDate(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatWeekRange(date: Date) {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, { month: sameMonth ? undefined : 'short', day: 'numeric' });
  return `${startLabel} - ${endLabel}`;
}

function weekDropdownLabel(offset: number) {
  if (offset === 0) return 'This Week';
  if (offset === -1) return 'Last Week';
  if (offset === 1) return 'Next Week';
  return `${Math.abs(offset)} weeks ${offset < 0 ? 'ago' : 'ahead'}`;
}

function formatCompactTime(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time;

  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours < 12 ? 'AM' : 'PM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutes} ${period}`;
}

function ClassSchedulePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobileSchedule();
  const today = useMemo(() => new Date(), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<ClassSession['day']>(() => {
    const todayIndex = today.getDay();
    return todayIndex === 0 ? 'Sun' : days[todayIndex - 1];
  });
  const [courseRows, coursesLoading] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [sessionRows, sessionsLoading, , refreshSessions] = useLoadAction('loadClassSessions', [], {
    userId: user?.id,
  });

  const [addSession] = useMutateAction('createClassSession');
  const [editSession] = useMutateAction('updateClassSession');
  const [removeSession] = useMutateAction('deleteClassSession');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassSession | null>(null);

  const courses = (courseRows ?? []).map(mapCourse);
  const sessions = (sessionRows ?? []).map(mapClassSession);
  const focusedCourseId = searchParams.get('courseId');
  const visibleSessions = focusedCourseId ? sessions.filter((s) => s.courseId === focusedCourseId) : sessions;

  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);

  const weekDays = useMemo(() => {
    const monday = addDays(startOfWeek(today), weekOffset * 7);
    return days.map((day, index) => ({ day, date: addDays(monday, index) }));
  }, [today, weekOffset]);

  const { startHour, endHour } = useMemo(() => {
    if (visibleSessions.length === 0) {
      return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    }
    let minMinutes = Infinity;
    let maxMinutes = -Infinity;
    visibleSessions.forEach((s) => {
      minMinutes = Math.min(minMinutes, parseTimeToMinutes(s.startTime));
      maxMinutes = Math.max(maxMinutes, parseTimeToMinutes(s.endTime));
    });
    return {
      startHour: Math.min(DEFAULT_START_HOUR, Math.floor(minMinutes / 60)),
      endHour: Math.max(DEFAULT_END_HOUR, Math.ceil(maxMinutes / 60)),
    };
  }, [visibleSessions]);

  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = startHour; h <= endHour; h++) result.push(h);
    return result;
  }, [startHour, endHour]);

  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;
  const mobileTotalHeight = (endHour - startHour) * MOBILE_HOUR_HEIGHT;
  const selectedDayDate = weekDays.find((entry) => entry.day === selectedDay)?.date ?? today;
  const selectedDaySessions = visibleSessions
    .filter((s) => s.day === selectedDay)
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

  const openAddDialog = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEditDialog = (session: ClassSession) => {
    setEditing(session);
    setDialogOpen(true);
  };

  const handleSubmit = async (values: Omit<ClassSession, 'id'> & { id?: string }) => {
    if (values.id) {
      await editSession({
        id: values.id,
        courseId: values.courseId,
        day: values.day,
        startTime: values.startTime,
        endTime: values.endTime,
        location: values.location?.trim() || null,
        userId: user?.id,
      });
    } else {
      await addSession({
        courseId: values.courseId,
        day: values.day,
        startTime: values.startTime,
        endTime: values.endTime,
        location: values.location?.trim() || null,
        userId: user?.id,
      });
    }
    refreshSessions();
  };

  const handleDelete = async (id: string) => {
    await removeSession({ id, userId: user?.id });
    refreshSessions();
  };

  const isLoading = coursesLoading || sessionsLoading;

  if (isLoading && sessions.length === 0 && courses.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">Loading class schedule...</div>;
  }

  const desktopSchedule = (
    <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle>Class Schedule</CardTitle>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Class
          </Button>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex-1 overflow-auto">
            <div className="flex min-w-[680px] xl:min-w-[820px]">
              {/* Time gutter */}
              <div className="sticky left-0 z-10 w-12 sm:w-16 shrink-0 bg-card">
                <div className="h-10 border-b border-[var(--border-light)]" />
                <div style={{ height: totalHeight }} className="relative">
                  {hours.map((h, idx) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[8px] sm:text-[10px] font-medium text-muted-foreground"
                      style={{ top: idx * HOUR_HEIGHT - 6 }}
                    >
                      {idx !== 0 && formatHourLabel(h)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Day columns */}
              {days.map((day) => {
                const daySessions = visibleSessions.filter((s) => s.day === day);
                return (
                  <div key={day} className="flex min-w-0 flex-1 flex-col border-l border-[var(--border-light)]">
                    <div className="flex h-8 sm:h-10 shrink-0 flex-col items-center justify-center border-b border-[var(--border-light)] bg-secondary/40">
                      <span className="text-[10px] sm:text-xs font-bold text-primary">{day}</span>
                    </div>
                    <div className="relative" style={{ height: totalHeight }}>
                      {/* Hour gridlines */}
                      {hours.map((h, idx) => (
                        <div
                          key={h}
                          className="absolute left-0 right-0 border-t border-[var(--border-light)]/60"
                          style={{ top: idx * HOUR_HEIGHT }}
                        />
                      ))}

                      {daySessions.map((s) => {
                        const course = getCourse(s.courseId);
                        const colors = getCourseColor(course?.color);
                        const startMin = parseTimeToMinutes(s.startTime);
                        const endMin = Math.max(parseTimeToMinutes(s.endTime), startMin + 20);
                        const top = ((startMin - startHour * 60) / 60) * HOUR_HEIGHT;
                        const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                        return (
                          <div
                            key={s.id}
                            className="group absolute left-1 right-1 flex flex-col overflow-hidden rounded-md border p-1.5 shadow-sm"
                            style={{
                              top,
                              height: Math.max(height, 32),
                              backgroundColor: colors.bg,
                              borderColor: colors.border,
                              color: colors.text,
                            }}
                            title={`${dayLabels[day]}: ${course?.code ?? ''} ${formatTimeDisplay(s.startTime)} - ${formatTimeDisplay(s.endTime)}${s.location ? ` at ${s.location}` : ''}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="truncate text-[9px] sm:text-[11px] font-bold">{course?.code ?? '—'}</span>
                              <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity xl:opacity-0 xl:group-hover:opacity-100">
                                <button
                                  type="button"
                                  className="rounded p-0.5 hover:bg-black/10"
                                  title="Edit"
                                  onClick={() => openEditDialog(s)}
                                >
                                  <Pencil className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded p-0.5 hover:bg-black/10"
                                  title="Delete"
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this class session?')) {
                                      handleDelete(s.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                              </div>
                            </div>
                            <span className="truncate text-[8px] sm:text-[10px] font-medium opacity-90">
                              {formatTimeDisplay(s.startTime)} - {formatTimeDisplay(s.endTime)}
                            </span>
                            {s.location && <span className="truncate text-[8px] sm:text-[10px] font-medium opacity-90">{s.location}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          {courses.length > 0 && (
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[var(--border-light)] px-4 py-3">
              {courses.map((c) => {
                const colors = getCourseColor(c.color);
                return (
                  <div key={c.id} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border"
                      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                    />
                    <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">{c.code}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
  );

  const mobileSchedule = (
    <div className="mobile-page-stack flex-1 pb-2">
      <div className="mobile-page-header">
        <h1 className="mobile-page-title">Class Schedule</h1>
        <p className="mobile-page-kicker">View and manage your weekly classes.</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mobile-control flex h-10 min-w-0 items-center justify-between px-2.5 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span className="truncate">{weekDropdownLabel(weekOffset)}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 bg-card">
              {[-1, 0, 1, 2].map((offset) => {
                const weekStart = addDays(startOfWeek(today), offset * 7);
                return (
                  <DropdownMenuItem key={offset} className="items-start py-2" onClick={() => setWeekOffset(offset)}>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold leading-tight">{weekDropdownLabel(offset)}</span>
                      <span className="mt-0.5 text-xs leading-tight text-muted-foreground">{formatWeekRange(weekStart)}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className="mobile-control h-10 px-3 text-xs"
            onClick={() => {
              setWeekOffset(0);
              setSelectedDay(today.getDay() === 0 ? 'Sun' : days[today.getDay() - 1]);
            }}
          >
            Today
          </button>
        </div>
        <button
          type="button"
          className="mobile-primary-action flex h-10 items-center justify-center gap-1.5 rounded-md px-3 text-xs"
          onClick={openAddDialog}
        >
          <Plus className="h-4 w-4" />
          <span>Add Class</span>
        </button>
      </div>

      <div className="-mx-3 overflow-x-auto px-3">
        <div className="grid min-w-[440px] grid-cols-7 gap-1.5">
          {weekDays.map(({ day, date }) => {
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                type="button"
                className="relative flex h-12 flex-col items-center justify-center rounded-lg border bg-card text-xs font-semibold shadow-[0_8px_18px_rgb(86_73_76/0.045)] transition-colors"
                style={{
                  borderColor: isSelected ? 'color-mix(in srgb, var(--main-color) 60%, white)' : 'var(--border-light)',
                  backgroundColor: isSelected ? 'color-mix(in srgb, var(--main-color) 16%, white)' : 'var(--surface)',
                  color: isSelected ? 'var(--main-accent)' : 'var(--text-primary)',
                }}
                onClick={() => setSelectedDay(day)}
              >
                <span>{day}</span>
                <span className="mt-0.5 text-[10px] font-medium text-[var(--text-secondary)]">{formatDateChip(date)}</span>
                {isSelected && <span className="absolute bottom-0 h-0.5 w-8 rounded-t-full bg-[var(--main-color-shade)]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mobile-surface overflow-hidden">
        <div className="grid h-10 grid-cols-[3.55rem_minmax(0,1fr)] border-b border-[var(--border-light)]">
          <div className="flex items-center justify-center border-r border-[var(--border-light)] text-xs font-bold text-[var(--text-primary)]">
            Time
          </div>
          <div className="flex items-center justify-center px-2 text-sm font-bold text-[var(--main-accent)]">
            {formatSelectedDate(selectedDayDate)}
          </div>
        </div>

        <div className="grid grid-cols-[3.55rem_minmax(0,1fr)]">
          <div className="relative border-r border-[var(--border-light)]" style={{ height: mobileTotalHeight }}>
            {hours.map((h, idx) => (
              <div
                key={h}
                className="absolute left-0 right-0 pr-2 text-right text-[11px] font-semibold text-[var(--text-primary)]"
                style={{ top: Math.min(idx * MOBILE_HOUR_HEIGHT + 8, mobileTotalHeight - 18) }}
              >
                {formatHourLabel(h)}
              </div>
            ))}
          </div>

          <div className="relative" style={{ height: mobileTotalHeight }}>
            {hours.map((h, idx) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-dashed border-[var(--border-light)]/80"
                style={{ top: idx * MOBILE_HOUR_HEIGHT }}
              />
            ))}

            {selectedDaySessions.length === 0 && (
              <div className="absolute inset-x-3 top-8 rounded-lg border border-dashed border-[var(--border-light)] bg-[var(--secondary-color)] px-3 py-4 text-center text-xs font-medium text-muted-foreground">
                No classes scheduled for {dayLabels[selectedDay]}.
              </div>
            )}

            {selectedDaySessions.map((s) => {
              const course = getCourse(s.courseId);
              const colors = getCourseColor(course?.color);
              const startMin = parseTimeToMinutes(s.startTime);
              const endMin = Math.max(parseTimeToMinutes(s.endTime), startMin + 20);
              const top = ((startMin - startHour * 60) / 60) * MOBILE_HOUR_HEIGHT;
              const height = ((endMin - startMin) / 60) * MOBILE_HOUR_HEIGHT;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="mobile-list-item group absolute left-2.5 right-2.5 overflow-hidden px-3 py-2 transition-transform active:scale-[0.99]"
                  style={{
                    top,
                    minHeight: 50,
                    height: Math.max(height, 50),
                    '--mobile-item-bg': colors.bg,
                    '--mobile-item-border': colors.border,
                    '--mobile-item-text': colors.text,
                  } as React.CSSProperties}
                  aria-label={`Edit ${course?.code ?? 'class'} on ${dayLabels[selectedDay]}`}
                  onClick={() => openEditDialog(s)}
                >
                  <span className="mobile-list-rail absolute inset-y-0 left-0 w-1" />
                  <span className="flex h-full min-h-0 flex-col justify-center gap-1 pl-1.5">
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-bold">{course?.code ?? 'Class'}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>
                          {formatCompactTime(s.startTime)} - {formatCompactTime(s.endTime)}
                        </span>
                      </span>
                    </span>
                    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[10px] font-semibold text-[var(--text-secondary)]">
                      <span className="truncate text-[11px] text-[var(--text-primary)]">{course?.name ?? 'Course details'}</span>
                      <span className="flex min-w-0 items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{s.location ?? 'Location TBD'}</span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {courses.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-light)] px-3 py-3">
            {courses.map((c) => {
              const colors = getCourseColor(c.color);
              return (
                <div key={c.id} className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                  />
                  <span className="truncate text-[11px] font-bold text-[var(--text-primary)]">{c.code}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      {isMobile ? mobileSchedule : desktopSchedule}

      <ClassSessionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        courses={courses}
        session={editing}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : undefined}
      />
    </div>
  );
}

export default ClassSchedulePage;
