import { ArticleType } from "@/process-article/schemas/articles";
import { load } from "cheerio";

export async function fetchArticleContent(fullDocument: ArticleType) {
  const { link: url } = fullDocument;
  console.info("Running fetchArticleContent action", { url });
  const articleResponse = await fetch(url);

  const htmlContent = await articleResponse.text();

  console.info("Fetched article content", { url });

  const content = removeHtmlTags({
    htmlContent,
  });

  if (!content) {
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
