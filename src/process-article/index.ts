import { BackendArticle, BackendArticleSchema } from "@/types";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { commitArticleToDb } from "./commitArticleToDb";
import { fetchArticleContent } from "./fetchArticleContent";
import { makeArticleSummary } from "./makeArticleSummary";
import { makeArticleTags } from "./makeArticleTags";
import { sanitizeUrlForS3Key } from "./utils/s3";
import { getProcessedArticle } from "./getProcessedArticle";

const s3 = new S3Client();
const articleBucket =
  process.env.ARTICLE_BUCKET || "lit-feed-dev-article-bucket";

export async function handler(request: any) {
  console.log("got request", request);
  const body = JSON.parse(request.Records[0].body);
  const backendArticle = BackendArticleSchema.parse(body);

  // Check if the backend article already exists in the backend database
  const backendArticleWithProcessedBits = await getProcessedArticle(
    backendArticle
  );

  let finalResult: BackendArticle;
  if (backendArticleWithProcessedBits) {
    finalResult = backendArticleWithProcessedBits;
  } else {
    const fetchArticleContentResult = await fetchArticleContent(backendArticle);

    console.log("got article content", { fetchArticleContentResult });

    const tagsAndSummaryResults = await Promise.all([
      makeArticleTags(fetchArticleContentResult),
      makeArticleSummary(fetchArticleContentResult),
    ]);

    console.log("got tags and summary results", { tagsAndSummaryResults });

    finalResult = {
      ...fetchArticleContentResult,
      tags: tagsAndSummaryResults[0].tags,
      summary: tagsAndSummaryResults[1].summary,
    };
  }

  await commitArticleToDb(finalResult);

  const articleUrl = sanitizeUrlForS3Key(finalResult.link);
  const articleCreatedAt = new Date(finalResult.createdAt);
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
