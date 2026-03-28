import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function Avatar({ user, size = 'md', dark }) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return user?.avatar_url ? (
    <img src={user.avatar_url} alt={user.name} className={`${sizeClass} rounded-full flex-shrink-0 object-cover`} />
  ) : (
    <div className={`${sizeClass} rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${
      dark ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-700'
    }`}>
      {user?.name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function GroupAvatars({ participants, myId, dark }) {
  const others = participants.filter(p => p.id !== myId).slice(0, 2);
  if (others.length === 0) return <Avatar user={null} dark={dark} />;
  return (
    <div className="relative w-9 h-9 flex-shrink-0">
      {others.map((p, i) => (
        <div key={p.id} className={`absolute ${i === 0 ? 'top-0 left-0' : 'bottom-0 right-0'} w-6 h-6 rounded-full border-2 ${dark ? 'border-slate-800' : 'border-white'} overflow-hidden`}>
          <Avatar user={p} size="sm" dark={dark} />
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Attachment preview card ─────────────────────────────────────────────────

function AttachmentCard({ type, data, dark }) {
  if (!data) return null;
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;

  if (type === 'article') {
    const tickers = Array.isArray(parsed.tickers)
      ? parsed.tickers
      : (() => { try { return JSON.parse(parsed.tickers || '[]'); } catch { return []; } })();
    return (
      <a
        href={parsed.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block mt-2 rounded-lg border p-3 text-left transition-colors ${
          dark
            ? 'bg-slate-700/60 border-slate-600 hover:border-slate-500'
            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">📰</span>
          <div className="min-w-0">
            <p className={`text-xs font-semibold leading-snug line-clamp-2 ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
              {parsed.headline}
            </p>
            <p className={`text-[10px] mt-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
              {parsed.source}{parsed.published_at ? ` · ${formatRelativeTime(parsed.published_at)}` : ''}
              {tickers.length > 0 && ` · ${tickers.slice(0, 3).join(', ')}`}
            </p>
          </div>
        </div>
      </a>
    );
  }

  if (type === 'ticker') {
    return (
      <a
        href={`/ticker/${parsed.symbol}`}
        className={`block mt-2 rounded-lg border p-3 transition-colors ${
          dark
            ? 'bg-slate-700/60 border-slate-600 hover:border-slate-500'
            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📈</span>
          <div>
            <span className={`text-xs font-mono font-bold ${dark ? 'text-slate-200' : 'text-slate-900'}`}>
              {parsed.symbol}
            </span>
            {parsed.name && (
              <span className={`text-xs ml-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{parsed.name}</span>
            )}
          </div>
        </div>
      </a>
    );
  }

  return null;
}

// ─── Conversation Thread ─────────────────────────────────────────────────────

function ConversationThread({ conversationId, myId, dark, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } finally {
      if (!silent) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 8000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages?.length]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: body.trim() }),
      });
      if (res.ok) { setBody(''); load(true); }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (loading) {
    return (
      <div className={`flex-1 flex items-center justify-center ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  const conv = data?.conversation;
  const messages = data?.messages || [];
  const inputBg = dark
    ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b flex-shrink-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        <button onClick={onBack} className={`p-1 rounded-md transition-colors ${dark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-slate-900'}`}>
            {conv?.display_name}
          </p>
          {conv?.type === 'group' && (
            <p className={`text-[10px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
              {conv.participants?.length} members
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <p className={`text-center text-sm py-8 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            No messages yet. Say hello!
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === myId;
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMe && (
                  <div className="flex-shrink-0 mb-1">
                    <Avatar user={{ name: msg.sender_name, avatar_url: msg.sender_avatar }} size="sm" dark={dark} />
                  </div>
                )}
                <div className={`max-w-[70%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && conv?.type === 'group' && (
                    <p className={`text-[10px] mb-1 ml-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {msg.sender_name}
                    </p>
                  )}
                  <div className={`rounded-2xl px-3 py-2 ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : dark ? 'bg-slate-700 text-slate-200 rounded-bl-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}>
                    {msg.body && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>}
                    {msg.attachment_type && (
                      <AttachmentCard type={msg.attachment_type} data={msg.attachment_data} dark={dark} />
                    )}
                  </div>
                  <p className={`text-[10px] mt-1 mx-1 ${dark ? 'text-slate-600' : 'text-slate-400'}`}>
                    {formatRelativeTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <form onSubmit={sendMessage} className={`flex items-end gap-2 px-4 py-3 border-t flex-shrink-0 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          rows={1}
          className={`flex-1 px-3 py-2 rounded-xl border text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500/40 ${inputBg}`}
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          type="submit"
          disabled={!body.trim() || sending}
          className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}

// ─── New Group Modal ─────────────────────────────────────────────────────────

function NewGroupModal({ friends, dark, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [creating, setCreating] = useState(false);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleCreate = async () => {
    if (!name.trim() || selected.size === 0) return;
    setCreating(true);
    try {
      const res = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'group', name: name.trim(), participant_ids: [...selected] }),
      });
      if (res.ok) onCreate(await res.json());
    } finally { setCreating(false); }
  };

  const inputBg = dark
    ? 'bg-slate-900 border-slate-600 text-white placeholder-slate-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className={`w-full max-w-sm rounded-xl border shadow-2xl p-5 ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>New Group</h3>
          <button onClick={onClose} className={dark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-900'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Group name…"
          className={`w-full px-3 py-2 text-sm rounded-lg border outline-none focus:ring-2 focus:ring-blue-500/40 mb-4 ${inputBg}`}
        />
        <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Add friends</p>
        <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
          {friends.map(f => (
            <label key={f.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selected.has(f.id) ? dark ? 'bg-blue-600/20' : 'bg-blue-50' : dark ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}>
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="w-4 h-4 rounded accent-blue-500" />
              <Avatar user={f} size="sm" dark={dark} />
              <span className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-800'}`}>{f.name}</span>
            </label>
          ))}
        </div>
        <button onClick={handleCreate} disabled={!name.trim() || selected.size === 0 || creating}
          className="w-full py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40">
          {creating ? 'Creating…' : 'Create Group'}
        </button>
      </div>
    </div>
  );
}

// ─── Messages Tab ────────────────────────────────────────────────────────────

function MessagesTab({ friends, myId, dark }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/conversations', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const startDm = async (friendId) => {
    const res = await fetch('/api/messages/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type: 'direct', participant_ids: [friendId] }),
    });
    if (res.ok) {
      const conv = await res.json();
      setConversations(prev => prev.find(c => c.id === conv.id) ? prev : [conv, ...prev]);
      setSelectedId(conv.id);
    }
  };

  const card = `rounded-lg border ${dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`;
  const muted = dark ? 'text-slate-500' : 'text-slate-400';

  if (selectedId) {
    return (
      <div className={`${card} overflow-hidden`} style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
        <ConversationThread
          conversationId={selectedId}
          myId={myId}
          dark={dark}
          onBack={() => { setSelectedId(null); loadConversations(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wider ${muted}`}>
          Conversations ({conversations.length})
        </p>
        <button onClick={() => setShowNewGroup(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          + New Group
        </button>
      </div>

      {/* Quick DM row */}
      {friends.length > 0 && (
        <div className={`${card} p-4`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${muted}`}>Message a friend</p>
          <div className="flex flex-wrap gap-2">
            {friends.map(f => (
              <button key={f.id} onClick={() => startDm(f.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors border ${dark ? 'bg-slate-700/60 border-slate-600 text-slate-200 hover:border-slate-500' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-400'}`}>
                <Avatar user={f} size="sm" dark={dark} />
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation list */}
      {loading ? (
        <p className={`text-sm text-center py-8 ${muted}`}>Loading…</p>
      ) : conversations.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className={`text-sm ${muted}`}>No conversations yet.</p>
          <p className={`text-xs mt-1 ${dark ? 'text-slate-600' : 'text-slate-300'}`}>Message a friend above or create a group.</p>
        </div>
      ) : (
        <div className={`${card} divide-y ${dark ? 'divide-slate-700' : 'divide-slate-100'} overflow-hidden`}>
          {conversations.map(conv => {
            const lastMsg = conv.last_message;
            const isGroup = conv.type === 'group';
            return (
              <button key={conv.id} onClick={() => setSelectedId(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${dark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}>
                {isGroup
                  ? <GroupAvatars participants={conv.participants || []} myId={myId} dark={dark} />
                  : <Avatar user={(conv.participants || []).find(p => p.id !== myId)} dark={dark} />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-medium truncate ${dark ? 'text-white' : 'text-slate-900'}`}>{conv.display_name}</span>
                    <span className={`text-[10px] flex-shrink-0 ${muted}`}>{lastMsg ? formatRelativeTime(lastMsg.created_at) : ''}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${muted}`}>
                    {lastMsg
                      ? lastMsg.attachment_type
                        ? `📎 ${lastMsg.attachment_type === 'article' ? 'Article' : 'Ticker'} shared`
                        : lastMsg.body
                      : 'No messages yet'}
                  </p>
                </div>
                {conv.unread_count > 0 && (
                  <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-500 text-white min-w-[18px] text-center">
                    {conv.unread_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {showNewGroup && (
        <NewGroupModal friends={friends} dark={dark} onClose={() => setShowNewGroup(false)}
          onCreate={(conv) => { setConversations(prev => [conv, ...prev]); setShowNewGroup(false); setSelectedId(conv.id); }} />
      )}
    </div>
  );
}

// ─── Main FriendsView ────────────────────────────────────────────────────────

export default function FriendsView() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const dark = theme === 'dark';

  const [activeTab, setActiveTab] = useState('friends');
  const [friends, setFriends] = useState({ friends: [], pending_received: [], pending_sent: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [unreadMessages, setUnreadMessages] = useState(0);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await fetch('/api/friends', { credentials: 'include' });
      const data = await res.json();
      setFriends(data);
    } catch (err) { console.error('Failed to fetch friends:', err); }
    finally { setLoading(false); }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/unread-count', { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setUnreadMessages(d.count || 0); }
    } catch {}
  }, []);

  useEffect(() => {
    fetchFriends();
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchFriends, fetchUnreadCount]);

  useEffect(() => {
    if (activeTab === 'messages') setUnreadMessages(0);
  }, [activeTab]);

  // Debounced user search
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, { credentials: 'include' });
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const setAction = (id, val) => setActionLoading(p => ({ ...p, [id]: val }));

  const sendRequest = async (userId) => {
    setAction(userId, true);
    try { await fetch(`/api/friends/request/${userId}`, { method: 'POST', credentials: 'include' }); await fetchFriends(); }
    finally { setAction(userId, false); }
  };
  const accept = async (id) => {
    setAction(id, true);
    try { await fetch(`/api/friends/accept/${id}`, { method: 'PUT', credentials: 'include' }); await fetchFriends(); }
    finally { setAction(id, false); }
  };
  const reject = async (id) => {
    setAction(id, true);
    try { await fetch(`/api/friends/reject/${id}`, { method: 'PUT', credentials: 'include' }); await fetchFriends(); }
    finally { setAction(id, false); }
  };
  const remove = async (id) => {
    setAction(id, true);
    try { await fetch(`/api/friends/${id}`, { method: 'DELETE', credentials: 'include' }); await fetchFriends(); }
    finally { setAction(id, false); }
  };

  const allRelatedIds = new Set([
    ...friends.friends.map(f => f.id),
    ...friends.pending_received.map(f => f.id),
    ...friends.pending_sent.map(f => f.id),
  ]);

  const card = `rounded-lg border ${dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`;
  const sectionTitle = `text-xs font-semibold uppercase tracking-wider mb-3 ${dark ? 'text-slate-400' : 'text-slate-500'}`;
  const nameText = `text-sm font-medium ${dark ? 'text-white' : 'text-slate-900'}`;
  const muted = dark ? 'text-slate-500' : 'text-slate-400';

  const btn = (variant) => {
    if (variant === 'primary') return 'px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors';
    if (variant === 'success') return 'px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors';
    if (variant === 'danger') return `px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${dark ? 'border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-500' : 'border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-300'}`;
    return `px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${dark ? 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-400' : 'border-slate-200 text-slate-500 hover:text-slate-900'}`;
  };

  const tabClass = (tab) => `relative px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-md transition-all ${
    activeTab === tab
      ? dark ? 'bg-slate-700 text-white' : 'bg-slate-900 text-white'
      : dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
  }`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className={`text-xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>Friends</h1>
        <div className="flex items-center gap-1">
          <button className={tabClass('friends')} onClick={() => setActiveTab('friends')}>Friends</button>
          <button className={tabClass('messages')} onClick={() => setActiveTab('messages')}>
            Messages
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-blue-500 text-white min-w-[16px] text-center leading-tight">
                {unreadMessages}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'messages' ? (
        <MessagesTab friends={friends.friends} myId={user?.id} dark={dark} />
      ) : (
        <>
          {/* Search */}
          <div className={card + ' p-4'}>
            <p className={sectionTitle}>Find people</p>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name or email…"
              className={`w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-1 focus:ring-blue-500 ${dark ? 'bg-slate-900 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
            />
            {searching && <p className={`mt-2 text-xs ${muted}`}>Searching…</p>}
            {searchResults.length > 0 && (
              <ul className="mt-3 space-y-2">
                {searchResults.map(u => (
                  <li key={u.id} className="flex items-center gap-3">
                    <Avatar user={u} dark={dark} />
                    <span className={nameText + ' flex-1'}>{u.name}</span>
                    {allRelatedIds.has(u.id)
                      ? <span className={`text-xs ${muted}`}>Already connected</span>
                      : <button onClick={() => sendRequest(u.id)} disabled={actionLoading[u.id]}
                          className={btn('primary') + ' disabled:opacity-50'}>Add friend</button>
                    }
                  </li>
                ))}
              </ul>
            )}
            {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
              <p className={`mt-2 text-xs ${muted}`}>No users found.</p>
            )}
          </div>

          {/* Pending received */}
          {friends.pending_received.length > 0 && (
            <div className={card + ' p-4'}>
              <p className={sectionTitle}>Friend requests ({friends.pending_received.length})</p>
              <ul className="space-y-3">
                {friends.pending_received.map(f => (
                  <li key={f.friendship_id} className="flex items-center gap-3">
                    <Avatar user={f} dark={dark} />
                    <span className={nameText + ' flex-1'}>{f.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => accept(f.friendship_id)} disabled={actionLoading[f.friendship_id]} className={btn('success') + ' disabled:opacity-50'}>Accept</button>
                      <button onClick={() => reject(f.friendship_id)} disabled={actionLoading[f.friendship_id]} className={btn('danger') + ' disabled:opacity-50'}>Decline</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pending sent */}
          {friends.pending_sent.length > 0 && (
            <div className={card + ' p-4'}>
              <p className={sectionTitle}>Sent requests ({friends.pending_sent.length})</p>
              <ul className="space-y-3">
                {friends.pending_sent.map(f => (
                  <li key={f.friendship_id} className="flex items-center gap-3">
                    <Avatar user={f} dark={dark} />
                    <span className={nameText + ' flex-1'}>{f.name}</span>
                    <button onClick={() => remove(f.friendship_id)} disabled={actionLoading[f.friendship_id]} className={btn('default') + ' disabled:opacity-50'}>Cancel</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Friends list */}
          <div className={card + ' p-4'}>
            <p className={sectionTitle}>Friends ({friends.friends.length})</p>
            {loading ? (
              <p className={`text-sm ${muted}`}>Loading…</p>
            ) : friends.friends.length === 0 ? (
              <p className={`text-sm ${muted}`}>No friends yet. Search above to connect with others.</p>
            ) : (
              <ul className="space-y-3">
                {friends.friends.map(f => (
                  <li key={f.friendship_id} className="flex items-center gap-3">
                    <Avatar user={f} dark={dark} />
                    <span className={nameText + ' flex-1'}>{f.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setActiveTab('messages')} className={btn('primary')}>Message</button>
                      <button onClick={() => navigate(`/compare/${f.id}`)} className={btn('default')}>Compare</button>
                      <button onClick={() => remove(f.friendship_id)} disabled={actionLoading[f.friendship_id]} className={btn('danger') + ' disabled:opacity-50'}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
