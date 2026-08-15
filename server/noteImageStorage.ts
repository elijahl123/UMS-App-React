import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';
import { ApiError } from './errors';

const VIEW_URL_TTL_SECONDS = 15 * 60;
let client: S3Client | null = null;

function translateStorageError(err: unknown): never {
  const storageError = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const code = storageError.Code ?? storageError.name;
  if (storageError.$metadata?.httpStatusCode === 403 || code === 'AccessDenied') {
    throw new ApiError('IMAGE_STORAGE_ACCESS_DENIED', 503);
  }
  if (code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch') {
    throw new ApiError('IMAGE_STORAGE_CREDENTIALS_INVALID', 503);
  }
  if (code === 'NoSuchBucket') {
    throw new ApiError('IMAGE_STORAGE_BUCKET_NOT_FOUND', 503);
  }
  throw err;
}

function storageConfig() {
  if (!config.spacesRegion || !config.spacesAccessKeyId || !config.spacesSecretAccessKey) {
    throw new ApiError('IMAGE_STORAGE_NOT_CONFIGURED', 503);
  }
  return {
    bucket: config.spacesBucket,
    region: config.spacesRegion,
    accessKeyId: config.spacesAccessKeyId,
    secretAccessKey: config.spacesSecretAccessKey,
  };
}

function spacesClient(): S3Client {
  const values = storageConfig();
  if (!client) {
    client = new S3Client({
      endpoint: `https://${values.region}.digitaloceanspaces.com`,
      region: values.region,
      forcePathStyle: false,
      credentials: {
        accessKeyId: values.accessKeyId,
        secretAccessKey: values.secretAccessKey,
      },
    });
  }
  return client;
}

export function noteImageStorageConfigured(): boolean {
  return Boolean(config.spacesRegion && config.spacesAccessKeyId && config.spacesSecretAccessKey);
}

export async function putNoteImage(params: {
  objectKey: string;
  body: Buffer;
  contentType: string;
}) {
  const { bucket } = storageConfig();
  try {
    await spacesClient().send(new PutObjectCommand({
      Bucket: bucket,
      Key: params.objectKey,
      Body: params.body,
      ContentType: params.contentType,
      ContentLength: params.body.length,
      ACL: 'private',
      CacheControl: 'private, max-age=900',
    }));
  } catch (err) {
    translateStorageError(err);
  }
}

export async function createNoteImageViewUrl(objectKey: string) {
  const { bucket } = storageConfig();
  const expiresAt = new Date(Date.now() + VIEW_URL_TTL_SECONDS * 1000).toISOString();
  const url = await getSignedUrl(
    spacesClient(),
    new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    { expiresIn: VIEW_URL_TTL_SECONDS }
  );
  return { url, expiresAt };
}

export async function getNoteImageObject(objectKey: string): Promise<GetObjectCommandOutput> {
  const { bucket } = storageConfig();
  try {
    return await spacesClient().send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  } catch (err) {
    translateStorageError(err);
  }
}

export async function deleteNoteImageObject(objectKey: string) {
  const { bucket } = storageConfig();
  try {
    await spacesClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  } catch (err) {
    translateStorageError(err);
  }
}
