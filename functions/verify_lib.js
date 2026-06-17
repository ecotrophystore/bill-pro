
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = undefined; // Ensure we hit real firestore
initializeApp({
  projectId: 'ecotrophy-inventory'
});
const db = getFirestore();

async function check() {
  console.log("--- Library Check ---");
  const p = await db.collection('products').get();
  console.log("Products Count:", p.size);
  p.docs.forEach(d => console.log(` - Product: ${d.data().name} (${d.data().category})`));
  
  const c = await db.collection('customers').get();
  console.log("Customers Count:", c.size);
  c.docs.forEach(d => console.log(` - Customer: ${d.data().name}`));
}

check().catch(console.error);
