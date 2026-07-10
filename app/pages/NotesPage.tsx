import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { Plus, Pencil, Trash2, FileText, StickyNote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mapCourse, mapNote } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import { useAuth } from '@/app/lib/auth/AuthContext';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function NotesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courseRows] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [noteRows, notesLoading, , refresh] = useLoadAction('loadNotes', [], { userId: user?.id });
  const [removeNote] = useMutateAction('deleteNote');

  const [courseFilter, setCourseFilter] = useState('all');

  const courses = (courseRows ?? []).map(mapCourse);
  const notes = (noteRows ?? []).map(mapNote);

  const getCourse = (courseId?: string) => courses.find((c) => c.id === courseId);

  const filtered = useMemo(() => {
    return notes
      .filter((n) => courseFilter === 'all' || n.courseId === courseFilter)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, courseFilter]);

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this note?')) {
      await removeNote({ id, userId: user?.id });
      refresh();
    }
  };

  if (notesLoading && notes.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">Loading notes...</div>;
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Notes</CardTitle>
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
            <Button onClick={() => navigate('/notes/new')} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Note
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <StickyNote className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-primary">No notes yet</p>
              <p className="text-xs text-muted-foreground">Create your first note to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((note) => {
                const course = getCourse(note.courseId);
                const colors = course ? getCourseColor(course.color) : null;
                const preview = stripHtml(note.content);
                return (
                  <div
                    key={note.id}
                    role="button"
                    onClick={() => navigate(`/notes/${note.id}`)}
                    className="group flex cursor-pointer flex-col gap-2 rounded-xl border-l-4 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                    style={{ borderLeftColor: colors?.border ?? 'var(--border-light)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <p className="truncate text-sm font-bold text-foreground">{note.title}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/notes/${note.id}`);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(note.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="line-clamp-3 text-xs text-muted-foreground">{preview || 'No content yet.'}</p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      {course ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: colors?.bg, color: colors?.text }}
                        >
                          {course.code}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-muted-foreground">No course</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{formatDate(note.updatedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default NotesPage;
