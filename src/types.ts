import { z } from "zod";
import { ObjectId } from "mongodb";

const objectIdSchema = z.instanceof(ObjectId);

export const UserFeedSchema = z.object({
  _id: objectIdSchema,
  href: z.string(),
  name: z.string(),
  userId: z.string(),
  updatedAt: z.date(),
  unread: z.number(),
  image: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  lastBuildDate: z.date().optional(),
  unreadArticles: z.number().optional(),
});

export const BackendFeedSchema = z.object({
  _id: objectIdSchema,
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  lastBuildDate: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  failedAttempts: z.number().optional(),
  image: z.string().optional(),
});

export const UserArticleSchema = z.object({
  _id: objectIdSchema,
  title: z.string(),
  feedUrl: z.string(),
  content: z.string(),
  href: z.string(),
  feedName: z.string().optional(),
  duration: z.string().optional(),
  date: z.date(),
  feedId: z.string().optional(),
  userId: z.string(),
  isRead: z.boolean(),
  isSaved: z.boolean(),
  isLiked: z.boolean().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  synchedAt: z.date(),
  image: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  score: z
    .object({
      neutral: z.number().optional(),
      like: z.number().optional(),
      dislike: z.number().optional(),
      preferenceScore: z.number().optional(),
    })
    .optional(),
});

export const BackendArticleSchema = z.object({
  _id: objectIdSchema,
  feedUrl: z.string(),
  title: z.string(),
  link: z.string(),
  content: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  pubDate: z.date(),
  image: z.string().optional(),
  duration: z.string().optional(),
  summary: z.string().optional(),
  textContent: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const BackendArticleEventSchema = z.object({
  _id: z.string(),
  feedUrl: z.string(),
  link: z.string(),
  content: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  pubDate: z.coerce.date(),
  image: z.string().optional(),
  duration: z.string().optional(),
  summary: z.string().optional(),
  textContent: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const UserSchema = z.object({
  _id: objectIdSchema,
  email: z.string(),
  name: z.string(),
  picture: z.string(),
  oauthId: z.string(),
  isEmailVerified: z.boolean(),
  nickname: z.string(),
  updatedAt: z.date(),
});

export type UserFeed = z.infer<typeof UserFeedSchema>;
export type BackendFeed = z.infer<typeof BackendFeedSchema>;
export type UserArticle = z.infer<typeof UserArticleSchema>;
export type BackendArticle = z.infer<typeof BackendArticleSchema>;
export type User = z.infer<typeof UserSchema>;
export type ArticleScore = UserArticle["score"];

export const SqsMessageSchema = z.object({
  Records: z.array(
    z.object({
      messageId: z.string(),
      receiptHandle: z.string(),
      body: z.string(),
      attributes: z.object({
        ApproximateReceiveCount: z.string(),
        AWSTraceHeader: z.string(),
        SentTimestamp: z.string(),
        SenderId: z.string(),
        ApproximateFirstReceiveTimestamp: z.string(),
      }),
      messageAttributes: z.object({}),
      md5OfBody: z.string(),
      eventSource: z.string(),
      eventSourceARN: z.string(),
      awsRegion: z.string(),
    })
  ),
});

export type SqsMessage = z.infer<typeof SqsMessageSchema>;
