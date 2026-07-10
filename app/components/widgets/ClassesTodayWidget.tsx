import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import type { ClassSession, Course } from '@/app/data/types';

interface Props {
  sessions: ClassSession[];
  courses: Course[];
}

function ClassesTodayWidget({ sessions, courses }: Props) {
  const navigate = useNavigate();

  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Classes Today</CardTitle>
      </CardHeader>
      <CardContent className={sessions.length === 0 ? 'flex items-center justify-center' : undefined}>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <img
              src="/storages/zwD6Awu5SX/static/NoClassesToday.svg"
              alt="No classes today"
              className="h-32 w-auto sm:h-36"
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
              return (
                <div
                  key={session.id}
                  className="rounded-lg p-4 transition-all hover:shadow-sm"
                  style={{ backgroundColor: 'var(--course-green)' }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-bold text-sm text-[#24553D]">{course?.code}</p>
                      <p className="text-xs text-[#24553D]/80">
                        {session.startTime} – {session.endTime}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="success"
                    className="w-full text-xs h-8"
                    onClick={() => navigate(`/notes?courseId=${session.courseId}`)}
                  >
                    Open Notes
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
