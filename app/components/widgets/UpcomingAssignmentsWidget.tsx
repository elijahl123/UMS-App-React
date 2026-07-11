import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Assignment, Course } from '@/app/data/types';
import AddAssignmentDialog from '@/app/components/widgets/AddAssignmentDialog';
import { formatAssignmentDue } from '@/app/data/assignmentDates';
import { getCourseColor } from '@/app/data/courseColors';

interface Props {
  assignments: Assignment[];
  courses: Course[];
  onAdd: (assignment: Omit<Assignment, 'id' | 'status'>) => void;
}

function UpcomingAssignmentsWidget({ assignments, courses, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 p-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:p-6 sm:pb-4">
        <CardTitle className="text-lg sm:text-2xl">Upcoming Assignments</CardTitle>
        <Button size="sm" className="bg-primary/15 text-primary hover:bg-primary/25 w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Assignment
        </Button>
      </CardHeader>
      <CardContent className={assignments.length === 0 ? 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6' : 'px-4 pb-4 sm:px-6 sm:pb-6'}>
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <img
              src="/storages/zwD6Awu5SX/static/NoAssignments.svg"
              alt="No assignments"
              className="h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]"
            />
            <div>
              <p className="text-base font-semibold text-primary">No Upcoming Assignments</p>
              <p className="text-xs text-muted-foreground">Great job! You're all caught up.</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {assignments.map((a) => {
              const course = getCourse(a.courseId);
              const colors = getCourseColor(course?.color);
              return (
                <li key={a.id}>
                  <Link
                    to={`/homework?courseId=${encodeURIComponent(a.courseId)}&status=${encodeURIComponent(a.status)}`}
                    className="flex gap-3 rounded-lg border p-3 transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  >
                    <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: colors.border }} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-bold">
                        {course ? `${course.code}: ` : ''}
                        {a.name}
                      </p>
                      <p className="text-xs opacity-80">
                        Due {formatAssignmentDue(a, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <AddAssignmentDialog open={open} onOpenChange={setOpen} courses={courses} onSubmit={onAdd} />
    </Card>
  );
}

export default UpcomingAssignmentsWidget;
