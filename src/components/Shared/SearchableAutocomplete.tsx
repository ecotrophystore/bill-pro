import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface Option {
  id: string;
  label: string;
  sublabel?: string;
  data?: any;
}

interface SearchableAutocompleteProps {
  value: string;
  options: Option[];
  onSelect: (option: Option | null, customText?: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  isNewAllowed?: boolean;
}

export default function SearchableAutocomplete({
  value,
  options,
  onSelect,
  placeholder,
  className,
  label,
  isNewAllowed = true
}: SearchableAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (opt.sublabel && opt.sublabel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const exactMatch = options.find(opt => opt.label.toLowerCase() === searchTerm.toLowerCase());

  const handleSelect = (option: Option | null, customText?: string) => {
    onSelect(option, customText);
    setIsOpen(false);
    if (option) setSearchTerm(option.label);
    else if (customText) setSearchTerm(customText);
  };

  return (
    <div className={clsx("relative space-y-1 w-full", className)} ref={wrapperRef}>
      {label && <label className="text-sm font-semibold text-primary-dark px-1">{label}</label>}
      <div 
        className={clsx(
          "neo-input flex items-center gap-2 group transition-all duration-200",
          isOpen && "ring-2 ring-primary/20 bg-white"
        )}
      >
        <Search size={18} className="text-secondary group-focus-within:text-primary transition-colors" />
        <input
          type="text"
          className="bg-transparent border-none outline-none w-full text-primary-dark placeholder:text-secondary/50"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
            if (isNewAllowed && !options.find(o => o.label === e.target.value)) {
                onSelect(null, e.target.value);
            }
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - (exactMatch ? 0 : 1)));
              setIsOpen(true);
            } else if (e.key === 'ArrowUp') {
              setHighlightedIndex(prev => Math.max(prev - 1, -1));
            } else if (e.key === 'Enter') {
              if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                handleSelect(filteredOptions[highlightedIndex]);
              } else if (isNewAllowed && searchTerm && !exactMatch) {
                handleSelect(null, searchTerm);
              }
            } else if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
        />
        <ChevronDown 
          size={18} 
          className={clsx("text-secondary cursor-pointer transition-transform", isOpen && "rotate-180")} 
          onClick={() => setIsOpen(!isOpen)}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-surface neo-card !p-1 shadow-2xl max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => (
              <div
                key={opt.id}
                className={clsx(
                  "px-4 py-3 cursor-pointer rounded-lg transition-all flex items-center justify-between group",
                  idx === highlightedIndex ? "bg-primary/10 text-primary" : "hover:bg-shadow-darker/5"
                )}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                <div>
                  <div className="font-medium text-primary-dark">{opt.label}</div>
                  {opt.sublabel && <div className="text-xs text-secondary">{opt.sublabel}</div>}
                </div>
                <ChevronDown size={14} className="opacity-0 group-hover:opacity-100 -rotate-90 text-secondary" />
              </div>
            ))
          ) : (
            isNewAllowed && searchTerm && (
              <div 
                className="px-4 py-4 cursor-pointer hover:bg-primary/10 text-primary flex items-center gap-3 rounded-lg"
                onClick={() => handleSelect(null, searchTerm)}
              >
                <div className="p-2 bg-primary/20 rounded-full">
                  <Plus size={18} />
                </div>
                <div>
                  <div className="font-bold flex items-center gap-2">Add "{searchTerm}" <Sparkles size={14} className="animate-pulse" /></div>
                  <div className="text-xs text-secondary">This will be auto-saved to your library.</div>
                </div>
              </div>
            )
          )}
          
          {!isNewAllowed && filteredOptions.length === 0 && (
            <div className="px-4 py-8 text-center text-secondary italic text-sm">
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
