import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function UserMenu() {
  const { user, refetch } = useAuth();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const dark = theme === 'dark';

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    await refetch();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full focus:outline-none"
        aria-label="User menu"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.name}
            className="w-7 h-7 rounded-full ring-2 ring-offset-1 ring-slate-500"
          />
        ) : (
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            dark ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {user.name?.[0]?.toUpperCase()}
          </div>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 mt-2 w-48 rounded-lg border shadow-lg z-50 py-1 ${
          dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          <div className={`px-3 py-2 border-b ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
            <p className={`text-xs font-medium truncate ${dark ? 'text-white' : 'text-slate-900'}`}>{user.name}</p>
          </div>
          <NavLink
            to="/friends"
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
              dark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Friends
          </NavLink>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
              dark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
