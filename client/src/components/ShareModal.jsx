import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

/**
 * Modal for sharing an article or ticker into a conversation.
 *
 * Props:
 *   attachment  — { type: 'article'|'ticker', data: { ... } }
 *   onClose()   — called to dismiss
 */
export default function ShareModal({ attachment, onClose }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [conversations, setConversations] = useState([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/messages/conversations', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations || []);
          if (data.conversations?.length > 0) setSelectedId(data.conversations[0].id);
        }
      } finally { setLoadingConvos(false); }
    };
    load();
  }, []);

  const handleSend = async () => {
    if (!selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          body: body.trim() || null,
          attachment_type: attachment.type,
          attachment_data: attachment.data,
        }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(onClose, 1000);
      }
    } finally { setSending(false); }
  };

  const overlay = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
  const modalBg = dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const inputBg = dark
    ? 'bg-slate-900 border-slate-600 text-white placeholder-slate-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';

  const parsedTickers = (() => {
    if (attachment.type !== 'article') return [];
    const t = attachment.data.tickers;
    if (Array.isArray(t)) return t;
    try { return JSON.parse(t || '[]'); } catch { return []; }
  })();

  return (
    <div className={overlay} onClick={onClose}>
      <div
        className={`w-full max-w-sm rounded-xl border shadow-2xl ${modalBg}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>Share</h3>
          <button onClick={onClose} className={`${muted} hover:${dark ? 'text-white' : 'text-slate-900'} transition-colors`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Attachment preview */}
          {attachment.type === 'article' && (
            <div className={`rounded-lg border p-3 ${dark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-start gap-2">
                <span className="text-base leading-none mt-0.5">📰</span>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold leading-snug line-clamp-2 ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {attachment.data.headline}
                  </p>
                  <p className={`text-[10px] mt-1 ${muted}`}>
                    {attachment.data.source}
                    {parsedTickers.length > 0 && ` · ${parsedTickers.slice(0, 4).join(', ')}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {attachment.type === 'ticker' && (
            <div className={`rounded-lg border p-3 ${dark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <span className="text-base">📈</span>
                <span className={`text-sm font-mono font-bold ${dark ? 'text-slate-200' : 'text-slate-900'}`}>
                  {attachment.data.symbol}
                </span>
                {attachment.data.name && (
                  <span className={`text-xs ${muted}`}>{attachment.data.name}</span>
                )}
              </div>
            </div>
          )}

          {/* Optional message */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${muted}`}>Add a message (optional)</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write something…"
              rows={2}
              className={`w-full px-3 py-2 rounded-lg border text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500/40 ${inputBg}`}
            />
          </div>

          {/* Conversation selector */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${muted}`}>Send to</label>
            {loadingConvos ? (
              <p className={`text-xs ${muted}`}>Loading conversations…</p>
            ) : conversations.length === 0 ? (
              <p className={`text-xs ${muted}`}>No conversations yet. Start one from the Friends tab.</p>
            ) : (
              <div className={`rounded-lg border overflow-hidden ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                {conversations.map((conv, i) => (
                  <label
                    key={conv.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      i > 0 ? (dark ? 'border-t border-slate-700' : 'border-t border-slate-100') : ''
                    } ${
                      selectedId === conv.id
                        ? dark ? 'bg-blue-600/20' : 'bg-blue-50'
                        : dark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="conversation"
                      value={conv.id}
                      checked={selectedId === conv.id}
                      onChange={() => setSelectedId(conv.id)}
                      className="accent-blue-500"
                    />
                    <span className={`text-sm truncate ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {conv.display_name}
                    </span>
                    {conv.type === 'group' && (
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                        group
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 px-5 py-4 border-t ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
          <button onClick={onClose} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${dark ? 'border-slate-600 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-500 hover:text-slate-900'}`}>
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!selectedId || sending || sent || conversations.length === 0}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {sent ? '✓ Shared!' : sending ? 'Sharing…' : 'Share →'}
          </button>
        </div>
      </div>
    </div>
  );
}
