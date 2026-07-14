import { parseBrightspaceCalendarPages, type BrightspaceCalendarPreviewRow } from './parser';

export type BrightspacePdfDiagnostic = {
  phase: string;
  name: string;
  message: string;
  stack?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
};

export class BrightspacePdfExtractionError extends Error {
  diagnostic: BrightspacePdfDiagnostic;

  constructor(message: string, diagnostic: BrightspacePdfDiagnostic) {
    super(message);
    this.name = 'BrightspacePdfExtractionError';
    this.diagnostic = diagnostic;
  }
}

function ensurePdfJsBrowserCompatibility() {
  type PromiseWithResolvers = typeof Promise & {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };
  type UrlWithParse = typeof URL & {
    parse?: (url: string | URL, base?: string | URL) => URL | null;
  };
  type ResponseWithBytes = typeof Response.prototype & {
    bytes?: () => Promise<Uint8Array>;
  };
  type ArrayPrototypeWithModernMethods = typeof Array.prototype & {
    at?: <T>(this: T[], index: number) => T | undefined;
    findLast?: <T>(this: T[], predicate: (value: T, index: number, array: T[]) => boolean) => T | undefined;
  };
  type ObjectConstructorWithHasOwn = ObjectConstructor & {
    hasOwn?: (object: object, property: PropertyKey) => boolean;
  };

  const promiseConstructor = Promise as PromiseWithResolvers;
  if (!promiseConstructor.withResolvers) {
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

  const arrayPrototype = Array.prototype as ArrayPrototypeWithModernMethods;
  if (!arrayPrototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
      value<T>(this: T[], index: number): T | undefined {
        const offset = Math.trunc(index) || 0;
        const resolvedIndex = offset < 0 ? this.length + offset : offset;
        return this[resolvedIndex];
      },
    });
  }

  if (!arrayPrototype.findLast) {
    Object.defineProperty(Array.prototype, 'findLast', {
      value<T>(this: T[], predicate: (value: T, index: number, array: T[]) => boolean): T | undefined {
        for (let index = this.length - 1; index >= 0; index -= 1) {
          if (predicate(this[index], index, this)) return this[index];
        }
        return undefined;
      },
    });
  }

  const objectConstructor = Object as ObjectConstructorWithHasOwn;
  if (!objectConstructor.hasOwn) {
    Object.defineProperty(Object, 'hasOwn', {
      value(object: object, property: PropertyKey): boolean {
        return Object.prototype.hasOwnProperty.call(object, property);
      },
    });
  }

  const urlConstructor = URL as UrlWithParse;
  if (!urlConstructor.parse) {
    urlConstructor.parse = (url, base) => {
      try {
        return new URL(url, base);
      } catch {
        return null;
      }
    };
  }

  if (typeof Response !== 'undefined') {
    const responsePrototype = Response.prototype as ResponseWithBytes;
    if (!responsePrototype.bytes) {
      responsePrototype.bytes = async function bytes() {
        return new Uint8Array(await this.arrayBuffer());
      };
    }
  }
}

function describeError(err: unknown): Pick<BrightspacePdfDiagnostic, 'name' | 'message' | 'stack'> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  return {
    name: typeof err,
    message: String(err),
  };
}

function buildPdfDiagnostic(file: File, phase: string, err: unknown): BrightspacePdfDiagnostic {
  const base = describeError(err);
  const browser =
    typeof navigator === 'undefined'
      ? {}
      : {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          maxTouchPoints: navigator.maxTouchPoints,
        };

  return {
    phase,
    ...base,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    ...browser,
  };
}

export function formatBrightspacePdfDiagnostic(err: unknown): string | null {
  if (!(err instanceof BrightspacePdfExtractionError)) return null;

  const details = err.diagnostic;
  return [
    `phase: ${details.phase}`,
    `error: ${details.name}: ${details.message}`,
    `file: ${details.fileName ?? 'unknown'} (${details.fileType || 'unknown type'}, ${details.fileSize ?? 'unknown'} bytes)`,
    `platform: ${details.platform ?? 'unknown'} / touch points: ${details.maxTouchPoints ?? 'unknown'}`,
    `userAgent: ${details.userAgent ?? 'unknown'}`,
    details.stack ? `stack:\n${details.stack}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function shouldDisablePdfWorker(): boolean {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const iOSDevice = /iPad|iPhone|iPod/.test(userAgent);
  const iPadDesktopMode = platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  return iOSDevice || iPadDesktopMode;
}

export async function extractBrightspacePdfText(file: File): Promise<string[]> {
  let phase = 'installing PDF.js compatibility shims';

  try {
    ensurePdfJsBrowserCompatibility();

    phase = 'loading PDF.js modules';
    const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.min.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]);
    GlobalWorkerOptions.workerSrc = workerUrl.default;

    if (shouldDisablePdfWorker()) {
      phase = 'loading PDF.js fake worker for iOS';
      const workerModule = await import(/* @vite-ignore */ workerUrl.default);
      (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = workerModule;
    }

    phase = 'reading uploaded PDF bytes';
    const data = new Uint8Array(await file.arrayBuffer());

    phase = 'opening PDF document';
    const pdf = await getDocument({ data }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      phase = `reading PDF page ${pageNumber}`;
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join('\n');
      pages.push(text);
    }

    phase = 'validating extracted PDF text';
    if (!pages.join('').trim()) {
      throw new Error('Could not read text from this PDF. Image-only Brightspace PDFs are not supported yet.');
    }

    return pages;
  } catch (err) {
    throw new BrightspacePdfExtractionError('Unable to read that Brightspace PDF.', buildPdfDiagnostic(file, phase, err));
  }
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
