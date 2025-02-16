import { BackendArticle } from "@/types";
import { getMongoClient, requireEnv } from "@/utils";
import { MongoClient } from "mongodb";

export async function getProcessedArticle(fullDocument: BackendArticle) {
  const { backendFeedDatabaseName, backendArticlesCollection, mongoUrl } =
    requireEnv({
      backendFeedDatabaseName: "BACKEND_FEED_DATABASE_NAME",
      backendArticlesCollection: "BACKEND_ARTICLES_COLLECTION",
      mongoUrl: "MONGO_URL",
    });

  const mongoClient = await getMongoClient(mongoUrl);
  const backendFeedDatabase = mongoClient.db(backendFeedDatabaseName);
  const backendArticles = backendFeedDatabase.collection(
    backendArticlesCollection
  );

  const existingArticle = await backendArticles.findOne({
    link: fullDocument.link,
    textContent: { $exists: true },
    summary: { $exists: true },
    tags: { $exists: true },
  });

  if (!existingArticle) {
    console.warn("No existing processed articles found", {
      link: fullDocument.link,
    });
    return undefined;
  }

  console.info("Found existing processed article", {
    link: fullDocument.link,
    existingArticle,
  });

  return {
    ...fullDocument,
    textContent: existingArticle.textContent,
    summary: existingArticle.summary,
    tags: existingArticle.tags,
  };
}
