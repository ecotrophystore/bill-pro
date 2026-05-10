const admin = require('firebase-admin');

// Ensure we have GOOGLE_APPLICATION_CREDENTIALS or it connects to emulator if FIRESTORE_EMULATOR_HOST is set
// Actually we can just run firebase-admin without args and it uses default credentials if authenticated
admin.initializeApp();
const db = admin.firestore();

async function run() {
  try {
    const users = await db.collection('users').get();
    console.log("Users:");
    users.forEach(doc => console.log(doc.id, doc.data()));
  } catch (e) {
    console.error(e);
  }
}
run();
