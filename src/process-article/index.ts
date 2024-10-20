import { ArticleSchema, ArticleType } from "./schemas/articles";
import { fetchArticleContent } from "./fetchArticleContent";
import { makeArticleSummary } from "./makeArticleSummary";
import { makeArticleTags } from "./makeArticleTags";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { sanitizeUrlForS3Key } from "./utils/s3";

const s3 = new S3Client();
const articleBucket =
  process.env.ARTICLE_BUCKET || "lit-feed-dev-article-bucket";

export async function handler(request: never) {
  console.log("got request", request);
  // TODO: Add caching using the article in S3
  const fullDocument = ArticleSchema.parse(request);
  const fetchArticleContentResult = await fetchArticleContent(fullDocument);

  console.log("got article content", { fetchArticleContentResult });

  const tagsAndSummaryResults = await Promise.all([
    makeArticleTags(fetchArticleContentResult),
    makeArticleSummary(fetchArticleContentResult),
  ]);

  console.log("got tags and summary results", { tagsAndSummaryResults });

  const finalResult = tagsAndSummaryResults.reduce<ArticleType>(
    (acc, result) => {
      return { ...acc, ...result };
    },
    {} as ArticleType
  );

  const articleUrl = sanitizeUrlForS3Key(fullDocument.link);
  const articleCreatedAt = new Date(fullDocument.createdAt);
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
