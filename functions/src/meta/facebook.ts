import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { graphGet, graphPost, graphDelete } from './graphApi.js';
import { extractSafeError } from './errors.js';
import type { FacebookPage, FacebookLeadForm } from './types.js';
import { db } from '../config.js';
import { resolveFacebookAuthorization, requireAdmin, getConfig, fbToken } from './auth.js';


// ── fetchAvailableFacebookPages ────────────────────────────────────────────────
export const fetchAvailableFacebookPages = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await resolveFacebookAuthorization();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    try {
      const result = await graphGet<{ data: any[] }>(
        `/${version}/me/accounts`,
        token,
        { fields: 'id,name,category,tasks,picture,instagram_business_account' }
      );

      const pages: FacebookPage[] = (result.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        pictureUrl: p.picture?.data?.url,
        tasks: p.tasks,
        connectedInstagramAccountId: p.instagram_business_account?.id,
      }));

      return { pages };
    } catch (err) {
      const safe = extractSafeError(err);
      throw new HttpsError('internal', safe.message);
    }
  }
);

// ── testFacebookConnection ─────────────────────────────────────────────────────
export const testFacebookConnection = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await resolveFacebookAuthorization();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    if (!config.facebookPageId) {
      throw new HttpsError('failed-precondition', 'No Facebook Page configured. Fetch and select a page first.');
    }

    try {
      const result = await graphGet<any>(
        `/${version}/${config.facebookPageId}`,
        token,
        { fields: 'id,name,category,instagram_business_account' }
      );

      const testedAt = new Date().toISOString();

      await db.collection('meta_integrations').doc('default').set({
        facebookConnectionStatus: 'connected',
        facebookPageName: result.name || config.facebookPageName,
        facebookPageCategory: result.category || config.facebookPageCategory,
        lastFacebookTestAt: testedAt,
        facebookLastErrorCode: '',
        facebookLastErrorMessage: '',
      }, { merge: true });

      await db.collection('audit_logs').add({
        action: 'facebook_test_connection_success',
        user: request.auth.uid,
        pageId: config.facebookPageId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        pageId: result.id,
        pageName: result.name,
        category: result.category,
        connectedInstagramAccountId: result.instagram_business_account?.id,
        testedAt,
      };
    } catch (err: any) {
      const safe = extractSafeError(err);
      await db.collection('meta_integrations').doc('default').set({
        facebookConnectionStatus: 'error',
        lastFacebookTestAt: new Date().toISOString(),
        facebookLastErrorCode: safe.code,
        facebookLastErrorMessage: safe.message,
      }, { merge: true });
      throw new HttpsError('internal', safe.message);
    }
  }
);

// ── fetchFacebookLeadForms ─────────────────────────────────────────────────────
export const fetchFacebookLeadForms = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await resolveFacebookAuthorization();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    if (!config.facebookPageId) {
      throw new HttpsError('failed-precondition', 'No Facebook Page configured. Fetch and select a page first.');
    }

    try {
      const result = await graphGet<{ data: any[] }>(
        `/${version}/${config.facebookPageId}/leadgen_forms`,
        token,
        { fields: 'id,name,status,created_time', limit: '50' }
      );

      const forms: FacebookLeadForm[] = (result.data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        status: f.status,
        createdTime: f.created_time,
      }));

      return { forms };
    } catch (err) {
      const safe = extractSafeError(err);
      throw new HttpsError('internal', safe.message);
    }
  }
);

// ── saveFacebookConfig ─────────────────────────────────────────────────────────
export const saveFacebookConfig = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
  await requireAdmin(request.auth.uid);

  const { config } = request.data;
  if (!config) throw new HttpsError('invalid-argument', 'Config missing.');

  const allowedFields: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    updatedBy: request.auth.uid,
  };

  const safe = [
    'facebookPageId', 'facebookPageName', 'facebookPageCategory',
    'facebookLeadFormId', 'defaultPipelineId', 'defaultStageId',
    'defaultLeadOwnerId',
  ];
  for (const f of safe) {
    if (config[f] !== undefined) allowedFields[f] = config[f];
  }

  await db.collection('meta_integrations').doc('default').set(allowedFields, { merge: true });

  await db.collection('audit_logs').add({
    action: 'facebook_config_saved',
    user: request.auth.uid,
    timestamp: FieldValue.serverTimestamp(),
  });

  return { success: true };
});

// ── saveInstagramConfig ────────────────────────────────────────────────────────
export const saveInstagramConfig = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
  await requireAdmin(request.auth.uid);

  const { config } = request.data;
  if (!config) throw new HttpsError('invalid-argument', 'Config missing.');

  const allowedFields: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    updatedBy: request.auth.uid,
  };

  const safe = [
    'instagramAccountId', 'instagramUsername', 'instagramName',
    'instagramProfilePictureUrl', 'instagramConnectedPageId',
  ];
  for (const f of safe) {
    if (config[f] !== undefined) allowedFields[f] = config[f];
  }

  await db.collection('meta_integrations').doc('default').set(allowedFields, { merge: true });
  return { success: true };
});

// ── subscribeFacebookLeadAds ───────────────────────────────────────────────────
export const subscribeFacebookLeadAds = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await resolveFacebookAuthorization();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    if (!config.facebookPageId) throw new HttpsError('failed-precondition', 'No Facebook Page configured.');

    try {
      await graphPost(
        `/${version}/${config.facebookPageId}/subscribed_apps`,
        token,
        { subscribed_fields: 'leadgen' }
      );

      await db.collection('meta_integrations').doc('default').set({
        facebookLeadAdsSubscribed: true,
        facebookLeadAdsSubscribedAt: new Date().toISOString(),
      }, { merge: true });

      await db.collection('audit_logs').add({
        action: 'facebook_lead_ads_subscribed',
        user: request.auth.uid,
        pageId: config.facebookPageId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (err) {
      const safe = extractSafeError(err);
      throw new HttpsError('internal', safe.message);
    }
  }
);

// ── unsubscribeFacebookLeadAds ─────────────────────────────────────────────────
export const unsubscribeFacebookLeadAds = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await resolveFacebookAuthorization();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    if (!config.facebookPageId) throw new HttpsError('failed-precondition', 'No Facebook Page configured.');

    try {
      await graphDelete(
        `/${version}/${config.facebookPageId}/subscribed_apps`,
        token
      );

      await db.collection('meta_integrations').doc('default').set({
        facebookLeadAdsSubscribed: false,
        facebookLeadAdsUnsubscribedAt: new Date().toISOString(),
      }, { merge: true });

      await db.collection('audit_logs').add({
        action: 'facebook_lead_ads_unsubscribed',
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

// ── subscribeFacebookPageMessages ──────────────────────────────────────────────
export const subscribeFacebookPageMessages = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const token = await resolveFacebookAuthorization();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    if (!config.facebookPageId) throw new HttpsError('failed-precondition', 'No Facebook Page configured.');

    try {
      await graphPost(
        `/${version}/${config.facebookPageId}/subscribed_apps`,
        token,
        { subscribed_fields: 'messages,messaging_postbacks,messaging_optins' }
      );

      await db.collection('meta_integrations').doc('default').set({
        facebookMessagesSubscribed: true,
        facebookMessagesSubscribedAt: new Date().toISOString(),
      }, { merge: true });

      await db.collection('audit_logs').add({
        action: 'facebook_page_messages_subscribed',
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

// ── unsubscribeFacebookPageMessages ───────────────────────────────────────────
export const unsubscribeFacebookPageMessages = onCall(
  { secrets: [fbToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
    await requireAdmin(request.auth.uid);

    const config = await getConfig();

    await db.collection('meta_integrations').doc('default').set({
      facebookMessagesSubscribed: false,
      facebookMessagesUnsubscribedAt: new Date().toISOString(),
    }, { merge: true });

    await db.collection('audit_logs').add({
      action: 'facebook_page_messages_unsubscribed',
      user: request.auth.uid,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

// ── disconnectFacebookIntegration ──────────────────────────────────────────────
export const disconnectFacebookIntegration = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');
  await requireAdmin(request.auth.uid);

  try {
    const token = await resolveFacebookAuthorization();
    const config = await getConfig();
    const version = config.graphApiVersion || 'v18.0';

    // Best effort unsubscribe
    if (config.facebookPageId) {
      if (config.facebookLeadAdsSubscribed || config.facebookMessagesSubscribed) {
         try {
           await graphDelete(`/${version}/${config.facebookPageId}/subscribed_apps`, token);
         } catch (e) {
           console.warn('Failed to unsubscribe from Facebook apps during disconnect:', e);
         }
      }
    }
  } catch (e) {
     // Ignore missing tokens on disconnect
  }

  // Clear config
  await db.collection('meta_integrations').doc('default').set({
    facebookPageId: '',
    facebookPageName: '',
    facebookPageCategory: '',
    facebookLeadFormId: '',
    facebookConnectionStatus: 'not_configured',
    facebookLeadAdsSubscribed: false,
    facebookMessagesSubscribed: false,
    lastFacebookTestAt: '',
    lastFacebookLeadAt: '',
    lastFacebookMessageAt: '',
    facebookLastErrorCode: '',
    facebookLastErrorMessage: '',
    // also clear dependent instagram config
    instagramAccountId: '',
    instagramUsername: '',
    instagramName: '',
    instagramConnectedPageId: '',
    instagramConnectionStatus: 'not_configured',
    instagramMessagesSubscribed: false,
    updatedAt: new Date().toISOString(),
    updatedBy: request.auth.uid,
  }, { merge: true });

  await db.collection('audit_logs').add({
    action: 'facebook_integration_disconnected',
    user: request.auth.uid,
    timestamp: FieldValue.serverTimestamp(),
  });

  return { success: true };
});
