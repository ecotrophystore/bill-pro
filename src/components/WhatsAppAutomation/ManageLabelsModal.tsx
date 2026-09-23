import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Check, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ChatLabelDef } from '../../constants/chatLabels';
import { LABEL_COLORS } from '../../constants/chatLabels';

interface ManageLabelsModalProps {
  onClose: () => void;
  labels: ChatLabelDef[];
}

export function ManageLabelsModal({ onClose, labels }: ManageLabelsModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ text: '', colorClass: LABEL_COLORS[0].class });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.text.trim() || !db) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'settings', 'chat_labels');
      
      let newLabels = [...labels];
      if (editingId) {
        newLabels = newLabels.map(l => l.id === editingId ? { ...l, text: formData.text, colorClass: formData.colorClass } : l);
      } else if (isCreating) {
        const newId = `label_${Date.now()}`;
        newLabels.push({ id: newId, text: formData.text, colorClass: formData.colorClass });
      }

      await updateDoc(docRef, { labels: newLabels });
      
      setEditingId(null);
      setIsCreating(false);
      setFormData({ text: '', colorClass: LABEL_COLORS[0].class });
    } catch (err: any) {
      console.error('Failed to save label:', err);
      alert('Error saving label: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!db || !window.confirm('Are you sure you want to delete this label? It will be removed from all chats.')) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'settings', 'chat_labels');
      const newLabels = labels.filter(l => l.id !== id);
      await updateDoc(docRef, { labels: newLabels });
    } catch (err: any) {
      console.error('Failed to delete label:', err);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (label: ChatLabelDef) => {
    setEditingId(label.id);
    setIsCreating(false);
    setFormData({ text: label.text, colorClass: label.colorClass });
  };

  const openCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setFormData({ text: '', colorClass: LABEL_COLORS[0].class });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-transparent border border-slate-200 w-full max-w-md shadow-2xl rounded-2xl overflow-hidden flex flex-col h-[70vh]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-transparent">
          <h3 className="font-bold text-slate-800 text-lg">Manage Chat Labels</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* List / Edit Area */}
        <div className="flex-1 overflow-y-auto p-5 custom-sidebar-scrollbar">
          
          {(isCreating || editingId) ? (
            <div className="bg-transparent p-4 rounded-xl border border-slate-200 mb-4 animate-fade-in">
              <h4 className="text-sm font-bold text-slate-700 mb-3">{isCreating ? 'Create New Label' : 'Edit Label'}</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Label Name</label>
                  <input
                    type="text"
                    value={formData.text}
                    onChange={(e) => setFormData({...formData, text: e.target.value})}
                    placeholder="e.g. 🎯 High Priority"
                    className="w-full bg-transparent border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-2 block">Color Theme</label>
                  <div className="grid grid-cols-4 gap-2">
                    {LABEL_COLORS.map(color => (
                      <button
                        key={color.id}
                        onClick={() => setFormData({...formData, colorClass: color.class})}
                        className={`h-8 rounded-lg border-2 flex items-center justify-center transition-all ${color.class} ${formData.colorClass === color.class ? 'border-current ring-2 ring-offset-1 ring-slate-400' : 'border-transparent'}`}
                        title={color.name}
                      >
                        {formData.colorClass === color.class && <Check size={14} className="opacity-80" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setIsCreating(false); setEditingId(null); }}
                    className="flex-1 py-2 text-sm font-semibold text-slate-600 bg-transparent border border-slate-300 rounded-lg hover:bg-transparent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !formData.text.trim()}
                    className="flex-1 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 size={16} className="animate-spin" />}
                    Save Label
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={openCreate}
              className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-semibold hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 mb-4"
            >
              <Plus size={18} /> Create New Label
            </button>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Existing Labels</h4>
            
            {labels.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-4">No labels defined.</div>
            ) : (
              labels.map(label => (
                <div key={label.id} className="flex items-center justify-between p-3 bg-transparent border border-slate-200 rounded-xl hover:shadow-sm transition-shadow">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md border ${label.colorClass}`}>
                    {label.text}
                  </span>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(label)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(label.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}



