const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFunctions, httpsCallable } = require('firebase/functions');
require('dotenv').config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, 'asia-south1');

async function test() {
  try {
    console.log("Signing in...");
    await signInWithEmailAndPassword(auth, 'ecotrophystore@gmail.com', 'eco1234');
    console.log("Signed in successfully. Token:", await auth.currentUser.getIdToken(true));
    
    console.log("Calling createInvoice...");
    const createInvoice = httpsCallable(functions, 'createInvoice');
    
    const invoiceData = {
      customer_id: 'walk_in',
      customer_name: 'Test Customer',
      is_igst: false,
      items: [
        { description: 'Test Product', hsn_code: '1234', quantity: 1, rate: 100, tax_percentage: 18, priceTier: 'retail' }
      ]
    };

    const result = await createInvoice({ invoiceData });
    console.log("Success:", result.data);
  } catch (error) {
    console.error("Error:", error.message);
    if (error.details) {
      console.error("Details:", error.details);
    }
  }
}

test();
