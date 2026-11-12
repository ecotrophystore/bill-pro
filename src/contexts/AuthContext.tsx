import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import type { User as DbUser, UserRole } from '../types';
import { normalizeRole } from '../config/roleAccess';

interface AuthContextType {
  user: User | null;
  dbUser: DbUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  dbUser: null,
  loading: true,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      console.error("Firebase Auth not initialized. Check configuration.");
      setLoading(false);
      return;
    }

    let unsubUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      setUser(firebaseUser);

      if (firebaseUser) {
        if (!db) {
          console.error("Firestore not initialized");
          setLoading(false);
          return;
        }

        const userRef = doc(db, 'users', firebaseUser.uid);

        // Live listener on current user profile for instant role/status updates
        unsubUserDoc = onSnapshot(
          userRef,
          async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              setDbUser({
                ...data,
                id: firebaseUser.uid,
                role: normalizeRole(data.role) as UserRole,
              } as DbUser);
              setLoading(false);
            } else {
              // Check if Admin/HR pre-invited this email in user_invites/{email}
              let preAssignedRole: UserRole = 'user';
              let extraMeta: Record<string, any> = {};
              let inviteRefToDelete: ReturnType<typeof doc> | null = null;

              if (firebaseUser.email) {
                try {
                  const cleanEmail = firebaseUser.email.toLowerCase();
                  const inviteRef = doc(db, 'user_invites', cleanEmail);
                  const inviteSnap = await getDoc(inviteRef);
                  if (inviteSnap.exists()) {
                    const invData = inviteSnap.data();
                    preAssignedRole = normalizeRole(invData.role);
                    extraMeta = {
                      name: invData.name || firebaseUser.displayName || cleanEmail.split('@')[0],
                      department: invData.department || '',
                      designation: invData.designation || '',
                      phone: invData.phone || '',
                      is_active: invData.is_active !== false,
                    };
                    inviteRefToDelete = inviteRef;
                  }
                } catch (e) {
                  // Ignore if lookup fails; fallback to 'user'
                }
              }

              const defaultUser = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                email: (firebaseUser.email || '').toLowerCase(),
                role: preAssignedRole,
                is_active: true,
                ...extraMeta,
                created_at: serverTimestamp()
              };

              try {
                await setDoc(userRef, defaultUser, { merge: true });
                if (inviteRefToDelete) {
                  await deleteDoc(inviteRefToDelete).catch(() => {});
                }
                setDbUser(defaultUser as unknown as DbUser);
              } catch {
                setDbUser(defaultUser as unknown as DbUser);
              }
              setLoading(false);
            }
          },
          (err) => {
            console.error('Error syncing db user:', err);
            setLoading(false);
          }
        );
      } else {
        setDbUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  const logout = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, dbUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
