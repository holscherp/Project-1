import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { apiPost } from '../hooks/useApi.js';

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
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const dark = theme === 'dark';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
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
      setMessages(prev => [...prev, {
        id: `shlob-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        created_at: new Date().toISOString(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Something went wrong: ${err.message}. Make sure the ANTHROPIC_API_KEY is configured.`,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex flex-col h-[calc(100vh-8rem)] rounded-lg border overflow-hidden ${
      dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
    }`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map(msg => (
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
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
                <p className={`text-[10px] mt-1 px-1 ${dark ? 'text-slate-600' : 'text-slate-300'}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          </div>
        ))}
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
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={sending ? 'Shlob is thinking...' : 'Ask Shlob about markets, news, tickers...'}
            disabled={sending}
            className={`flex-1 px-4 py-2.5 rounded-lg border text-sm ${
              dark
                ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500'
                : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'
            } focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-50`}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
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
