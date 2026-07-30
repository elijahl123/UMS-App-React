export function noteHtmlToText(html: string): string {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  template.content
    .querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]')
    .forEach((mathNode) => {
      const latex = mathNode.dataset.latex?.trim();
      mathNode.replaceWith(document.createTextNode(latex ? ` ${latex} ` : ' '));
    });

  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim();
}
