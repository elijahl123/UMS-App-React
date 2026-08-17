import { Extension, type Editor } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';

export type InlineLatexSegment =
  | { type: 'text'; value: string }
  | { type: 'math'; latex: string; source: string };

function isEscaped(value: string, index: number) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findUnescaped(value: string, delimiter: string, from: number) {
  let cursor = value.indexOf(delimiter, from);
  while (cursor !== -1) {
    if (!isEscaped(value, cursor)) return cursor;
    cursor = value.indexOf(delimiter, cursor + delimiter.length);
  }
  return -1;
}

function findBalancedFallbackClose(
  value: string,
  from: number,
  openCharacter: '(' | '[',
  closeCharacter: ')' | ']'
) {
  let depth = 0;
  for (let cursor = from; cursor < value.length; cursor += 1) {
    if (value[cursor] === openCharacter && !isEscaped(value, cursor)) {
      depth += 1;
      continue;
    }
    if (value[cursor] !== closeCharacter || isEscaped(value, cursor)) continue;
    if (depth === 0) return cursor;
    depth -= 1;
  }
  return -1;
}

function findSingleDollar(value: string, from: number) {
  for (let cursor = from; cursor < value.length; cursor += 1) {
    if (
      value[cursor] === '$' &&
      !isEscaped(value, cursor) &&
      value[cursor - 1] !== '$' &&
      value[cursor + 1] !== '$'
    ) {
      return cursor;
    }
  }
  return -1;
}

function isNumericCurrency(value: string) {
  return /^\s*[\d,]+(?:\.\d+)?\s*$/.test(value);
}

export function parseInlineLatex(value: string): InlineLatexSegment[] {
  const segments: InlineLatexSegment[] = [];
  let textStart = 0;
  let cursor = 0;

  const addMatch = (start: number, end: number, latex: string) => {
    if (start > textStart) segments.push({ type: 'text', value: value.slice(textStart, start) });
    segments.push({ type: 'math', latex: latex.trim(), source: value.slice(start, end) });
    textStart = end;
    cursor = end;
  };

  while (cursor < value.length) {
    if (value.startsWith('\\(', cursor) && !isEscaped(value, cursor)) {
      const strictClose = findUnescaped(value, '\\)', cursor + 2);
      const close =
        strictClose === -1
          ? findBalancedFallbackClose(value, cursor + 2, '(', ')')
          : strictClose;
      if (close !== -1) {
        const latex = value.slice(cursor + 2, close);
        if (latex.trim() && !latex.includes('\n')) {
          addMatch(cursor, close + (strictClose === -1 ? 1 : 2), latex);
          continue;
        }
      }
    }

    if (
      value[cursor] === '$' &&
      !isEscaped(value, cursor) &&
      value[cursor - 1] !== '$' &&
      value[cursor + 1] !== '$'
    ) {
      const close = findSingleDollar(value, cursor + 1);
      if (close !== -1) {
        const latex = value.slice(cursor + 1, close);
        const followedByDigit = /\d/.test(value[close + 1] ?? '');
        if (latex.trim() && !latex.includes('\n') && !isNumericCurrency(latex) && !followedByDigit) {
          addMatch(cursor, close + 1, latex);
          continue;
        }
      }
    }

    cursor += 1;
  }

  if (textStart < value.length) segments.push({ type: 'text', value: value.slice(textStart) });
  return segments.length > 0 ? segments : [{ type: 'text', value }];
}

export function parseBlockLatex(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    const latex = trimmed.slice(2, -2).trim();
    return latex || null;
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith(']')) {
    const close = findBalancedFallbackClose(trimmed, 2, '[', ']');
    if (close === trimmed.length - 1) {
      const latex = trimmed.slice(2, -1).trim();
      return latex || null;
    }
  }
  if (trimmed.startsWith('$$') && !trimmed.startsWith('$$$') && trimmed.endsWith('$$')) {
    const latex = trimmed.slice(2, -2).trim();
    return latex || null;
  }
  return null;
}

export function normalizeChatGptMathHtml(html: string) {
  if (typeof document === 'undefined' || !html.includes('katex')) return html;

  const template = document.createElement('template');
  template.innerHTML = html;

  const editableMathMlTags = new Set([
    'math',
    'semantics',
    'mrow',
    'mi',
    'mn',
    'mo',
    'mtext',
    'ms',
    'mspace',
    'msub',
    'msup',
    'msubsup',
  ]);

  const renderEditableMathMl = (source: Element, target: HTMLElement): boolean => {
    const tag = source.localName;
    if (!editableMathMlTags.has(tag)) return false;

    if (tag === 'semantics') {
      const presentation = [...source.children].find((child) => child.localName !== 'annotation');
      return presentation ? renderEditableMathMl(presentation, target) : false;
    }

    if (tag === 'mi' || tag === 'mn' || tag === 'mo' || tag === 'mtext' || tag === 'ms') {
      target.append(document.createTextNode(source.textContent ?? ''));
      return true;
    }

    if (tag === 'mspace') {
      target.append(document.createTextNode(' '));
      return true;
    }

    const children = [...source.children];
    if (children.length === 0) {
      const text = source.textContent ?? '';
      if (!text) return false;
      target.append(document.createTextNode(text));
      return true;
    }

    if (tag === 'msub' || tag === 'msup' || tag === 'msubsup') {
      if (children.length < 2 || !renderEditableMathMl(children[0], target)) return false;

      const subscript = tag === 'msub' || tag === 'msubsup' ? children[1] : null;
      const superscript = tag === 'msup' ? children[1] : tag === 'msubsup' ? children[2] : null;

      if (subscript) {
        const sub = document.createElement('sub');
        if (!renderEditableMathMl(subscript, sub)) return false;
        target.append(sub);
      }
      if (superscript) {
        const sup = document.createElement('sup');
        if (!renderEditableMathMl(superscript, sup)) return false;
        target.append(sup);
      }
      return true;
    }

    for (const child of children) {
      if (!renderEditableMathMl(child, target)) return false;
    }
    return true;
  };

  const editableMath = (source: Element, type: 'inline' | 'block') => {
    const math = source.querySelector('.katex-mathml math') ?? source.querySelector('math');
    const semantics = math?.querySelector('semantics');
    if (!semantics) return null;

    const replacement = document.createElement(type === 'block' ? 'div' : 'span');
    return renderEditableMathMl(semantics, replacement) ? replacement : null;
  };

  const replaceMath = (source: Element, type: 'inline' | 'block') => {
    const latex = source
      .querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent?.trim();
    if (!latex) return;

    const editable = editableMath(source, type);
    if (editable) {
      source.replaceWith(editable);
      return;
    }

    const replacement = document.createElement(type === 'block' ? 'div' : 'span');
    replacement.dataset.type = type === 'block' ? 'block-math' : 'inline-math';
    replacement.dataset.latex = latex;
    source.replaceWith(replacement);
  };

  template.content.querySelectorAll('.katex-display').forEach((node) => {
    replaceMath(node, 'block');
  });
  template.content.querySelectorAll('.katex').forEach((node) => {
    replaceMath(node, 'inline');
  });

  return template.innerHTML;
}

function startsBlockLatex(value: string) {
  const trimmed = value.trimStart();
  return trimmed.startsWith('\\[') || (trimmed.startsWith('$$') && !trimmed.startsWith('$$$'));
}

interface TextSource {
  node: ProseMirrorNode;
  start: number;
  end: number;
}

function transformTextRun(nodes: ProseMirrorNode[], schema: Schema) {
  const sources: TextSource[] = [];
  let value = '';

  for (const node of nodes) {
    const text = node.text ?? '';
    const start = value.length;
    value += text;
    sources.push({ node, start, end: value.length });
  }

  const segments = parseInlineLatex(value);
  if (!segments.some((segment) => segment.type === 'math')) return nodes;

  const output: ProseMirrorNode[] = [];
  let offset = 0;

  for (const segment of segments) {
    if (segment.type === 'math') {
      output.push(schema.nodes.inlineMath.create({ latex: segment.latex }));
      offset += segment.source.length;
      continue;
    }

    const segmentStart = offset;
    const segmentEnd = segmentStart + segment.value.length;
    for (const source of sources) {
      const from = Math.max(segmentStart, source.start);
      const to = Math.min(segmentEnd, source.end);
      if (from >= to) continue;
      output.push(schema.text(value.slice(from, to), source.node.marks));
    }
    offset = segmentEnd;
  }

  return output;
}

function transformInlineContent(node: ProseMirrorNode, schema: Schema) {
  const output: ProseMirrorNode[] = [];
  let textRun: ProseMirrorNode[] = [];

  const flushText = () => {
    if (textRun.length === 0) return;
    output.push(...transformTextRun(textRun, schema));
    textRun = [];
  };

  node.content.forEach((child) => {
    if (child.isText) {
      textRun.push(child);
      return;
    }
    flushText();
    output.push(child);
  });
  flushText();

  return Fragment.fromArray(output);
}

interface FragmentTransform {
  fragment: Fragment;
  convertedBlock: boolean;
}

function transformFragment(fragment: Fragment, schema: Schema, allowBlock: boolean): FragmentTransform {
  const children: ProseMirrorNode[] = [];
  fragment.forEach((child) => children.push(child));

  const output: ProseMirrorNode[] = [];
  let convertedBlock = false;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];

    if (allowBlock && child.isTextblock && startsBlockLatex(child.textBetween(0, child.content.size, '\n'))) {
      let combined = '';
      for (let end = index; end < children.length && children[end].isTextblock; end += 1) {
        const text = children[end].textBetween(0, children[end].content.size, '\n');
        combined += combined ? `\n${text}` : text;
        const latex = parseBlockLatex(combined);
        if (latex) {
          output.push(schema.nodes.blockMath.create({ latex }));
          index = end;
          convertedBlock = true;
          combined = '';
          break;
        }
      }
      if (!combined) continue;
    }

    if (child.isTextblock) {
      output.push(child.copy(transformInlineContent(child, schema)));
      continue;
    }

    if (child.content.size > 0) {
      let nested = transformFragment(child.content, schema, true);
      if (!child.type.validContent(nested.fragment)) {
        nested = transformFragment(child.content, schema, false);
      }
      output.push(child.copy(nested.fragment));
      convertedBlock ||= nested.convertedBlock;
      continue;
    }

    output.push(child);
  }

  return { fragment: Fragment.fromArray(output), convertedBlock };
}

export function transformLatexSlice(slice: Slice, schema: Schema) {
  const transformed = transformFragment(slice.content, schema, true);
  return new Slice(
    transformed.fragment,
    transformed.convertedBlock ? 0 : slice.openStart,
    transformed.convertedBlock ? 0 : slice.openEnd
  );
}

function hasRecoverableChatGptArtifact(value: string) {
  const hasRecoveredInline = parseInlineLatex(value).some(
    (segment) =>
      segment.type === 'math' &&
      segment.source.startsWith('\\(') &&
      !segment.source.endsWith('\\)')
  );
  if (hasRecoveredInline) return true;

  const blockStart = value.indexOf('\\[');
  if (blockStart === -1 || findUnescaped(value, '\\]', blockStart + 2) !== -1) return false;
  return findBalancedFallbackClose(value, blockStart + 2, '[', ']') !== -1;
}

/**
 * Repairs notes saved after ChatGPT's rich clipboard stripped closing delimiter
 * backslashes. Strict, intentionally stored LaTeX strings are left unchanged.
 */
export function recoverChatGptPasteArtifacts(editor: Editor) {
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n');
  if (!hasRecoverableChatGptArtifact(text)) return false;

  const transformed = transformLatexSlice(
    new Slice(editor.state.doc.content, 0, 0),
    editor.schema
  );
  if (transformed.content.eq(editor.state.doc.content)) return false;

  const transaction = editor.state.tr.replaceWith(
    0,
    editor.state.doc.content.size,
    transformed.content
  );
  transaction.setMeta('addToHistory', false);
  editor.view.dispatch(transaction);
  return true;
}

export const LatexPaste = Extension.create({
  name: 'latexPaste',

  transformPastedHTML(html) {
    return normalizeChatGptMathHtml(html);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPasted: (slice) => transformLatexSlice(slice, this.editor.schema),
        },
      }),
    ];
  },
});
