import { db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

export const uploadDocumentForWhatsApp = async (
  blob: Blob,
  filename: string,
  customer: any
) => {
  let phone = '';
  if (typeof customer === 'object' && customer !== null) {
    phone = customer.whatsapp_number || customer.phone || '';
  }
  
  if (!phone) {
    phone = window.prompt("Customer phone number is missing. Please enter a valid 10-digit WhatsApp number (e.g. 9876543210):") || '';
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error("Invalid or missing phone number.");
  }
  const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  // 1. Upload to Firebase Storage
  const storageRef = ref(storage, `shared_documents/${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
  const snapshot = await uploadBytes(storageRef, blob);
  const downloadUrl = await getDownloadURL(snapshot.ref);

  return { success: true, phone: finalPhone, url: downloadUrl };
};
