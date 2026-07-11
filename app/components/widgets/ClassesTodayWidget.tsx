import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
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
}

function ClassesTodayWidget({ sessions, courses }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [noteRows] = useLoadAction('loadNotes', [], { userId: user?.id });
  const [addNote, isCreatingNote] = useMutateAction<Record<string, unknown>, CreatedNoteRow[]>('createNote');

  const notes = (noteRows ?? []).map(mapNote);
  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);

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
    <Card>
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
        <CardTitle className="text-lg sm:text-2xl">Classes Today</CardTitle>
      </CardHeader>
      <CardContent className={sessions.length === 0 ? 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6' : 'px-4 pb-4 sm:px-6 sm:pb-6'}>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <img
              src="/storages/zwD6Awu5SX/static/NoClassesToday.svg"
              alt="No classes today"
              className="h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]"
            />
            <div>
              <p className="text-base font-semibold text-primary">No Classes Today</p>
              <p className="text-xs text-muted-foreground">Enjoy your day off!</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map((session) => {
              const course = getCourse(session.courseId);
              const colors = getCourseColor(course?.color);
              const openClassContext = () => navigate(`/class-schedule?courseId=${encodeURIComponent(session.courseId)}`);
              return (
                <div
                  key={session.id}
                  className="rounded-lg border p-4 transition-all hover:shadow-sm"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                >
                  <button
                    type="button"
                    className="mb-2 flex w-full items-start justify-between gap-3 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={openClassContext}
                  >
                    <div>
                      <p className="text-sm font-bold">{course?.code}</p>
                      <p className="text-xs opacity-80">
                        {formatTimeDisplay(session.startTime)} - {formatTimeDisplay(session.endTime)}
                      </p>
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="success"
                    className="w-full text-xs h-8"
                    style={{ backgroundColor: colors.border, color: colors.text }}
                    disabled={!course || isCreatingNote}
                    onClick={() => handleOpenNotes(course, session.courseId)}
                  >
                    {isCreatingNote ? 'Opening...' : 'Open Notes'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ClassesTodayWidget;
