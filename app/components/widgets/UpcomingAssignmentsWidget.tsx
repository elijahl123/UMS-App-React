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
  compact?: boolean;
}

function UpcomingAssignmentsWidget({ assignments, courses, onAdd, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);
  const visibleAssignments = compact ? assignments.slice(0, 2) : assignments;
  const hiddenCount = assignments.length - visibleAssignments.length;

  return (
    <Card>
      <CardHeader className={`shrink-0 gap-2 p-3 pb-2 ${compact ? 'flex-row items-center justify-between space-y-0 sm:p-4 sm:pb-2' : 'sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:p-6 sm:pb-4'}`}>
        <CardTitle className={compact ? 'text-base md:text-lg xl:text-xl' : 'text-lg sm:text-2xl'}>Upcoming Assignments</CardTitle>
        <Button size="sm" className={`bg-primary/15 text-primary hover:bg-primary/25 ${compact ? 'w-auto px-2' : 'w-full sm:w-auto'}`} onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          <span>{compact ? 'Add' : 'Add Assignment'}</span>
        </Button>
      </CardHeader>
      <CardContent className={assignments.length === 0 ? `min-h-0 ${compact ? 'flex items-center justify-center overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4' : 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6'}` : `min-h-0 ${compact ? 'overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4' : 'px-4 pb-4 sm:px-6 sm:pb-6'}`}>
        {assignments.length === 0 ? (
          <div className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-2' : 'gap-4'}`}>
            <img
              src="/storages/zwD6Awu5SX/static/NoAssignments.svg"
              alt="No assignments"
              className={compact ? 'hidden h-16 w-auto max-w-[60%] sm:block xl:h-20' : 'h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]'}
            />
            <div>
              <p className="text-base font-semibold text-primary">No Upcoming Assignments</p>
              <p className="text-xs text-muted-foreground">Great job! You&apos;re all caught up.</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleAssignments.map((a) => {
              const course = getCourse(a.courseId);
              const colors = getCourseColor(course?.color);
              return (
                <li key={a.id}>
                  <Link
                    to={`/homework?courseId=${encodeURIComponent(a.courseId)}&status=${encodeURIComponent(a.status)}`}
                    className={`flex rounded-lg border transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring ${compact ? 'gap-2 p-2' : 'gap-3 p-3'}`}
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  >
                    <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: colors.border }} />
                    <div className="flex-1 min-w-0">
                      <p className={`truncate font-bold ${compact ? 'text-xs sm:text-sm' : 'text-sm'}`}>
                        {course ? `${course.code}: ` : ''}
                        {a.name}
                      </p>
                      <p className="truncate text-xs opacity-80">
                        Due {formatAssignmentDue(a, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
            {hiddenCount > 0 && (
              <li className="rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-center text-xs font-semibold text-muted-foreground">
                +{hiddenCount} more
              </li>
            )}
          </ul>
        )}
      </CardContent>
      <AddAssignmentDialog open={open} onOpenChange={setOpen} courses={courses} onSubmit={onAdd} />
    </Card>
  );
}

export default UpcomingAssignmentsWidget;
