import { callGpt, GptBackend } from "@/process-article/utils/http";
import { BackendArticle } from "@/types";

export async function makeArticleTags(fullDocument: BackendArticle) {
  const { link: url, textContent: content, title } = fullDocument;
  if (!content) {
    console.warn("No content found, skipping tags creation", { url });
    return fullDocument;
  }

  console.info("Running makeArticleTags action", { url, content });

  const response = await callGpt({
    systemPrompt: `The following is an article title followed by an article content, return a list of relevant tags for the article. Do not add a single word from yourself. If the tags are not related to the article title: ${title}, reply with 'Done'`,
    content,
    backend: GptBackend.Cf,
  });

  const tags = response
    .split(",")
    .map((tag: string) => tag.replace("\n", "").replace("\\n", "").trim());

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
