// Cliente MinIO (S3-compatível) para o bucket de criativos.
// Usado por list_minio_files e pelo minio_key opcional em meta_create_image/meta_create_video.

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getClient(): S3Client {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKeyId = process.env.MINIO_ACCESS_KEY;
  const secretAccessKey = process.env.MINIO_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "MinIO não configurado — defina MINIO_ENDPOINT, MINIO_ACCESS_KEY e MINIO_SECRET_KEY."
    );
  }
  return new S3Client({
    endpoint,
    region: "us-east-1", // dummy — MinIO ignora, mas o SDK exige uma region
    forcePathStyle: true, // MinIO usa path-style (endpoint/bucket/key), não virtual-hosted
    credentials: { accessKeyId, secretAccessKey },
  });
}

function resolveBucket(bucket?: string): string {
  const b = bucket ?? process.env.MINIO_BUCKET;
  if (!b) throw new Error("Bucket do MinIO não informado (defina MINIO_BUCKET ou passe explicitamente).");
  return b;
}

export interface MinioFile {
  key: string;
  name: string;
  size: number;
  lastModified?: string;
}

/** Lista arquivos do bucket, opcionalmente filtrando por prefixo ("pasta"). */
export async function listMinioFiles(prefix?: string, bucket?: string): Promise<MinioFile[]> {
  const client = getClient();
  const Bucket = resolveBucket(bucket);
  const out: MinioFile[] = [];
  let ContinuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken })
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith("/")) continue; // pula marcadores de "pasta" vazia
      out.push({
        key: obj.Key,
        name: obj.Key.split("/").pop() || obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString(),
      });
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out;
}

/** Gera URL assinada temporária (padrão 15min) para baixar um objeto — usada como file_url/url na Meta. */
export async function getMinioPresignedUrl(
  key: string,
  expiresInSeconds = 900,
  bucket?: string
): Promise<string> {
  const client = getClient();
  const Bucket = resolveBucket(bucket);
  return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
