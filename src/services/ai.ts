import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function extractDataFromDocument(
  base64Data: string,
  mimeType: string,
  type: 'purchase' | 'expense' | 'statement'
): Promise<any> {
  if (!genAI) {
    throw new Error('Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  // Use the flash model which is cost-effective and fast
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const prompt = getPromptForType(type);

  const imageParts = [
    {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    },
  ];

  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error('Gemini AI Extraction Error:', error);
    throw new Error('Failed to extract data from document. Please verify the document format and quality.');
  }
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
            "description": "Item Name",
            "quantity": 1,
            "rate": 10.50,
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
