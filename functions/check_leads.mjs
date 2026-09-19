import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

try {
  initializeApp({ projectId: "ecotrophy-inventory" });
} catch (e) {}

const db = getFirestore();

async function checkLeads() {
  const snap = await db.collection("leads").orderBy("created_at", "desc").limit(1).get();
  snap.forEach(doc => {
    console.log(`Lead ID: ${doc.id}`);
    console.log(`Data:`, doc.data());
  });
}

checkLeads().catch(console.error);
