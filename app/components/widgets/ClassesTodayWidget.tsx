import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, GraduationCap } from 'lucide-react';
import type { ClassSession, Course } from '@/app/data/types';
import { createDailyClassNoteTitle, findDailyClassNote, formatTimeDisplay } from '@/app/data/classSchedule';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { mapNote } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';

interface CreatedNoteRow {
  id: number | string;
}

interface Props {
  sessions: ClassSession[];
  courses: Course[];
  compact?: boolean;
}

function ClassesTodayWidget({ sessions, courses, compact = false }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [noteRows] = useLoadAction('loadNotes', [], { userId: user?.id });
  const [addNote, isCreatingNote] = useMutateAction<Record<string, unknown>, CreatedNoteRow[]>('createNote');

  const notes = (noteRows ?? []).map(mapNote);
  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);
  const visibleSessions = compact ? sessions.slice(0, 2) : sessions;
  const hiddenCount = sessions.length - visibleSessions.length;

  const handleOpenNotes = async (course: Course | undefined, courseId: string) => {
    if (!course) return;
    const existingNote = findDailyClassNote(notes, course);
    if (existingNote) {
      navigate(`/notes/${existingNote.id}`);
      return;
    }

    const createdNotes = await addNote({
      courseId,
      title: createDailyClassNoteTitle(course),
      content: '',
      userId: user?.id,
    });
    const noteId = createdNotes[0]?.id;
    navigate(noteId ? `/notes/${noteId}` : `/notes?courseId=${courseId}`);
  };

  return (
    <Card className="rounded-xl border border-[var(--border-light)] shadow-md md:rounded-lg md:border-2 md:border-primary md:shadow-none">
      <CardHeader className={`shrink-0 p-4 pb-3 ${compact ? 'sm:p-4 sm:pb-2' : 'sm:p-6 sm:pb-4'}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary md:hidden">
            <GraduationCap className="h-5 w-5" />
          </span>
          <CardTitle className={compact ? 'whitespace-nowrap text-[0.98rem] text-primary md:text-lg xl:text-xl' : 'text-lg sm:text-2xl'}>Classes Today</CardTitle>
        </div>
      </CardHeader>
      <CardContent className={sessions.length === 0 ? `min-h-0 ${compact ? 'flex items-center justify-center overflow-hidden px-4 pb-4 sm:px-4 sm:pb-4' : 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6'}` : `min-h-0 ${compact ? 'overflow-hidden px-4 pb-4 sm:px-4 sm:pb-4' : 'px-4 pb-4 sm:px-6 sm:pb-6'}`}>
        {sessions.length === 0 ? (
          <div className={`flex w-full flex-col items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50/70 py-5 text-center md:h-full md:flex-1 md:py-0 ${compact ? 'gap-2' : 'gap-4'}`}>
            <img
              src="/storages/zwD6Awu5SX/static/NoClassesToday.svg"
              alt="No classes today"
              className={compact ? 'hidden h-16 w-auto max-w-[60%] sm:block xl:h-20' : 'h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]'}
            />
            <div>
              <p className="text-base font-semibold text-[var(--secondary-accent)]">No Classes Today</p>
              <p className="text-xs text-muted-foreground">Enjoy your day off!</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleSessions.map((session) => {
              const course = getCourse(session.courseId);
              const colors = getCourseColor(course?.color);
              const openClassContext = () => navigate(`/class-schedule?courseId=${encodeURIComponent(session.courseId)}`);
              return (
                <div
                  key={session.id}
                  className={`rounded-lg border transition-all hover:shadow-sm ${compact ? 'p-3' : 'p-4'}`}
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                >
                  <button
                    type="button"
                    className={`${compact ? 'mb-3' : 'mb-2'} flex w-full items-start justify-between gap-3 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-ring`}
                    onClick={openClassContext}
                  >
                    <div>
                      <p className={`font-bold ${compact ? 'text-sm' : 'text-sm'}`}>{course?.code}</p>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-xs opacity-80">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatTimeDisplay(session.startTime)} - {formatTimeDisplay(session.endTime)}</span>
                      </p>
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="success"
                    className={`${compact ? 'h-11' : 'h-8'} w-full gap-2 rounded-lg border text-sm font-bold shadow-sm hover:opacity-90`}
                    style={{ backgroundColor: colors.border, borderColor: colors.border, color: colors.text }}
                    disabled={!course || isCreatingNote}
                    onClick={() => handleOpenNotes(course, session.courseId)}
                  >
                    <BookOpen className="h-4 w-4" />
                    {isCreatingNote ? 'Opening...' : 'Open Notes'}
                  </Button>
                </div>
              );
            })}
            {hiddenCount > 0 && (
              <div className="rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-center text-xs font-semibold text-muted-foreground">
                +{hiddenCount} more
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ClassesTodayWidget;
