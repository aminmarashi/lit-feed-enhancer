import { BackendArticle, UserArticle } from "./types";

export function requireEnv<T extends Record<string, string>>(
  config: T
): { [K in keyof T]: string } {
  const missingValues = Object.values(config).filter(
    (key) => !(key in process.env) || !process.env[key]
  );
  if (missingValues.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingValues.join(", ")}`
    );
  }

  const result = {} as { [K in keyof T]: string };

  for (const key in config) {
    result[key] = process.env[config[key]]!;
  }

  return result;
}

export function backendToUserArticle(
  backendArticle: BackendArticle
): Omit<UserArticle, "feedId" | "feedName" | "userId" | "synchedAt"> {
  return {
    feedUrl: backendArticle.feedUrl,
    title: backendArticle.title,
    summary: backendArticle.summary,
    href: backendArticle.link,
    isRead: false,
    isSaved: false,
    isLiked: null,
    createdAt: backendArticle.createdAt,
    updatedAt: backendArticle.updatedAt,
    date: backendArticle.pubDate,
    image: backendArticle.image,
    duration: backendArticle.duration,
    content: backendArticle.content,
    tags: backendArticle.tags,
  };
}
