import { SqsMessage, UserArticle } from "@/types";
import { requireEnv } from "@/utils";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { MongoClient, ObjectId } from "mongodb";

export async function handler(message: SqsMessage) {
  const article = JSON.parse(message.Records[0].body) as UserArticle;
  let {
    getArticleScoreLambda,
    mongoUrl,
    userFeedDatabaseName,
    userArticlesCollection,
  } = requireEnv({
    getArticleScoreLambda: "GET_ARTICLE_SCORE_LAMBDA",
    mongoUrl: "MONGO_URL",
    userFeedDatabaseName: "USER_FEED_DATABASE_NAME",
    userArticlesCollection: "USER_ARTICLES_COLLECTION",
  });

  if (article.score) {
    console.log("Article already has a score, skipping scoring", { article });
    return;
  }

  const createdAt = new Date(article.createdAt);
  const oneDayAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (createdAt < oneDayAgo) {
    console.log("Article is older than 7 days, skipping scoring", {
      createdAt,
      oneDayAgo,
    });
    return;
  }
  if (!article.content) {
    console.log("Article does not have content yet, skipping scoring", {
      article,
    });
    return;
  }
  if (!article.tags && !article.summary) {
    console.log("Article does not have tags or summary, skipping scoring", {
      article,
    });
    return;
  }

  console.log(`Invoking article score lambda: ${getArticleScoreLambda}`);

  // invoke lambda synchronously
  const lambda = new LambdaClient();
  const { Payload } = await lambda.send(
    new InvokeCommand({
      FunctionName: getArticleScoreLambda,
      Payload: JSON.stringify(article),
    })
  );
  const result = Buffer.from(Payload as Uint8Array).toString();

  const score = JSON.parse(result);

  console.log("Updating article score", { article, score });

  const mongoClient = new MongoClient(mongoUrl);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(userFeedDatabaseName);
    const articlesCollection = db.collection(userArticlesCollection);

    const updateResult = await articlesCollection.updateOne(
      { _id: new ObjectId(article._id) },
      { $set: { score } }
    );

    console.log("Article score updated", { article, score, updateResult });

    return score;
  } finally {
    await mongoClient.close();
  }
}
