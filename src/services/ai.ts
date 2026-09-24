import { GoogleGenerativeAI } from '@google/generative-ai';

export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    const customKey = localStorage.getItem('VITE_GEMINI_API_KEY') || localStorage.getItem('GEMINI_API_KEY');
    if (customKey) return customKey;
  }
  return ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || '';
}

export function setApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('VITE_GEMINI_API_KEY', key.trim());
    localStorage.setItem('GEMINI_API_KEY', key.trim());
  }
}

const CANDIDATE_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-1.5-flash'];

export async function extractDataFromDocument(
  base64Data: string,
  mimeType: string,
  type: 'purchase' | 'expense' | 'statement'
): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please add it to .env as VITE_GEMINI_API_KEY.');
  }

  const prompt = getPromptForType(type);
  const genAI = new GoogleGenerativeAI(apiKey);

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: mimeType
    }
  };

  let lastError: any = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });

      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      return JSON.parse(text);
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      // If model not found or deprecated (404), try next candidate
      if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
        console.warn(`[AI] Model ${modelName} not available, trying next fallback...`);
        continue;
      }
      // If payment (402) or auth (401), stop model looping
      break;
    }
  }

  console.error('Gemini AI Extraction Error details:', lastError);
  const errMsg = lastError?.message || 'Failed to extract data';
  if (errMsg.includes('402') || errMsg.includes('prepayment') || errMsg.includes('credits are depleted')) {
    throw new Error('AI Error (402): Prepayment credits are depleted for this Gemini API key in Google AI Studio. Please check your billing at ai.studio/projects or enter a new API key.');
  }
  if (errMsg.includes('401') || errMsg.includes('API key not valid')) {
    throw new Error('AI Error: Gemini API key is invalid or expired. Please verify VITE_GEMINI_API_KEY in .env.');
  }
  throw new Error('AI Error: ' + errMsg);
}

function getPromptForType(type: 'purchase' | 'expense' | 'statement'): string {
  if (type === 'purchase') {
    return `
      You are an expert OCR and data extraction system.
      Extract the details from this purchase invoice/receipt.
      Return the output as a JSON object matching this schema exactly:
      {
        "vendor": {
          "name": "Vendor/Company Name",
          "address": "Full Address",
          "gst_number": "GSTIN or Tax ID if present",
          "phone": "Phone number if present"
        },
        "invoice": {
          "invoice_number": "Invoice or Bill Number",
          "invoice_date": "YYYY-MM-DD",
          "payment_method": "Cash, Card, Bank Transfer, UPI, etc"
        },
        "items": [
          {
            "itemName": "Item Name",
            "quantity": 1,
            "unitPrice": 10.50,
            "amount": 10.50
          }
        ],
        "taxAmount": 0.00,
        "grandTotal": 0.00,
        "category": "Expenses",
        "overallConfidence": 0.95,
        "manualReviewRequired": false
      }
      Important: Ensure numeric values are numbers, not strings.
    `;
  } else if (type === 'expense') {
    return `
      You are an expert OCR and data extraction system.
      Extract the key details from this expense receipt.
      Return the output as a JSON object matching this schema exactly:
      {
        "date": "YYYY-MM-DD",
        "description": "Short description of what was purchased (e.g. Office Supplies from Staples)",
        "amount": 0.00,
        "category": "General",
        "notes": "Any extra details or vendor name"
      }
      Important: Ensure amount is a number.
    `;
  } else if (type === 'statement') {
    return `
      You are an expert financial data extraction system.
      Extract the bank transactions from this bank statement document.
      Return the output as a JSON object matching this schema exactly:
      {
        "transactions": [
          {
            "date": "YYYY-MM-DD",
            "description": "Transaction Description/Narration",
            "amount": 100.00,
            "type": "credit" or "debit",
            "reference": "Reference number or cheque number if any"
          }
        ]
      }
      Important: Ensure amount is a positive number. Determine type based on withdrawal/deposit columns.
    `;
  }
  return '';
}
