import { GoogleGenerativeAI } from "@google/generative-ai";

const key = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
if (!key) {
  console.error("No API key found.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(key);

async function listModels() {
  try {
    // The @google/generative-ai library doesn't have a direct listModels method in all versions.
    // Let's try fetching manually with REST or check if it's there.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await response.json();
    console.log("Available Models:");
    data.models.forEach((m) => {
      console.log(m.name);
    });
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
