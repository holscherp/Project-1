import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function Avatar({ user, size = 'md', dark }) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return user.avatar_url ? (
    <img src={user.avatar_url} alt={user.name} className={`${sizeClass} rounded-full flex-shrink-0`} />
  ) : (
    <div className={`${sizeClass} rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${
      dark ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-700'
    }`}>
      {user.name?.[0]?.toUpperCase()}
    </div>
  );
}

export default function FriendsView() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const dark = theme === 'dark';

  const [friends, setFriends] = useState({ friends: [], pending_received: [], pending_sent: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const fetchFriends = useCallback(async () => {
    try {
      const res = await fetch('/api/friends', { credentials: 'include' });
      const data = await res.json();
      setFriends(data);
    } catch (err) {
      console.error('Failed to fetch friends:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, { credentials: 'include' });
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const setAction = (id, val) => setActionLoading(p => ({ ...p, [id]: val }));

  const sendRequest = async (userId) => {
    setAction(userId, true);
    try {
      await fetch(`/api/friends/request/${userId}`, { method: 'POST', credentials: 'include' });
      await fetchFriends();
    } finally {
      setAction(userId, false);
    }
  };

  const accept = async (friendshipId) => {
    setAction(friendshipId, true);
    try {
      await fetch(`/api/friends/accept/${friendshipId}`, { method: 'PUT', credentials: 'include' });
      await fetchFriends();
    } finally {
      setAction(friendshipId, false);
    }
  };

  const reject = async (friendshipId) => {
    setAction(friendshipId, true);
    try {
      await fetch(`/api/friends/reject/${friendshipId}`, { method: 'PUT', credentials: 'include' });
      await fetchFriends();
    } finally {
      setAction(friendshipId, false);
    }
  };

  const remove = async (friendshipId) => {
    setAction(friendshipId, true);
    try {
      await fetch(`/api/friends/${friendshipId}`, { method: 'DELETE', credentials: 'include' });
      await fetchFriends();
    } finally {
      setAction(friendshipId, false);
    }
  };

  // Compute which search result users already have a relationship with
  const allRelatedIds = new Set([
    ...friends.friends.map(f => f.id),
    ...friends.pending_received.map(f => f.id),
    ...friends.pending_sent.map(f => f.id),
  ]);

  const card = `rounded-lg border ${dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`;
  const sectionTitle = `text-xs font-semibold uppercase tracking-wider mb-3 ${dark ? 'text-slate-400' : 'text-slate-500'}`;
  const nameText = `text-sm font-medium ${dark ? 'text-white' : 'text-slate-900'}`;
  const btn = (variant) => {
    if (variant === 'primary') return `px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors`;
    if (variant === 'success') return `px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors`;
    if (variant === 'danger') return `px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${dark ? 'border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-500' : 'border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-300'}`;
    return `px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${dark ? 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-400' : 'border-slate-200 text-slate-500 hover:text-slate-900'}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className={`text-xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>Friends</h1>

      {/* Search */}
      <div className={card + ' p-4'}>
        <p className={sectionTitle}>Find people</p>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name or email…"
          className={`w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-1 focus:ring-blue-500 ${
            dark
              ? 'bg-slate-900 border-slate-600 text-white placeholder-slate-500'
              : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
          }`}
        />
        {searching && (
          <p className={`mt-2 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Searching…</p>
        )}
        {searchResults.length > 0 && (
          <ul className="mt-3 space-y-2">
            {searchResults.map(u => (
              <li key={u.id} className="flex items-center gap-3">
                <Avatar user={u} dark={dark} />
                <span className={nameText + ' flex-1'}>{u.name}</span>
                {allRelatedIds.has(u.id) ? (
                  <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Already connected</span>
                ) : (
                  <button
                    onClick={() => sendRequest(u.id)}
                    disabled={actionLoading[u.id]}
                    className={btn('primary') + ' disabled:opacity-50'}
                  >
                    Add friend
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
          <p className={`mt-2 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>No users found.</p>
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
          <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Loading…</p>
        ) : friends.friends.length === 0 ? (
          <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>No friends yet. Search above to connect with others.</p>
        ) : (
          <ul className="space-y-3">
            {friends.friends.map(f => (
              <li key={f.friendship_id} className="flex items-center gap-3">
                <Avatar user={f} dark={dark} />
                <span className={nameText + ' flex-1'}>{f.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/compare/${f.id}`)}
                    className={btn('default')}
                  >
                    Compare
                  </button>
                  <button onClick={() => remove(f.friendship_id)} disabled={actionLoading[f.friendship_id]} className={btn('danger') + ' disabled:opacity-50'}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
