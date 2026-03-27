import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';

export default function TickerChip({ symbol, onClick }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) {
      onClick(symbol);
    } else {
      navigate(`/ticker/${symbol}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold cursor-pointer transition-all border ${
        dark
          ? 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white'
          : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-400 hover:text-slate-900'
      }`}
    >
      {symbol}
    </button>
  );
}
