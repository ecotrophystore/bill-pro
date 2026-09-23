import React, { useState } from 'react';
import { X, User, Phone, Send, Loader2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface NewChatModalProps {
  onClose: () => void;
  onChatCreated: (conversation: any) => void;
}

export function NewChatModal({ onClose, onChatCreated }: NewChatModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStartChat = async () => {
    if (!name.trim() || !phone.trim() || !db) return;
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const docRef = await addDoc(collection(db, 'conversations'), {
        participantName: name.trim(),
        participantPhone: cleanPhone,
        lastMessage: 'Chat initialized',
        lastMessageAt: serverTimestamp(),
        lastDirection: 'outbound',
        pipelineStage: 'new',
        unreadCount: 0,
        updated_at: serverTimestamp()
      });
      onChatCreated({ id: docRef.id, participantName: name.trim(), participantPhone: cleanPhone });
    } catch (err) {
      console.error('Error creating chat:', err);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="neo-card w-full max-w-sm bg-transparent flex flex-col p-5 shadow-2xl rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h3 className="font-bold text-slate-800 text-base">New Chat (Add Contact)</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:bg-transparent rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">Contact Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full neo-input py-2 pl-9 pr-3 text-sm"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">Phone Number (with Country Code)</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 919876543210"
                className="w-full neo-input py-2 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] p-3 rounded-lg leading-relaxed mt-2">
            <strong>Note:</strong> Meta requires you to send a pre-approved template message to start a conversation with a new contact.
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="neo-btn text-xs px-4 py-2 font-semibold">Cancel</button>
          <button 
            onClick={handleStartChat}
            disabled={!name.trim() || !phone.trim() || loading}
            className="neo-btn-primary text-xs px-4 py-2 font-semibold flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}


