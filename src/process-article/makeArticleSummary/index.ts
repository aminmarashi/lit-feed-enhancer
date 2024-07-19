import { ArticleType } from "@/process-article/schemas/articles";
import { chatGPTHeaders } from "@/process-article/utils/http";

export async function makeArticleSummary(fullDocument: ArticleType) {
  const { link: url, textContent: content, title } = fullDocument;
  if (!content) {
    console.warn("No content found, skipping summary creation", { url });
    return fullDocument;
  }

  console.info("Running makeArticleSummary action", { url, content });

  const summary = await requestGPTSummary({
    content,
    title,
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

async function requestGPTSummary({
  content,
  title,
}: {
  content: string;
  title: string;
}): Promise<string> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "The following is an article title followed by an article content, return a summary of the article and nothing else. Do not say anything else except for the summarized text of the article. If the summary does not match the article content, reply with a single whitespace.",
          },
          {
            role: "user",
            content: title,
          },
          {
            role: "user",
            content: content,
          },
        ],
      }),
      headers: chatGPTHeaders,
    });
    const json = await response.json();

    const data = json.choices[0].message.content.trim();
    return data;
  } catch (error) {
    console.error("Error requesting data from OpenAI:", {
      error: error as Error,
    });
    return "";
  }
}
