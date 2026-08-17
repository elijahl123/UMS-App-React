import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Placeholder } from '@tiptap/extensions';
import 'katex/dist/katex.min.css';
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  ImagePlus,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LatexPaste, recoverChatGptPasteArtifacts } from '@/app/lib/latexPaste';
import { NoteImage, NoteImageActionsContext, type NoteImageAttrs } from '@/app/components/widgets/NoteImageNode';
import {
  NOTE_IMAGE_ACCEPT,
  NOTE_IMAGE_MAX_BYTES,
  deleteUnattachedNoteImage,
  isSupportedNoteImageFile,
  noteImageErrorMessage,
  uploadNoteImage,
} from '@/app/lib/noteImages/client';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onUploadStateChange?: (hasUnresolvedImages: boolean) => void;
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
        active && 'bg-primary/15 text-primary'
      )}
    >
      {children}
    </button>
  );
}

function RichTextEditor({ content, onChange, placeholder, autoFocus = false, onUploadStateChange }: Props) {
  const lastEmittedRef = useRef(content);
  const didAutoFocusRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef(new Map<string, File>());
  const previewUrlsRef = useRef(new Map<string, string>());
  const removedUploadIdsRef = useRef(new Set<string>());
  const unattachedImageIdsRef = useRef(new Map<string, string>());
  const uploadQueueRef = useRef<string[]>([]);
  const queuedUploadIdsRef = useRef(new Set<string>());
  const uploadQueueRunningRef = useRef(false);
  const insertFilesRef = useRef<(files: File[], position?: number) => void>(() => undefined);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const releaseUploadResources = useCallback((uploadId: string) => {
    const previewUrl = previewUrlsRef.current.get(uploadId);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(uploadId);
    }
    filesRef.current.delete(uploadId);
  }, []);

  const cleanupRemovedUploads = useCallback((doc: ProseMirrorNode) => {
    const presentUploadIds = new Set<string>();
    const presentImageIds = new Set<string>();
    doc.descendants((node) => {
      if (node.type.name !== 'noteImage') return;
      if (typeof node.attrs.uploadId === 'string') presentUploadIds.add(node.attrs.uploadId);
      if (typeof node.attrs.imageId === 'string') presentImageIds.add(node.attrs.imageId);
    });

    for (const uploadId of filesRef.current.keys()) {
      if (presentUploadIds.has(uploadId)) continue;
      removedUploadIdsRef.current.add(uploadId);
      releaseUploadResources(uploadId);
    }
    for (const [imageId, uploadId] of unattachedImageIdsRef.current) {
      if (presentImageIds.has(imageId)) continue;
      unattachedImageIdsRef.current.delete(imageId);
      removedUploadIdsRef.current.delete(uploadId);
      void deleteUnattachedNoteImage(imageId).catch(() => undefined);
    }
  }, [releaseUploadResources]);

  const editMath = (kind: 'inline' | 'block', node: ProseMirrorNode, pos: number) => {
    const currentLatex = String(node.attrs.latex ?? '');
    const nextLatex = window.prompt('Edit LaTeX formula', currentLatex);
    if (!nextLatex?.trim()) return;

    const chain = editorRef.current?.chain().focus();
    if (kind === 'inline') {
      chain?.updateInlineMath({ latex: nextLatex.trim(), pos }).run();
    } else {
      chain?.updateBlockMath({ latex: nextLatex.trim(), pos }).run();
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      Subscript,
      Superscript,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      InlineMath.extend({
        addInputRules() {
          return [];
        },
      }).configure({
        katexOptions: {
          displayMode: false,
          throwOnError: false,
          trust: false,
          strict: 'warn',
        },
        onClick: (node, pos) => editMath('inline', node, pos),
      }),
      BlockMath.extend({
        addInputRules() {
          return [];
        },
      }).configure({
        katexOptions: {
          displayMode: true,
          throwOnError: false,
          trust: false,
          strict: 'warn',
        },
        onClick: (node, pos) => editMath('block', node, pos),
      }),
      LatexPaste,
      NoteImage,
      Placeholder.configure({ placeholder: placeholder ?? 'Start typing your note...' }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
      cleanupRemovedUploads(editor.state.doc);
      let unresolved = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'noteImage' && node.attrs.status !== 'ready') unresolved = true;
      });
      onUploadStateChange?.(unresolved);
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter(isSupportedNoteImageFile);
        if (files.length === 0) return false;
        event.preventDefault();
        insertFilesRef.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = [...(event.dataTransfer?.files ?? [])].filter(isSupportedNoteImageFile);
        if (files.length === 0) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertFilesRef.current(files, position);
        return true;
      },
      attributes: {
        'aria-label': 'Rich text editor',
        class:
          'max-w-none min-h-[240px] sm:min-h-[360px] focus:outline-none px-4 py-3 sm:px-6 sm:py-4 text-sm sm:text-base text-foreground',
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor]);

  useEffect(() => () => {
    for (const url of previewUrlsRef.current.values()) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!editor) return;
    // Only push external content into the editor when it did not originate
    // from this editor's own onUpdate (avoids clobbering cursor while typing),
    // e.g. when the note data finishes loading asynchronously or switching notes.
    if (content !== lastEmittedRef.current && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', { emitUpdate: false });
      lastEmittedRef.current = content;
    }
  }, [editor, content]);

  useEffect(() => {
    if (!editor) return;
    recoverChatGptPasteArtifacts(editor);
  }, [editor, content]);

  useEffect(() => {
    if (!editor || !autoFocus || didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const chain = editor.chain().focus('end');
      if (!editor.isActive('bulletList')) chain.toggleBulletList();
      chain.run();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, editor]);

  const updateUploadNode = useCallback((uploadId: string, attrs: Partial<NoteImageAttrs>) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    let targetPosition: number | null = null;
    currentEditor.state.doc.descendants((node, position) => {
      if (node.type.name === 'noteImage' && node.attrs.uploadId === uploadId) {
        targetPosition = position;
        return false;
      }
      return true;
    });
    if (targetPosition === null) return;
    const node = currentEditor.state.doc.nodeAt(targetPosition);
    if (!node) return;
    currentEditor.view.dispatch(
      currentEditor.state.tr.setNodeMarkup(targetPosition, undefined, { ...node.attrs, ...attrs })
    );
  }, []);

  const performUpload = useCallback(async (uploadId: string) => {
    const file = filesRef.current.get(uploadId);
    if (!file) return;
    updateUploadNode(uploadId, { status: 'uploading', error: null });
    try {
      const uploaded = await uploadNoteImage(file);
      if (removedUploadIdsRef.current.has(uploadId)) {
        removedUploadIdsRef.current.delete(uploadId);
        releaseUploadResources(uploadId);
        void deleteUnattachedNoteImage(uploaded.image.id).catch(() => undefined);
        return;
      }
      unattachedImageIdsRef.current.set(uploaded.image.id, uploadId);
      releaseUploadResources(uploadId);
      updateUploadNode(uploadId, {
        imageId: uploaded.image.id,
        filename: uploaded.image.originalFilename,
        status: 'ready',
        displayUrl: uploaded.url,
        error: null,
      });
      setUploadNotice(null);
    } catch (err) {
      updateUploadNode(uploadId, { status: 'failed', error: noteImageErrorMessage(err) });
    }
  }, [releaseUploadResources, updateUploadNode]);

  const drainUploadQueue = useCallback(async () => {
    if (uploadQueueRunningRef.current) return;
    uploadQueueRunningRef.current = true;
    try {
      while (uploadQueueRef.current.length > 0) {
        const uploadId = uploadQueueRef.current.shift()!;
        queuedUploadIdsRef.current.delete(uploadId);
        await performUpload(uploadId);
      }
    } finally {
      uploadQueueRunningRef.current = false;
    }
  }, [performUpload]);

  const enqueueUploads = useCallback((uploadIds: string[]) => {
    for (const uploadId of uploadIds) {
      if (queuedUploadIdsRef.current.has(uploadId)) continue;
      queuedUploadIdsRef.current.add(uploadId);
      uploadQueueRef.current.push(uploadId);
    }
    void drainUploadQueue();
  }, [drainUploadQueue]);

  const insertFiles = useCallback((files: File[], position?: number) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const validFiles = files.filter((file) => {
      if (!isSupportedNoteImageFile(file)) {
        setUploadNotice('Choose a HEIC, HEIF, JPEG, PNG, WebP, or GIF image.');
        return false;
      }
      if (file.size > NOTE_IMAGE_MAX_BYTES) {
        setUploadNotice('Images must be 25 MB or smaller.');
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;

    const uploads = validFiles.map((file) => {
      const uploadId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      filesRef.current.set(uploadId, file);
      previewUrlsRef.current.set(uploadId, previewUrl);
      return { uploadId, file, previewUrl };
    });
    const nodes = uploads.map(({ uploadId, file, previewUrl }) => ({
      type: 'noteImage',
      attrs: {
        imageId: null,
        uploadId,
        alt: file.name.replace(/\.[^.]+$/, ''),
        filename: file.name,
        status: 'uploading',
        displayUrl: previewUrl,
        error: null,
      },
    }));
    const chain = currentEditor.chain().focus();
    if (typeof position === 'number') chain.insertContentAt(position, nodes).run();
    else chain.insertContent(nodes).run();
    enqueueUploads(uploads.map(({ uploadId }) => uploadId));
  }, [enqueueUploads]);

  insertFilesRef.current = insertFiles;

  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Enter URL', previousUrl ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border-light)] bg-card">
      <input
        ref={fileInputRef}
        type="file"
        accept={NOTE_IMAGE_ACCEPT}
        multiple
        className="sr-only"
        aria-label="Upload note images"
        onChange={(event) => {
          insertFiles([...event.target.files ?? []]);
          event.target.value = '';
        }}
      />
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-light)] bg-secondary/40 px-2 py-1.5">
        <ToolbarButton title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border-light)]" />
        <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Subscript" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}>
          <SubscriptIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Superscript" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
          <SuperscriptIcon className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border-light)]" />
        <ToolbarButton title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border-light)]" />
        <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive('link')} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Upload images" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border-light)]" />
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>
      {uploadNotice && <p className="border-b border-[var(--border-light)] px-4 py-2 text-xs font-medium text-destructive">{uploadNotice}</p>}
      <div className="max-h-[50vh] overflow-y-auto sm:max-h-[60vh]">
        <NoteImageActionsContext.Provider value={{ retryUpload: (uploadId) => enqueueUploads([uploadId]) }}>
          <EditorContent editor={editor} />
        </NoteImageActionsContext.Provider>
      </div>
    </div>
  );
}

export default RichTextEditor;
