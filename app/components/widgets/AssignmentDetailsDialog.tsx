import { Link } from 'react-router-dom';
import { AlignLeft, CalendarClock, CheckCircle2, ExternalLink, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCourseColor } from '@/app/data/courseColors';
import { formatAssignmentDue } from '@/app/data/assignmentDates';
import type { Assignment, AssignmentStatus, Course } from '@/app/data/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: Assignment | null;
  course?: Course;
  onEdit?: (assignment: Assignment) => void;
  onDelete?: (assignment: Assignment) => void;
  onMarkComplete?: (assignment: Assignment) => void;
  onMarkIncomplete?: (assignment: Assignment) => void;
}

const statusPresentation: Record<AssignmentStatus, { label: string; className: string }> = {
  upcoming: {
    label: 'Upcoming',
    className: 'border-[var(--main-accent)] text-[var(--main-accent)] bg-[color-mix(in_srgb,var(--main-color)_18%,var(--surface))]',
  },
  due_today: {
    label: 'Due today',
    className:
      'border-[color-mix(in_srgb,var(--course-citrine)_62%,var(--secondary-accent))] text-[color-mix(in_srgb,var(--course-citrine)_62%,var(--secondary-accent))] bg-[color-mix(in_srgb,var(--course-citrine)_50%,var(--surface))]',
  },
  late: {
    label: 'Late',
    className: 'border-[var(--main-accent)] text-[var(--main-accent)] bg-[color-mix(in_srgb,var(--main-accent)_14%,var(--surface))]',
  },
  completed: {
    label: 'Completed',
    className:
      'border-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))] text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))] bg-[color-mix(in_srgb,var(--course-emerald)_48%,var(--surface))]',
  },
};

function AssignmentDetailsDialog({
  open,
  onOpenChange,
  assignment,
  course,
  onEdit,
  onDelete,
  onMarkComplete,
  onMarkIncomplete,
}: Props) {
  if (!assignment) return null;

  const colors = getCourseColor(course?.color);
  const status = statusPresentation[assignment.status] ?? statusPresentation.upcoming;
  const dueLabel = formatAssignmentDue(assignment, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const description = assignment.description?.trim();
  const isCompleted = assignment.status === 'completed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: colors.border }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-words">{assignment.name}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {course ? `${course.code} · ${course.name}` : 'No course'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`text-[10px] uppercase ${status.className}`}>
              {status.label}
            </Badge>
          </div>
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due</p>
              <p className="font-medium">{dueLabel}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <AlignLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              {description ? (
                <p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words font-medium">{description}</p>
              ) : (
                <p className="text-muted-foreground">No description</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-row flex-wrap items-center justify-between gap-2 sm:justify-between">
          {course ? (
            <Button asChild variant="link" className="h-auto px-0">
              <Link to={`/courses/${course.id}`} onClick={() => onOpenChange(false)}>
                Open course
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {onDelete && (
              <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(assignment)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            )}
            {onEdit && (
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(assignment)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </Button>
            )}
            {isCompleted
              ? onMarkIncomplete && (
                  <Button type="button" size="sm" onClick={() => onMarkIncomplete(assignment)}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Mark incomplete
                  </Button>
                )
              : onMarkComplete && (
                  <Button type="button" variant="success" size="sm" onClick={() => onMarkComplete(assignment)}>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Mark complete
                  </Button>
                )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignmentDetailsDialog;
