import admin from 'firebase-admin';

// Initialize the app without credentials to use the local emulator or default credentials
admin.initializeApp();

async function run() {
    const db = admin.firestore();
    const snapshot = await db.collection("meta_webhook_events").orderBy("receivedAt", "desc").limit(5).get();
    
    console.log(`Found ${snapshot.size} events`);
    
    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\nEvent ID: ${doc.id}`);
        console.log(`Received: ${data.receivedAt ? data.receivedAt.toDate() : 'unknown'}`);
        console.log(`Platform: ${data.platform}`);
        console.log(`Type: ${data.eventType}`);
        console.log(`Status: ${data.processingStatus}`);
        if (data.processingError) console.log(`Error: ${data.processingError}`);
        console.log(`Payload Summary: ${JSON.stringify(data.payloadSummary, null, 2).substring(0, 500)}...`);
    });
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
