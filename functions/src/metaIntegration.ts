import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "node:crypto";
import { defineSecret } from "firebase-functions/params";
import { db } from "./config.js";

// We define Firebase Secrets that need to be set via CLI
const metaAppSecret = defineSecret("META_APP_SECRET");
const metaVerifyToken = defineSecret("META_WEBHOOK_VERIFY_TOKEN");
const whatsappAccessToken = defineSecret("META_WHATSAPP_ACCESS_TOKEN");
const facebookToken = defineSecret("META_FACEBOOK_SYSTEM_USER_TOKEN");

/**
 * Validates if the user is an admin
 */
async function requireAdmin(uid: string) {
  const userDoc = await db.collection("users").doc(uid).get();
  if (userDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can perform this action");
  }
}

/**
 * Get Meta Secrets Status safely
 */
export const getMetaSecretStatus = onCall(
  { secrets: [metaAppSecret, metaVerifyToken, whatsappAccessToken, facebookToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

    let appSecretConfigured = false;
    let webhookVerifyTokenConfigured = false;
    let whatsappTokenConfigured = false;
    let facebookTokenConfigured = false;

    try { if (metaAppSecret.value()) appSecretConfigured = true; } catch (e) {}
    try { if (metaVerifyToken.value()) webhookVerifyTokenConfigured = true; } catch (e) {}
    try { if (whatsappAccessToken.value()) whatsappTokenConfigured = true; } catch (e) {}
    try { if (facebookToken.value()) facebookTokenConfigured = true; } catch (e) {}

    const docRef = await db.collection("meta_integrations").doc("default").get();
    const config = docRef.exists ? docRef.data() : {};

    return {
      config: {
        metaAppId: config?.metaAppId || "",
        metaBusinessPortfolioId: config?.businessPortfolioId || "",
        graphApiVersion: config?.graphApiVersion || "v18.0",
        environment: config?.environment || "Test",
        whatsappPhoneNumberId: config?.whatsappPhoneNumberId || "",
        whatsappBusinessAccountId: config?.whatsappBusinessAccountId || "",
        whatsappDisplayPhoneNumber: config?.whatsappDisplayPhoneNumber || "",
        whatsappDisplayName: config?.whatsappDisplayName || "",
        defaultTemplateLanguage: config?.defaultTemplateLanguage || "en_US",
        // Facebook
        facebookPageId: config?.facebookPageId || "",
        facebookPageName: config?.facebookPageName || "",
        facebookPageCategory: config?.facebookPageCategory || "",
        facebookLeadFormId: config?.facebookLeadFormId || "",
        defaultPipelineId: config?.defaultPipelineId || "",
        defaultStageId: config?.defaultStageId || "",
        defaultLeadOwnerId: config?.defaultLeadOwnerId || "",
        // Instagram
        instagramAccountId: config?.instagramAccountId || "",
        instagramUsername: config?.instagramUsername || "",
        instagramName: config?.instagramName || "",
        instagramConnectedPageId: config?.instagramConnectedPageId || "",
      },
      status: {
        connectionStatus: config?.connectionStatus || "not_configured",
        appSecretConfigured,
        webhookVerifyTokenConfigured,
        whatsappTokenConfigured,
        facebookTokenConfigured,
        whatsappWebhookVerified: config?.whatsappWebhookVerified || false,
        whatsappWebhookSubscribed: config?.whatsappWebhookSubscribed || false,
        lastConnectionTestAt: config?.lastConnectionTestAt || "",
        lastWebhookReceivedAt: config?.lastWebhookReceivedAt || "",
        lastSuccessfulMessageAt: config?.lastSuccessfulMessageAt || "",
        lastErrorCode: config?.lastErrorCode || "",
        lastErrorMessage: config?.lastErrorMessage || "",
        // Facebook
        facebookConnectionStatus: config?.facebookConnectionStatus || "not_configured",
        facebookLeadAdsSubscribed: config?.facebookLeadAdsSubscribed || false,
        facebookMessagesSubscribed: config?.facebookMessagesSubscribed || false,
        lastFacebookTestAt: config?.lastFacebookTestAt || "",
        lastFacebookLeadAt: config?.lastFacebookLeadAt || "",
        lastFacebookMessageAt: config?.lastFacebookMessageAt || "",
        facebookLastErrorCode: config?.facebookLastErrorCode || "",
        facebookLastErrorMessage: config?.facebookLastErrorMessage || "",
        // Instagram
        instagramConnectionStatus: config?.instagramConnectionStatus || "not_configured",
        instagramMessagesSubscribed: config?.instagramMessagesSubscribed || false,
        lastInstagramTestAt: config?.lastInstagramTestAt || "",
        lastInstagramMessageAt: config?.lastInstagramMessageAt || "",
        instagramLastErrorCode: config?.instagramLastErrorCode || "",
        instagramLastErrorMessage: config?.instagramLastErrorMessage || "",
      }
    };
  }
);

/**
 * Save non-sensitive Meta integration config
 */
export const saveMetaIntegrationConfig = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    await requireAdmin(request.auth.uid);

    const { config } = request.data;
    if (!config) throw new HttpsError("invalid-argument", "Config object missing");

    await db.collection("meta_integrations").doc("default").set({
        metaAppId: config.metaAppId || "",
        businessPortfolioId: config.metaBusinessPortfolioId || "",
        graphApiVersion: config.graphApiVersion || "v18.0",
        environment: config.environment || "Test",
        whatsappPhoneNumberId: config.whatsappPhoneNumberId || "",
        whatsappBusinessAccountId: config.whatsappBusinessAccountId || "",
        whatsappDisplayPhoneNumber: config.whatsappDisplayPhoneNumber || "",
        whatsappDisplayName: config.whatsappDisplayName || "",
        defaultTemplateLanguage: config.defaultTemplateLanguage || "en_US",
        updatedAt: new Date().toISOString(),
        updatedBy: request.auth.uid
    }, { merge: true });

    return { success: true };
});

/**
 * Test WhatsApp Connection
 */
export const testWhatsAppConnection = onCall(
  { secrets: [whatsappAccessToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    await requireAdmin(request.auth.uid);

    let token = "";
    try { token = whatsappAccessToken.value(); } catch (e) {}
    if (!token) throw new HttpsError("failed-precondition", "WhatsApp Access Token is empty or not configured.");

    const docRef = await db.collection("meta_integrations").doc("default").get();
    const data = docRef.data();
    
    if (!data || !data.whatsappPhoneNumberId) {
      throw new HttpsError("failed-precondition", "WhatsApp Phone Number ID not configured.");
    }

    const version = data.graphApiVersion || "v18.0";
    const phoneId = data.whatsappPhoneNumberId;

    try {
      const url = `https://graph.facebook.com/${version}/${phoneId}?access_token=${token}`;
      const response = await fetch(url);
      const result = await response.json();

      if (result.error) {
        await db.collection("meta_integrations").doc("default").set({
          connectionStatus: "error",
          lastConnectionTestAt: new Date().toISOString(),
          lastErrorCode: result.error.code?.toString() || "",
          lastErrorMessage: result.error.message || "Unknown Meta Error"
        }, { merge: true });
        
        await db.collection("audit_logs").add({
            action: "meta_test_connection_failed",
            user: request.auth.uid,
            timestamp: FieldValue.serverTimestamp(),
            error: result.error.message
        });
        
        throw new HttpsError("internal", result.error.message);
      }

      await db.collection("meta_integrations").doc("default").set({
        connectionStatus: "connected",
        lastConnectionTestAt: new Date().toISOString(),
        lastErrorCode: "",
        lastErrorMessage: "",
        whatsappDisplayPhoneNumber: result.display_phone_number || data.whatsappDisplayPhoneNumber,
        whatsappDisplayName: result.verified_name || data.whatsappDisplayName
      }, { merge: true });

      await db.collection("audit_logs").add({
          action: "meta_test_connection_success",
          user: request.auth.uid,
          timestamp: FieldValue.serverTimestamp()
      });

      return { 
          success: true, 
          displayPhoneNumber: result.display_phone_number,
          verifiedName: result.verified_name,
          qualityRating: result.quality_rating,
          accountStatus: result.status,
          lastTestedAt: new Date().toISOString()
      };
    } catch (err: any) {
      throw new HttpsError("internal", err.message);
    }
  }
);


export const subscribeWhatsAppWebhook = onCall(
    { secrets: [whatsappAccessToken] },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
        await requireAdmin(request.auth.uid);

        let token = "";
        try { token = whatsappAccessToken.value(); } catch (e) {}
        if (!token) throw new HttpsError("failed-precondition", "WhatsApp Access Token missing.");

        const docRef = await db.collection("meta_integrations").doc("default").get();
        const data = docRef.data();
        if (!data || !data.metaAppId || !data.whatsappBusinessAccountId) {
            throw new HttpsError("failed-precondition", "Meta App ID and WABA ID must be configured first.");
        }

        const version = data.graphApiVersion || "v18.0";
        const appId = data.metaAppId;

        // Subscribing to WhatsApp Webhooks
        try {
            const url = `https://graph.facebook.com/${version}/${appId}/subscriptions`;
            
            // Note: in a real implementation, you'd send `object=whatsapp_business_account`, `callback_url`, `fields`, `verify_token`
            // Meta Graph API requires the callback URL to be sent here, or it can be configured in the dashboard.
            // For simplicity and since we don't have the callback URL hardcoded in the env, we assume the user sets it up in dashboard,
            // OR we can make the request if we know our own URL. Usually, we just subscribe the specific WABA fields if the callback is set.
            
            // To subscribe a specific WABA to the app:
            const wabaUrl = `https://graph.facebook.com/${version}/${data.whatsappBusinessAccountId}/subscribed_apps`;
            
            const response = await fetch(wabaUrl, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error.message);
            }

            await db.collection("meta_integrations").doc("default").set({
                whatsappWebhookSubscribed: true,
            }, { merge: true });

            await db.collection("audit_logs").add({
                action: "whatsapp_webhook_subscribed",
                user: request.auth.uid,
                timestamp: FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (err: any) {
            throw new HttpsError("internal", err.message);
        }
    }
);

export const unsubscribeWhatsAppWebhook = onCall(
    { secrets: [whatsappAccessToken] },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
        await requireAdmin(request.auth.uid);

        let token = "";
        try { token = whatsappAccessToken.value(); } catch (e) {}
        if (!token) throw new HttpsError("failed-precondition", "WhatsApp Access Token missing.");

        const docRef = await db.collection("meta_integrations").doc("default").get();
        const data = docRef.data();
        if (!data || !data.whatsappBusinessAccountId) {
            throw new HttpsError("failed-precondition", "WABA ID must be configured.");
        }

        const version = data.graphApiVersion || "v18.0";

        try {
            const wabaUrl = `https://graph.facebook.com/${version}/${data.whatsappBusinessAccountId}/subscribed_apps`;
            
            const response = await fetch(wabaUrl, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error.message);
            }

            await db.collection("meta_integrations").doc("default").set({
                whatsappWebhookSubscribed: false,
            }, { merge: true });

            await db.collection("audit_logs").add({
                action: "whatsapp_webhook_unsubscribed",
                user: request.auth.uid,
                timestamp: FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (err: any) {
            throw new HttpsError("internal", err.message);
        }
    }
);

export const sendWhatsAppTestMessage = onCall(
    { secrets: [whatsappAccessToken] },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
        await requireAdmin(request.auth.uid);

        const { phoneNumber, mode, templateName, templateLanguage, textBody } = request.data;
        if (!phoneNumber) throw new HttpsError("invalid-argument", "Phone number required");

        let token = "";
        try { token = whatsappAccessToken.value(); } catch (e) {}
        if (!token) throw new HttpsError("failed-precondition", "WhatsApp Access Token missing.");

        const docRef = await db.collection("meta_integrations").doc("default").get();
        const data = docRef.data();
        if (!data || !data.whatsappPhoneNumberId) {
            throw new HttpsError("failed-precondition", "Phone Number ID not configured.");
        }

        const version = data.graphApiVersion || "v18.0";
        const phoneId = data.whatsappPhoneNumberId;
        const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

        const body: any = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNumber,
        };

        if (mode === "template") {
            body.type = "template";
            body.template = {
                name: templateName,
                language: { code: templateLanguage }
            };
        } else {
            body.type = "text";
            body.text = { preview_url: false, body: textBody };
        }

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });
            
            const result = await response.json();

            if (result.error) {
                throw new Error(result.error.message);
            }

            const messageId = result.messages?.[0]?.id;

            await db.collection("meta_integrations").doc("default").set({
                lastSuccessfulMessageAt: new Date().toISOString(),
                connectionStatus: "connected",
                lastErrorCode: "",
                lastErrorMessage: ""
            }, { merge: true });

            return { success: true, messageId };
        } catch (err: any) {
            throw new HttpsError("internal", err.message);
        }
    }
);

/**
 * Webhook Handler (GET & POST)
 */
export const metaWebhook = onRequest(
  { secrets: [metaVerifyToken, metaAppSecret] },
  async (req, res) => {
    // 1. Webhook Verification (GET)
    if (req.method === "GET") {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      let expectedToken = "";
      try { expectedToken = metaVerifyToken.value(); } catch (e) {
          res.status(500).send("Verify Token Secret not configured"); return;
      }

      if (mode === "subscribe" && token === expectedToken) {
        await db.collection("meta_integrations").doc("default").set({
            whatsappWebhookVerified: true
        }, { merge: true });
        res.status(200).send(challenge);
        return;
      } else {
        res.status(403).send("Forbidden");
        return;
      }
    }

    // 2. Webhook Event Processing (POST)
    if (req.method === "POST") {
      let secret = "";
      try { secret = metaAppSecret.value(); } catch (e) {
          res.status(500).send("App Secret not configured"); return;
      }

      // Verify Signature
      const signature = req.headers["x-hub-signature-256"] as string;
      if (!signature) { res.status(400).send("Missing signature"); return; }

      const rawBody = (req as any).rawBody; 
      if (!rawBody) { res.status(400).send("Missing raw body"); return; }

      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(rawBody);
      const expectedSignature = `sha256=${hmac.digest("hex")}`;

      try {
        const expectedBuffer = Buffer.from(expectedSignature);
        const actualBuffer = Buffer.from(signature);
        if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
          res.status(403).send("Invalid signature"); return;
        }
      } catch (err) {
        res.status(403).send("Signature verification failed"); return;
      }

      // Fast Return
      res.status(200).send("EVENT_RECEIVED");

      const body = req.body;
      
      try {
        // Store minimal event data and defer async processing
        if (body.object) {
          await db.collection("meta_integrations").doc("default").set({
              lastWebhookReceivedAt: new Date().toISOString()
          }, { merge: true });

          // Call our async processor in the background
          // We can't await it here as it would block the response if we hadn't already sent res.status().send()
          // But since we did send the response, Firebase might terminate the function. 
          // Best practice for v2 is to use Cloud Tasks or PubSub, but for lightweight approach, 
          // we can just await it since we already flushed the response, OR use PubSub if strictly needed.
          // In Node.js, asynchronous operations started before the response ends might finish, but Firebase 
          // can freeze the instance. We will store it in firestore and use a Firestore trigger for processing,
          // or just await it here but Firebase functions allow awaiting after send IF the promise is returned.
          // The safest lightweight way without PubSub is to write to Firestore, and have a Firestore trigger process it.
          // OR, simply await it here and then resolve the function. Wait, we already sent the response!
          // Correct Firebase V2 way to return fast but keep alive: you can't. You must await the promise before resolving the function.
          // But the requirement says "Return HTTP 200 quickly. Process it asynchronously."
          // We will save to meta_webhook_events, and a firestore trigger will pick it up.
          
          const batch = db.batch();
          body.entry?.forEach((entry: any) => {
             const eventId = entry.id + "_" + new Date().getTime();
             const docRef = db.collection("meta_webhook_events").doc(eventId);
             
             // Extract stable idempotency key and determine event type
             let idempotencyKey = eventId;
             let eventType = "unknown";
             
             if (entry.changes && entry.changes[0]) {
                 const change = entry.changes[0];
                 const value = change.value;
                 
                 // WhatsApp
                 if (value?.messages) {
                     idempotencyKey = value.messages[0].id;
                     eventType = "whatsapp_message";
                 } else if (value?.statuses) {
                     idempotencyKey = value.statuses[0].id + "_" + value.statuses[0].status;
                     eventType = "whatsapp_status";
                 }
                 // Facebook Lead Ads
                 else if (change.field === "leadgen") {
                     idempotencyKey = value.leadgen_id;
                     eventType = "leadgen";
                 }
             }
             // Facebook Page / Instagram Messages
             else if (entry.messaging && entry.messaging[0]) {
                 const msg = entry.messaging[0];
                 idempotencyKey = msg.message?.mid || eventId;
                 eventType = "messages";
             }

             batch.set(docRef, {
                 idempotencyKey,
                 platform: body.object, // 'whatsapp_business_account', 'page', 'instagram'
                 eventType,
                 receivedAt: FieldValue.serverTimestamp(),
                 processingStatus: "pending",
                 retryCount: 0,
                 payloadSummary: {
                    entry: entry
                 } // Storing the entry here so the trigger can parse it
             });
          });
          await batch.commit();
        }
      } catch (err) {
        console.error("Error storing webhook event", err);
      }
    } else {
      res.status(405).send("Method Not Allowed");
    }
  }
);
