import { callGpt, GptBackend } from "@/process-article/utils/http";
import { BackendArticle } from "@/types";
import categories from "./categories.json";

export async function makeArticleTags(fullDocument: BackendArticle) {
  const { link: url, textContent: content, title } = fullDocument;
  if (!content) {
    console.warn("No content found, skipping tags creation", { url });
    return fullDocument;
  }

  console.info("Running makeArticleTags action", { url, content });

  const response = await callGpt({
    systemPrompt: `
      The user gives you an input in the following format:
      categories: string[]
      title: string
      content: string
      Your task is to return exactly 5 most relevant categories from the list of categories provided based on the title and content. What you return is passed directly to a JSON parser, so make sure to return a valid JSON array of strings. Do not add any other text or explanation.
    `,
    content: `categories: ${JSON.stringify(
      categories,
      null,
      2
    )}\ntitle: ${title}\ncontent: ${content}`,
    backend: GptBackend.Cf,
  });

  const allTags = response
    .split(",")
    .map((tag: string) => tag.replace(/[^A-Za-z]/g, "").trim())
    .map((tag: string) =>
      categories.find((c) => c.toLowerCase() === tag.toLowerCase())
    )
    .filter((tag: string) => tag);

  const tags = Array.from(new Set(allTags)).slice(0, 5);

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
