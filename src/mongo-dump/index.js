const { S3Client } = require("@aws-sdk/client-s3");
const spawn = require('child_process');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

const s3 = new S3Client();
const mongoDumpPath = 'bin/mongodump';

async function handler() {
  console.log(`Going to get a dump from mongoDB and store it in s3 using mongodump ${mongoDumpPath}`);
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    throw new Error('MONGO_URL environment variable is not set');
  }
  const bucketName = process.env.MONGO_DUMP_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('MONGO_DUMP_BUCKET_NAME environment variable is not set');
  }
  const dumpFileName = `mongo-dump-${new Date().toISOString()}.gz`;
  const dumpFilePath = `/tmp/${dumpFileName}`;
  const dumpFileKey = `mongo-dumps/${dumpFileName}`;
  console.log(`Going to store dump in ${dumpFileName}`);

  // Call mongodump asynchronously and wait for it to finish
  console.log(`Calling mongodump ${mongoDumpPath} --uri ${mongoUrl} --gzip --archive=${dumpFilePath}`);
  const dumpProcess = spawn.spawn(mongoDumpPath, ['--uri', mongoUrl, '--gzip', `--archive=${dumpFilePath}`]);

await new Promise((resolve, reject) => {
  let errorOutput = '';

  // Capture error output
  dumpProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  dumpProcess.on('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`mongodump failed with exit code ${code}: ${errorOutput}`));
    }
  });
});

  console.log(`Storing dumped file in S3 ${bucketName}`);
  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: dumpFileKey,
    Body: fs.createReadStream(dumpFilePath),
    ContentType: 'application/gzip',
  }));
}

module.exports = { handler };
