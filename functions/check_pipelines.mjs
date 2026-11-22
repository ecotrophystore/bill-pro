import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

try {
  initializeApp({ projectId: "ecotrophy-inventory" });
} catch (e) {}

const db = getFirestore();

async function checkPipelines() {
  const snap = await db.collection("pipelines").get();
  console.log(`Found ${snap.size} pipelines in DB.`);
  snap.forEach(doc => {
    console.log(`ID: ${doc.id}, Name: ${doc.data().name}`);
  });
}

checkPipelines().catch(console.error);
