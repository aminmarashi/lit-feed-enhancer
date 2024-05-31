import { z } from "zod";

export const ArticleSchema = z.object({
  feedUrl: z.string(),
  title: z.string(),
  link: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  pubDate: z.string().optional(),
  image: z.string().optional(),
  duration: z.string().optional(),
  summary: z.string().optional(),
  textContent: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type ArticleType = z.infer<typeof ArticleSchema>;
