const gptApiKey = "FAKE_CLOUDFLARE_API_TOKEN";
const gptModelName = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const gptRequestHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${gptApiKey}`,
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
      `https://api.cloudflare.com/client/v4/accounts/6bd55f31cfc0f753bb4a09b63d5ccfb4/ai/run/${gptModelName}`,
      {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content,
            },
          ],
        }),
        headers: gptRequestHeaders,
      }
    );
    const json = await response.json();

    const data = json.result.response.trim();
    return data;
  } catch (error) {
    console.error("Error requesting data from chat API:", {
      error: error as Error,
    });
    return "";
  }
}
