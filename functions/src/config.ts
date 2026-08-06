import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Ensure we only initialize once
export const app = getApps().length === 0 ? initializeApp() : getApps()[0]!;
export const db = getFirestore(app);
