import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

let R2_ACCOUNT_ID = '';
let R2_ACCESS_KEY_ID = '';
let R2_SECRET_ACCESS_KEY = '';
const R2_BUCKET = 'bantu-production';
export function initStorage(accountId: string, accessKeyId: string, secretAccessKey: string): void {
  R2_ACCOUNT_ID = accountId;
  R2_ACCESS_KEY_ID = accessKeyId;
  R2_SECRET_ACCESS_KEY = secretAccessKey;
  client = null;
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export async function upload(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await getClient().send(command);
}

export async function getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  await getClient().send(command);
}
