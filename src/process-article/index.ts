import {
  BackendArticle,
  BackendArticleEventSchema,
  BackendArticleSchema,
} from "@/types";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ObjectId } from "mongodb";
import { commitArticleToDb } from "./commitArticleToDb";
import { fetchArticleContent } from "./fetchArticleContent";
import { makeArticleSummary } from "./makeArticleSummary";
import { makeArticleTags } from "./makeArticleTags";
import { sanitizeUrlForS3Key } from "./utils/s3";

const s3 = new S3Client();
const articleBucket =
  process.env.ARTICLE_BUCKET || "lit-feed-dev-article-bucket";

export async function handler(request: any) {
  console.log("got request", request);
  const body = JSON.parse(request.Records[0].body);
  const fullDocument = BackendArticleEventSchema.parse(body);
  const backendArticle = BackendArticleSchema.parse({
    ...fullDocument,
    _id: new ObjectId(fullDocument._id),
  });
  const fetchArticleContentResult = await fetchArticleContent(backendArticle);

  console.log("got article content", { fetchArticleContentResult });

  const tagsAndSummaryResults = await Promise.all([
    makeArticleTags(fetchArticleContentResult),
    makeArticleSummary(fetchArticleContentResult),
  ]);

  console.log("got tags and summary results", { tagsAndSummaryResults });

  const finalResult = tagsAndSummaryResults.reduce<BackendArticle>(
    (acc, result) => {
      return { ...acc, ...result };
    },
    {} as BackendArticle
  );

  await commitArticleToDb(backendArticle);

  const articleUrl = sanitizeUrlForS3Key(backendArticle.link);
  const articleCreatedAt = new Date(backendArticle.createdAt);
  const year = articleCreatedAt.getFullYear();
  const month = articleCreatedAt.getMonth() + 1;
  const monthZeroPadded = month.toString().padStart(2, "0");
  const day = articleCreatedAt.getDate();
  const dayZeroPadded = day.toString().padStart(2, "0");
  const s3Key = `backend-articles/${year}/${monthZeroPadded}/${dayZeroPadded}/${articleUrl}/backend-article.json`;
  const s3Params = {
    Bucket: articleBucket,
    Key: s3Key,
    Body: JSON.stringify(finalResult),
  };

  await s3.send(new PutObjectCommand(s3Params));

  console.log("saved article to S3", { s3Key, finalResult });

  return finalResult;
}
