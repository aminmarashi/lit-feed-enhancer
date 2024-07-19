import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const s3 = new S3Client();
const lambda = new LambdaClient();
const trainLikedArticlesLambdaArn = process.env.TRAIN_LIKED_ARTICLES_LAMBDA;

export async function handler(request: never) {
  const year = new Date().getFullYear();
  const zeroPaddedMonth = (new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0");
  const zeroPaddedDay = new Date().getDate().toString().padStart(2, "0");

  const timestamp = new Date().getTime();
  const eventId = Math.floor(Math.random() * 1000000);

  const { operationType, fullDocument } = request;

  const collectionName = "feedUrl" in fullDocument ? "articles" : "feeds";

  const s3Key = `${collectionName}/${
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fullDocument as any).userId
  }/${operationType}/${year}/${zeroPaddedMonth}/${zeroPaddedDay}/${timestamp}-${eventId}.json`;
  const s3Params = {
    Bucket: "lit-feed-dev-feed-events-bucket",
    Key: s3Key,
    Body: JSON.stringify(fullDocument),
  };

  await s3.send(new PutObjectCommand(s3Params));
  console.log("saved event to S3", { s3Key, fullDocument, operationType });

  if (collectionName === "articles" && operationType === "update") {
    if (trainLikedArticlesLambdaArn) {
      // invoke lambda asynchronously
      console.log(
        `Invoking article training lambda: ${trainLikedArticlesLambdaArn}`
      );
      await lambda.send(
        new InvokeCommand({
          FunctionName: trainLikedArticlesLambdaArn,
          Payload: JSON.stringify(fullDocument),
          InvocationType: "Event",
        })
      );
      console.log(
        `Invoked article training lambda: ${trainLikedArticlesLambdaArn}`
      );
    } else {
      console.log("No training lambda configured");
    }
  }
}
