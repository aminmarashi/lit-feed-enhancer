import { ArticleType } from "@/process-article/schemas/articles";
import {
  gptApiKey,
  gptRequestHeaders,
  gptModelName,
  callGpt,
} from "@/process-article/utils/http/cf";
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

  const response = await callGpt({
    systemPrompt: `The following is an article title followed by an article content, return a list of relevant tags for the article. Do not add a single word from yourself. If the tags are not related to the article title: ${title}, reply with 'Done'`,
    content,
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
