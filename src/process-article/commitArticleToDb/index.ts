import { BackendArticle, UserArticleSchema } from "@/types";
import { backendToUserArticle, requireEnv } from "@/utils";
import { MongoClient } from "mongodb";

export async function commitArticleToDb(fullDocument: BackendArticle) {
  const {
    userFeedDatabaseName,
    backendFeedDatabaseName,
    userArticlesCollection,
    backendArticlesCollection,
    mongoUrl,
  } = requireEnv({
    userFeedDatabaseName: "USER_FEED_DATABASE_NAME",
    backendFeedDatabaseName: "BACKEND_FEED_DATABASE_NAME",
    userArticlesCollection: "USER_ARTICLES_COLLECTION",
    backendArticlesCollection: "BACKEND_ARTICLES_COLLECTION",
    mongoUrl: "MONGO_URL",
  });

  const mongoClient = new MongoClient(mongoUrl);
  await mongoClient.connect();
  const userFeedDatabase = mongoClient.db(userFeedDatabaseName);
  const backendFeedDatabase = mongoClient.db(backendFeedDatabaseName);
  const userArticles = userFeedDatabase.collection(userArticlesCollection);
  const backendArticles = backendFeedDatabase.collection(
    backendArticlesCollection
  );

  const updatedBackendArticles = await backendArticles.updateOne(
    {
      feedUrl: fullDocument.feedUrl,
      link: fullDocument.link,
    },
    {
      $set: {
        textContent: fullDocument.textContent,
        summary: fullDocument.summary,
        tags: fullDocument.tags,
      },
    }
  );

  console.log("updated articles", { updatedBackendArticles });

  const userArticle = UserArticleSchema.parse({
    ...backendToUserArticle(fullDocument),
    synchedAt: new Date(),
  });
  const updatedArticles = await userArticles.updateMany(
    {
      feedUrl: fullDocument.feedUrl,
      href: fullDocument.link,
    },
    {
      $set: userArticle,
    }
  );

  console.log("Updated articles with link", { updatedArticles, userArticle });
}
