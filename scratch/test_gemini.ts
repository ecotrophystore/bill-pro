
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/chakravarthimahendrawarma/Desktop/Bill Pro/functions/.env" });

const apiKey = process.env.GEMINI_API_KEY;
console.log("Using API Key:", apiKey ? "EXISTS" : "MISSING");

const genAI = new GoogleGenerativeAI(apiKey || "");

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello, are you working?");
    const response = await result.response;
    console.log("Response:", response.text());
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
