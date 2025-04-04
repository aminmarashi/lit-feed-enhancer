import { callGpt, GptBackend } from "@/process-article/utils/http";
import { BackendArticle } from "@/types";

export async function makeArticleSummary(fullDocument: BackendArticle) {
  const { link: url, textContent: content, title } = fullDocument;
  if (!content) {
    console.warn("No content found, skipping summary creation", { url });
    return fullDocument;
  }

  console.info("Running makeArticleSummary action", { url, content });

  const summary = await callGpt({
    systemPrompt: `Return a summary of at least 100 characters long from the article that keeps the essence while remaining as short as possible.  If the content is not related to the title: ${title}, reply with 'Done' instead of the summary. The following message is the article content.`,
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
