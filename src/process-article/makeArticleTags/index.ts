import { callGpt, GptBackend } from "@/process-article/utils/http";
import { BackendArticle } from "@/types";

const categories = [
  "APIs",
  "Mobile",
  "Apps",
  "Health",
  "Politics",
  "Sports",
  "Energy",
  "Business",
  "Engineering",
  "Design",
  "AI",
  "Asia",
  "Europe",
  "Africa",
  "Americas",
  "Oceania",
  "China",
  "India",
  "Russia",
  "Ukraine",
  "MiddleEast",
  "NorthAmerica",
  "Trump",
  "Musk",
  "Bezos",
  "Zuckerberg",
  "Coding",
  "Religion",
  "Culture",
  "OpenSource",
  "DevTools",
  "OS",
  "Terminal",
  "Testing",
  "Video",
  "Cloud",
  "Analytics",
  "Graphics",
  "Gaming",
  "UI",
  "Guides",
  "Writing",
  "GenAI",
  "Scandal",
  "Crypto",
  "Stocks",
  "Trading",
  "Libraries",
  "Networking",
  "Interfaces",
  "FOSS",
  "Consumer",
  "Performance",
  "Power",
  "Security",
  "Emerging",
  "Concurrency",
  "Bandwidth",
  "Communication",
  "Vision",
  "Modeling",
  "Brands",
  "Messaging",
  "Remote",
  "Media",
  "Containers",
  "AGI",
  "LLM",
  "ABTesting",
  "Chips",
  "DataScience",
  "Accelerators",
  "Marketing",
  "Personal",
  "Architecture",
  "Education",
  "Software",
  "Accessibility",
  "Chemistry",
  "Protocols",
  "Industry",
  "Standards",
  "Database",
  "Robotics",
  "VR",
  "Quantum",
  "IoT",
  "5G",
  "Space",
  "Cyberlaw",
  "Fintech",
  "Ecommerce",
  "Startups",
  "Privacy",
  "CloudSec",
  "DevOps",
  "Ethics",
  "Bioinformatics",
  "SmartCities",
  "Distributed",
  "Wearables",
  "Licensing",
  "Policy",
  "Sustainability",
  "HPC",
  "Visualization",
  "CloudInfra",
  "Automation",
  "Social",
  "Innovation",
  "EmergingTech",
];

export async function makeArticleTags(fullDocument: BackendArticle) {
  const { link: url, textContent: content, title } = fullDocument;
  if (!content) {
    console.warn("No content found, skipping tags creation", { url });
    return fullDocument;
  }

  console.info("Running makeArticleTags action", { url, content });

  const response = await callGpt({
    systemPrompt: `
      The user gives you an input in the following format:
      categories: string[]
      title: string
      content: string
      Your task is to find the top 5 most relevant categories from the given list of categories for the title and content and reply with only a valid json array. If the title and content are not relevant to any of the categories, return an empty array. Your output must be a valid json without any extra words or characters. The items in the array must be strings chosen from the given list of categories ordered by relevance. The items in the output array must be in the list of categories. If the relevance of two categories is the same, the one that appears first in the list must be chosen.
    `,
    content: `categories: ${JSON.stringify(
      categories,
      null,
      2
    )}\ntitle: ${title}\ncontent: ${content}`,
    backend: GptBackend.Cf,
  });

  const tags = response
    .split(",")
    .map((tag: string) => tag.replace(/[^A-Za-z]/g, "").trim())
    .filter((tag: string) =>
      categories.map((c) => c.toLowerCase()).includes(tag.toLowerCase())
    )
    .slice(0, 5);

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
