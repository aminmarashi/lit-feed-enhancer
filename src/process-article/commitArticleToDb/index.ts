import { BackendArticle } from "@/types";
import { requireEnv } from "@/utils";
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

  if (
    !fullDocument.textContent &&
    !fullDocument.summary &&
    !fullDocument.tags
  ) {
    console.warn(
      "No processing done on article to be saved, skipping DB update",
      {
        fullDocument,
      }
    );
    return;
  }

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
      link: fullDocument.link,
    },
    {
      $set: {
        textContent: fullDocument.textContent,
        summary: fullDocument.summary,
        tags: fullDocument.tags,
        updatedAt: new Date(),
      },
    }
  );

  console.log("Updated backend articles processed data", {
    updatedBackendArticles,
  });

  /**
   * This will update any user articles with the same link as the backend article regardless of their feed
   * It could be that some of the newly created user articles are missed to be updated due to a race condition with inserting user articles and this event
   */
  const updatedArticles = await userArticles.updateMany(
    {
      href: fullDocument.link,
    },
    {
      $set: {
        summary: fullDocument.summary,
        tags: fullDocument.tags,
        updatedAt: new Date(),
      },
    }
  );

  console.log("Updated user articles processed data", {
    updatedArticles,
    userArticle,
  });
}
