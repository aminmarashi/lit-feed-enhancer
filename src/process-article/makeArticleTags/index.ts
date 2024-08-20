import { ArticleType } from "@/process-article/schemas/articles";
import { chatGPTHeaders } from "@/process-article/utils/http";
import { toString } from "nlcst-to-string";
import { retext } from "retext";
import retextKeywords from "retext-keywords";
import retextPos from "retext-pos";

export async function makeArticleTags(fullDocument: ArticleType) {
  const { link: url, textContent: text } = fullDocument;

  if (!text) {
    console.warn("No content found, skipping tag creation", { url });
    return fullDocument;
  }

  console.log("Running makeArticleTags action", { url, text });

  const file = await retext()
    .use(retextPos)
    .use(retextKeywords, { maximum: 40 }) // Limit the keywords and keyphrases
    .process(text);

  if (!file.data.keywords) {
    return fullDocument;
  }

  const keywords = file.data.keywords
    .filter((kw) => kw.matches.length > 0)
    .filter((kw) => kw.matches[0].node.type === "WordNode")
    .filter((kw) =>
      ["NN", "NNS", "NNP", "NNPS"].includes(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (kw.matches[0] as any).node.data?.partOfSpeech
      )
    )
    .filter((kw) => kw.score > 0.25)
    .map((kw) => `${toString(kw.matches[0].node)}:${kw.score.toFixed(2)}`);

  console.log("Keywords found", { keywords });

  const umbrellaKeywords =
    keywords.length > 1 ? await requestGPTKeywords(keywords) : [];

  console.log("Umbrella keywords found", { umbrellaKeywords });

  return {
    ...fullDocument,
    tags: umbrellaKeywords,
  };
}

async function requestGPTKeywords(keywords: string[]): Promise<string[]> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Take these items in the keywords:match_score format and turn them into maximum of 10 umbrella keywords that are sorted by the most relevant keywords based on the match_score provided, answer with maximum of 10 comma-separated keywords, each keyword can consist of one or maximum two english words. Do not return any text but those words, no number, extra punctuations or anything else, I want just those comma separated words, nothing else",
          },
          {
            role: "user",
            content: `Keywords: ${keywords.join(", ")}`,
          },
        ],
      }),
      headers: chatGPTHeaders,
    });
    const json = await response.json();

    const data = json.choices[0].message.content.trim();
    const keywordsList = data.split(",");
    return keywordsList.map((keyword: string) => keyword.trim());
  } catch (error) {
    console.error("Error requesting data from OpenAI:", {
      error: error as Error,
    });
    return [];
  }
}
