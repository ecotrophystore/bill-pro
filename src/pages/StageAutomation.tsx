import React from 'react';
import PipelineSettingsTab from '../components/settings/PipelineSettingsTab';
import { Target, Sparkles } from 'lucide-react';

export default function StageAutomation() {
  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">CRM Settings</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
              Admin Config
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary-dark mt-1 flex items-center gap-2">
            Stage Automation <Sparkles className="text-amber-500" size={28} />
          </h1>
          <p className="text-secondary text-sm">
            Configure automated WhatsApp messages for stage transitions and customize pipeline rules.
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl shadow-sm border border-shadow-darker/10 p-2 sm:p-6 overflow-hidden">
        <PipelineSettingsTab />
      </div>
    </div>
  );
}
