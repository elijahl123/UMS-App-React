import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LatexPaste, recoverChatGptPasteArtifacts } from '@/app/lib/latexPaste';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
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

function RichTextEditor({ content, onChange, placeholder, autoFocus = false }: Props) {
  const lastEmittedRef = useRef(content);
  const didAutoFocusRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);

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
      StarterKit,
      Underline,
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
      Placeholder.configure({ placeholder: placeholder ?? 'Start typing your note...' }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
    editorProps: {
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
        <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border-light)]" />
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div className="max-h-[50vh] overflow-y-auto sm:max-h-[60vh]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default RichTextEditor;
