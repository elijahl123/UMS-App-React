import { createContext, useContext, useEffect, useState } from 'react';
import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ImageOff, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getNoteImageUrl } from '@/app/lib/noteImages/client';
import { cn } from '@/lib/utils';

export interface NoteImageActions {
  retryUpload: (uploadId: string) => void;
}

export const NoteImageActionsContext = createContext<NoteImageActions>({ retryUpload: () => undefined });

export interface NoteImageAttrs {
  imageId: string | null;
  uploadId: string | null;
  alt: string;
  filename: string;
  status: 'ready' | 'uploading' | 'failed';
  displayUrl: string | null;
  error: string | null;
}

function NoteImageView({ node, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const attrs = node.attrs as NoteImageAttrs;
  const { retryUpload } = useContext(NoteImageActionsContext);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(attrs.displayUrl);
  const [viewError, setViewError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (attrs.displayUrl) {
      setResolvedUrl(attrs.displayUrl);
      setViewError(false);
      return;
    }
    if (!attrs.imageId || attrs.status !== 'ready') return;
    let active = true;
    setViewError(false);
    void getNoteImageUrl(attrs.imageId)
      .then((result) => {
        if (active) setResolvedUrl(result.url);
      })
      .catch(() => {
        if (active) setViewError(true);
      });
    return () => { active = false; };
  }, [attrs.displayUrl, attrs.imageId, attrs.status, refreshKey]);

  const editAlt = () => {
    const next = window.prompt('Describe this image', attrs.alt || attrs.filename);
    if (next !== null) updateAttributes({ alt: next.trim() });
  };

  return (
    <NodeViewWrapper
      as="figure"
      data-note-image-node
      className={cn('note-image-node group relative my-3', selected && 'is-selected')}
      contentEditable={false}
    >
      {attrs.status === 'uploading' ? (
        <div className="note-image-placeholder">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Uploading {attrs.filename || 'image'}…</span>
        </div>
      ) : attrs.status === 'failed' ? (
        <div className="note-image-placeholder text-destructive">
          <ImageOff className="h-6 w-6" />
          <span>{attrs.error || 'Upload failed.'}</span>
          {attrs.uploadId && (
            <Button type="button" variant="outline" size="sm" onClick={() => retryUpload(attrs.uploadId!)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </Button>
          )}
        </div>
      ) : resolvedUrl ? (
        <img src={resolvedUrl} alt={attrs.alt} draggable={false} />
      ) : viewError ? (
        <div className="note-image-placeholder text-destructive">
          <ImageOff className="h-6 w-6" />
          <span>Private image could not be loaded.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : (
        <div className="note-image-placeholder"><Loader2 className="h-6 w-6 animate-spin" /> Loading image…</div>
      )}

      <div className={cn('note-image-actions', selected ? 'flex' : 'hidden group-hover:flex group-focus-within:flex')}>
        {attrs.status === 'ready' && (
          <Button type="button" variant="secondary" size="sm" onClick={editAlt} title="Edit image description">
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Alt text
          </Button>
        )}
        <Button type="button" variant="destructive" size="sm" onClick={deleteNode} title="Remove image">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
        </Button>
      </div>
      {attrs.status === 'ready' && attrs.alt && <figcaption className="sr-only">{attrs.alt}</figcaption>}
    </NodeViewWrapper>
  );
}

export const NoteImage = Node.create({
  name: 'noteImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      imageId: { default: null, parseHTML: (element) => element.getAttribute('data-note-image-id') },
      uploadId: { default: null, rendered: false },
      alt: { default: '', parseHTML: (element) => element.getAttribute('alt') ?? '' },
      filename: { default: '', rendered: false },
      status: { default: 'ready', rendered: false },
      displayUrl: { default: null, rendered: false },
      error: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-note-image-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { imageId, alt } = HTMLAttributes as { imageId?: string; alt?: string };
    if (!imageId) return ['span', { 'data-note-image-upload': 'pending' }];
    return ['img', mergeAttributes({ 'data-note-image-id': imageId, alt: alt ?? '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
});
