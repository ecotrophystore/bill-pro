import React from 'react';
import { Sparkles, ArrowRight, X, AlertCircle } from 'lucide-react';
import type { Lead, Pipeline } from '../../types';

interface PipelineReassignBannerProps {
  currentPipelineName: string;
  recommendedPipeline: { id: string; name: string; reason: string } | null;
  onConfirmReassign: (targetPipelineId: string) => void;
  onDismiss: () => void;
}

export function PipelineReassignBanner({
  currentPipelineName,
  recommendedPipeline,
  onConfirmReassign,
  onDismiss,
}: PipelineReassignBannerProps) {
  if (!recommendedPipeline) return null;

  return (
    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-teal-500/10 border border-emerald-500/30 shadow-sm flex items-center justify-between gap-4 animate-fade-in flex-wrap">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-emerald-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
          <Sparkles size={16} />
        </div>
        <div className="text-xs">
          <div className="font-bold text-primary-dark flex items-center gap-1.5">
            <span>Pipeline Reassignment Recommendation</span>
            <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Automatic Rule
            </span>
          </div>
          <p className="text-secondary mt-0.5 leading-relaxed">
            {recommendedPipeline.reason} (Current: <strong>{currentPipelineName}</strong> ➔ Recommended:{' '}
            <strong className="text-emerald-700">{recommendedPipeline.name}</strong>)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-shadow-darker/10 text-secondary hover:text-primary-dark hover:bg-transparent transition-colors"
        >
          Keep Current Pipeline
        </button>

        <button
          type="button"
          onClick={() => onConfirmReassign(recommendedPipeline.id)}
          className="text-xs font-bold px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all flex items-center gap-1.5"
        >
          Move to {recommendedPipeline.name} <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

