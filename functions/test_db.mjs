import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: "ecotrophy-inventory" });
const db = getFirestore();

async function run() {
  const eventsSnap = await db.collection("meta_webhook_events")
    .orderBy("receivedAt", "desc")
    .limit(3)
    .get();
  
  if (eventsSnap.empty) {
    console.log("No webhook events found.");
    return;
  }

  eventsSnap.forEach(doc => {
    console.log(`Doc ID: ${doc.id}`);
    const data = doc.data();
    console.log(`receivedAt: ${data.receivedAt?.toDate()}`);
    console.log(`processingStatus: ${data.processingStatus}`);
    console.log(`note: ${data.note}`);
    console.log(`relatedLeadId: ${data.relatedLeadId}`);
    console.log(`entry:`, JSON.stringify(data.entry).substring(0, 200));
    console.log("---");
  });
}
run().catch(console.error);
