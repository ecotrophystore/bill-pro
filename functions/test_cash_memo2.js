import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { readFile } from 'fs/promises';

async function run() {
  const envContent = await readFile('../.env', 'utf-8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key) env[key.trim()] = vals.join('=').trim().replace(/['"]/g, '');
  });

  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  });
  const auth = getAuth(app);

  const credentialsToTry = [
    { email: 'manager@ecotrophy.com', pass: 'admin123' },
    { email: 'manager@ecotrophy.com', pass: 'password123' },
    { email: 'admin@ecobill.com', pass: 'password123' },
    { email: 'admin@ecobill.com', pass: 'admin1234' },
    { email: 'ecotrophystore@gmail.com', pass: 'admin123' }
  ];

  let loggedIn = false;
  for (const cred of credentialsToTry) {
    try {
      await signInWithEmailAndPassword(auth, cred.email, cred.pass);
      console.log(`Logged in as ${cred.email} with ${cred.pass}`);
      loggedIn = true;
      break;
    } catch (e) {}
  }

  if (!loggedIn) {
    console.log("Could not log in with any credentials.");
    process.exit(1);
  }

  const functions = getFunctions(app, 'asia-south1');
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
  process.exit(0);
}
run();
