import { Worker } from 'node:worker_threads';
import { ApiError } from './errors';
import type { ProcessedNoteImage, SupportedNoteImageMime } from './noteImageConversion';

const PROCESSING_TIMEOUT_MS = 60_000;
const MAX_QUEUED_CONVERSIONS = 4;

interface QueueItem {
  id: number;
  body: Buffer;
  contentType: SupportedNoteImageMime;
  resolve: (result: ProcessedNoteImage) => void;
  reject: (err: Error) => void;
  timeout?: NodeJS.Timeout;
}

interface WorkerSuccess {
  id: number;
  ok: true;
  result: Omit<ProcessedNoteImage, 'body'> & { body: ArrayBuffer };
}

interface WorkerFailure {
  id: number;
  ok: false;
  code: 'IMAGE_DIMENSIONS_TOO_LARGE' | 'IMAGE_CONVERSION_FAILED';
}

let nextId = 1;
let worker: Worker | null = null;
let active: QueueItem | null = null;
const queue: QueueItem[] = [];

function workerUrl() {
  return new URL(
    import.meta.url.endsWith('.ts') ? './noteImageConversionWorker.ts' : './noteImageConversionWorker.js',
    import.meta.url
  );
}

function startNext() {
  if (active || queue.length === 0) return;
  active = queue.shift()!;
  if (!worker) worker = createWorker();
  const input = Uint8Array.from(active.body);
  active.body = Buffer.alloc(0);
  active.timeout = setTimeout(() => {
    const expired = active;
    const expiredWorker = worker;
    active = null;
    worker = null;
    if (expired) expired.reject(new ApiError('IMAGE_PROCESSING_TIMEOUT', 503));
    void expiredWorker?.terminate();
    startNext();
  }, PROCESSING_TIMEOUT_MS);
  active.timeout.unref();
  worker.postMessage({ id: active.id, body: input.buffer, contentType: active.contentType }, [input.buffer]);
}

function failActive(err: Error) {
  if (!active) return;
  if (active.timeout) clearTimeout(active.timeout);
  const failed = active;
  active = null;
  failed.reject(err);
  startNext();
}

function createWorker() {
  const url = workerUrl();
  const instance = new Worker(url, {
    execArgv: url.pathname.endsWith('.ts') ? ['--import', 'tsx'] : undefined,
  });
  instance.on('message', (message: WorkerSuccess | WorkerFailure) => {
    if (!active || message.id !== active.id) return;
    if (active.timeout) clearTimeout(active.timeout);
    const completed = active;
    active = null;
    if (message.ok) {
      completed.resolve({ ...message.result, body: Buffer.from(message.result.body) });
    } else {
      const status = message.code === 'IMAGE_DIMENSIONS_TOO_LARGE' ? 413 : 422;
      completed.reject(new ApiError(message.code, status));
    }
    startNext();
  });
  instance.on('error', () => {
    if (worker !== instance) return;
    worker = null;
    failActive(new ApiError('IMAGE_CONVERSION_FAILED', 422));
  });
  instance.on('exit', (code) => {
    if (worker !== instance) return;
    worker = null;
    if (active) failActive(new ApiError(code === 0 ? 'IMAGE_PROCESSING_INTERRUPTED' : 'IMAGE_CONVERSION_FAILED', 503));
  });
  instance.unref();
  return instance;
}

export function processNoteImage(body: Buffer, contentType: SupportedNoteImageMime) {
  if (active && queue.length >= MAX_QUEUED_CONVERSIONS) {
    return Promise.reject(new ApiError('IMAGE_PROCESSING_BUSY', 503));
  }
  return new Promise<ProcessedNoteImage>((resolve, reject) => {
    queue.push({ id: nextId++, body, contentType, resolve, reject });
    startNext();
  });
}

export async function closeNoteImageProcessor() {
  const closingWorker = worker;
  worker = null;
  if (active?.timeout) clearTimeout(active.timeout);
  active?.reject(new ApiError('IMAGE_PROCESSING_INTERRUPTED', 503));
  active = null;
  for (const item of queue.splice(0)) item.reject(new ApiError('IMAGE_PROCESSING_INTERRUPTED', 503));
  await closingWorker?.terminate();
}
