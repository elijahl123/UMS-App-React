import { parseBrightspaceCalendarPages, type BrightspaceCalendarPreviewRow } from './parser';

function ensurePdfJsBrowserCompatibility() {
  type PromiseWithResolvers = typeof Promise & {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };

  const promiseConstructor = Promise as PromiseWithResolvers;
  if (promiseConstructor.withResolvers) return;

  promiseConstructor.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    return { promise, resolve, reject };
  };
}

export async function extractBrightspacePdfText(file: File): Promise<string[]> {
  ensurePdfJsBrowserCompatibility();

  const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl.default;

  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join('\n');
    pages.push(text);
  }

  if (!pages.join('').trim()) {
    throw new Error('Could not read text from this PDF. Image-only Brightspace PDFs are not supported yet.');
  }

  return pages;
}

export async function parseBrightspacePdfFile(file: File): Promise<BrightspaceCalendarPreviewRow[]> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Please choose a PDF file.');
  }

  const pages = await extractBrightspacePdfText(file);
  const rows = parseBrightspaceCalendarPages(pages);
  if (rows.length === 0) {
    throw new Error('No Brightspace agenda entries were found in this PDF.');
  }

  return rows;
}
