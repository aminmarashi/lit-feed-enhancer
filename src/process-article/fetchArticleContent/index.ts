import { BackendArticle } from "@/types";
import { load } from "cheerio";
import { callGpt, GptBackend } from "../utils/http";

export async function fetchArticleContent(fullDocument: BackendArticle) {
  const { link: url } = fullDocument;
  console.info("Running fetchArticleContent action", { url });

  let htmlContent = "";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const contentType = response.headers.get("content-type");
    if (
      !(
        contentType &&
        (contentType.includes("text") || contentType.includes("html"))
      )
    ) {
      console.warn("Invalid content type", { url, contentType });
      return fullDocument;
    }
    htmlContent = await response.text();
    if (!htmlContent) {
      console.warn("No content found", { url });
      return fullDocument;
    }
  } catch (error) {
    console.error("Failed to fetch article content", { url, error });
    return fullDocument;
  }

  console.info("Fetched article content", { url });

  const rawContent = removeHtmlTags({
    htmlContent,
  });

  console.info("Removed HTML tags", { url, rawContent });

  const content = await callGpt({
    systemPrompt: `Extract the essence of this article, remove any remainder from removing html tags and only keep the relevant content, keep the details as accurately as possible, do not summarize the text, do not add a single word from yourself. If you want to refuse my request, just say "no" without any extra words.`,
    content: rawContent,
    backend: GptBackend.Cf,
  });

  console.log("Extracted content", { content });

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
