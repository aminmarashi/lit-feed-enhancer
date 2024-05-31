/* eslint-disable @typescript-eslint/no-unused-vars */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client();

export async function handler(request: never) {
  const { articleLink, userId } = request;

  return 0.5;
}
