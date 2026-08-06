import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { graphGet, graphPost, graphDelete } from './graphApi.js';
import { extractSafeError } from './errors.js';
import type { InstagramAccount } from './types.js';
import { db } from '../config.js';
const fbToken = defineSecret('META_FACEBOOK_SYSTEM_USER_TOKEN');

async function requireAdmin(uid: string) {
  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can perform this action.');
  }
}

async function getConfig() {
  const doc = await db.collection('meta_integrations').doc('default').get();
  return doc.data() || {};
}

async function getToken(): Promise<string> {
  let token = '';
  try { token = fbToken.value(); } catch { /* not configured */ }
  if (!token) throw new HttpsError('failed-precondition', 'META_FACEBOOK_SYSTEM_USER_TOKEN is not configured.');
  return token;
}

// ── fetchConnectedInstagramAccount ─────────────────────────────────────────────
export const fetchConnectedInstagramAccount = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await getToken();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    if (!config.facebookPageId) {
      throw new HttpsError('failed-precondition', 'No Facebook Page configured. Set up Facebook integration first.');
    }

    try {
      const result = await graphGet<any>(
        `/${version}/${config.facebookPageId}`,
        token,
        { fields: 'instagram_business_account{id,username,name,profile_picture_url}' }
      );

      const igData = result.instagram_business_account;

      if (!igData) {
        return {
          connected: false,
          connectedFacebookPageId: config.facebookPageId,
          message: 'No Instagram Professional Account is connected to the selected Facebook Page.',
        };
      }

      const account: InstagramAccount = {
        id: igData.id,
        username: igData.username,
        name: igData.name,
        profilePictureUrl: igData.profile_picture_url,
      };

      return {
        connected: true,
        instagramAccount: account,
        connectedFacebookPageId: config.facebookPageId,
      };
    } catch (err) {
      const safe = extractSafeError(err);
      throw new HttpsError('internal', safe.message);
    }
  }
);

// ── testInstagramConnection ────────────────────────────────────────────────────
export const testInstagramConnection = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await getToken();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    if (!config.instagramAccountId) {
      throw new HttpsError('failed-precondition', 'No Instagram Account configured. Fetch connected account first.');
    }

    try {
      const result = await graphGet<any>(
        `/${version}/${config.instagramAccountId}`,
        token,
        { fields: 'id,username,name,profile_picture_url' }
      );

      const testedAt = new Date().toISOString();

      await db.collection('meta_integrations').doc('default').set({
        instagramConnectionStatus: 'connected',
        instagramUsername: result.username || config.instagramUsername,
        instagramName: result.name || config.instagramName,
        lastInstagramTestAt: testedAt,
        instagramLastErrorCode: '',
        instagramLastErrorMessage: '',
      }, { merge: true });

      await db.collection('audit_logs').add({
        action: 'instagram_test_connection_success',
        user: request.auth.uid,
        instagramAccountId: config.instagramAccountId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        username: result.username,
        name: result.name,
        testedAt,
      };
    } catch (err: any) {
      const safe = extractSafeError(err);
      await db.collection('meta_integrations').doc('default').set({
        instagramConnectionStatus: 'error',
        lastInstagramTestAt: new Date().toISOString(),
        instagramLastErrorCode: safe.code,
        instagramLastErrorMessage: safe.message,
      }, { merge: true });
      throw new HttpsError('internal', safe.message);
    }
  }
);

// ── subscribeInstagramMessages ─────────────────────────────────────────────────
export const subscribeInstagramMessages = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await getToken();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    if (!config.facebookPageId) {
      throw new HttpsError('failed-precondition', 'No Facebook Page configured. Instagram DMs are subscribed via the connected Facebook Page.');
    }

    try {
      // Instagram DMs come through the connected Facebook Page's webhook subscription
      await graphPost(
        `/${version}/${config.facebookPageId}/subscribed_apps`,
        token,
        { subscribed_fields: 'instagram_manage_messages' }
      );

      await db.collection('meta_integrations').doc('default').set({
        instagramMessagesSubscribed: true,
        instagramMessagesSubscribedAt: new Date().toISOString(),
      }, { merge: true });

      await db.collection('audit_logs').add({
        action: 'instagram_messages_subscribed',
        user: request.auth.uid,
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (err) {
      const safe = extractSafeError(err);
      throw new HttpsError('internal', safe.message);
    }
  }
);

// ── unsubscribeInstagramMessages ───────────────────────────────────────────────
export const unsubscribeInstagramMessages = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    await db.collection('meta_integrations').doc('default').set({
      instagramMessagesSubscribed: false,
      instagramMessagesUnsubscribedAt: new Date().toISOString(),
    }, { merge: true });

    await db.collection('audit_logs').add({
      action: 'instagram_messages_unsubscribed',
      user: request.auth.uid,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
