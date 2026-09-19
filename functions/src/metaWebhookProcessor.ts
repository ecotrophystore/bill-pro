import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { graphGet } from "./meta/graphApi.js";
import { db } from "./config.js";
import { extractMetaRequirements } from "./utils/metaRequirementExtractor.js";
import { classifyLeadPipeline } from "./utils/pipelineClassifier.js";
import type { PipelineRule } from "./utils/types.js";
const fbToken = defineSecret("META_FACEBOOK_SYSTEM_USER_TOKEN");

export async function processWebhookPayload(eventId: string, data: any) {
    if (data.processingStatus !== "pending") return; // Already processed or processing

    const { payloadSummary, platform, eventType } = data;

    try {
        // Mark as processing
        await db.collection("meta_webhook_events").doc(eventId).set({ processingStatus: "processing" }, { merge: true });

        const entry = payloadSummary.entry;
        if (!entry || !entry.changes || entry.changes.length === 0) {
            await db.collection("meta_webhook_events").doc(eventId).set({ 
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
            const businessPhoneId = value.metadata?.phone_number_id || "1263075550230396";
            const businessDisplayPhone = value.metadata?.display_phone_number || "919344309369";

            // Prevent duplicate processing based on messageId
            const existingMsgDocs = await db.collection("messages").where("metaMessageId", "==", messageId).limit(1).get();
            if (!existingMsgDocs.empty) {
                await db.collection("meta_webhook_events").doc(eventId).set({ 
                    processingStatus: "completed", 
                    note: "Duplicate message ignored",
                    processedAt: FieldValue.serverTimestamp() 
                }, { merge: true });
                return;
            }

            // Extract message text
            let textBody = "Unsupported message type";
            if (message.type === "text") textBody = message.text.body;
            else textBody = `[${message.type} message]`;

            // Dynamically resolve the correct pipeline ID and first stage from Firestore
            const pipelinesSnap = await db.collection("pipelines").get();
            const allPipelines = pipelinesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            
            const rulesSnap = await db.collection("pipeline_rules").get();
            const allRules = rulesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)) as PipelineRule[];

            // Check if existing customer (for repeat customer logic)
            const cleanPhoneDigits = senderPhone.replace(/\D/g, "");
            const searchPhones = [...new Set([senderPhone, cleanPhoneDigits, cleanPhoneDigits.replace(/^91/, "")].filter(Boolean))];
            const leadsQuery = await db.collection("leads").where("phone", "in", searchPhones).limit(1).get();
            const isRepeat = !leadsQuery.empty;

            // Extract requirements from text
            const requirements = extractMetaRequirements(textBody);
            
            // Build the lead snapshot for classification
            const leadSnapshot: any = {
                is_repeat_customer: isRepeat,
                source: "WhatsApp"
            };
            if (requirements.required_quantity) leadSnapshot.required_quantity = requirements.required_quantity;
            if (requirements.urgency) leadSnapshot.urgency = requirements.urgency;
            if (requirements.customer_type) leadSnapshot.customer_type = requirements.customer_type;
            if (requirements.location) leadSnapshot.location = requirements.location;

            const classification = classifyLeadPipeline(leadSnapshot, allRules, allPipelines);
            const pipelineId = classification.pipeline_id;
            
            // Prevent duplicate rule mismatch if pipeline is hardcoded
            const defaultPipelines: any[] = [
                { id: "small_order", stages: [{ id: "new_enquiry" }] },
                { id: "regular_order", stages: [{ id: "new_enquiry" }] },
                { id: "bulk_order", stages: [{ id: "new_enquiry" }] },
                { id: "unclassified", stages: [{ id: "new_enquiry" }] }
            ];
            
            // Get the pipeline object to find the first stage
            const targetPipeline = allPipelines.find(p => p.id === pipelineId) || defaultPipelines.find(p => p.id === pipelineId) || allPipelines[0];
            const firstStageId = targetPipeline?.stages?.[0]?.id || "new_enquiry";

            let leadId = "";
            let conversationId = "";
            
            if (!isRepeat) {
                // Create Lead
                const newLeadRef = db.collection("leads").doc();
                leadId = newLeadRef.id;
                
                // Prioritize name explicitly mentioned in the text message
                const extractedName = requirements.customer_name;
                const profileName = contact?.profile?.name;
                const leadName = extractedName || profileName || (cleanPhoneDigits ? `Lead +${cleanPhoneDigits}` : senderPhone);
                
                const newLeadData: any = {
                    id: leadId,
                    name: leadName,
                    phone: senderPhone,
                    whatsapp_business_phone_id: businessPhoneId,
                    whatsapp_business_phone: businessDisplayPhone,
                    source: "WhatsApp",
                    platform: "meta",
                    pipeline_id: pipelineId,
                    status: firstStageId,
                    last_message: textBody,
                    last_message_channel: "whatsapp",
                    createdAt: FieldValue.serverTimestamp(),
                    created_at: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    updated_at: FieldValue.serverTimestamp(),
                    customer_lifecycle: "new_customer",
                    stage_history: [
                        {
                            from_stage: "Initial Ingest",
                            to_stage: targetPipeline?.stages?.[0]?.label || "New",
                            changed_by: "system_meta_inbound",
                            changed_by_name: "WhatsApp Auto-Capture",
                            changed_at: new Date(),
                            note: `WhatsApp message received: "${textBody}". Assigned to pipeline "${targetPipeline?.name || pipelineId}" via rules (${classification.matched_rule_name}).`
                        }
                    ],
                    notification_history: [],
                    notifications_sent: {}
                };

                // Add extracted requirements
                if (requirements.required_quantity) newLeadData.required_quantity = requirements.required_quantity;
                if (requirements.event_name) newLeadData.event_name = requirements.event_name;
                if (requirements.event_type) newLeadData.event_type = requirements.event_type;
                if (requirements.event_date) newLeadData.event_date = requirements.event_date;
                if (requirements.delivery_date) newLeadData.delivery_date = requirements.delivery_date;
                if (requirements.trophy_type) newLeadData.trophy_type = requirements.trophy_type;
                if (requirements.trophy_size) newLeadData.trophy_size = requirements.trophy_size;
                if (requirements.budget) newLeadData.budget = requirements.budget;
                if (requirements.value) newLeadData.value = requirements.value;
                if (requirements.email) newLeadData.email = requirements.email;
                if (requirements.notes) newLeadData.reason = requirements.notes;
                if (requirements.organization) newLeadData.company = requirements.organization;
                if (requirements.customer_type) newLeadData.customer_type = requirements.customer_type;
                if (requirements.urgency) newLeadData.urgency = requirements.urgency;
                if (requirements.location) newLeadData.location = requirements.location;

                await newLeadRef.set(newLeadData);
                
                // Create in-app notification
                await db.collection("notifications").add({
                    title: `New Lead: ${leadName}`,
                    message: `Assigned to: ${targetPipeline?.name || pipelineId}`,
                    type: "lead",
                    link: `/leads/${leadId}`,
                    is_read: false,
                    created_at: FieldValue.serverTimestamp()
                });

                // Create corresponding Customer record
                const newCustomerRef = db.collection("customers").doc();
                await newCustomerRef.set({
                    id: newCustomerRef.id,
                    name: leadName,
                    phone: senderPhone,
                    whatsapp_number: senderPhone,
                    email: requirements.email || "",
                    company: requirements.organization || "",
                    location: requirements.location || "",
                    type: requirements.customer_type === "Corporate" ? "business" : "individual",
                    customer_type: "new",
                    total_enquiries_count: 1,
                    notes: "Created automatically from WhatsApp inbound message",
                    created_at: FieldValue.serverTimestamp()
                });
            } else {
                const leadDoc = leadsQuery.docs[0];
                if (leadDoc) {
                    leadId = leadDoc.id;
                    const existingData = leadDoc.data();
                    
                    // We only want to move an existing lead's pipeline if:
                    // 1. The new message explicitly specifies a quantity/requirement, AND
                    // 2. The existing lead is currently in 'unclassified' (meaning it's finally getting classified)
                    // OR if the lead is already closed/won/lost (so they are starting a new journey).
                    const isClosed = existingData.status === "won" || existingData.status === "lost" || existingData.status === "completed" || existingData.status === "lost_cancelled";
                    const isCurrentlyUnclassified = existingData.pipeline_id === "unclassified";
                    const hasNewClassification = pipelineId !== "unclassified";
                    
                    const shouldMovePipeline = isClosed || (isCurrentlyUnclassified && hasNewClassification);
                    
                    const updates: any = {
                        last_message: textBody,
                        last_message_channel: "whatsapp",
                        whatsapp_business_phone_id: businessPhoneId,
                        whatsapp_business_phone: businessDisplayPhone,
                        updatedAt: FieldValue.serverTimestamp(),
                        updated_at: FieldValue.serverTimestamp(),
                        customer_lifecycle: "existing_customer",
                        is_repeat_customer: true,
                    };
                    
                    if (shouldMovePipeline) {
                        updates.pipeline_id = pipelineId;
                        updates.status = firstStageId;
                    }
                    
                    if (requirements.customer_name && (!existingData.name || existingData.name.startsWith("Lead +") || existingData.name.toLowerCase().includes("event"))) updates.name = requirements.customer_name;
                    if (requirements.organization && !existingData.company) updates.company = requirements.organization;
                    if (requirements.email && !existingData.email) updates.email = requirements.email;
                    if (requirements.budget && !existingData.budget) updates.budget = requirements.budget;
                    if (requirements.value && !existingData.value) updates.value = requirements.value;
                    if (requirements.location && !existingData.location) updates.location = requirements.location;
                    if (requirements.required_quantity && !existingData.required_quantity) updates.required_quantity = requirements.required_quantity;
                    if (requirements.event_name && !existingData.event_name) updates.event_name = requirements.event_name;
                    if (requirements.event_type && !existingData.event_type) updates.event_type = requirements.event_type;
                    if (requirements.delivery_date && !existingData.delivery_date) updates.delivery_date = requirements.delivery_date;
                    if (requirements.urgency) updates.urgency = requirements.urgency;

                    await leadDoc.ref.update(updates);
                    
                    // Log pipeline change if it moved
                    if (existingData.pipeline_id !== pipelineId || existingData.status !== firstStageId) {
                        const historyArray = existingData.stage_history || [];
                        historyArray.push({
                            from_stage: existingData.status || "Unknown",
                            to_stage: targetPipeline?.stages?.[0]?.label || "New",
                            changed_by: "system_meta_inbound",
                            changed_by_name: "WhatsApp Auto-Capture",
                            changed_at: new Date(),
                            note: `Repeat customer mapped to pipeline "${targetPipeline?.name || pipelineId}" via rules (${classification.matched_rule_name}).`
                        });
                        await leadDoc.ref.update({ stage_history: historyArray });
                    }
                    
                    // Create in-app notification for repeat customer message
                    await db.collection("notifications").add({
                        title: `New Message: ${existingData.name || 'Existing Lead'}`,
                        message: `Pipeline: ${existingData.pipeline_id !== pipelineId && shouldMovePipeline ? (targetPipeline?.name || pipelineId) : (existingData.pipeline_id || 'Unknown')}`,
                        type: "lead",
                        link: `/leads/${leadId}`,
                        is_read: false,
                        created_at: FieldValue.serverTimestamp()
                    });
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
                    participantName: contact?.profile?.name || (cleanPhoneDigits ? `+${cleanPhoneDigits}` : senderPhone),
                    lastMessage: textBody,
                    lastMessageAt: FieldValue.serverTimestamp(),
                    lastDirection: "inbound",
                    createdAt: FieldValue.serverTimestamp(),
                    created_at: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    updated_at: FieldValue.serverTimestamp(),
                    lastCustomerReplyAt: FieldValue.serverTimestamp()
                });
            } else {
                const convDoc = convQuery.docs[0];
                if (convDoc) {
                    conversationId = convDoc.id;
                    await convDoc.ref.update({ 
                        lastMessage: textBody,
                        lastMessageAt: FieldValue.serverTimestamp(),
                        lastDirection: "inbound",
                        updatedAt: FieldValue.serverTimestamp(),
                        updated_at: FieldValue.serverTimestamp(),
                        lastCustomerReplyAt: FieldValue.serverTimestamp()
                    });
                }
            }

            // Save Message
            const newMsgRef = db.collection("messages").doc();
            await newMsgRef.set({
                id: newMsgRef.id,
                conversationId,
                leadId,
                senderPhone,
                from: senderPhone,
                direction: "inbound",
                type: message.type,
                content: textBody,
                status: "delivered", // For inbound it's delivered to us
                metaMessageId: messageId,
                platform: "whatsapp",
                timestamp: FieldValue.serverTimestamp(),
                created_at: FieldValue.serverTimestamp()
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

            await db.collection('meta_webhook_events').doc(eventId).set({ 
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

            await db.collection('meta_webhook_events').doc(eventId).set({ 
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
                await db.collection('meta_webhook_events').doc(eventId).set({ processingStatus: "completed", note: "Duplicate leadgen ignored", processedAt: FieldValue.serverTimestamp() }, { merge: true });
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
            
            // Map fields - handle all phone field variations
            const fields: Record<string, string> = {};
            leadData.field_data?.forEach((f: any) => {
                const key = (f.name || "").toLowerCase().trim();
                fields[key] = f.values?.[0] || "";
                fields[f.name] = f.values?.[0] || ""; // also keep original key
            });

            const email = fields.email || "";
            // Normalize phone: handle phone_number, phone, mobile_number, mobile, whatsapp_number
            const rawPhone = fields.phone_number || fields.phone || fields.mobile_number || fields.mobile || fields.whatsapp_number || "";
            const phone = rawPhone.replace(/\D/g, "").slice(-10);
            const name = fields.full_name || fields["full name"] || fields.first_name || "Facebook Lead";
            const location = fields.location || fields.city || fields.address || "";
            const required_quantity = fields.required_quantity || fields["require quantity"] || fields.quantity || "";
            const event_date = fields.event_date || fields["event date"] || "";
            const delivery_date = fields.delivery_date || fields["delivery date"] || fields["when the delivery want"] || fields.when_the_delivery_want || "";

            const newLeadRef = db.collection("leads").doc();
            const leadId = newLeadRef.id;

            const newLeadData: Record<string, any> = {
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
            };
            if (location) newLeadData.location = location;
            if (required_quantity) newLeadData.required_quantity = required_quantity;
            if (event_date) newLeadData.event_date = event_date;
            if (delivery_date) newLeadData.delivery_date = delivery_date;

            await newLeadRef.set(newLeadData);
            
            // Create in-app notification
            await db.collection("notifications").add({
                title: `New Lead: ${name}`,
                message: `From Facebook Lead Ads. Assigned to Default Pipeline.`,
                type: "lead",
                link: `/leads/${leadId}`,
                is_read: false,
                created_at: FieldValue.serverTimestamp()
            });

            // Create corresponding Customer record
            const newCustomerRef = db.collection("customers").doc();
            await newCustomerRef.set({
                id: newCustomerRef.id,
                name,
                phone,
                email,
                location,
                type: "individual",
                notes: `Created automatically from Facebook Lead Ads (Form: ${formId})`,
                created_at: FieldValue.serverTimestamp()
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

            await db.collection('meta_webhook_events').doc(eventId).set({ processingStatus: "completed", relatedLeadId: leadId, processedAt: FieldValue.serverTimestamp() }, { merge: true });
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
                await db.collection('meta_webhook_events').doc(eventId).set({ processingStatus: "completed", note: "Not a valid message event", processedAt: FieldValue.serverTimestamp() }, { merge: true });
                return;
            }

            const existingMsgDocs = await db.collection("messages").where("metaMessageId", "==", messageId).limit(1).get();
            if (!existingMsgDocs.empty) {
                await db.collection('meta_webhook_events').doc(eventId).set({ processingStatus: "completed", note: "Duplicate message ignored", processedAt: FieldValue.serverTimestamp() }, { merge: true });
                return;
            }

            let leadId = "";
            let conversationId = "";
            
            // Search for existing lead with this sender ID
            const leadsQuery = await db.collection("leads").where("metaSenderId", "==", senderId).where("platform", "==", platform).limit(1).get();
            if (leadsQuery.empty) {
                const newLeadRef = db.collection("leads").doc();
                leadId = newLeadRef.id;
                const leadName = `${platform === 'instagram' ? 'Instagram' : 'Facebook'} User (${senderId})`;
                await newLeadRef.set({
                    id: leadId,
                    name: leadName,
                    metaSenderId: senderId,
                    platform,
                    source: `${platform}_inbound`,
                    status: "new",
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
                
                // Create in-app notification
                await db.collection("notifications").add({
                    title: `New Lead: ${leadName}`,
                    message: `From ${platform === 'instagram' ? 'Instagram' : 'Facebook'} Direct Message. Assigned to Default Pipeline.`,
                    type: "lead",
                    link: `/leads/${leadId}`,
                    is_read: false,
                    created_at: FieldValue.serverTimestamp()
                });

                // Create corresponding Customer record
                const newCustomerRef = db.collection("customers").doc();
                await newCustomerRef.set({
                    id: newCustomerRef.id,
                    name: leadName,
                    phone: "",
                    email: "",
                    type: "individual",
                    notes: `Created automatically from ${platform === 'instagram' ? 'Instagram' : 'Facebook'} DM message`,
                    created_at: FieldValue.serverTimestamp()
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

            await db.collection('meta_webhook_events').doc(eventId).set({ 
                processingStatus: "completed", 
                relatedConversationId: conversationId,
                relatedLeadId: leadId,
                relatedMessageId: newMsgRef.id,
                processedAt: FieldValue.serverTimestamp() 
            }, { merge: true });

            return;
        }

        // Ignored event type
        await db.collection("meta_webhook_events").doc(eventId).set({ 
            processingStatus: "ignored", 
            note: "Event type not handled",
            processedAt: FieldValue.serverTimestamp() 
        }, { merge: true });

    } catch (error: any) {
        console.error(`Error processing webhook event ${eventId}:`, error);
        await db.collection("meta_webhook_events").doc(eventId).set({ 
            processingStatus: "failed", 
            processingError: error.message,
            processedAt: FieldValue.serverTimestamp() 
        }, { merge: true });
    }
}
