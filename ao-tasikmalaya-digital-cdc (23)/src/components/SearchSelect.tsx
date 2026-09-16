import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

export interface OptionType {
  value: string;
  label: string;
}

interface SearchSelectProps {
  options: (string | OptionType)[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

export const SearchSelect: React.FC<SearchSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Pilih...',
  disabled = false,
  required = false,
  className = '',
  id,
  name,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const normalizedOptions: OptionType[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const filteredOptions = normalizedOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <input type="hidden" id={id} name={name} value={value} required={required} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-neutral-900 border border-white/10 rounded-lg text-sm text-left font-medium transition-all focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 ${
          disabled
            ? 'bg-neutral-950 text-white/30 cursor-not-allowed border-white/5'
            : 'cursor-pointer hover:border-white/20'
        } ${selectedOption ? 'text-white' : 'text-white/40'}`}
      >
        <span className="truncate pr-2">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-white/50 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2 border-b border-white/10 flex items-center gap-2 bg-neutral-950">
            <Search className="w-4 h-4 text-white/40 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              className="w-full bg-transparent text-sm focus:outline-none placeholder:text-white/40 text-white"
              placeholder="Cari opsi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 hover:bg-white/10 rounded-full text-white/40 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full px-3.5 py-2.5 text-left text-sm flex items-center justify-between hover:bg-white/10 hover:text-white transition-colors ${
                    opt.value === value
                      ? 'bg-white/15 font-semibold text-white'
                      : 'text-white/80'
                  }`}
                >
                  <span className="truncate pr-2">{opt.label}</span>
                  {opt.value === value && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-white/40 italic">
                Opsi tidak ditemukan
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
