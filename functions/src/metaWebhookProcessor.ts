import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { graphGet } from "./meta/graphApi.js";

const db = getFirestore();
const fbToken = defineSecret("META_FACEBOOK_SYSTEM_USER_TOKEN");

/**
 * Background processor for incoming Meta Webhook events
 */
export const processMetaWebhookEvent = onDocumentCreated({ document: "meta_webhook_events/{eventId}", secrets: [fbToken] }, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    
    const data = snapshot.data();
    if (data.processingStatus !== "pending") return; // Already processed or processing

    const eventId = event.params.eventId;
    const { payloadSummary, platform, eventType } = data;

    try {
        // Mark as processing
        await snapshot.ref.set({ processingStatus: "processing" }, { merge: true });

        const entry = payloadSummary.entry;
        if (!entry || !entry.changes || entry.changes.length === 0) {
            await snapshot.ref.set({ 
                processingStatus: "failed", 
                processingError: "Empty entry or changes",
                processedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            return;
        }

        const change = entry.changes[0];
        const value = change.value;

        // --- 1. PROCESS WHATSAPP MESSAGES ---
        if (eventType === "whatsapp_message" && value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const contact = value.contacts ? value.contacts[0] : null;
            const senderPhone = message.from;
            const messageId = message.id;

            // Prevent duplicate processing based on messageId
            const existingMsgDocs = await db.collection("messages").where("metaMessageId", "==", messageId).limit(1).get();
            if (!existingMsgDocs.empty) {
                await snapshot.ref.set({ 
                    processingStatus: "completed", 
                    note: "Duplicate message ignored",
                    processedAt: FieldValue.serverTimestamp() 
                }, { merge: true });
                return;
            }

            let leadId = "";
            let conversationId = "";
            
            const leadsQuery = await db.collection("leads").where("phone", "==", senderPhone).limit(1).get();
            if (leadsQuery.empty) {
                // Create Lead
                const newLeadRef = db.collection("leads").doc();
                leadId = newLeadRef.id;
                await newLeadRef.set({
                    id: leadId,
                    name: contact?.profile?.name || senderPhone,
                    phone: senderPhone,
                    source: "whatsapp_inbound",
                    status: "new",
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
            } else {
                const leadDoc = leadsQuery.docs[0];
                if (leadDoc) {
                    leadId = leadDoc.id;
                    await leadDoc.ref.update({ updatedAt: FieldValue.serverTimestamp() });
                }
            }

            // Find or create Conversation
            const convQuery = await db.collection("conversations").where("leadId", "==", leadId).where("platform", "==", "whatsapp").limit(1).get();
            if (convQuery.empty) {
                const newConvRef = db.collection("conversations").doc();
                conversationId = newConvRef.id;
                await newConvRef.set({
                    id: conversationId,
                    leadId,
                    platform: "whatsapp",
                    status: "open",
                    participantPhone: senderPhone,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    lastCustomerReplyAt: FieldValue.serverTimestamp()
                });
            } else {
                const convDoc = convQuery.docs[0];
                if (convDoc) {
                    conversationId = convDoc.id;
                    await convDoc.ref.update({ 
                        updatedAt: FieldValue.serverTimestamp(),
                        lastCustomerReplyAt: FieldValue.serverTimestamp()
                    });
                }
            }

            // Extract message text (simplistic approach for now)
            let textBody = "Unsupported message type";
            if (message.type === "text") textBody = message.text.body;
            else textBody = `[${message.type} message]`;

            // Save Message
            const newMsgRef = db.collection("messages").doc();
            await newMsgRef.set({
                id: newMsgRef.id,
                conversationId,
                leadId,
                direction: "inbound",
                type: message.type,
                content: textBody,
                status: "delivered", // For inbound it's delivered to us
                metaMessageId: messageId,
                platform: "whatsapp",
                timestamp: FieldValue.serverTimestamp()
            });

            // Log activity
            await db.collection("activities").add({
                leadId,
                type: "whatsapp_message_received",
                description: `Received WhatsApp message from ${senderPhone}`,
                date: new Date().toISOString()
            });

            // Pause automations for this lead
            const enrollments = await db.collection("automation_enrollments").where("leadId", "==", leadId).where("status", "==", "active").get();
            const batchUpdate = db.batch();
            enrollments.forEach(doc => {
                batchUpdate.set(doc.ref, { status: "paused_due_to_reply", updatedBy: "system" }, { merge: true });
            });
            await batchUpdate.commit();

            await snapshot.ref.set({ 
                processingStatus: "completed", 
                relatedConversationId: conversationId,
                relatedLeadId: leadId,
                relatedMessageId: newMsgRef.id,
                processedAt: FieldValue.serverTimestamp() 
            }, { merge: true });

            return;
        }

        // --- 2. PROCESS MESSAGE STATUSES (WhatsApp) ---
        if (eventType === "whatsapp_status" && value.statuses && value.statuses.length > 0) {
            const statusUpdate = value.statuses[0];
            const messageId = statusUpdate.id;
            const newStatus = statusUpdate.status; // sent, delivered, read, failed

            // Update in messages collection
            const msgQuery = await db.collection("messages").where("metaMessageId", "==", messageId).limit(1).get();
            if (!msgQuery.empty && msgQuery.docs[0]) {
                const msgDoc = msgQuery.docs[0];
                const updateData: any = { status: newStatus };
                
                if (newStatus === "delivered") updateData.deliveredAt = FieldValue.serverTimestamp();
                if (newStatus === "read") updateData.readAt = FieldValue.serverTimestamp();
                if (newStatus === "failed") {
                    updateData.failedAt = FieldValue.serverTimestamp();
                    updateData.errorCode = statusUpdate.errors?.[0]?.code || "";
                    updateData.errorMessage = statusUpdate.errors?.[0]?.message || "Unknown error";
                }

                await msgDoc.ref.set(updateData, { merge: true });
            }

            // Also check message_queue (if we use it for outbounds)
            const queueQuery = await db.collection("message_queue").where("metaMessageId", "==", messageId).limit(1).get();
            if (!queueQuery.empty && queueQuery.docs[0]) {
                const qDoc = queueQuery.docs[0];
                const updateData: any = { status: newStatus };
                if (newStatus === "failed") {
                    updateData.errorMessage = statusUpdate.errors?.[0]?.message || "Unknown error";
                }
                await qDoc.ref.set(updateData, { merge: true });
            }

            await snapshot.ref.set({ 
                processingStatus: "completed", 
                processedAt: FieldValue.serverTimestamp() 
            }, { merge: true });

            return;
        }

        // --- 3. PROCESS FACEBOOK LEAD ADS ---
        if (eventType === "leadgen") {
            const leadgenId = value.leadgen_id;
            const formId = value.form_id;
            const pageId = value.page_id;

            // Check duplicate
            const existingLeadDocs = await db.collection("leads").where("leadgenId", "==", leadgenId).limit(1).get();
            if (!existingLeadDocs.empty) {
                await snapshot.ref.set({ processingStatus: "completed", note: "Duplicate leadgen ignored", processedAt: FieldValue.serverTimestamp() }, { merge: true });
                return;
            }

            let token = "";
            try { token = fbToken.value(); } catch { }
            if (!token) throw new Error("META_FACEBOOK_SYSTEM_USER_TOKEN not configured.");

            // Fetch config to know default pipeline/stage
            const configDoc = await db.collection("meta_integrations").doc("default").get();
            const config = configDoc.data() || {};
            const version = config.graphApiVersion || "v18.0";

            // Fetch lead details from Meta
            const leadData = await graphGet<any>(`/${version}/${leadgenId}`, token);
            
            // Map fields
            const fields: Record<string, string> = {};
            leadData.field_data?.forEach((f: any) => { fields[f.name] = f.values?.[0] || ""; });
            
            const email = fields.email || "";
            const phone = fields.phone_number || fields.phone || "";
            const name = fields.full_name || fields.first_name || "Facebook Lead";

            const newLeadRef = db.collection("leads").doc();
            const leadId = newLeadRef.id;

            await newLeadRef.set({
                id: leadId,
                name,
                email,
                phone,
                source: "facebook_lead_ads",
                platform: "meta",
                status: "new",
                pipelineId: config.defaultPipelineId || "",
                stageId: config.defaultStageId || "",
                ownerId: config.defaultLeadOwnerId || "",
                leadgenId,
                pageId,
                formId,
                campaignId: leadData.campaign_id || "",
                adSetId: leadData.adset_id || "",
                adId: leadData.ad_id || "",
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                stageEnteredAt: FieldValue.serverTimestamp()
            });

            await db.collection("lead_intake_events").add({
                leadId,
                source: "facebook_lead_ads",
                platform: "meta",
                leadgenId,
                pageId,
                formId,
                campaignId: leadData.campaign_id || "",
                adSetId: leadData.adset_id || "",
                adId: leadData.ad_id || "",
                receivedAt: FieldValue.serverTimestamp()
            });

            await db.collection("activities").add({
                leadId,
                type: "facebook_lead_received",
                description: `Received Facebook Lead from form ${formId}`,
                date: new Date().toISOString()
            });

            await db.collection("meta_integrations").doc("default").set({ lastFacebookLeadAt: new Date().toISOString() }, { merge: true });

            await snapshot.ref.set({ processingStatus: "completed", relatedLeadId: leadId, processedAt: FieldValue.serverTimestamp() }, { merge: true });
            return;
        }

        // --- 4. PROCESS FACEBOOK / INSTAGRAM MESSAGES ---
        if (eventType === "messages" && entry.messaging && entry.messaging.length > 0) {
            const msgEvent = entry.messaging[0];
            const senderId = msgEvent.sender?.id;
            const recipientId = msgEvent.recipient?.id;
            const messageObj = msgEvent.message;
            const messageId = messageObj?.mid;
            
            if (!senderId || !messageObj || !messageId) {
                await snapshot.ref.set({ processingStatus: "completed", note: "Not a valid message event", processedAt: FieldValue.serverTimestamp() }, { merge: true });
                return;
            }

            const existingMsgDocs = await db.collection("messages").where("metaMessageId", "==", messageId).limit(1).get();
            if (!existingMsgDocs.empty) {
                await snapshot.ref.set({ processingStatus: "completed", note: "Duplicate message ignored", processedAt: FieldValue.serverTimestamp() }, { merge: true });
                return;
            }

            let leadId = "";
            let conversationId = "";
            
            // Search for existing lead with this sender ID
            const leadsQuery = await db.collection("leads").where("metaSenderId", "==", senderId).where("platform", "==", platform).limit(1).get();
            if (leadsQuery.empty) {
                const newLeadRef = db.collection("leads").doc();
                leadId = newLeadRef.id;
                await newLeadRef.set({
                    id: leadId,
                    name: `${platform === 'instagram' ? 'Instagram' : 'Facebook'} User (${senderId})`,
                    metaSenderId: senderId,
                    platform,
                    source: `${platform}_inbound`,
                    status: "new",
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
            } else {
                const leadDoc = leadsQuery.docs[0];
                if (leadDoc) {
                    leadId = leadDoc.id;
                    await leadDoc.ref.update({ updatedAt: FieldValue.serverTimestamp() });
                }
            }

            const convQuery = await db.collection("conversations").where("leadId", "==", leadId).where("platform", "==", platform).limit(1).get();
            if (convQuery.empty) {
                const newConvRef = db.collection("conversations").doc();
                conversationId = newConvRef.id;
                await newConvRef.set({
                    id: conversationId,
                    leadId,
                    platform,
                    status: "open",
                    participantId: senderId,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    lastCustomerReplyAt: FieldValue.serverTimestamp()
                });
            } else {
                const convDoc = convQuery.docs[0];
                if (convDoc) {
                    conversationId = convDoc.id;
                    await convDoc.ref.update({ 
                        updatedAt: FieldValue.serverTimestamp(),
                        lastCustomerReplyAt: FieldValue.serverTimestamp()
                    });
                }
            }

            let textBody = messageObj.text || "[Attachment/Media]";

            const newMsgRef = db.collection("messages").doc();
            await newMsgRef.set({
                id: newMsgRef.id,
                conversationId,
                leadId,
                direction: "inbound",
                type: messageObj.text ? "text" : "media",
                content: textBody,
                status: "delivered",
                metaMessageId: messageId,
                platform,
                timestamp: FieldValue.serverTimestamp()
            });

            await db.collection("activities").add({
                leadId,
                type: `${platform}_message_received`,
                description: `Received ${platform} message`,
                date: new Date().toISOString()
            });

            const enrollments = await db.collection("automation_enrollments").where("leadId", "==", leadId).where("status", "==", "active").get();
            const batchUpdate = db.batch();
            enrollments.forEach(doc => {
                batchUpdate.set(doc.ref, { status: "paused_due_to_reply", updatedBy: "system" }, { merge: true });
            });
            await batchUpdate.commit();

            if (platform === "instagram") {
                await db.collection("meta_integrations").doc("default").set({ lastInstagramMessageAt: new Date().toISOString() }, { merge: true });
            } else if (platform === "page") {
                await db.collection("meta_integrations").doc("default").set({ lastFacebookMessageAt: new Date().toISOString() }, { merge: true });
            }

            await snapshot.ref.set({ 
                processingStatus: "completed", 
                relatedConversationId: conversationId,
                relatedLeadId: leadId,
                relatedMessageId: newMsgRef.id,
                processedAt: FieldValue.serverTimestamp() 
            }, { merge: true });

            return;
        }

        // Ignored event type
        await snapshot.ref.set({ 
            processingStatus: "ignored", 
            note: "Event type not handled",
            processedAt: FieldValue.serverTimestamp() 
        }, { merge: true });

    } catch (error: any) {
        console.error(`Error processing webhook event ${eventId}:`, error);
        await snapshot.ref.set({ 
            processingStatus: "failed", 
            processingError: error.message,
            processedAt: FieldValue.serverTimestamp() 
        }, { merge: true });
    }
});
