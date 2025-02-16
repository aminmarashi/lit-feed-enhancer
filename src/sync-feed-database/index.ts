import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { requireEnv } from "@/utils";

const s3 = new S3Client();
const sqs = new SQSClient();

export async function handler(request: any) {
  console.log(JSON.stringify(request));
  const {
    trainLikedArticlesQueueUrl,
    updateArticleScoreQueueUrl,
    feedEventsBucket,
  } = requireEnv({
    feedEventsBucket: "FEED_EVENT_BUCKET",
    trainLikedArticlesQueueUrl: "TRAIN_LIKED_ARTICLES_QUEUE_URL",
    updateArticleScoreQueueUrl: "UPDATE_ARTICLE_SCORE_QUEUE_URL",
  });
  const year = new Date().getFullYear();
  const zeroPaddedMonth = (new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0");
  const zeroPaddedDay = new Date().getDate().toString().padStart(2, "0");

  const timestamp = new Date().getTime();
  const eventId = Math.floor(Math.random() * 1000000);

  const body = JSON.parse(request.Records[0].body);
  const { operationType, fullDocument } = body;

  const collectionName = "feedUrl" in fullDocument ? "articles" : "feeds";

  const s3Key = `${collectionName}/${
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fullDocument.userId
  }/${operationType}/${year}/${zeroPaddedMonth}/${zeroPaddedDay}/${timestamp}-${eventId}.json`;
  const s3Params = {
    Bucket: feedEventsBucket,
    Key: s3Key,
    Body: JSON.stringify(fullDocument),
  };

  await s3.send(new PutObjectCommand(s3Params));
  console.log("saved event to S3", { s3Key, fullDocument, operationType });

  if (collectionName === "articles" && operationType === "update") {
    if (!(fullDocument.title && fullDocument.summary && fullDocument.tags)) {
      console.log(
        "Skipping article training and scoring as article is missing summary, title or tags"
      );
      return;
    }

    if (
      fullDocument.isSaved ||
      fullDocument.isLiked === true ||
      fullDocument.isLiked === false
    ) {
      console.log(
        `Pushing article training message to queue: ${trainLikedArticlesQueueUrl}`
      );
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: trainLikedArticlesQueueUrl,
          MessageBody: JSON.stringify(fullDocument),
        })
      );
      console.log(
        `Pushed article training message to queue: ${trainLikedArticlesQueueUrl}`
      );
      return;
    }
    if (fullDocument.score) {
      console.log("Article already scored, skipping scoring");
      return;
    }

    console.log(
      `Pushing update article score message to queue: ${updateArticleScoreQueueUrl}`
    );
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: updateArticleScoreQueueUrl,
        MessageBody: JSON.stringify(fullDocument),
      })
    );
    console.log(
      `Pushed update article score message to queue: ${updateArticleScoreQueueUrl}`
    );
  }
}
