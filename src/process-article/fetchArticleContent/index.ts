import { ArticleType } from "@/process-article/schemas/articles";
import { load } from "cheerio";
import {
  gptApiKey,
  gptRequestHeaders,
  gptModelName,
  callGpt,
} from "../utils/http";

export async function fetchArticleContent(fullDocument: ArticleType) {
  const { link: url } = fullDocument;
  console.info("Running fetchArticleContent action", { url });
  const articleResponse = await fetch(url);

  const htmlContent = await articleResponse.text();

  console.info("Fetched article content", { url });

  const rawContent = removeHtmlTags({
    htmlContent,
  });

  const content = await callGpt({
    systemPrompt:
      "Extract the essence of this article, remove any remainder from removing html tags and only keep the relevant content, keep the details as accurately as possible, do not summarize the text, do not add a single word from yourself. Refuse my request by simply saying no.",
    content: rawContent,
  });

  if (!content || content.length < 100) {
    console.warn("No content found", { url });
    return fullDocument;
  }

  console.info("Content extracted", { url });

  return {
    ...fullDocument,
    textContent: content,
  };
}

function removeHtmlTags({ htmlContent }: { htmlContent: string }) {
  const $ = load(htmlContent);
  // Remove specified tags
  const tagsToRemove = [
    "meta",
    "img",
    "dd",
    "script",
    "style",
    "link",
    "input",
    "form",
    "select",
    "option",
    "iframe",
    "canvas",
    "svg",
    "map",
    "area",
    "nav",
    "object",
    "video",
    "audio",
    "iframe",
  ];

  tagsToRemove.forEach((tag) => {
    $(tag).remove();
  });

  // Remove anything resembling an HTTP link
  $("body *").each((i, element) => {
    const text = $(element).text();
    if (!text) return;
    const modifiedText = text.replace(/(https?:\/\/[^\s]+)/g, "");
    $(element).text(modifiedText);
  });

  // Extract the inner text from the HTML
  const bodyText = $("body").text();
  if (!bodyText) {
    return "";
  }
  return bodyText.replace(/\s+/g, " ");
}
