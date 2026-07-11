import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ClassSessionFormDialog from '@/app/components/widgets/ClassSessionFormDialog';
import { mapCourse, mapClassSession } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import type { ClassSession } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { dayLabels, formatTimeDisplay, parseTimeToMinutes } from '@/app/data/classSchedule';

const days: ClassSession['day'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const HOUR_HEIGHT = 56; // px per hour row
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;

function formatHourLabel(hour: number): string {
  const h = hour % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

function ClassSchedulePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
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
        userId: user?.id,
      });
    } else {
      await addSession({
        courseId: values.courseId,
        day: values.day,
        startTime: values.startTime,
        endTime: values.endTime,
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

  return (
    <div className="flex h-full flex-col gap-4">
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
            <div className="flex min-w-[820px]">
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
                            title={`${dayLabels[day]}: ${course?.code ?? ''} ${formatTimeDisplay(s.startTime)} - ${formatTimeDisplay(s.endTime)}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="truncate text-[9px] sm:text-[11px] font-bold">{course?.code ?? '—'}</span>
                              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
