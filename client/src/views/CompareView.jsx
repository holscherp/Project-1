import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';

function Chip({ label, variant, dark }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium';
  if (variant === 'shared') return (
    <span className={`${base} ${dark ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>
      <span className="opacity-60">✓</span> {label}
    </span>
  );
  if (variant === 'mine') return (
    <span className={`${base} ${dark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
      <span className="opacity-60">→</span> {label}
    </span>
  );
  return (
    <span className={`${base} ${dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
      <span className="opacity-60">←</span> {label}
    </span>
  );
}

function Section({ title, data, getLabel, dark }) {
  const { shared, only_mine, only_theirs } = data;
  return (
    <div className={`rounded-lg border p-4 ${dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{title}</h3>
        <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
          {shared.length} shared · {only_mine.length} only you · {only_theirs.length} only them
        </span>
      </div>
      {shared.length === 0 && only_mine.length === 0 && only_theirs.length === 0 ? (
        <p className={`text-xs ${dark ? 'text-slate-600' : 'text-slate-400'}`}>No items to compare.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {shared.map((item, i) => <Chip key={i} label={getLabel(item)} variant="shared" dark={dark} />)}
          {only_mine.map((item, i) => <Chip key={i} label={getLabel(item)} variant="mine" dark={dark} />)}
          {only_theirs.map((item, i) => <Chip key={i} label={getLabel(item)} variant="theirs" dark={dark} />)}
        </div>
      )}
    </div>
  );
}

export default function CompareView() {
  const { userId } = useParams();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dark = theme === 'dark';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/friends/compare/${userId}`, { credentials: 'include' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load comparison');
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  const base = `min-h-screen ${dark ? 'bg-slate-900' : 'bg-slate-50'}`;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Loading comparison…</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className={`text-sm ${dark ? 'text-red-400' : 'text-red-500'}`}>{error}</p>
      <button onClick={() => navigate('/friends')} className={`text-xs underline ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Back to Friends</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/friends')} className={`text-xs ${dark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
          ← Friends
        </button>
      </div>

      <div className={`rounded-xl border p-5 ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.me.avatar_url ? (
              <img src={data.me.avatar_url} alt={data.me.name} className="w-9 h-9 rounded-full" />
            ) : (
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${dark ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {data.me.name?.[0]?.toUpperCase()}
              </div>
            )}
            <span className={`text-sm font-medium ${dark ? 'text-white' : 'text-slate-900'}`}>{data.me.name}</span>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded ${dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>vs</span>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${dark ? 'text-white' : 'text-slate-900'}`}>{data.them.name}</span>
            {data.them.avatar_url ? (
              <img src={data.them.avatar_url} alt={data.them.name} className="w-9 h-9 rounded-full" />
            ) : (
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${dark ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {data.them.name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${dark ? 'bg-emerald-500' : 'bg-emerald-500'}`} />
          <span className={dark ? 'text-slate-400' : 'text-slate-500'}>Shared</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${dark ? 'bg-blue-500' : 'bg-blue-500'}`} />
          <span className={dark ? 'text-slate-400' : 'text-slate-500'}>Only you</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${dark ? 'bg-slate-500' : 'bg-slate-400'}`} />
          <span className={dark ? 'text-slate-400' : 'text-slate-500'}>Only {data.them.name.split(' ')[0]}</span>
        </div>
      </div>

      <Section
        title="Tickers"
        data={data.tickers}
        getLabel={t => t.symbol}
        dark={dark}
      />
      <Section
        title="Sectors"
        data={data.sectors}
        getLabel={s => s.name}
        dark={dark}
      />
      <Section
        title="Macro Topics"
        data={data.topics}
        getLabel={t => t.name}
        dark={dark}
      />
      <Section
        title="X Accounts"
        data={data.x_accounts}
        getLabel={x => x.display_name || `@${x.handle}`}
        dark={dark}
      />
    </div>
  );
}
