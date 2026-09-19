import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize without credentials will use Application Default Credentials
// or the locally defined GOOGLE_APPLICATION_CREDENTIALS
try {
  initializeApp({ projectId: "ecotrophy-inventory" });
} catch (e) {
  // Ignore if already initialized
}
const db = getFirestore();

async function checkUsers() {
  console.log("Fetching users from Firestore...");
  const usersSnap = await db.collection("users").get();
  
  if (usersSnap.empty) {
    console.log("No users found in the 'users' collection.");
    return;
  }

  console.log(`Found ${usersSnap.size} users:`);
  usersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`- User ID: ${doc.id}`);
    console.log(`  Name/Email: ${data.name || data.email || 'Unknown'}`);
    console.log(`  Role: ${data.role || 'No role assigned'}`);
    console.log(`  Is Active: ${data.is_active !== undefined ? data.is_active : 'Not set'}`);
    console.log("------------------------");
  });
}

checkUsers().catch(console.error);
