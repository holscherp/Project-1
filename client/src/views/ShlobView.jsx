import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { apiPost } from '../hooks/useApi.js';

function useCountdown(resetAt) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!resetAt) { setTimeLeft(''); return; }

    const tick = () => {
      const ms = new Date(resetAt) - Date.now();
      if (ms <= 0) { setTimeLeft(''); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resetAt]);

  return timeLeft;
}

function parsePoem(content) {
  // Split the Cara opening from the rest of the response
  // The format is: "For Cara: ...\n\n<rest>"
  const match = content.match(/^(For Cara:.*?)\n\n([\s\S]*)$/s);
  if (match) return { poem: match[1].trim(), body: match[2].trim() };
  return { poem: null, body: content };
}

export default function ShlobView() {
  const { theme } = useTheme();
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey, I'm Shlob — your market intelligence assistant. I can answer questions about the news, tickers, filings, and earnings data on Meridian. Ask me anything.",
      created_at: new Date().toISOString(),
    }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [usesRemaining, setUsesRemaining] = useState(null);
  const [usesTotal, setUsesTotal] = useState(5);
  const [resetAt, setResetAt] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const countdown = useCountdown(resetAt);

  const dark = theme === 'dark';
  const rateLimited = usesRemaining === 0;

  const fetchRateStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/shlob/rate-status', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setUsesRemaining(d.uses_remaining);
        setUsesTotal(d.uses_total);
        setResetAt(d.reset_at);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchRateStatus(); }, [fetchRateStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending || rateLimited) return;
    const msg = input.trim();
    setInput('');
    setSending(true);

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const result = await apiPost('/api/shlob/ask', { question: msg });

      if (result.uses_remaining !== undefined) {
        setUsesRemaining(result.uses_remaining);
        setResetAt(result.reset_at);
      }

      setMessages(prev => [...prev, {
        id: `shlob-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        created_at: new Date().toISOString(),
      }]);
    } catch (err) {
      // Check if it's a rate limit error
      if (err.status === 429 || (err.message && err.message.includes('rate_limited'))) {
        await fetchRateStatus();
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: "I've hit my daily limit. Check the counter above — I'll be back once the timer resets.",
          created_at: new Date().toISOString(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Something went wrong: ${err.message}. Make sure the ANTHROPIC_API_KEY is configured.`,
          created_at: new Date().toISOString(),
        }]);
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const usageDots = usesTotal > 0
    ? Array.from({ length: usesTotal }, (_, i) => i < (usesTotal - (usesRemaining ?? usesTotal)))
    : [];

  return (
    <div className={`flex flex-col h-[calc(100vh-8rem)] rounded-lg border overflow-hidden ${
      dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
    }`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              dark ? 'bg-slate-700 text-slate-200' : 'bg-slate-900 text-white'
            }`}>
              S
            </div>
            <div>
              <h1 className={`text-sm font-bold ${dark ? 'text-slate-200' : 'text-slate-800'}`}>Shlob</h1>
              <p className={`text-[10px] uppercase tracking-widest font-bold ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                Market Intelligence Assistant
              </p>
            </div>
          </div>

          {/* Rate limit indicator */}
          {usesRemaining !== null && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                {usageDots.map((used, i) => (
                  <span
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      used
                        ? dark ? 'bg-slate-600' : 'bg-slate-300'
                        : dark ? 'bg-emerald-400' : 'bg-emerald-500'
                    }`}
                  />
                ))}
                <span className={`text-[10px] ml-1 font-medium tabular-nums ${
                  rateLimited
                    ? 'text-red-400'
                    : dark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  {usesRemaining}/{usesTotal}
                </span>
              </div>
              {rateLimited && countdown && (
                <span className={`text-[10px] font-mono tabular-nums ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                  resets in {countdown}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map(msg => {
          const { poem, body } = msg.role === 'assistant' ? parsePoem(msg.content) : { poem: null, body: msg.content };
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${msg.role === 'user' ? '' : 'flex gap-3'}`}>
                {msg.role === 'assistant' && (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                    dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-900 text-white'
                  }`}>
                    S
                  </div>
                )}
                <div>
                  <div className={`rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? dark ? 'bg-slate-700 text-slate-200' : 'bg-slate-900 text-white'
                      : dark ? 'bg-slate-800 border border-slate-700 text-slate-300' : 'bg-slate-50 border border-slate-200 text-slate-700'
                  }`}>
                    {poem && (
                      <>
                        <p className={`text-xs italic leading-relaxed mb-2 pb-2 border-b ${
                          dark ? 'text-rose-300/80 border-slate-700' : 'text-rose-500/70 border-slate-200'
                        }`}>
                          {poem}
                        </p>
                      </>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
                  </div>
                  <p className={`text-[10px] mt-1 px-1 ${dark ? 'text-slate-600' : 'text-slate-300'}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="flex gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-900 text-white'
              }`}>
                S
              </div>
              <div className={`rounded-lg px-4 py-3 ${
                dark ? 'bg-slate-800 border border-slate-700' : 'bg-slate-50 border border-slate-200'
              }`}>
                <div className="flex gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${dark ? 'bg-slate-500' : 'bg-slate-400'}`} style={{ animationDelay: '0ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${dark ? 'bg-slate-500' : 'bg-slate-400'}`} style={{ animationDelay: '150ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${dark ? 'bg-slate-500' : 'bg-slate-400'}`} style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`px-6 py-4 border-t ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        {rateLimited && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-xs text-center ${
            dark ? 'bg-red-900/20 text-red-400 border border-red-800/40' : 'bg-red-50 text-red-500 border border-red-200'
          }`}>
            Daily limit reached ({usesTotal} uses). {countdown ? `Resets in ${countdown}.` : 'Try again tomorrow.'}
          </div>
        )}
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={
              rateLimited
                ? `Limit reached — resets ${countdown ? `in ${countdown}` : 'soon'}`
                : sending ? 'Shlob is thinking...' : 'Ask Shlob about markets, news, tickers...'
            }
            disabled={sending || rateLimited}
            className={`flex-1 px-4 py-2.5 rounded-lg border text-sm ${
              dark
                ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500'
                : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'
            } focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-50`}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim() || rateLimited}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-30 ${
              dark
                ? 'bg-slate-200 text-slate-900 hover:bg-white'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
