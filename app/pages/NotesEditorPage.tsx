import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RichTextEditor from '@/app/components/widgets/RichTextEditor';
import { mapCourse, mapNote } from '@/app/data/mappers';
import { useAuth } from '@/app/lib/auth/AuthContext';

const NO_COURSE = 'none';

function NotesEditorPage() {
  const { noteId } = useParams<{ noteId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [courseRows] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [noteRows] = useLoadAction('loadNotes', [], { userId: user?.id });
  const [addNote] = useMutateAction('createNote');
  const [editNote] = useMutateAction('updateNote');
  const [removeNote] = useMutateAction('deleteNote');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [courseId, setCourseId] = useState<string>(NO_COURSE);
  const [isSaving, setIsSaving] = useState(false);

  const courses = useMemo(() => (courseRows ?? []).map(mapCourse), [courseRows]);
  const notes = useMemo(() => (noteRows ?? []).map(mapNote), [noteRows]);
  const note = noteId ? notes.find((n) => n.id === noteId) ?? null : null;

  const isEdit = Boolean(noteId);

  // Only load the note's data into the form once per note (when it first becomes
  // available), so it doesn't keep overwriting the user's in-progress edits.
  const loadedNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (noteId && note && loadedNoteIdRef.current !== noteId) {
      setTitle(note.title);
      setContent(note.content);
      setCourseId(note.courseId ?? NO_COURSE);
      loadedNoteIdRef.current = noteId;
    }
  }, [noteId, note]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      if (isEdit) {
        await editNote({
          id: noteId!,
          courseId: courseId === NO_COURSE ? null : courseId,
          title: title.trim(),
          content,
          userId: user?.id,
        });
      } else {
        await addNote({
          courseId: courseId === NO_COURSE ? null : courseId,
          title: title.trim(),
          content,
          userId: user?.id,
        });
      }
      navigate('/notes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!note || !confirm('Are you sure you want to delete this note?')) return;
    await removeNote({ id: note.id, userId: user?.id });
    navigate('/notes');
  };

  if (noteId && !note) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => navigate('/notes')}
          className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Notes
        </button>
        <div className="rounded-lg border border-[var(--border-light)] bg-card p-6 text-center">
          <p className="text-muted-foreground">Note not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => navigate('/notes')}
          className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Notes
        </button>

        <div className="flex flex-col gap-4 rounded-lg border border-[var(--border-light)] bg-card p-4 sm:flex-row sm:items-end sm:gap-3 sm:p-6">
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground">Title</label>
            <Input
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 text-lg font-bold"
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <label className="text-xs font-semibold text-muted-foreground">Course (optional)</label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Link to a course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COURSE}>No course</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-1">
        <RichTextEditor content={content} onChange={setContent} placeholder="Write your note here..." />
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {isEdit ? (
          <Button variant="destructive" onClick={handleDelete} className="w-full gap-2 sm:w-auto">
            <Trash2 className="h-4 w-4" />
            Delete Note
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-2 sm:gap-3">
          <Button variant="outline" onClick={() => navigate('/notes')} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving} className="w-full gap-2 sm:w-auto">
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Note'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NotesEditorPage;
