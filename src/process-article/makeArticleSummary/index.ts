import { ArticleType } from "@/process-article/schemas/articles";
import { callGpt, GptBackend } from "@/process-article/utils/http";

export async function makeArticleSummary(fullDocument: ArticleType) {
  const { link: url, textContent: content, title } = fullDocument;
  if (!content) {
    console.warn("No content found, skipping summary creation", { url });
    return fullDocument;
  }

  console.info("Running makeArticleSummary action", { url, content });

  const summary = await callGpt({
    systemPrompt: `The following is an article title followed by an article content, return an extensive summary of the article that keeps the essence of the article while remaining as short as possible. Do not add a single word from yourself. If the summary is not related to the article title: ${title}, reply with 'Done'`,
    content,
    backend: GptBackend.Cf,
  });

  if (!summary.trim()) {
    console.warn("No summary found", { url });
    return fullDocument;
  }

  if (summary.length < 50) {
    console.warn("Summary too short", { url, summary });
    return fullDocument;
  }

  console.info("Summary created", { url, summary });

  return {
    ...fullDocument,
    summary,
  };
}
