import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Bot, CheckCircle2, AlertTriangle, XCircle, Send, Loader2, Sparkles, MessageSquare, Filter, RefreshCw, Eye, ThumbsUp, ShieldCheck, User, Phone, DollarSign, Calendar, MapPin, Package } from 'lucide-react';
import { db } from '../../lib/firebase';
import { processInboundWhatsAppMessage } from '../../lib/whatsappInboundProcessor';

const PERMANENT_TOKEN = "EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD";
const PHONE_NUMBER_ID = "1292217613971980";

export function WhatsAppAiInbox() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'Qualified' | 'Needs Follow-up' | 'Not Qualified' | 'review'>('all');
  
  // Simulation input for testing
  const [simPhone, setSimPhone] = useState('918148936699');
  const [simName, setSimName] = useState('Karthik Raja');
  const [simText, setSimText] = useState('Hi sir, enaku 50 pieces custom wooden trophy venum next month annual award ceremony ku. Budget around 30k. Possible ah?');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  // Reply approval state
  const [editableReply, setEditableReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyStatus, setReplyStatus] = useState('');

  // Audit log modal
  const [auditModalData, setAuditModalData] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'conversations'), orderBy('updated_at', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setConversations(docs);
      if (docs.length > 0 && !selectedConv) {
        setSelectedConv(docs[0]);
        setEditableReply(docs[0].ai_suggested_reply || '');
      }
      setLoading(false);
    }, (err) => {
      console.error('Error fetching conversations:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (selectedConv) {
      setEditableReply(selectedConv.ai_suggested_reply || '');
      setReplyStatus('');
    }
  }, [selectedConv?.id]);

  const handleSimulateInbound = async () => {
    if (!simText.trim()) return;
    setSimulating(true);
    setSimResult(null);
    try {
      const outcome = await processInboundWhatsAppMessage({
        senderPhone: simPhone.trim(),
        senderName: simName.trim(),
        messageText: simText.trim(),
        metaMessageId: `sim_${Date.now()}`,
      });
      setSimResult(outcome);
      setSimulating(false);
    } catch (err: any) {
      console.error('Simulation error:', err);
      alert('Failed to process message: ' + err.message);
      setSimulating(false);
    }
  };

  const handleApproveAndSendReply = async () => {
    if (!selectedConv || !editableReply.trim()) return;
    setSendingReply(true);
    setReplyStatus('');

    const phone = selectedConv.participantPhone;
    const cleanPhone = String(phone).replace(/\D/g, '');
    const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    try {
      // 1. Send via WhatsApp Cloud API
      const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERMANENT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: finalPhone,
          type: 'text',
          text: { body: editableReply.trim() }
        })
      });

      const resData = await res.json();
      if (resData.messages?.[0]?.id) {
        const msgId = resData.messages[0].id;
        
        // 2. Record outbound message
        if (db) {
          await addDoc(collection(db, 'messages'), {
            leadId: selectedConv.leadId,
            senderPhone: finalPhone,
            direction: 'outbound',
            type: 'text',
            content: editableReply.trim(),
            metaMessageId: msgId,
            platform: 'whatsapp',
            created_at: serverTimestamp(),
          });

          await updateDoc(doc(db, 'conversations', selectedConv.id), {
            lastMessage: `[You]: ${editableReply.trim()}`,
            lastMessageAt: serverTimestamp(),
            ai_suggested_reply: '', // Clear pending draft
            updated_at: serverTimestamp(),
          });

          await addDoc(collection(db, 'activities'), {
            lead_id: selectedConv.leadId,
            leadId: selectedConv.leadId,
            type: 'whatsapp_reply_sent',
            title: 'Human Approved WhatsApp Reply Sent',
            message: `Sent WhatsApp reply: "${editableReply.trim()}"`,
            actor: 'Sales Rep (Approved)',
            created_at: serverTimestamp(),
          });
        }

        setReplyStatus('✓ Reply approved & delivered to WhatsApp!');
      } else {
        throw new Error(resData.error?.message || 'Meta API delivery failed');
      }
    } catch (err: any) {
      console.error('Error sending approved reply:', err);
      setReplyStatus(`Error: ${err.message}`);
    } finally {
      setSendingReply(false);
    }
  };

  const filteredConversations = conversations.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'review') return c.ai_flag_for_review === true;
    return c.ai_qualification === filter;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="neo-card p-6 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
            <Sparkles size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary-dark">AI WhatsApp Lead Qualification Hub</h2>
            <p className="text-sm text-secondary">
              Real-time Tamil, Tanglish & English chat parsing, intelligent pipeline updates & approval controls.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
            <ShieldCheck size={14} /> Human Approval Mode: Active
          </span>
        </div>
      </div>

      {/* Simulator for Live Testing */}
      <div className="neo-card p-5 border border-primary/20 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-primary-dark flex items-center gap-2">
            <Bot size={18} className="text-primary" /> Live WhatsApp Chat Simulator
          </h3>
          <span className="text-xs text-secondary">Simulates inbound WhatsApp webhook message</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-secondary uppercase">Sender Phone</label>
            <input 
              value={simPhone} 
              onChange={e => setSimPhone(e.target.value)} 
              className="neo-input w-full text-sm mt-1" 
              placeholder="918148936699"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-secondary uppercase">Sender Name</label>
            <input 
              value={simName} 
              onChange={e => setSimName(e.target.value)} 
              className="neo-input w-full text-sm mt-1" 
              placeholder="Karthik Raja"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-secondary uppercase">Incoming WhatsApp Message (English / Tamil / Tanglish)</label>
          <textarea 
            value={simText} 
            onChange={e => setSimText(e.target.value)} 
            className="neo-input w-full text-sm mt-1 resize-none h-20" 
            placeholder="Type any message..."
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2 flex-wrap text-xs">
            <button 
              onClick={() => setSimText("Hi bro, enaku 50 custom wood trophies venum next month annual event ku. Budget around 30k. Possible ah?")}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-secondary"
            >
              Tanglish Lead Example
            </button>
            <button 
              onClick={() => setSimText("Payment GPay panniten sir, receipt anupunga")}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-secondary"
            >
              Payment Query Example
            </button>
            <button 
              onClick={() => setSimText("Earn 5000 daily from home click here")}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-secondary"
            >
              Spam Example
            </button>
          </div>
          <button 
            onClick={handleSimulateInbound}
            disabled={simulating || !simText.trim()}
            className="neo-btn-primary !px-5 !py-2 text-sm flex items-center gap-2 shrink-0"
          >
            {simulating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Analyze & Qualify
          </button>
        </div>

        {simResult && (
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2 animate-fade-in text-sm">
            <div className="flex items-center justify-between font-bold text-emerald-600">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={16} /> AI Analyzed & Pipeline Updated!</span>
              <span className="uppercase text-xs px-2 py-0.5 rounded bg-emerald-500/10">Stage: {simResult.pipelineStage}</span>
            </div>
            <p className="text-xs text-primary-dark"><strong>Decision:</strong> {simResult.aiAnalysis.qualification_reason}</p>
            <button 
              onClick={() => setAuditModalData(simResult.aiAnalysis.internal_audit_log)}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <Eye size={12} /> View Full Structured Audit Log
            </button>
          </div>
        )}
      </div>

      {/* Main Inbox & Review View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
        {/* Left: Conversations Feed */}
        <div className="lg:col-span-5 neo-card p-4 flex flex-col space-y-3">
          <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
            <h3 className="font-bold text-primary-dark flex items-center gap-2">
              <MessageSquare size={16} /> WhatsApp Leads ({filteredConversations.length})
            </h3>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setFilter('all')} 
                className={`px-2 py-1 rounded text-xs font-bold ${filter === 'all' ? 'bg-primary text-white' : 'text-secondary hover:bg-slate-100'}`}
              >
                All
              </button>
              <button 
                onClick={() => setFilter('Qualified')} 
                className={`px-2 py-1 rounded text-xs font-bold ${filter === 'Qualified' ? 'bg-emerald-500 text-white' : 'text-secondary hover:bg-slate-100'}`}
              >
                Qualified
              </button>
              <button 
                onClick={() => setFilter('review')} 
                className={`px-2 py-1 rounded text-xs font-bold ${filter === 'review' ? 'bg-amber-500 text-white' : 'text-secondary hover:bg-slate-100'}`}
              >
                Needs Review
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-20 flex items-center justify-center text-secondary">
              <Loader2 className="animate-spin mr-2" size={18} /> Loading conversations...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-20 text-center text-secondary text-sm">
              No conversations found in this filter.
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-[500px] pr-1">
              {filteredConversations.map((c) => {
                const isSelected = selectedConv?.id === c.id;
                const status = c.ai_qualification || 'Needs Follow-up';
                const statusColor = 
                  status === 'Qualified' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                  status === 'Not Qualified' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                  'bg-amber-500/10 text-amber-600 border-amber-500/20';

                return (
                  <div 
                    key={c.id}
                    onClick={() => setSelectedConv(c)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-primary/5 border-primary shadow-sm' 
                        : 'bg-white hover:bg-slate-50 border-shadow-darker/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm text-primary-dark truncate">
                        {c.participantName || `+${c.participantPhone}`}
                      </div>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
                        {status}
                      </span>
                    </div>
                    <div className="text-xs text-secondary mt-1 line-clamp-2">
                      {c.lastMessage || 'No message content'}
                    </div>
                    {c.ai_classification && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                          {c.ai_classification.replace(/_/g, ' ')}
                        </span>
                        {c.ai_flag_for_review && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold flex items-center gap-0.5">
                            <AlertTriangle size={10} /> Review Needed
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Selected Lead Analysis & Reply Approver */}
        <div className="lg:col-span-7 neo-card p-5 flex flex-col justify-between space-y-4">
          {selectedConv ? (
            <>
              {/* Header */}
              <div className="border-b border-shadow-darker/10 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-primary-dark">
                      {selectedConv.participantName || 'WhatsApp Contact'}
                    </h3>
                    <p className="text-xs text-secondary flex items-center gap-1 mt-0.5">
                      <Phone size={12} /> +{selectedConv.participantPhone}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${
                      selectedConv.ai_qualification === 'Qualified' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                      selectedConv.ai_qualification === 'Not Qualified' ? 'bg-rose-500/10 text-rose-600 border-rose-500/30' :
                      'bg-amber-500/10 text-amber-600 border-amber-500/30'
                    }`}>
                      {selectedConv.ai_qualification || 'Needs Follow-up'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Message Received Box */}
              <div className="bg-slate-50 border border-shadow-darker/10 p-3 rounded-xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Incoming Message</div>
                <div className="text-sm text-primary-dark whitespace-pre-wrap">{selectedConv.lastMessage}</div>
              </div>

              {/* Proposed AI Reply Box (Awaiting Human Approval) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-primary-dark flex items-center gap-1.5">
                    <Sparkles size={14} className="text-emerald-500" /> Proposed AI Reply Draft (Human Approval Required)
                  </label>
                  <span className="text-[10px] text-secondary">Will not send until approved</span>
                </div>
                <textarea 
                  value={editableReply}
                  onChange={e => setEditableReply(e.target.value)}
                  className="neo-input w-full text-sm resize-none h-24 font-sans"
                  placeholder="AI draft reply will appear here..."
                />
                
                {replyStatus && (
                  <div className={`text-xs font-bold p-2.5 rounded-lg ${
                    replyStatus.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                  }`}>
                    {replyStatus}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button 
                    onClick={handleApproveAndSendReply}
                    disabled={sendingReply || !editableReply.trim()}
                    className="neo-btn-primary !px-5 !py-2 text-sm flex items-center gap-2"
                  >
                    {sendingReply ? <Loader2 size={16} className="animate-spin" /> : <ThumbsUp size={16} />}
                    Approve & Send via WhatsApp
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-secondary text-sm">
              Select a conversation on the left to view details and approve replies.
            </div>
          )}
        </div>
      </div>

      {/* Structured Audit Log Modal */}
      {auditModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-shadow-darker/50 backdrop-blur-sm animate-fade-in">
          <div className="neo-card w-full max-w-lg bg-surface flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <h3 className="font-bold text-primary-dark flex items-center gap-2">
                <Sparkles size={18} className="text-primary" /> Internal Qualification Audit Log
              </h3>
              <button onClick={() => setAuditModalData(null)} className="text-secondary hover:text-primary-dark">
                &times;
              </button>
            </div>
            <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
              {auditModalData}
            </pre>
            <div className="flex justify-end">
              <button onClick={() => setAuditModalData(null)} className="neo-btn px-4 py-1.5 text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
