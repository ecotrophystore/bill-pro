import { db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import type { Customer, Invoice, Quotation, CashMemo, ProformaInvoice, Settings } from '../types';
import { downloadPDF } from '../utils/pdfGenerator';

export interface MetaConfig {
  phoneId: string;
  token: string;
  version: string;
}

export async function getMetaConfig(): Promise<MetaConfig> {
  let phoneId = '1263075550230396';
  let token = 'EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD';
  let version = 'v18.0';

  if (db) {
    try {
      const metaDoc = await getDoc(doc(db, 'meta_integrations', 'default'));
      if (metaDoc.exists()) {
        const data = metaDoc.data();
        if (data?.whatsappPhoneNumberId) phoneId = data.whatsappPhoneNumberId;
        if (data?.metaWhatsAppAccessToken || data?.accessToken) {
          token = data.metaWhatsAppAccessToken || data.accessToken;
        }
        if (data?.graphApiVersion) version = data.graphApiVersion;
      }
    } catch (e) {
      console.warn('Could not read meta_integrations/default:', e);
    }
  }

  return { phoneId, token, version };
}

export function formatIndianPhoneNumber(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export function generateDefaultShareMessage(
  docData: Invoice | Quotation | CashMemo | ProformaInvoice,
  customerName: string,
  docType: 'Invoice' | 'Quotation' | 'Cash Memo' | 'Proforma Invoice'
): string {
  const docNumber = (docData as any).number || (docData as any).quote_number || '';
  const total = Number((docData as any).grand_total || 0).toLocaleString('en-IN');
  const status = ((docData as any).payment_status || 'unpaid').toUpperCase();
  const balance = Number((docData as any).balance_amount ?? (docData as any).grand_total ?? 0);

  let statusText = `Status: ${status}`;
  if (status !== 'PAID' && balance > 0) {
    statusText += ` (Pending Balance: ₹${balance.toLocaleString('en-IN')})`;
  }

  return `Dear ${customerName || 'Valued Customer'},\n\nPlease find attached your ${docType} #${docNumber} from EcoTrophy.\n\n• Total Amount: ₹${total}\n• ${statusText}\n\nThank you for your business! If you have any questions, feel free to reply directly here.`;
}

export interface SendInbuiltWhatsAppResult {
  success: boolean;
  downloadUrl?: string;
  wamid?: string;
  conversationId?: string;
  error?: string;
}

export async function sendDocumentViaInbuiltWhatsApp(params: {
  docData: Invoice | Quotation | CashMemo | ProformaInvoice;
  customer: Customer | string;
  docType: 'Invoice' | 'Quotation' | 'Cash Memo' | 'Proforma Invoice';
  phone: string;
  messageText: string;
  settings?: Settings;
  existingBlob?: Blob;
}): Promise<SendInbuiltWhatsAppResult> {
  const { docData, customer, docType, phone, messageText, settings, existingBlob } = params;

  if (!db || !storage) {
    throw new Error('Firebase services are not initialized.');
  }

  const cleanPhone = formatIndianPhoneNumber(phone);
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error('Please enter a valid 10-digit WhatsApp phone number.');
  }

  const customerName = typeof customer === 'object' && customer !== null ? customer.name : customer || 'Customer';
  const docNumber = (docData as any).number || (docData as any).quote_number || 'DOC';
  const sanitizedDocNumber = docNumber.replace(/[^a-zA-Z0-9.-]/g, '_');
  const sanitizedCustomer = customerName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${docType.replace(/\s+/g, '_')}_${sanitizedDocNumber}_${sanitizedCustomer}.pdf`;

  // 1. Generate PDF Blob if not passed
  let blob: Blob;
  if (existingBlob) {
    blob = existingBlob;
  } else {
    const generated = await downloadPDF(docData, customer, docType, 'blob', settings);
    if (!generated || !(generated instanceof Blob)) {
      throw new Error('Could not generate PDF document.');
    }
    blob = generated;
  }

  // 2. Upload to Firebase Storage
  const storageRef = ref(storage, `shared_documents/${Date.now()}_${filename}`);
  const uploadSnap = await uploadBytes(storageRef, blob);
  const downloadUrl = await getDownloadURL(uploadSnap.ref);

  // 3. Dispatch via Meta Cloud API
  const { phoneId, token, version } = await getMetaConfig();

  const metaPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'document',
    document: {
      link: downloadUrl,
      filename: filename,
      caption: messageText ? messageText.slice(0, 1024) : undefined
    }
  };

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metaPayload)
  });

  const resJson = await response.json();
  if (resJson.error) {
    console.error('Meta WhatsApp API Error:', resJson.error);
    throw new Error(resJson.error.message || 'Meta Cloud WhatsApp API error');
  }

  const wamid = resJson.messages?.[0]?.id || `wamid_${Date.now()}`;

  // 4. Sync with In-app WhatsApp Database (conversations & messages)
  let convId = '';
  try {
    const leadId = (docData as any).lead_id || (docData as any).leadId || (typeof customer === 'object' ? (customer as any).id : null);
    
    // Find existing conversation with this phone
    const qConv = query(collection(db, 'conversations'), where('participantPhone', '==', cleanPhone));
    const snapConv = await getDocs(qConv);

    if (!snapConv.empty) {
      convId = snapConv.docs[0].id;
      await updateDoc(doc(db, 'conversations', convId), {
        lastMessage: `[You]: 📄 ${filename}`,
        lastMessageAt: serverTimestamp(),
        lastDirection: 'outbound',
        updated_at: serverTimestamp()
      });
    } else {
      const newConvRef = await addDoc(collection(db, 'conversations'), {
        participantPhone: cleanPhone,
        participantName: customerName,
        leadId: leadId || null,
        lastMessage: `[You]: 📄 ${filename}`,
        lastMessageAt: serverTimestamp(),
        lastDirection: 'outbound',
        unreadCount: 0,
        platform: 'whatsapp',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      convId = newConvRef.id;
    }

    // Add to messages collection
    await addDoc(collection(db, 'messages'), {
      conversationId: convId,
      leadId: leadId || null,
      senderPhone: cleanPhone,
      direction: 'outbound',
      type: 'document',
      content: messageText ? `${messageText}\n\n📄 ${filename}` : `📄 ${filename}`,
      mediaUrl: downloadUrl,
      metaMessageId: wamid,
      platform: 'whatsapp',
      triggeredBy: 'billing_share',
      created_at: serverTimestamp()
    });

    // Add activity log
    if (leadId) {
      await addDoc(collection(db, 'activities'), {
        lead_id: leadId,
        leadId: leadId,
        type: 'whatsapp_document_shared',
        title: `${docType} Shared via WhatsApp`,
        message: `Shared ${docType} #${docNumber} to +${cleanPhone}`,
        created_at: serverTimestamp()
      });
    }
  } catch (syncErr) {
    console.warn('Failed to sync in-app WhatsApp conversation records, but WhatsApp was dispatched:', syncErr);
  }

  return {
    success: true,
    downloadUrl,
    wamid,
    conversationId: convId
  };
}
