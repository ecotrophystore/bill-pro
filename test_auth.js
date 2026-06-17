import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDR455QnKVYPiqS9rXOGm5uHgZqIsd8ess",
  authDomain: "ecotrophy-inventory.firebaseapp.com",
  projectId: "ecotrophy-inventory",
  storageBucket: "ecotrophy-inventory.firebasestorage.app",
  messagingSenderId: "62541510816",
  appId: "1:62541510816:web:6a3fc26aa11799f4b831c5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function testAccounts() {
  const accounts = [
    { email: 'admin@ecotrophy.in', role: 'admin' },
    { email: 'accounts@ecotrophy.in', role: 'accounts' },
    { email: 'sales@ecotrophy.in', role: 'sales' },
  ];

  for (const acc of accounts) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, acc.email, 'password123');
      console.log(`Success: ${acc.email} logged in. Setting role...`);
      await setDoc(doc(db, "users", userCredential.user.uid), {
        id: userCredential.user.uid,
        name: acc.role.toUpperCase() + " User",
        email: acc.email,
        role: acc.role,
        is_active: true,
        created_at: new Date()
      }, { merge: true });
    } catch (e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        try {
            console.log(`Creating ${acc.email}...`);
            const userCredential = await createUserWithEmailAndPassword(auth, acc.email, 'password123');
            await setDoc(doc(db, "users", userCredential.user.uid), {
                id: userCredential.user.uid,
                name: acc.role.toUpperCase() + " User",
                email: acc.email,
                role: acc.role,
                is_active: true,
                created_at: new Date()
            });
            console.log(`Created: ${acc.email}`);
        } catch(createErr) {
            console.error(`Failed to create ${acc.email}:`, createErr.message);
        }
      } else {
        console.error(`Failed to login ${acc.email}:`, e.message);
      }
    }
  }
  process.exit(0);
}

testAccounts();
