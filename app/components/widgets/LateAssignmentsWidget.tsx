import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Assignment, Course } from '@/app/data/types';
import { formatAssignmentDue } from '@/app/data/assignmentDates';

interface Props {
  assignments: Assignment[];
  courses: Course[];
}

const rowColors = ['var(--course-green)', 'var(--course-gray)', 'var(--course-yellow)', 'var(--course-blue)'];
const textColors = ['#24553D', '#3A3A3E', '#6B5A1E', '#1F3A66'];

function LateAssignmentsWidget({ assignments, courses }: Props) {
  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Late Assignments</CardTitle>
      </CardHeader>
      <CardContent className={assignments.length === 0 ? 'flex items-center justify-center' : undefined}>
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <img
              src="/storages/zwD6Awu5SX/static/NoLateAssignments.svg"
              alt="No late assignments"
              className="h-32 w-auto sm:h-36"
            />
            <div>
              <p className="text-base font-semibold text-primary">No Late Assignments</p>
              <p className="text-xs text-muted-foreground">Keep up the good work!</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a, idx) => {
                  const course = getCourse(a.courseId);
                  const colorIdx = idx % rowColors.length;
                  return (
                    <TableRow
                      key={a.id}
                      className="border-none hover:opacity-85 transition-opacity"
                      style={{ backgroundColor: rowColors[colorIdx] }}
                    >
                      <TableCell className="font-semibold text-xs py-2.5" style={{ color: textColors[colorIdx] }}>
                        {course?.code}: {a.name}
                      </TableCell>
                      <TableCell className="font-semibold text-xs py-2.5 text-right" style={{ color: textColors[colorIdx] }}>
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
