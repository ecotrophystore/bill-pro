import{n as e}from"./index-DJWs2iG_.js";function t(){if(typeof window<`u`){let e=localStorage.getItem(`VITE_GEMINI_API_KEY`)||localStorage.getItem(`GEMINI_API_KEY`);if(e)return e}return``}async function n(n,i,a){let o=t();if(!o)throw Error(`Gemini API key is not configured. Please configure your Gemini API Key or environment.`);let s=new e(o).getGenerativeModel({model:`gemini-flash-latest`,generationConfig:{responseMimeType:`application/json`}}),c=r(a),l=[{inlineData:{data:n,mimeType:i}}];try{let e=(await(await s.generateContent([c,...l])).response).text();return JSON.parse(e)}catch(e){throw console.error(`Gemini AI Extraction Error:`,e),Error(`Failed to extract data from document. Please verify the document format and quality.`)}}function r(e){return e===`purchase`?`
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
    `:e===`expense`?`
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
    `:e===`statement`?`
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
    `:``}export{n as t};