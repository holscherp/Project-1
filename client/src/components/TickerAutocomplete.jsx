import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

/**
 * Reusable autocomplete input for ticker symbols.
 *
 * Props:
 *   value          — controlled input value (string)
 *   onChange(val)  — called on every keystroke
 *   onSelect(symbol, name) — called when user picks a suggestion
 *   placeholder    — input placeholder text
 *   className      — wrapper div CSS classes
 *   inputClassName — additional CSS classes for the <input>
 *   onEnter(val)   — optional: called when Enter is pressed with no suggestion highlighted
 */
export default function TickerAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Ticker',
  className = '',
  inputClassName = '',
  onEnter,
}) {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch suggestions with 200ms debounce
  const fetchSuggestions = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/ticker/search?q=${encodeURIComponent(q)}`);
        const data = res.ok ? await res.json() : { results: [] };
        setSuggestions(data.results || []);
        setOpen((data.results || []).length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value.toUpperCase();
    onChange(val);
    fetchSuggestions(val);
  };

  const handleSelect = (suggestion) => {
    onSelect(suggestion.symbol, suggestion.name);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter(value);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        handleSelect(suggestions[activeIndex]);
      } else if (onEnter) {
        onEnter(value);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const inputBase = dark
    ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';

  const dropdownBg = dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          className={`${inputBase} focus:outline-none focus:ring-2 focus:ring-slate-400/30 ${inputClassName}`}
        />
        {loading && (
          <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            ···
          </span>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className={`absolute left-0 top-full mt-1 w-full min-w-[220px] rounded-lg border shadow-lg z-50 overflow-hidden ${dropdownBg}`}>
          {suggestions.map((s, i) => (
            <li
              key={s.symbol}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                i === activeIndex
                  ? dark ? 'bg-slate-700' : 'bg-slate-100'
                  : dark ? 'hover:bg-slate-700/60' : 'hover:bg-slate-50'
              } ${i > 0 ? (dark ? 'border-t border-slate-700/50' : 'border-t border-slate-100') : ''}`}
            >
              <span className={`text-xs font-mono font-semibold w-16 shrink-0 ${dark ? 'text-slate-200' : 'text-slate-900'}`}>
                {s.symbol}
              </span>
              <span className={`text-xs truncate ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {s.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
