import { HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { db } from '../config.js';

export const fbToken = defineSecret('META_FACEBOOK_SYSTEM_USER_TOKEN');
export const waToken = defineSecret('META_WHATSAPP_ACCESS_TOKEN');


export async function resolveFacebookAuthorization(): Promise<string> {
  let token = '';
  try {
    token = fbToken.value();
  } catch {
    // Secret not available in environment
  }
  if (!token) {
    throw new HttpsError(
      'failed-precondition',
      'Facebook System User Token is not configured. Please add META_FACEBOOK_SYSTEM_USER_TOKEN.'
    );
  }
  return token;
}

export async function resolveWhatsAppAuthorization(): Promise<string> {
  let token = '';
  try {
    token = waToken.value();
  } catch {
    // Secret not available in environment
  }
  if (!token) {
    throw new HttpsError(
      'failed-precondition',
      'WhatsApp Access Token is not configured. Please add META_WHATSAPP_ACCESS_TOKEN.'
    );
  }
  return token;
}

export async function requireAdmin(uid: string): Promise<void> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can perform this action.');
  }
}

export async function getConfig(): Promise<any> {
  const doc = await db.collection('meta_integrations').doc('default').get();
  return doc.data() || {};
}
