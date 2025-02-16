import { ArticleType } from "@/process-article/schemas/articles";
import {
  geminiApiKey,
  gptRequestHeaders,
  geminiModelName,
} from "@/process-article/utils/http";
import { toString } from "nlcst-to-string";
import { retext } from "retext";
import retextKeywords from "retext-keywords";
import retextPos from "retext-pos";

export async function makeArticleTags(fullDocument: ArticleType) {
  const { link: url, textContent: content, title } = fullDocument;
  if (!content) {
    console.warn("No content found, skipping tags creation", { url });
    return fullDocument;
  }

  console.info("Running makeArticleTags action", { url, content });

  const tags = await requestGPTTags({
    content,
    title,
  });

  if (!tags.length) {
    console.warn("No tags found", { url });
    return fullDocument;
  }

  console.info("Tags created", { url, tags });

  return {
    ...fullDocument,
    tags,
  };
}

async function requestGPTTags({
  content,
  title,
}: {
  content: string;
  title: string;
}): Promise<string[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelName}:generateContent?key=` +
        geminiApiKey,
      {
        method: "POST",
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `The following is an article title followed by an article content, return a list of relevant tags for the article. Do not add a single word from yourself. If the tags are not related to the article title: ${title}, reply with 'Done'`,
              },
            ],
          },
          contents: {
            role: "user",
            parts: [
              {
                text: content,
              },
            ],
          },
        }),
        headers: gptRequestHeaders,
      }
    );
    const json = await response.json();

    const data = json.candidates[0].content.parts[0].text.trim();
    return data
      .split(",")
      .map((tag: string) => tag.replace("\n", "").replace("\\n", "").trim());
  } catch (error) {
    console.error("Error requesting data from chat API:", {
      error: error as Error,
    });
    return [];
  }
}
