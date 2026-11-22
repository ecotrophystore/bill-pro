import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface UnitSelectorProps {
  value?: string;
  onChange: (unit: string) => void;
  className?: string;
}

export const UNIT_GROUPS: { label: string; units: { value: string; label: string }[] }[] = [
  {
    label: 'Counts & Packaging',
    units: [
      { value: 'Pcs', label: 'Pcs (Pieces)' },
      { value: 'Nos', label: 'Nos (Numbers)' },
      { value: 'Set', label: 'Set' },
      { value: 'Pair', label: 'Pair' },
      { value: 'Box', label: 'Box' },
      { value: 'Pack', label: 'Pack' },
      { value: 'Dozen', label: 'Dozen' },
      { value: 'Unit', label: 'Unit' },
      { value: 'Roll', label: 'Roll' },
      { value: 'Sheet', label: 'Sheet' },
      { value: 'Bundle', label: 'Bundle' },
      { value: 'Bag', label: 'Bag' },
    ],
  },
  {
    label: 'Area & Length',
    units: [
      { value: 'Sq Ft', label: 'Sq Ft (Square Feet)' },
      { value: 'Ft', label: 'Ft (Feet)' },
      { value: 'Rft', label: 'Rft (Running Feet)' },
      { value: 'Sq Mtr', label: 'Sq Mtr (Square Meter)' },
      { value: 'Mtr', label: 'Mtr (Meter)' },
      { value: 'Sq In', label: 'Sq In (Square Inch)' },
      { value: 'In', label: 'In (Inch)' },
      { value: 'Cm', label: 'Cm (Centimeter)' },
      { value: 'Mm', label: 'Mm (Millimeter)' },
      { value: 'Yard', label: 'Yard' },
    ],
  },
  {
    label: 'Weight & Volume',
    units: [
      { value: 'Kg', label: 'Kg (Kilogram)' },
      { value: 'Gm', label: 'Gm (Gram)' },
      { value: 'Mg', label: 'Mg (Milligram)' },
      { value: 'Quintal', label: 'Quintal' },
      { value: 'Ton', label: 'Ton' },
      { value: 'Ltr', label: 'Ltr (Liter)' },
      { value: 'Ml', label: 'Ml (Milliliter)' },
    ],
  },
  {
    label: 'Time & Services',
    units: [
      { value: 'Hrs', label: 'Hrs (Hours)' },
      { value: 'Days', label: 'Days' },
      { value: 'Job', label: 'Job' },
    ],
  },
];

const ALL_PRESET_VALUES = new Set(UNIT_GROUPS.flatMap((g) => g.units.map((u) => u.value)));

export const UnitSelector: React.FC<UnitSelectorProps> = ({ value = 'Pcs', onChange, className = '' }) => {
  const current = value || 'Pcs';
  const isPreset = ALL_PRESET_VALUES.has(current);
  const [isCustom, setIsCustom] = useState(!isPreset);

  useEffect(() => {
    if (value && !ALL_PRESET_VALUES.has(value)) {
      setIsCustom(true);
    } else if (value && ALL_PRESET_VALUES.has(value)) {
      setIsCustom(false);
    }
  }, [value]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === '__custom__') {
      setIsCustom(true);
      onChange('');
    } else {
      setIsCustom(false);
      onChange(selected);
    }
  };

  if (isCustom) {
    return (
      <div className={`relative flex items-center ${className}`}>
        <input
          type="text"
          autoFocus
          className="neo-input w-full text-xs py-1 pl-2 pr-6 text-primary-dark font-semibold"
          placeholder="Custom unit"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            setIsCustom(false);
            onChange('Pcs');
          }}
          className="absolute right-1.5 text-secondary hover:text-primary-dark p-0.5 rounded"
          title="Back to unit presets"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <select
      aria-label="Unit metric"
      className={`neo-input w-full text-xs py-1 px-2 text-primary-dark font-semibold cursor-pointer ${className}`}
      value={current}
      onChange={handleSelectChange}
    >
      {UNIT_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.units.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </optgroup>
      ))}
      <option value="__custom__">Custom Unit...</option>
    </select>
  );
};

