import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Check } from 'lucide-react';
import type { Assignment, Course } from '@/app/data/types';
import { formatAssignmentDue } from '@/app/data/assignmentDates';
import { getCourseColor } from '@/app/data/courseColors';

interface Props {
  assignments: Assignment[];
  courses: Course[];
  compact?: boolean;
}

function LateAssignmentsWidget({ assignments, courses, compact = false }: Props) {
  const navigate = useNavigate();
  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);
  const visibleAssignments = compact ? assignments.slice(0, 2) : assignments;
  const hiddenCount = assignments.length - visibleAssignments.length;
  const openHomework = (assignment: Assignment) => {
    navigate(`/homework?courseId=${encodeURIComponent(assignment.courseId)}&status=late`);
  };

  return (
    <Card className="mobile-surface !border !border-[var(--border-light)] md:rounded-lg md:!border-2 md:!border-primary md:shadow-none">
      <CardHeader className={`shrink-0 p-4 pb-3 ${compact ? 'sm:p-4 sm:pb-2' : 'sm:p-6 sm:pb-4'}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary md:hidden">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <CardTitle className={compact ? 'whitespace-nowrap text-[0.98rem] text-primary md:text-lg xl:text-xl' : 'text-lg sm:text-2xl'}>Late Assignments</CardTitle>
        </div>
      </CardHeader>
      <CardContent className={assignments.length === 0 ? `min-h-0 ${compact ? 'flex items-center justify-center overflow-hidden px-4 pb-4 sm:px-4 sm:pb-4' : 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6'}` : `min-h-0 ${compact ? 'overflow-hidden px-4 pb-4 sm:px-4 sm:pb-4' : 'px-4 pb-4 sm:px-6 sm:pb-6'}`}>
        {assignments.length === 0 ? (
          <div className={`flex w-full flex-col items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--course-green)_64%,white)] bg-[color-mix(in_srgb,var(--course-green)_34%,white)] py-5 text-center md:h-full md:flex-1 md:py-0 ${compact ? 'gap-2' : 'gap-4'}`}>
            <img
              src="/storages/zwD6Awu5SX/static/NoLateAssignments.svg"
              alt="No late assignments"
              className={compact ? 'hidden h-16 w-auto max-w-[60%] sm:block xl:h-20' : 'h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]'}
            />
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--course-green)_70%,white)] bg-[color-mix(in_srgb,var(--course-green)_52%,white)] text-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))] md:hidden">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-[var(--secondary-accent)]">No Late Assignments</p>
              <p className="text-xs text-muted-foreground">Keep up the good work!</p>
            </div>
          </div>
        ) : compact ? (
          <ul className="flex flex-col gap-2">
            {visibleAssignments.map((a) => {
              const course = getCourse(a.courseId);
              const colors = getCourseColor(course?.color);
              const itemStyle = {
                '--mobile-item-bg': colors.bg,
                '--mobile-item-border': colors.border,
                '--mobile-item-text': colors.text,
              } as React.CSSProperties;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className="mobile-list-item flex w-full gap-2 p-2 focus:outline-none focus:ring-2 focus:ring-ring"
                    style={itemStyle}
                    onClick={() => openHomework(a)}
                  >
                    <div className="mobile-list-rail w-1" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold sm:text-sm">
                        {course?.code}: {a.name}
                      </p>
                      <p className="truncate text-xs opacity-80">
                        Due {formatAssignmentDue(a, { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
            {hiddenCount > 0 && (
              <li className="mobile-more-row">
                +{hiddenCount} more
              </li>
            )}
          </ul>
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
