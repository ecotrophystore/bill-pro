import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, MessageCircle, AlertCircle, Check, CheckCheck, Paperclip, Image as ImageIcon, FileText, Mic, Play, FileIcon, Tag, Settings } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, doc, getDocs, getDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, functions, storage } from '../../lib/firebase';
import { useChatLabels } from '../../hooks/useChatLabels';
import { ManageLabelsModal } from '../WhatsAppAutomation/ManageLabelsModal';
import type { Lead } from '../../types';

interface PipelineQuickChatModalProps {
  lead: Lead;
  onClose: () => void;
}

export function PipelineQuickChatModal({ lead, onClose }: PipelineQuickChatModalProps) {
  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showLabelsMenu, setShowLabelsMenu] = useState(false);
  const [showManageLabels, setShowManageLabels] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { labels: dynamicChatLabels } = useChatLabels();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Fetch Conversation
  useEffect(() => {
    if (!db) return;
    
    // Find conversation linked to this lead or phone
    const fetchConv = async () => {
      try {
        let convDoc = null;

        // 1. Try by leadId
        const q1 = query(collection(db, 'conversations'), where('leadId', '==', lead.id));
        const snap1 = await getDocs(q1);
        if (!snap1.empty) {
          convDoc = snap1.docs[0];
        }

        // 2. Fallback: Try by phone number
        if (!convDoc && lead.phone) {
          const rawPhone = lead.phone.replace(/\D/g, '');
          const phoneWith91 = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
          
          const q2 = query(collection(db, 'conversations'), where('participantPhone', '==', phoneWith91));
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            convDoc = snap2.docs[0];
          }
        }

        if (convDoc) {
          setConversation({ id: convDoc.id, ...convDoc.data() });
        }
      } catch (err) {
        console.error('Error fetching conversation:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConv();
  }, [lead.id]);

  // Subscribe to Messages
  useEffect(() => {
    if (!db || !conversation?.id) return;
    
    let convMsgs: any[] = [];
    let phoneMsgs: any[] = [];

    const mergeAndSet = () => {
      const map = new Map<string, any>();
      [...convMsgs, ...phoneMsgs].forEach((m) => {
        if (!m) return;
        const key = m.metaMessageId || m.id;
        map.set(key, m);
      });
      const combined = Array.from(map.values());

      combined.sort((a, b) => {
        const getT = (item: any) => {
          const v = item.created_at || item.createdAt || item.timestamp;
          if (!v) return 0;
          return v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : new Date(v).getTime() || 0;
        };
        return getT(a) - getT(b);
      });

      setMessages(combined);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    // 1. Listen by conversationId
    const q1 = query(collection(db, 'messages'), where('conversationId', '==', conversation.id));
    const unsub1 = onSnapshot(q1, (snap) => {
      convMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mergeAndSet();
    });

    // 2. Listen by senderPhone
    const rawPhone = String(lead.phone || '').replace(/\D/g, '');
    let searchPhones: string[] = [];
    if (rawPhone.length >= 10) {
      const tenDigit = rawPhone.slice(-10);
      searchPhones = [rawPhone, tenDigit, `91${tenDigit}`, `+91${tenDigit}`];
    } else if (rawPhone.length > 0) {
      searchPhones = [rawPhone];
    }

    let unsub2 = () => {};
    if (searchPhones.length > 0) {
      const q2 = query(collection(db, 'messages'), where('senderPhone', 'in', searchPhones.slice(0, 10)));
      unsub2 = onSnapshot(q2, (snap) => {
        phoneMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        mergeAndSet();
      });
    }

    return () => {
      unsub1();
      unsub2();
    };
  }, [conversation?.id, lead.phone]);

  const handleSend = async () => {
    if (!inputText.trim() || !conversation?.id || !functions) return;
    setIsSending(true);
    await sendMessagePayload({ type: 'text', text: { body: inputText.trim() } }, inputText.trim());
    setInputText('');
    setIsSending(false);
  };

  const handleSendMedia = async (file: File, type: 'image' | 'document' | 'audio') => {
    if (!conversation?.id || !storage) return;
    setIsSending(true);
    setShowAttachmentMenu(false);
    
    try {
      // 1. Upload to Firebase Storage
      const fileRef = ref(storage, `chat_media/${lead.id}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      // 2. Build Payload
      let payload: any = { type };
      let previewText = `Sent ${type}`;
      
      if (type === 'image') {
        payload.image = { link: url };
        previewText = '📷 Image';
      } else if (type === 'document') {
        payload.document = { link: url, filename: file.name };
        previewText = `📄 ${file.name}`;
      } else if (type === 'audio') {
        payload.audio = { link: url };
        previewText = '🎵 Audio';
      }

      await sendMessagePayload(payload, previewText, url);
    } catch (err: any) {
      console.error('Failed to send media:', err);
      alert(`Error uploading/sending media: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const sendMessagePayload = async (messagePayload: any, textForDb: string, mediaUrl?: string) => {
    try {
      const cleanPhone = String(lead.phone || '').replace(/\D/g, '');
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      let sentViaFunction = false;

      // 1. Try secure backend Callable Function first (only works for text currently)
      if (messagePayload.type === 'text') {
        try {
          const sendWhatsAppMessage = httpsCallable(functions, 'sendWhatsAppChatMessage');
          await sendWhatsAppMessage({
            conversationId: conversation.id,
            leadId: lead.id,
            phone: finalPhone,
            message: textForDb
          });
          sentViaFunction = true;
        } catch (fnErr: any) {
          console.warn('Backend Cloud Function fallback to direct Meta Cloud API:', fnErr);
        }
      }

      // 2. Direct Meta Graph API fallback for text, or Primary for Media
      if (!sentViaFunction) {
        let phoneId = '1263075550230396';
        let token = 'EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD';
        let version = 'v18.0';

        if (db) {
          try {
            const metaDoc = await getDoc(doc(db, 'meta_integrations', 'default'));
            if (metaDoc.exists()) {
              const data = metaDoc.data();
              if (data?.whatsappPhoneNumberId) phoneId = data.whatsappPhoneNumberId;
              if (data?.metaWhatsAppAccessToken || data?.accessToken) token = data.metaWhatsAppAccessToken || data.accessToken;
              if (data?.graphApiVersion) version = data.graphApiVersion;
            }
          } catch (e) {
            console.warn('Could not read meta_integrations/default:', e);
          }
        }

        const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: finalPhone,
            ...messagePayload
          })
        });

        const resJson = await res.json();
        if (resJson.error) {
          throw new Error(resJson.error.message || 'Meta Cloud API error');
        }

        const wamid = resJson.messages?.[0]?.id || `out_${Date.now()}`;

        // Save to Firestore messages & update conversation doc
        if (db) {
          await addDoc(collection(db, 'messages'), {
            conversationId: conversation.id,
            leadId: lead.id,
            senderPhone: finalPhone,
            direction: 'outbound',
            type: messagePayload.type,
            content: textForDb,
            mediaUrl: mediaUrl || null,
            metaMessageId: wamid,
            platform: 'whatsapp',
            triggeredBy: 'pipeline_chat',
            created_at: serverTimestamp()
          });

          await updateDoc(doc(db, 'conversations', conversation.id), {
            lastMessage: `[You]: ${textForDb}`,
            lastMessageAt: serverTimestamp(),
            lastDirection: 'outbound',
            updated_at: serverTimestamp()
          });

          await addDoc(collection(db, 'activities'), {
            lead_id: lead.id,
            type: 'whatsapp_reply_sent',
            title: 'WhatsApp Quick Chat Sent',
            message: `Sent WhatsApp reply: "${textForDb.slice(0, 100)}"`,
            actor: 'Staff',
            created_at: serverTimestamp()
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      alert(`Error sending message: ${err.message}`);
    }
  };

  const handleToggleLabel = async (labelId: string) => {
    if (!conversation?.id || !db) return;
    
    const currentLabels = conversation.labels || [];
    const newLabels = currentLabels.includes(labelId)
      ? currentLabels.filter((id: string) => id !== labelId)
      : [...currentLabels, labelId];

    try {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        labels: newLabels,
        updated_at: serverTimestamp()
      });
      // The onSnapshot listener in useEffect will automatically update the conversation state
    } catch (err) {
      console.error('Failed to update labels:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="neo-card w-full max-w-lg bg-[#111b21] border border-slate-700/50 flex flex-col shadow-2xl rounded-2xl overflow-hidden h-[80vh]">
        
        {/* Header */}
        <div className="bg-[#202c33] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-transparent flex items-center justify-center text-xl font-bold">
              {lead.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight text-white">{lead.name}</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">{lead.organization || 'Lead'}</p>
              
              {conversation?.labels && conversation.labels.length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {conversation.labels.map((labelId: string) => {
                    const labelDef = dynamicChatLabels.find((l) => l.id === labelId);
                    if (!labelDef) return null;
                    return (
                      <span key={labelId} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${labelDef.colorClass}`}>
                        {labelDef.text}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Labels Menu */}
            {conversation && (
              <div className="relative">
                <button
                  onClick={() => setShowLabelsMenu(!showLabelsMenu)}
                  className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                    showLabelsMenu || (conversation.labels && conversation.labels.length > 0)
                      ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                      : 'hover:bg-transparent text-white/70 hover:text-white'
                  }`}
                  title="Toggle Chat Labels"
                >
                  <Tag size={16} />
                  <span className="hidden sm:inline">Labels</span>
                </button>

                {showLabelsMenu && (
                  <div className="absolute top-full right-0 mt-2 bg-[#2a3942] rounded-xl shadow-xl border border-slate-700 py-2 flex flex-col z-50 min-w-[200px]">
                    <div className="px-3 pb-2 mb-1 border-b border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Apply Labels
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto py-1 custom-sidebar-scrollbar">
                      {dynamicChatLabels.map((label) => {
                        const isActive = conversation.labels?.includes(label.id);
                        return (
                          <button
                            key={label.id}
                            onClick={() => handleToggleLabel(label.id)}
                            className="flex items-center justify-between px-3 py-1.5 hover:bg-transparent transition-colors text-left w-full"
                          >
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${label.colorClass}`}>
                              {label.text}
                            </span>
                            {isActive && <Check size={14} className="text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="border-t border-slate-700 mt-1 pt-1">
                      <button
                        onClick={() => { setShowLabelsMenu(false); setShowManageLabels(true); }}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-transparent transition-colors w-full text-left"
                      >
                        <Settings size={14} /> Manage Labels
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={onClose} className="p-2 hover:bg-transparent rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#0b141a] overflow-y-auto p-4 custom-sidebar-scrollbar relative" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', backgroundSize: '300px', opacity: 0.9 }}>
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 size={30} className="animate-spin text-[#008069]" />
            </div>
          ) : !conversation ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-transparent rounded-xl mx-auto max-w-sm mt-10 backdrop-blur-sm">
              <AlertCircle size={40} className="text-amber-500 mb-3" />
              <h4 className="font-bold text-slate-800 text-lg mb-2">No Chat Found</h4>
              <p className="text-slate-600 text-sm mb-4">
                This lead does not have an active WhatsApp conversation linked yet.
              </p>
              <p className="text-xs text-slate-400">
                To start a chat, they must message your WhatsApp business number first, or you can start a chat from the WhatsApp Command Center.
              </p>
            </div>
          ) : (
            <div className="flex flex-col space-y-3">
              {messages.map((msg) => {
                const isOutbound = msg.direction === 'outbound';
                return (
                  <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg p-2.5 shadow-sm text-sm ${isOutbound ? 'bg-[#005c4b] text-gray-100 rounded-tr-none' : 'bg-[#202c33] text-gray-100 rounded-tl-none'}`}>
                      {msg.type === 'image' && msg.mediaUrl ? (
                        <div className="mb-2 rounded-md overflow-hidden bg-black/20">
                          <img src={msg.mediaUrl} alt="Attachment" className="max-w-full max-h-64 object-contain" />
                        </div>
                      ) : msg.type === 'audio' && msg.mediaUrl ? (
                        <div className="mb-2">
                          <audio controls src={msg.mediaUrl} className="max-w-[200px] h-8" />
                        </div>
                      ) : msg.type === 'document' && msg.mediaUrl ? (
                        <div className="mb-2 p-3 bg-black/10 rounded-lg flex items-center gap-3">
                          <FileIcon size={24} className={isOutbound ? 'text-gray-100' : 'text-[#008069]'} />
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="underline font-medium hover:text-white truncate max-w-[150px]">
                            {msg.content || 'Document'}
                          </a>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{msg.content || msg.text || msg.body || msg.message}</div>
                      )}
                      <div className="text-[10px] text-gray-400 text-right mt-1.5 font-medium flex items-center justify-end gap-1">
                        {(() => {
                          const ts = msg.created_at || msg.createdAt || msg.timestamp;
                          if (!ts) return '';
                          const date = ts.toDate ? ts.toDate() : ts.toMillis ? new Date(ts.toMillis()) : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
                          if (isNaN(date.getTime())) return '';
                          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        })()}
                        {isOutbound && (
                          <span className="inline-flex items-center ml-0.5">
                            {msg.status === 'read' ? (
                              <CheckCheck size={14} className="text-[#53bdeb]" />
                            ) : msg.status === 'delivered' ? (
                              <CheckCheck size={14} className="text-gray-400" />
                            ) : (
                              <Check size={14} className="text-gray-400" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        {conversation && (
          <div className="bg-[#202c33] p-3 flex gap-2 shrink-0 items-center relative">
            <div className="relative">
              <button
                onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                className="w-10 h-10 rounded-full hover:bg-transparent text-gray-300 flex items-center justify-center transition-colors shrink-0"
                title="Attach"
              >
                <Paperclip size={20} />
              </button>

              {showAttachmentMenu && (
                <div className="absolute bottom-12 left-0 bg-[#2a3942] rounded-xl shadow-xl py-2 flex flex-col gap-1 z-50 min-w-[160px] border border-slate-700">
                  <button onClick={() => imageInputRef.current?.click()} className="flex items-center gap-3 px-4 py-2 hover:bg-transparent text-gray-200 transition-colors text-left w-full">
                    <ImageIcon size={18} className="text-blue-400" />
                    <span className="text-sm font-medium">Image</span>
                  </button>
                  <button onClick={() => docInputRef.current?.click()} className="flex items-center gap-3 px-4 py-2 hover:bg-transparent text-gray-200 transition-colors text-left w-full">
                    <FileText size={18} className="text-purple-400" />
                    <span className="text-sm font-medium">Document</span>
                  </button>
                  <button onClick={() => audioInputRef.current?.click()} className="flex items-center gap-3 px-4 py-2 hover:bg-transparent text-gray-200 transition-colors text-left w-full">
                    <Mic size={18} className="text-orange-400" />
                    <span className="text-sm font-medium">Voice Note</span>
                  </button>
                </div>
              )}
            </div>

            {/* Hidden File Inputs */}
            <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'image'); }} />
            <input type="file" ref={docInputRef} className="hidden" accept="application/pdf,.doc,.docx" onChange={(e) => { if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'document'); }} />
            <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={(e) => { if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'audio'); }} />

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 rounded-xl border-none outline-none px-4 py-2.5 text-sm resize-none bg-[#2a3942] text-gray-100 placeholder:text-gray-400 max-h-32"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isSending}
              className="w-10 h-10 rounded-full bg-[#008069] hover:bg-[#006e5a] text-white flex items-center justify-center transition-colors disabled:opacity-50 shrink-0"
            >
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-1" />}
            </button>
          </div>
        )}
      </div>
      {showManageLabels && (
        <ManageLabelsModal 
          labels={dynamicChatLabels} 
          onClose={() => setShowManageLabels(false)} 
        />
      )}
    </div>
  );
}


