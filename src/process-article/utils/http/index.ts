import { callGpt as callCfGpt } from "./cf";
import { callGpt as callGeminiGpt } from "./gemini";

export enum GptBackend {
  Cf = "cf",
  Gemini = "gemini",
}

export async function callGpt({
  systemPrompt,
  content,
  backend = GptBackend.Gemini,
}: {
  systemPrompt: string;
  content: string;
  backend?: GptBackend;
}) {
  switch (backend) {
    case GptBackend.Cf:
      return callCfGpt({ systemPrompt, content });
    case GptBackend.Gemini:
      return callGeminiGpt({ systemPrompt, content });
    default:
      return callGeminiGpt({ systemPrompt, content });
  }
}
