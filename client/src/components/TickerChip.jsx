import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';

const TICKER_COLORS = [
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-orange-500/20 text-orange-400 border-orange-500/30',
];

const TICKER_COLORS_LIGHT = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
  'bg-orange-100 text-orange-700 border-orange-200',
];

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function TickerChip({ symbol, onClick }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const colors = theme === 'dark' ? TICKER_COLORS : TICKER_COLORS_LIGHT;
  const colorClass = colors[hashCode(symbol) % colors.length];

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
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border cursor-pointer transition-opacity hover:opacity-80 ${colorClass}`}
    >
      {symbol}
    </button>
  );
}
