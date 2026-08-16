import { parentPort } from 'node:worker_threads';
import {
  convertNoteImage,
  NoteImageConversionError,
  type SupportedNoteImageMime,
} from './noteImageConversion';

interface ConversionRequest {
  id: number;
  body: ArrayBuffer;
  contentType: SupportedNoteImageMime;
}

if (!parentPort) throw new Error('NOTE_IMAGE_WORKER_PARENT_REQUIRED');

parentPort.on('message', async (request: ConversionRequest) => {
  try {
    const result = await convertNoteImage(Buffer.from(request.body), request.contentType);
    const output = Uint8Array.from(result.body);
    parentPort!.postMessage({
      id: request.id,
      ok: true,
      result: { ...result, body: output.buffer },
    }, [output.buffer]);
  } catch (err) {
    parentPort!.postMessage({
      id: request.id,
      ok: false,
      code: err instanceof NoteImageConversionError ? err.code : 'IMAGE_CONVERSION_FAILED',
    });
  }
});
