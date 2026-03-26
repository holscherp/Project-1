import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApi, apiPost } from '../hooks/useApi.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function ChatView() {
  const { theme } = useTheme();
  const { data: channelsData, loading: channelsLoading } = useApi('/api/chat/channels');
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load messages when channel changes
  useEffect(() => {
    if (!activeChannel) return;
    setMessagesLoading(true);
    fetch(`/api/chat/${activeChannel}/messages`)
      .then(r => r.json())
      .then(data => {
        setMessages(data.messages || []);
        setMessagesLoading(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .catch(() => setMessagesLoading(false));
  }, [activeChannel]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !activeChannel || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);

    // Optimistically add user message
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, role: 'user', content: msg, created_at: new Date().toISOString() }]);

    try {
      const result = await apiPost(`/api/chat/${activeChannel}/message`, { content: msg });
      // Add assistant response
      setMessages(prev => [...prev, result.message]);
    } catch (err) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `Error: ${err.message}. Make sure ANTHROPIC_API_KEY is configured.`, created_at: new Date().toISOString() }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handlePaste = async () => {
    if (!pasteInput.trim() || !activeChannel) return;
    // Insert as a social message (simulating a pasted post)
    const msg = pasteInput.trim();
    setPasteInput('');
    setPasteMode(false);

    try {
      await apiPost(`/api/chat/${activeChannel}/message`, {
        content: `[Pasted post from this account's feed]:\n\n"${msg}"\n\nWhat's your analysis of this?`
      });
      // Reload messages
      const res = await fetch(`/api/chat/${activeChannel}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {}
  };

  const channels = channelsData?.channels || {};
  const categoryOrder = ['Activist Investors', 'Macro Analysts', 'Official/Institutional', 'Financial Journalists'];

  const sidebarBg = theme === 'dark' ? 'bg-navy-800 border-navy-700' : 'bg-navy-50 border-navy-200';
  const chatBg = theme === 'dark' ? 'bg-navy-900' : 'bg-white';
  const cardBg = theme === 'dark' ? 'bg-navy-800 border-navy-700' : 'bg-white border-navy-200';
  const inputBg = theme === 'dark' ? 'bg-navy-700 border-navy-600 text-navy-200' : 'bg-navy-50 border-navy-200 text-navy-800';
  const textSecondary = theme === 'dark' ? 'text-navy-400' : 'text-navy-500';
  const textMuted = theme === 'dark' ? 'text-navy-500' : 'text-navy-400';

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex gap-0 h-[calc(100vh-8rem)] rounded-lg overflow-hidden border" style={{ borderColor: theme === 'dark' ? '#334155' : '#e2e8f0' }}>
      {/* Sidebar */}
      <div className={`w-64 shrink-0 border-r overflow-y-auto ${sidebarBg}`}>
        <div className={`px-3 py-2 border-b ${theme === 'dark' ? 'border-navy-700' : 'border-navy-200'}`}>
          <h2 className={`text-xs font-mono font-semibold uppercase tracking-wider ${textMuted}`}>Analyst Chat Room</h2>
        </div>
        {channelsLoading ? (
          <div className="p-4"><LoadingSpinner /></div>
        ) : (
          categoryOrder.map(category => {
            const categoryChannels = channels[category] || [];
            if (categoryChannels.length === 0) return null;
            return (
              <div key={category} className="mb-1">
                <div className={`px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wider ${textMuted}`}>
                  {category}
                </div>
                {categoryChannels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => setActiveChannel(ch.id)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      activeChannel === ch.id
                        ? theme === 'dark' ? 'bg-navy-700 text-accent-green' : 'bg-accent-blue/10 text-accent-blue'
                        : theme === 'dark' ? 'text-navy-300 hover:bg-navy-700/50' : 'text-navy-700 hover:bg-navy-100'
                    }`}
                  >
                    <span className="font-mono text-xs opacity-60">@</span>{ch.account_handle}
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col ${chatBg}`}>
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className={`text-sm ${textSecondary}`}>Select an account to start chatting</p>
              <p className={`text-xs font-mono mt-1 ${textMuted}`}>Ask questions about their posts and market views</p>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messagesLoading ? (
                <LoadingSpinner message="Loading messages..." />
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className={`text-sm ${textSecondary}`}>No messages yet in this thread.</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>
                    Posts from this account will appear here, or paste one manually.
                  </p>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                      msg.role === 'user'
                        ? 'bg-accent-blue text-white'
                        : msg.role === 'social'
                          ? theme === 'dark' ? 'bg-navy-700 border border-accent-purple/30' : 'bg-purple-50 border border-purple-200'
                          : theme === 'dark' ? 'bg-navy-800 border border-navy-700' : 'bg-navy-50 border border-navy-200'
                    }`}>
                      {msg.role === 'social' && (
                        <div className="text-xs font-mono text-accent-purple mb-1">
                          @{msg.author_handle || activeChannel}
                        </div>
                      )}
                      {msg.role === 'assistant' && (
                        <div className="text-xs font-mono text-accent-green mb-1">Meridian Analyst</div>
                      )}
                      <p className={`text-sm whitespace-pre-wrap leading-relaxed ${
                        msg.role === 'user' ? 'text-white' : theme === 'dark' ? 'text-navy-200' : 'text-navy-800'
                      }`}>{msg.content}</p>
                      <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : textMuted}`}>
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Paste mode */}
            {pasteMode && (
              <div className={`px-4 py-2 border-t ${theme === 'dark' ? 'border-navy-700 bg-navy-800' : 'border-navy-200 bg-navy-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-mono ${textMuted}`}>Paste a post from this account:</span>
                  <button onClick={() => setPasteMode(false)} className={`text-xs ${textMuted} hover:text-accent-red`}>Cancel</button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={pasteInput}
                    onChange={e => setPasteInput(e.target.value)}
                    className={`flex-1 px-3 py-1.5 rounded border text-sm resize-none ${inputBg} placeholder:text-navy-500 focus:outline-none focus:ring-1 focus:ring-accent-blue`}
                    rows={3}
                    placeholder="Paste the post content here..."
                  />
                  <button onClick={handlePaste}
                    className="px-3 py-1 bg-accent-blue text-white text-sm rounded hover:bg-blue-600 transition-colors self-end">
                    Analyze
                  </button>
                </div>
              </div>
            )}

            {/* Input */}
            <div className={`px-4 py-3 border-t ${theme === 'dark' ? 'border-navy-700' : 'border-navy-200'}`}>
              <div className="flex gap-2">
                <button
                  onClick={() => setPasteMode(!pasteMode)}
                  className={`px-2 py-1.5 rounded border text-xs font-mono shrink-0 transition-colors ${
                    theme === 'dark' ? 'border-navy-600 text-navy-400 hover:text-accent-purple hover:border-accent-purple' : 'border-navy-300 text-navy-500 hover:text-accent-purple hover:border-accent-purple'
                  }`}
                  title="Paste a post manually"
                >
                  Paste
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={sending ? 'Analyzing...' : 'Ask about this account\'s views...'}
                  disabled={sending}
                  className={`flex-1 px-3 py-1.5 rounded border text-sm ${inputBg} placeholder:text-navy-500 focus:outline-none focus:ring-1 focus:ring-accent-blue disabled:opacity-50`}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="px-4 py-1.5 bg-accent-green text-white text-sm font-medium rounded hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  {sending ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
