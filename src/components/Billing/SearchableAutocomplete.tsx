import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

interface Item {
  id: string;
  label: string;
  subLabel?: string;
}

interface SearchableAutocompleteProps {
  items: Item[];
  value: string;
  onSelect: (id: string, label: string) => void;
  onCustomChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export default function SearchableAutocomplete({
  items,
  value,
  onSelect,
  onCustomChange,
  placeholder = "Search...",
  label
}: SearchableAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredItems = items.filter(item => 
    item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.subLabel && item.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {label && <label className="text-sm font-semibold text-primary-dark px-1 mb-1 block">{label}</label>}
      <div 
        className={`neo-input flex items-center gap-2 cursor-text transition-all ${isOpen ? 'ring-2 ring-primary/20' : ''}`}
        onClick={() => setIsOpen(true)}
      >
        <Search size={16} className="text-secondary opacity-50" />
        <input
          type="text"
          className="bg-transparent border-none outline-none w-full p-0 text-primary-dark placeholder:text-secondary/50"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onCustomChange?.(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <ChevronDown size={16} className={`text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-surface neo-card p-1 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xl">
          {filteredItems.length > 0 ? (
            filteredItems.map(item => (
              <button
                key={item.id}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-shadow-darker/5 flex items-center justify-between group"
                onClick={() => {
                  onSelect(item.id, item.label);
                  setSearchTerm(item.label);
                  setIsOpen(false);
                }}
              >
                <div>
                  <div className="text-sm font-medium text-primary-dark group-hover:text-primary transition-colors">{item.label}</div>
                  {item.subLabel && <div className="text-xs text-secondary opacity-70">{item.subLabel}</div>}
                </div>
                {value === item.id && <Check size={14} className="text-primary" />}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-sm text-secondary text-center italic">
              {searchTerm ? "No matches found. Press Enter to use custom name." : "Start typing to search..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
