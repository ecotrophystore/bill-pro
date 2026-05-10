import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { readFile } from 'fs/promises';

async function run() {
  const envContent = await readFile('../.env.local', 'utf-8').catch(() => readFile('../.env', 'utf-8'));
  const env = {};
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key) env[key.trim()] = vals.join('=').trim().replace(/['"]/g, '');
  });

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const functions = getFunctions(app, 'asia-south1'); // Note the region

  try {
    await signInWithEmailAndPassword(auth, 'admin@ecobill.com', 'admin123'); // Adjust password if needed
    console.log("Logged in");
  } catch (e) {
    console.error("Login failed", e);
    return;
  }

  const createCashMemoFn = httpsCallable(functions, 'createCashMemo');
  const memoData = {
    customer_id: 'walk_in',
    customer_name: 'Test Walk in',
    walk_in_customer: true,
    items: [{
      description: 'Test Product',
      hsn_code: '1234',
      quantity: 1,
      rate: 100,
      tax_percentage: 0
    }]
  };

  try {
    console.log("Calling createCashMemo...");
    const res = await createCashMemoFn({ memoData });
    console.log("Success:", res.data);
  } catch (e) {
    console.error("Function error:", e.code, e.message, e.details);
  }
}
run();
