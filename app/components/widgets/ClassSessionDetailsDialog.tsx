import { Link } from 'react-router-dom';
import { CalendarDays, Clock, ExternalLink, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getCourseColor } from '@/app/data/courseColors';
import {
  dayLabels,
  formatTimeDisplay,
  isClassSessionRezoned,
  isImportedClassSession,
  parseTimeToMinutes,
  scheduledClassTimeLabel,
} from '@/app/data/classSchedule';
import type { ClassSession, Course } from '@/app/data/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ClassSession | null;
  course?: Course;
  /** The calendar date this session falls on in the week being viewed. */
  date?: Date;
  onEdit?: (session: ClassSession) => void;
  onDelete?: (session: ClassSession) => void;
}

function formatDuration(session: ClassSession) {
  const minutes = parseTimeToMinutes(session.endTime) - parseTimeToMinutes(session.startTime);
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr${hours === 1 ? '' : 's'}`;
  return `${hours} hr${hours === 1 ? '' : 's'} ${rest} min`;
}

function formatSessionDate(session: ClassSession, date?: Date) {
  if (!date) return dayLabels[session.day];
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function ClassSessionDetailsDialog({ open, onOpenChange, session, course, date, onEdit, onDelete }: Props) {
  if (!session) return null;

  const colors = getCourseColor(course?.color);
  const imported = isImportedClassSession(session);
  const duration = formatDuration(session);
  const timeRange = `${formatTimeDisplay(session.startTime)} - ${formatTimeDisplay(session.endTime)}`;
  const scheduledLabel = isClassSessionRezoned(session) ? scheduledClassTimeLabel(session) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: colors.border }} aria-hidden="true" />
            <div className="min-w-0">
              <DialogTitle className="truncate">{course?.code ?? 'Class'}</DialogTitle>
              <DialogDescription className="mt-0.5">{course?.name ?? 'Course details unavailable'}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-start gap-3">
            <dt className="mt-0.5 shrink-0 text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Day</span>
            </dt>
            <dd className="min-w-0 font-medium">{formatSessionDate(session, date)}</dd>
          </div>
          <div className="flex items-start gap-3">
            <dt className="mt-0.5 shrink-0 text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Time</span>
            </dt>
            <dd className="min-w-0 font-medium">
              {timeRange}
              {duration && <span className="ml-2 text-xs font-normal text-muted-foreground">({duration})</span>}
              {scheduledLabel && (
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Scheduled for {scheduledLabel}
                </span>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-3">
            <dt className="mt-0.5 shrink-0 text-muted-foreground">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Location</span>
            </dt>
            <dd className={`min-w-0 ${session.location ? 'font-medium' : 'text-muted-foreground'}`}>
              {session.location ?? 'No location set'}
            </dd>
          </div>
        </dl>

        {imported && (
          <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            This session was imported from your academic calendar. Edit it from the calendar page instead.
          </p>
        )}

        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
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
          {!imported && (
            <div className="flex items-center gap-2">
              {onDelete && (
                <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(session)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </Button>
              )}
              {onEdit && (
                <Button type="button" size="sm" onClick={() => onEdit(session)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ClassSessionDetailsDialog;
