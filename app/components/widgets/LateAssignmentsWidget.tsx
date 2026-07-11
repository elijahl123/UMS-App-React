import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Assignment, Course } from '@/app/data/types';
import { formatAssignmentDue } from '@/app/data/assignmentDates';
import { getCourseColor } from '@/app/data/courseColors';

interface Props {
  assignments: Assignment[];
  courses: Course[];
}

function LateAssignmentsWidget({ assignments, courses }: Props) {
  const navigate = useNavigate();
  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);
  const openHomework = (assignment: Assignment) => {
    navigate(`/homework?courseId=${encodeURIComponent(assignment.courseId)}&status=late`);
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
        <CardTitle className="text-lg sm:text-2xl">Late Assignments</CardTitle>
      </CardHeader>
      <CardContent className={assignments.length === 0 ? 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6' : 'px-4 pb-4 sm:px-6 sm:pb-6'}>
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <img
              src="/storages/zwD6Awu5SX/static/NoLateAssignments.svg"
              alt="No late assignments"
              className="h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]"
            />
            <div>
              <p className="text-base font-semibold text-primary">No Late Assignments</p>
              <p className="text-xs text-muted-foreground">Keep up the good work!</p>
            </div>
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const course = getCourse(a.courseId);
                  const colors = getCourseColor(course?.color);
                  return (
                    <TableRow
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer border-none transition-opacity hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                      onClick={() => openHomework(a)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openHomework(a);
                        }
                      }}
                    >
                      <TableCell className="py-2.5 text-xs font-bold">
                        {course?.code}: {a.name}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-xs font-bold">
                        {formatAssignmentDue(a, { month: 'short', day: 'numeric' })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LateAssignmentsWidget;
