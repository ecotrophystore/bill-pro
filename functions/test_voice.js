import { GoogleGenerativeAI } from '@google/generative-ai';

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);
  const voiceModel = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      systemInstruction: "You are EcoBill Jarvis, the AI voice assistant..."
  }, { apiVersion: 'v1beta' });

  const voiceTools = [{
      functionDeclarations: [
          {
              name: "navigate",
              description: "Navigate to a specific page in the app.",
              parameters: {
                  type: "object",
                  properties: {
                      page: { type: "string" },
                      reason: { type: "string" }
                  },
                  required: ["page"]
              }
          }
      ]
  }];

  const chat = voiceModel.startChat({
      tools: voiceTools,
  });

  try {
      const result = await chat.sendMessage("Go to invoices");
      console.log(result.response.functionCalls());
      console.log("Success!");
  } catch (err) {
      console.error(err);
  }
}
test();
