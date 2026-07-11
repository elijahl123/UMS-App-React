import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Assignment, Course } from '@/app/data/types';
import AddAssignmentDialog from '@/app/components/widgets/AddAssignmentDialog';
import { formatAssignmentDue } from '@/app/data/assignmentDates';

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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pb-4">
        <CardTitle>Upcoming Assignments</CardTitle>
        <Button size="sm" className="bg-primary/15 text-primary hover:bg-primary/25 w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Assignment
        </Button>
      </CardHeader>
      <CardContent className={assignments.length === 0 ? 'flex items-center justify-center' : undefined}>
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <img
              src="/storages/zwD6Awu5SX/static/NoAssignments.svg"
              alt="No assignments"
              className="h-32 w-auto sm:h-36"
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
              return (
                <li key={a.id} className="flex gap-3 rounded-lg border border-[var(--border-light)] p-3 transition-colors hover:bg-primary/5">
                  <div className="w-1 shrink-0 rounded-full bg-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">
                      {course ? `${course.code}: ` : ''}{a.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatAssignmentDue(a, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
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
