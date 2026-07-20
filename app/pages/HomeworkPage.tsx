import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  Sparkles,
  ChevronRight,
  RotateCcw,
  FileUp,
  FileText,
  Hourglass,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AssignmentFormDialog from '@/app/components/widgets/AssignmentFormDialog';
import BrightspacePdfImportCard from '@/app/components/BrightspacePdfImportCard';
import { mapCourse, mapAssignment } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import { formatAssignmentDue, formatDueTime, formatTimeZoneLabel } from '@/app/data/assignmentDates';
import type { Assignment, Course } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';

const statusValues = new Set(['all', 'upcoming', 'due_today', 'late', 'completed']);

interface Group {
  key: string;
  label: string;
  icon: typeof AlertTriangle;
  iconClass: string;
  iconBgClass: string;
  textClass: string;
  items: Assignment[];
}

type GroupKey = 'late' | 'today' | 'upcoming' | 'completed';

const groupPresentation: Record<GroupKey, Pick<Group, 'iconClass' | 'iconBgClass' | 'textClass'>> = {
  late: {
    iconClass: 'text-[var(--main-accent)]',
    iconBgClass: 'bg-[color-mix(in_srgb,var(--main-accent)_14%,white)]',
    textClass: 'text-[var(--main-accent)]',
  },
  today: {
    iconClass: 'text-[color-mix(in_srgb,var(--course-yellow)_62%,var(--secondary-accent))]',
    iconBgClass: 'bg-[color-mix(in_srgb,var(--course-yellow)_50%,white)]',
    textClass: 'text-[color-mix(in_srgb,var(--course-yellow)_62%,var(--secondary-accent))]',
  },
  upcoming: {
    iconClass: 'text-[var(--main-accent)]',
    iconBgClass: 'bg-[color-mix(in_srgb,var(--main-color)_18%,white)]',
    textClass: 'text-[var(--main-accent)]',
  },
  completed: {
    iconClass: 'text-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))]',
    iconBgClass: 'bg-[color-mix(in_srgb,var(--course-green)_48%,white)]',
    textClass: 'text-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))]',
  },
};

function HomeworkPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [courseRows, coursesLoading] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows, assignmentsLoading, , refreshAssignments] = useLoadAction('loadAssignments', [], {
    userId: user?.id,
  });

  const [addAssignment] = useMutateAction('createAssignment');
  const [editAssignment] = useMutateAction('updateAssignment');
  const [removeAssignment] = useMutateAction('deleteAssignment');

  const [courseFilter, setCourseFilter] = useState(() => searchParams.get('courseId') ?? 'all');
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get('status');
    return status && statusValues.has(status) ? status : 'all';
  });
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(['completed']));
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);

  const getCourse = (courseId: string) => courses.find((c) => c.id === courseId);

  useEffect(() => {
    setCourseFilter(searchParams.get('courseId') ?? 'all');
    const status = searchParams.get('status');
    setStatusFilter(status && statusValues.has(status) ? status : 'all');
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktopLayout(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

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
      { key: 'late', label: 'Late', icon: AlertTriangle, ...groupPresentation.late, items: late },
      { key: 'today', label: 'Due Today', icon: CalendarClock, ...groupPresentation.today, items: dueToday },
      { key: 'upcoming', label: 'Upcoming', icon: Sparkles, ...groupPresentation.upcoming, items: upcoming },
      { key: 'completed', label: 'Completed', icon: CheckCircle2, ...groupPresentation.completed, items: completed },
    ].filter((g) => g.items.length > 0);
  }, [filtered]);

  const overviewItems = useMemo(() => {
    const upcomingTotal = assignments.filter((a) => a.status === 'upcoming' || a.status === 'due_today').length;
    const completedTotal = assignments.filter((a) => a.status === 'completed').length;
    const lateTotal = assignments.filter((a) => a.status === 'late').length;

    return [
      { label: 'Total', value: assignments.length, icon: FileText, iconClass: 'text-[var(--main-accent)]' },
      { label: 'Upcoming', value: upcomingTotal, icon: Hourglass, iconClass: 'text-[var(--text-secondary)]' },
      {
        label: 'Completed',
        value: completedTotal,
        icon: CheckCircle2,
        iconClass: 'text-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))]',
      },
      { label: 'Late', value: lateTotal, icon: AlertTriangle, iconClass: 'text-[var(--main-accent)]' },
    ];
  }, [assignments]);

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
    const dueTimeLabel = formatDueTime(a.dueTime);
    const dueTodayLabel = dueTimeLabel ? `Today at ${dueTimeLabel} ${formatTimeZoneLabel(a.dueTimeZone, a.dueDate)}` : 'Today';
    const dueLabel = emphasis === 'today' ? dueTodayLabel : formatAssignmentDue(a, { month: 'short', day: 'numeric', year: 'numeric' });
    return (
      <div
        key={a.id}
        className="group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-2.5 pl-4 shadow-[0_8px_20px_rgb(86_73_76/0.05)] sm:gap-4 sm:p-3 sm:pl-5 md:gap-3 md:p-3 md:pl-5 md:shadow-sm xl:gap-4 xl:p-4 xl:pl-6"
        style={{ borderColor: colors.border, backgroundColor: `color-mix(in srgb, ${colors.bg} 42%, white)`, color: colors.text }}
      >
        <span className="absolute left-3.5 top-4 h-[calc(100%-2rem)] w-1.5 rounded-full md:left-4 md:top-4 md:h-[calc(100%-2rem)] xl:top-5 xl:h-[calc(100%-2.5rem)]" style={{ backgroundColor: colors.border }} />
        <div
          className="ml-5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:ml-4 sm:h-12 sm:w-12 md:h-11 md:w-11 xl:h-14 xl:w-14"
          style={{ backgroundColor: `color-mix(in srgb, ${colors.bg} 62%, white)` }}
          aria-hidden="true"
        >
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 md:h-5 md:w-5 xl:h-7 xl:w-7" style={{ color: colors.text }} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-snug text-[var(--secondary-accent)] sm:text-base md:text-sm xl:text-base" title={a.name}>
              {a.name}
            </p>
            <p className="truncate text-[11px] font-semibold leading-tight text-[var(--text-secondary)] sm:text-xs md:text-xs" title={course?.code ?? 'No course'}>
              {course?.code ?? 'No course'}
            </p>
          </div>
          <p className={`flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-tight sm:text-xs md:text-xs ${emphasis === 'late' ? 'text-[var(--main-accent)]' : colors.text}`}>
            <CalendarClock className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 md:h-3.5 md:w-3.5" />
            <span className="min-w-0 truncate" title={dueLabel}>
              {dueLabel}
            </span>
          </p>
        </div>
        <div className="flex w-fit shrink-0 overflow-hidden rounded-lg border border-[var(--border-light)] bg-white/65 shadow-[0_6px_14px_rgb(86_73_76/0.05)] md:bg-white/60">
          {a.status === 'completed' ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none text-[color-mix(in_srgb,var(--course-green)_68%,var(--secondary-accent))] hover:bg-white/70 sm:w-9 md:h-8 md:w-9 xl:h-10 xl:w-11 [&_svg]:size-3.5 xl:[&_svg]:size-4"
              title="Mark incomplete"
              onClick={() => handleMarkIncomplete(a)}
            >
              <RotateCcw className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-[var(--main-accent)] hover:bg-white/70 sm:w-9 md:h-8 md:w-9 xl:h-10 xl:w-11 [&_svg]:size-3.5 xl:[&_svg]:size-4" title="Mark complete" onClick={() => handleMarkComplete(a)}>
              <CheckCircle2 className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
            </Button>
          )}
          <span className="my-1.5 w-px bg-[var(--border-light)] xl:my-2" aria-hidden="true" />
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-[var(--secondary-accent)] hover:bg-white/70 sm:w-9 md:h-8 md:w-9 xl:h-10 xl:w-11 [&_svg]:size-3.5 xl:[&_svg]:size-4" title="Edit" onClick={() => openEditDialog(a)}>
            <Pencil className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
          </Button>
          <span className="my-1.5 w-px bg-[var(--border-light)] xl:my-2" aria-hidden="true" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none text-[var(--main-accent)] hover:bg-white/70 sm:w-9 md:h-8 md:w-9 xl:h-10 xl:w-11 [&_svg]:size-3.5 xl:[&_svg]:size-4"
            title="Delete"
            onClick={() => {
              if (confirm('Are you sure you want to delete this assignment?')) {
                handleDelete(a.id);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-0 md:h-full md:overflow-hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-2 md:h-full md:max-w-none md:gap-0 md:overflow-hidden md:rounded-lg md:border-2 md:border-primary md:bg-card">
        <section className="px-2 pb-1 pr-20 pt-3 md:flex md:flex-col md:items-stretch md:gap-3 md:px-4 md:pb-3 md:pr-4 md:pt-4 xl:flex-row xl:items-center xl:justify-between xl:px-5 xl:pb-4 xl:pt-5">
          <div className="max-w-[calc(100%-4.5rem)] sm:max-w-none">
            <h1 className="text-3xl font-bold leading-tight text-[var(--secondary-accent)] sm:text-4xl md:text-xl md:text-primary xl:text-2xl">Homework</h1>
            <p className="mt-2 text-sm font-medium text-[var(--text-secondary)] sm:text-base md:hidden">Stay on track and get everything done.</p>
          </div>
          {isDesktopLayout && (
            <div className="hidden min-w-0 grid-cols-2 items-center gap-2 md:grid xl:grid-cols-[auto_auto_auto_auto] xl:justify-end">
              <Select value={courseFilter} onValueChange={setCourseFilter}>
                <SelectTrigger className="h-9 w-full rounded-md border border-input bg-white px-3 text-xs font-semibold text-[var(--secondary-accent)] shadow-none xl:h-10 xl:w-[200px] xl:px-4 xl:text-sm">
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
                <SelectTrigger className="h-9 w-full rounded-md border border-input bg-white px-3 text-xs font-semibold text-[var(--secondary-accent)] shadow-none xl:h-10 xl:w-[180px] xl:px-4 xl:text-sm">
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
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-2 rounded-md px-3 text-xs xl:h-10 xl:px-4 xl:text-sm [&_svg]:size-4"
                onClick={() => setShowImportPanel((current) => !current)}
              >
                <FileUp className="h-4 w-4" />
                {showImportPanel ? 'Hide Import' : 'Import Brightspace PDF'}
              </Button>
              <Button
                onClick={openAddDialog}
                className="h-9 gap-2 rounded-md border-2 border-primary bg-[var(--secondary-color)] px-3 text-xs font-semibold text-primary shadow-none hover:bg-primary hover:text-primary-foreground xl:h-10 xl:px-4 xl:text-sm [&_svg]:size-4"
              >
                <Plus className="h-4 w-4" />
                Add Assignment
              </Button>
            </div>
          )}
        </section>

        {!isDesktopLayout && <section className="grid gap-3 md:hidden">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:min-w-0">
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="h-14 w-full rounded-lg border border-[var(--border-light)] bg-white px-5 text-sm font-semibold text-[var(--secondary-accent)] shadow-[0_6px_18px_rgb(86_73_76/0.04)] sm:text-base md:w-[200px]">
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
              <SelectTrigger className="h-14 w-full rounded-lg border border-[var(--border-light)] bg-white px-5 text-sm font-semibold text-[var(--secondary-accent)] shadow-[0_6px_18px_rgb(86_73_76/0.04)] sm:text-base md:w-[180px]">
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
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-14 w-full gap-3 rounded-lg border border-[var(--border-light)] bg-[var(--secondary-color)] px-5 text-sm font-semibold text-[var(--secondary-accent)] shadow-[0_6px_18px_rgb(86_73_76/0.04)] hover:bg-[var(--secondary-accent-soft)] hover:text-[var(--secondary-accent)] sm:text-base md:w-auto [&_svg]:size-4"
            onClick={() => setShowImportPanel((current) => !current)}
          >
            <FileUp className="h-4 w-4" />
            {showImportPanel ? 'Hide Import' : 'Import Brightspace PDF'}
          </Button>

          <Button
            onClick={openAddDialog}
            className="h-14 w-full gap-3 rounded-lg border-0 bg-[var(--main-color)] px-6 text-base font-semibold text-white shadow-[0_10px_22px_color-mix(in_srgb,var(--main-color)_34%,transparent)] hover:bg-[var(--main-color-shade)] sm:text-lg md:w-auto [&_svg]:size-6"
          >
            <Plus className="h-6 w-6" />
            Add Assignment
          </Button>
        </section>}

        <section className="grid gap-5 md:min-h-0 md:flex-1 md:overflow-auto md:px-4 md:pb-4 xl:px-5 xl:pb-5">
          {showImportPanel && (
            <div>
              <BrightspacePdfImportCard
                title="Import Brightspace Assignments"
                description="Download the Brightspace calendar as a PDF, preview the parsed rows, and import the items you want into Homework and Calendar."
              />
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-[var(--border-light)] bg-white px-5 py-12 text-center shadow-[0_10px_24px_rgb(86_73_76/0.05)]">
              <p className="text-sm font-semibold text-primary">No assignments found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters or add a new assignment.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 md:gap-4 xl:gap-5">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-3 md:gap-2.5 xl:gap-3">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => toggleGroupCollapsed(group.key)}
                    aria-expanded={!collapsedGroups.has(group.key)}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full md:h-9 md:w-9 xl:h-10 xl:w-10 ${group.iconBgClass}`}>
                      <group.icon className={`h-5 w-5 md:h-4 md:w-4 xl:h-5 xl:w-5 ${group.iconClass}`} />
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="truncate text-xl font-bold text-[var(--secondary-accent)] sm:text-2xl md:text-lg xl:text-xl">{group.label}</span>
                      <span className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-sm font-bold md:h-7 md:min-w-7 md:text-xs xl:h-8 xl:min-w-8 xl:text-sm ${group.iconBgClass} ${group.textClass}`}>
                        {group.items.length}
                      </span>
                    </span>
                    <ChevronRight className={`h-5 w-5 shrink-0 ${group.textClass} transition-transform ${collapsedGroups.has(group.key) ? '' : 'rotate-90'}`} />
                  </button>
                  {!collapsedGroups.has(group.key) && (
                    <div className="flex flex-col gap-3">
                      {group.items.map((a) =>
                        renderRow(a, getCourse(a.courseId), group.key === 'late' ? 'late' : group.key === 'today' ? 'today' : undefined)
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-[var(--border-light)] bg-white p-4 shadow-[0_10px_26px_rgb(86_73_76/0.06)] sm:p-5 md:hidden">
            <p className="text-lg font-bold text-[var(--secondary-accent)] sm:text-xl">Homework Overview</p>
            <div className="mt-4 grid grid-cols-4">
              {overviewItems.map((item, index) => (
                <div
                  key={item.label}
                  className={`flex min-w-0 flex-col items-center gap-1.5 px-1.5 text-center sm:gap-2 sm:px-3 ${index > 0 ? 'border-l border-[var(--border-light)]' : ''}`}
                >
                  <item.icon className={`mb-0.5 h-5 w-5 sm:mb-1 sm:h-6 sm:w-6 ${item.iconClass}`} />
                  <span className="text-xl font-bold leading-none text-[var(--secondary-accent)] sm:text-3xl">{item.value}</span>
                  <span className="truncate text-[10px] font-medium text-[var(--text-secondary)] sm:text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

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
