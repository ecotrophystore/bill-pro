import React, { useState, useEffect } from 'react';
import { X, Percent, IndianRupee } from 'lucide-react';

interface DiscountSelectorProps {
  discountPercent: number;
  onChange: (percent: number) => void;
  subtotal?: number;
}

const PRESET_DISCOUNTS = [0, 5, 10, 20, 30, 50];

export const DiscountSelector: React.FC<DiscountSelectorProps> = ({
  discountPercent,
  onChange,
  subtotal = 0,
}) => {
  const isPreset = PRESET_DISCOUNTS.includes(discountPercent);
  const [isCustom, setIsCustom] = useState(!isPreset && discountPercent > 0);
  const [mode, setMode] = useState<'percent' | 'flat'>('percent');
  const [customVal, setCustomVal] = useState<string>(
    discountPercent > 0 ? discountPercent.toString() : ''
  );

  // Sync custom input if external discountPercent changes to a non-preset value
  useEffect(() => {
    if (!PRESET_DISCOUNTS.includes(discountPercent)) {
      setIsCustom(true);
      if (mode === 'percent') {
        setCustomVal(discountPercent > 0 ? discountPercent.toString() : '');
      } else if (subtotal > 0) {
        const flatAmt = Math.round((subtotal * discountPercent) / 100);
        setCustomVal(flatAmt > 0 ? flatAmt.toString() : '');
      }
    } else if (!isCustom) {
      setCustomVal('');
    }
  }, [discountPercent, subtotal]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustom(true);
      setMode('percent');
      // If was 0, keep empty for user to type
      const current = discountPercent > 0 ? discountPercent.toString() : '';
      setCustomVal(current);
    } else {
      setIsCustom(false);
      onChange(parseFloat(val) || 0);
    }
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setCustomVal(raw);
    const parsed = parseFloat(raw);

    if (isNaN(parsed) || parsed <= 0) {
      onChange(0);
      return;
    }

    if (mode === 'percent') {
      const clamped = Math.min(100, Math.max(0, parsed));
      onChange(clamped);
    } else {
      // Flat Rupee Mode -> convert to %
      if (subtotal > 0) {
        const pct = Math.min(100, Math.max(0, (parsed / subtotal) * 100));
        // Round to 2 decimal places
        const roundedPct = Math.round(pct * 100) / 100;
        onChange(roundedPct);
      }
    }
  };

  const handleModeToggle = (newMode: 'percent' | 'flat') => {
    setMode(newMode);
    if (newMode === 'flat' && subtotal > 0) {
      const flat = Math.round((subtotal * discountPercent) / 100);
      setCustomVal(flat > 0 ? flat.toString() : '');
    } else {
      setCustomVal(discountPercent > 0 ? discountPercent.toString() : '');
    }
  };

  const handleReset = () => {
    setIsCustom(false);
    setCustomVal('');
    onChange(0);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <select
        className="neo-input text-xs py-1 px-2 w-28 font-medium cursor-pointer"
        value={isCustom ? 'custom' : discountPercent}
        onChange={handleSelectChange}
      >
        <option value={0}>None (0%)</option>
        <option value={5}>5%</option>
        <option value={10}>10%</option>
        <option value={20}>20%</option>
        <option value={30}>30%</option>
        <option value={50}>50%</option>
        <option value="custom">Customize...</option>
      </select>

      {isCustom && (
        <div className="flex items-center gap-1 p-1 bg-surface border border-shadow-darker/20 rounded-lg shadow-xs animate-fade-in">
          {/* Unit Toggle (% vs ₹) */}
          <div className="flex items-center bg-secondary/10 rounded p-0.5 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => handleModeToggle('percent')}
              className={`px-1.5 py-0.5 rounded transition-all ${
                mode === 'percent'
                  ? 'bg-primary text-white shadow-2xs'
                  : 'text-secondary hover:text-primary-dark'
              }`}
              title="Custom Percentage"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => handleModeToggle('flat')}
              className={`px-1.5 py-0.5 rounded transition-all ${
                mode === 'flat'
                  ? 'bg-primary text-white shadow-2xs'
                  : 'text-secondary hover:text-primary-dark'
              }`}
              title="Custom Amount in ₹"
            >
              ₹
            </button>
          </div>

          {/* Number Input */}
          <div className="relative">
            <input
              type="number"
              min="0"
              max={mode === 'percent' ? 100 : subtotal || undefined}
              step={mode === 'percent' ? '0.1' : '1'}
              placeholder={mode === 'percent' ? 'e.g. 7.5' : 'Amount'}
              value={customVal}
              onChange={handleCustomInputChange}
              className="neo-input text-xs py-0.5 px-1.5 w-20 text-right font-bold text-primary-dark"
              autoFocus
            />
          </div>

          {/* Clear button */}
          <button
            type="button"
            onClick={handleReset}
            className="p-1 text-secondary hover:text-error rounded hover:bg-secondary/10 transition-colors"
            title="Reset to 0%"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
};
