const gptApiKey = process.env.GEMINI_API_KEY;
const gptModelName = "gemini-2.0-flash-lite-preview-02-05";

const gptRequestHeaders = {
  "Content-Type": "application/json",
};

export async function callGpt({
  systemPrompt,
  content,
}: {
  systemPrompt: string;
  content: string;
}) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${gptModelName}:generateContent?key=${gptApiKey}`,
      {
        method: "POST",
        body: JSON.stringify({
          system_instruction: {
            parts: {
              text: systemPrompt,
            },
          },
          contents: {
            parts: {
              text: content,
            },
          },
        }),
        headers: gptRequestHeaders,
      }
    );
    const json = await response.json();

    if (json.error) {
      console.error("Error requesting data from chat API:", {
        error: json.error,
      });
      return "";
    }
    const data = json.candidates[0].content.parts[0].text.trim();
    return data;
  } catch (error) {
    console.error("Error requesting data from chat API:", {
      error: error as Error,
    });
    return "";
  }
}
