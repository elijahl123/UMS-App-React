import { useMemo, useState } from 'react';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { Plus, Pencil, Trash2, CheckCircle2, AlertTriangle, CalendarClock, Sparkles, ChevronRight, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AssignmentFormDialog from '@/app/components/widgets/AssignmentFormDialog';
import { mapCourse, mapAssignment } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import { formatAssignmentDue, formatDueTime, formatTimeZoneLabel } from '@/app/data/assignmentDates';
import type { Assignment, Course } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';

interface Group {
  key: string;
  label: string;
  icon: typeof AlertTriangle;
  headerClass: string;
  items: Assignment[];
}

function HomeworkPage() {
  const { user } = useAuth();
  const [courseRows, coursesLoading] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows, assignmentsLoading, , refreshAssignments] = useLoadAction('loadAssignments', [], {
    userId: user?.id,
  });

  const [addAssignment] = useMutateAction('createAssignment');
  const [editAssignment] = useMutateAction('updateAssignment');
  const [removeAssignment] = useMutateAction('deleteAssignment');

  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(['completed']));

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);

  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);

  const filtered = useMemo(() => {
    return assignments
      .filter((a) => courseFilter === 'all' || a.courseId === courseFilter)
      .filter((a) => statusFilter === 'all' || a.status === statusFilter)
      .sort((a, b) => `${a.dueDate} ${a.dueTime ?? ''}`.localeCompare(`${b.dueDate} ${b.dueTime ?? ''}`));
  }, [assignments, courseFilter, statusFilter]);

  const groups: Group[] = useMemo(() => {
    const late = filtered.filter((a) => a.status === 'late');
    const dueToday = filtered.filter((a) => a.status === 'due_today');
    const upcoming = filtered.filter((a) => a.status === 'upcoming');
    const completed = filtered.filter((a) => a.status === 'completed');
    return [
      { key: 'late', label: 'Late', icon: AlertTriangle, headerClass: 'text-[#B3261E]', items: late },
      { key: 'today', label: 'Due Today', icon: CalendarClock, headerClass: 'text-[#6B5A1E]', items: dueToday },
      { key: 'upcoming', label: 'Upcoming', icon: Sparkles, headerClass: 'text-primary', items: upcoming },
      { key: 'completed', label: 'Completed', icon: CheckCircle2, headerClass: 'text-[#24553D]', items: completed },
    ].filter((g) => g.items.length > 0);
  }, [filtered]);

  const openAddDialog = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEditDialog = (assignment: Assignment) => {
    setEditing(assignment);
    setDialogOpen(true);
  };

  const handleSubmit = async (values: Omit<Assignment, 'id'> & { id?: string }) => {
    if (values.id) {
      await editAssignment({
        id: values.id,
        courseId: values.courseId,
        name: values.name,
        dueDate: values.dueDate,
        dueTime: values.dueTime ?? null,
        dueTimeZone: values.dueTimeZone,
        status: values.status,
        description: values.description ?? null,
        userId: user?.id,
      });
    } else {
      await addAssignment({
        courseId: values.courseId,
        name: values.name,
        dueDate: values.dueDate,
        dueTime: values.dueTime ?? null,
        dueTimeZone: values.dueTimeZone,
        description: values.description ?? null,
        userId: user?.id,
      });
    }
    refreshAssignments();
  };

  const handleDelete = async (id: string) => {
    await removeAssignment({ id, userId: user?.id });
    refreshAssignments();
  };

  const handleMarkComplete = async (assignment: Assignment) => {
    await editAssignment({
      id: assignment.id,
      courseId: assignment.courseId,
      name: assignment.name,
      dueDate: assignment.dueDate,
      dueTime: assignment.dueTime ?? null,
      dueTimeZone: assignment.dueTimeZone,
      status: 'completed',
      description: assignment.description ?? null,
      userId: user?.id,
    });
    refreshAssignments();
  };

  const handleMarkIncomplete = async (assignment: Assignment) => {
    await editAssignment({
      id: assignment.id,
      courseId: assignment.courseId,
      name: assignment.name,
      dueDate: assignment.dueDate,
      dueTime: assignment.dueTime ?? null,
      dueTimeZone: assignment.dueTimeZone,
      status: 'upcoming',
      description: assignment.description ?? null,
      userId: user?.id,
    });
    refreshAssignments();
  };

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isLoading = coursesLoading || assignmentsLoading;

  if (isLoading && assignments.length === 0 && courses.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">Loading homework...</div>;
  }

  const renderRow = (a: Assignment, course: Course | undefined, emphasis?: 'late' | 'today') => {
    const colors = getCourseColor(course?.color);
    const leftBorder =
      emphasis === 'late' ? '#e35c5f' : emphasis === 'today' ? '#e0c874' : colors.border;
    const dueTimeLabel = formatDueTime(a.dueTime);
    const dueTodayLabel = dueTimeLabel ? `Today at ${dueTimeLabel} ${formatTimeZoneLabel(a.dueTimeZone, a.dueDate)}` : 'Today';
    return (
      <div
        key={a.id}
        className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border-l-4 bg-card p-2 sm:p-3 shadow-sm"
        style={{ borderLeftColor: leftBorder, backgroundColor: emphasis === 'late' ? '#fff5f5' : emphasis === 'today' ? '#fffaf0' : undefined }}
      >
        <span
          className="hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] sm:px-2 sm:text-[10px] font-bold sm:inline-block"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {course?.code ?? '—'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{a.name}</p>
          <p className="truncate text-xs text-muted-foreground sm:hidden">{course?.code ?? '—'}</p>
        </div>
        <div className="flex flex-row-reverse items-center justify-between gap-2 sm:gap-3 sm:flex-row">
          <span
            className={`shrink-0 text-xs font-semibold ${
              emphasis === 'late' ? 'text-[#B3261E]' : emphasis === 'today' ? 'text-[#8a6d1a]' : 'text-muted-foreground'
            }`}
          >
            {emphasis === 'today' ? dueTodayLabel : formatAssignmentDue(a, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <div className="flex shrink-0 items-center gap-1 sm:gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {a.status === 'completed' ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark incomplete" onClick={() => handleMarkIncomplete(a)}>
                <RotateCcw className="h-4 w-4 text-[#24553D]" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark complete" onClick={() => handleMarkComplete(a)}>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEditDialog(a)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Delete"
              onClick={() => {
                if (confirm('Are you sure you want to delete this assignment?')) {
                  handleDelete(a.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>Homework</CardTitle>
            {groups.find((g) => g.key === 'late') && (
              <Badge className="bg-[#ffdcdd] text-[#B3261E] hover:bg-[#ffdcdd]" variant="secondary">
                {groups.find((g) => g.key === 'late')?.items.length} late
              </Badge>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="due_today">Due Today</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openAddDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Assignment
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto px-2 sm:px-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm font-semibold text-primary">No assignments found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters or add a new assignment.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 text-left text-sm font-bold ${group.headerClass}`}
                    onClick={() => toggleGroupCollapsed(group.key)}
                    aria-expanded={!collapsedGroups.has(group.key)}
                  >
                    <ChevronRight className={`h-4 w-4 transition-transform ${collapsedGroups.has(group.key) ? '' : 'rotate-90'}`} />
                    <group.icon className="h-4 w-4" />
                    <span>{group.label}</span>
                    <span className="text-xs font-medium text-muted-foreground">({group.items.length})</span>
                  </button>
                  {!collapsedGroups.has(group.key) && (
                    <div className="flex flex-col gap-2">
                      {group.items.map((a) =>
                        renderRow(a, getCourse(a.courseId), group.key === 'late' ? 'late' : group.key === 'today' ? 'today' : undefined)
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AssignmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        courses={courses}
        assignment={editing}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : undefined}
      />
    </div>
  );
}

export default HomeworkPage;
