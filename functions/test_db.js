const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // assuming it exists or we use application default credentials

admin.initializeApp();
const db = admin.firestore();

async function run() {
  const users = await db.collection('users').get();
  users.forEach(doc => console.log(doc.id, doc.data()));
}
run();
