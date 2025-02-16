import { callGpt as callCfGpt } from "./cf";
import { callGpt as callGeminiGpt } from "./gemini";

export async function callGpt({
  systemPrompt,
  content,
  backend = "gemini",
}: {
  systemPrompt: string;
  content: string;
  backend?: string;
}) {
  switch (backend) {
    case "cf":
      return callCfGpt({ systemPrompt, content });
    case "gemini":
      return callGeminiGpt({ systemPrompt, content });
    default:
      return callGeminiGpt({ systemPrompt, content });
  }
}
