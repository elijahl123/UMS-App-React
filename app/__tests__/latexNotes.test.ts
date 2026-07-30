import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { Fragment, Slice } from '@tiptap/pm/model';
import {
  parseBlockLatex,
  parseInlineLatex,
  normalizeChatGptMathHtml,
  recoverChatGptPasteArtifacts,
  transformLatexSlice,
} from '@/app/lib/latexPaste';
import { noteHtmlToText } from '@/app/lib/noteText';

function createMathEditor() {
  return new Editor({
    extensions: [StarterKit, InlineMath, BlockMath],
    content: '<p></p>',
  });
}

describe('LaTeX note paste parsing', () => {
  it('collapses ChatGPT KaTeX clipboard HTML into one math node per formula', () => {
    const html =
      '<p>A DFA uses ' +
      '<span class="katex">' +
      '<span class="katex-mathml"><math><semantics><mrow>A=(Q,Σ)</mrow>' +
      '<annotation encoding="application/x-tex">A=(Q,\\Sigma)</annotation>' +
      '</semantics></math></span>' +
      '<span class="katex-html" aria-hidden="true">A=(Q,Σ)</span>' +
      '</span>.</p>' +
      '<span class="katex-display"><span class="katex">' +
      '<span class="katex-mathml"><math><semantics><mrow>δ(q,ε)=q</mrow>' +
      '<annotation encoding="application/x-tex">\\delta(q,\\epsilon)=q</annotation>' +
      '</semantics></math></span>' +
      '<span class="katex-html" aria-hidden="true">δ(q,ε)=q</span>' +
      '</span></span>';

    const normalized = normalizeChatGptMathHtml(html);

    expect(normalized).toContain(
      '<span data-type="inline-math" data-latex="A=(Q,\\Sigma)"></span>'
    );
    expect(normalized).toContain(
      '<div data-type="block-math" data-latex="\\delta(q,\\epsilon)=q"></div>'
    );
    expect(normalized).not.toContain('katex');
    expect(normalized).not.toContain('A=(Q,Σ)');
  });

  it('recognizes ChatGPT and dollar-delimited inline formulas', () => {
    expect(parseInlineLatex('Use \\(x^2 + y^2\\) or $E=mc^2$ here.')).toEqual([
      { type: 'text', value: 'Use ' },
      { type: 'math', latex: 'x^2 + y^2', source: '\\(x^2 + y^2\\)' },
      { type: 'text', value: ' or ' },
      { type: 'math', latex: 'E=mc^2', source: '$E=mc^2$' },
      { type: 'text', value: ' here.' },
    ]);
  });

  it('recovers ChatGPT clipboard formulas whose closing backslash was stripped', () => {
    expect(
      parseInlineLatex(
        'A DFA is written as \\(A=(Q,\\Sigma,\\delta,q_0,F)). ' +
          '\\(Q) is the state set and \\(\\Sigma^*) is the language.'
      )
    ).toEqual([
      { type: 'text', value: 'A DFA is written as ' },
      {
        type: 'math',
        latex: 'A=(Q,\\Sigma,\\delta,q_0,F)',
        source: '\\(A=(Q,\\Sigma,\\delta,q_0,F))',
      },
      { type: 'text', value: '. ' },
      { type: 'math', latex: 'Q', source: '\\(Q)' },
      { type: 'text', value: ' is the state set and ' },
      { type: 'math', latex: '\\Sigma^*', source: '\\(\\Sigma^*)' },
      { type: 'text', value: ' is the language.' },
    ]);
    expect(parseBlockLatex('\\[\\delta(q,\\epsilon)=q]')).toBe('\\delta(q,\\epsilon)=q');
  });

  it('recognizes both block forms, including multiline formulas', () => {
    expect(parseBlockLatex('\\[\\sum_{i=1}^n i\\]')).toBe('\\sum_{i=1}^n i');
    expect(parseBlockLatex('$$\n\\begin{aligned}\nx &= 1 \\\\\ny &= 2\n\\end{aligned}\n$$')).toBe(
      '\\begin{aligned}\nx &= 1 \\\\\ny &= 2\n\\end{aligned}'
    );
  });

  it('leaves currency, escaped, empty, and unmatched delimiters literal', () => {
    const values = [
      'The book costs $100$.',
      'The prices are $5 and $10 today.',
      String.raw`Use \\(literal\\) text.`,
      'Empty $  $ formula.',
      'Unmatched $x + y text.',
    ];

    for (const value of values) {
      expect(parseInlineLatex(value)).toEqual([{ type: 'text', value }]);
    }
    expect(parseBlockLatex('$$  $$')).toBeNull();
    expect(parseBlockLatex('\\[not closed')).toBeNull();
  });

  it('preserves rich-text marks while replacing a formula split across text nodes', () => {
    const editor = createMathEditor();
    const { schema } = editor;
    const paragraph = schema.nodes.paragraph.create(
      null,
      Fragment.fromArray([
        schema.text('Before \\(', [schema.marks.bold.create()]),
        schema.text('x^2', [schema.marks.italic.create()]),
        schema.text('\\) after', [schema.marks.bold.create()]),
      ])
    );

    const transformed = transformLatexSlice(new Slice(Fragment.from(paragraph), 0, 0), schema);
    const result = transformed.content.firstChild!;

    expect(result.childCount).toBe(3);
    expect(result.child(0).text).toBe('Before ');
    expect(result.child(0).marks[0].type.name).toBe('bold');
    expect(result.child(1).type.name).toBe('inlineMath');
    expect(result.child(1).attrs.latex).toBe('x^2');
    expect(result.child(2).text).toBe(' after');
    expect(result.child(2).marks[0].type.name).toBe('bold');
    editor.destroy();
  });

  it('turns a multiline standalone block into one block math node', () => {
    const editor = createMathEditor();
    const { schema } = editor;
    const paragraphs = ['\\[', '\\sum_{i=1}^n i', '\\]'].map((text) =>
      schema.nodes.paragraph.create(null, schema.text(text))
    );

    const transformed = transformLatexSlice(
      new Slice(Fragment.fromArray(paragraphs), 1, 1),
      schema
    );

    expect(transformed.openStart).toBe(0);
    expect(transformed.openEnd).toBe(0);
    expect(transformed.content.childCount).toBe(1);
    expect(transformed.content.firstChild?.type.name).toBe('blockMath');
    expect(transformed.content.firstChild?.attrs.latex).toBe('\\sum_{i=1}^n i');
    editor.destroy();
  });

  it('recovers a note previously saved with ChatGPT clipboard artifacts', () => {
    const editor = createMathEditor();
    editor.commands.setContent(
      '<p>A DFA is written as \\(A=(Q,\\Sigma,\\delta,q_0,F)).</p>' +
        '<p>\\(Q) is the state set.</p>'
    );

    expect(recoverChatGptPasteArtifacts(editor)).toBe(true);
    expect(editor.getHTML()).toContain(
      '<span data-latex="A=(Q,\\Sigma,\\delta,q_0,F)" data-type="inline-math"></span>'
    );
    expect(editor.getHTML()).toContain(
      '<span data-latex="Q" data-type="inline-math"></span>'
    );
    expect(recoverChatGptPasteArtifacts(editor)).toBe(false);
    editor.destroy();
  });
});

describe('LaTeX note persistence and previews', () => {
  it('serializes math nodes without persisting generated KaTeX markup', () => {
    const editor = createMathEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Energy: ' },
            { type: 'inlineMath', attrs: { latex: 'E=mc^2' } },
          ],
        },
        { type: 'blockMath', attrs: { latex: '\\frac{a}{b}' } },
      ],
    });

    const html = editor.getHTML();
    expect(html).toContain(
      '<p>Energy: <span data-latex="E=mc^2" data-type="inline-math"></span></p>'
    );
    expect(html).toContain('<div data-latex="\\frac{a}{b}" data-type="block-math"></div>');
    expect(html).not.toContain('katex');
    editor.destroy();
  });

  it('includes serialized formulas in note preview and search text', () => {
    expect(
      noteHtmlToText(
        '<p>Energy <span data-type="inline-math" data-latex="E=mc^2"></span></p>' +
          '<div data-type="block-math" data-latex="\\frac{a}{b}"></div>'
      )
    ).toBe('Energy E=mc^2 \\frac{a}{b}');
  });
});
