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
      Your task is to find the top 5 most relevant categories from the given list of categories for the title and content and reply with only a valid json array. If the title and content are not relevant to any of the categories, return an empty array. Your output must be a valid json without any extra words or characters. The items in the array must be strings chosen from the given list of categories ordered by relevance. The items in the output array must be in the list of categories. If the relevance of two categories is the same, the one that appears first in the list must be chosen.
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
