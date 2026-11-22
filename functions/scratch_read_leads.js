import admin from 'firebase-admin';

admin.initializeApp();

async function run() {
    const db = admin.firestore();
    const snapshot = await db.collection("leads").orderBy("created_at", "desc").limit(3).get();
    
    console.log(`Found ${snapshot.size} leads`);
    
    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\nLead ID: ${doc.id}`);
        console.log(`Name: ${data.name}`);
        console.log(`Phone: ${data.phone}`);
        console.log(`Pipeline ID: ${data.pipeline_id}`);
        console.log(`Status: ${data.status}`);
        console.log(`Created: ${data.created_at ? data.created_at.toDate() : 'unknown'}`);
    });
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
