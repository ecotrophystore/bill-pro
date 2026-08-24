import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyADF4qRiXl1HavHy8GAXVx6XaweqQkq6Yk",
  authDomain: "ecotrophy-inventory.firebaseapp.com",
  projectId: "ecotrophy-inventory",
  storageBucket: "ecotrophy-inventory.firebasestorage.app",
  messagingSenderId: "62541510816",
  appId: "1:62541510816:web:6a3fc26aa11799f4b831c5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

signInWithEmailAndPassword(auth, "admin@ecotrophy.in", "password123")
  .then(() => console.log("Success"))
  .catch(e => console.error("Error with new key:", e.code));
