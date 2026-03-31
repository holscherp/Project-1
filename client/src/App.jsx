import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import NewsFeed from './views/NewsFeed.jsx';
import EarningsView from './views/EarningsView.jsx';
import ShlobView from './views/ShlobView.jsx';
import WatchlistView from './views/WatchlistView.jsx';
import PortfolioView from './views/PortfolioView.jsx';
import TickerDetail from './views/TickerDetail.jsx';
import LoginView from './views/LoginView.jsx';
import FriendsView from './views/FriendsView.jsx';
import CompareView from './views/CompareView.jsx';
import UserMenu from './components/UserMenu.jsx';
import TickerAutocomplete from './components/TickerAutocomplete.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function Header() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings', { credentials: 'include' });
        const data = await res.json();
        if (data.last_updated) setLastUpdated(data.last_updated);
      } catch {}
    };
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/messages/unread-count', { credentials: 'include' });
        if (res.ok) { const d = await res.json(); setUnreadMessages(d.count || 0); }
      } catch {}
    };
    fetchSettings();
    fetchUnread();
    const settingsInterval = setInterval(fetchSettings, 60000);
    const unreadInterval = setInterval(fetchUnread, 30000);
    return () => { clearInterval(settingsInterval); clearInterval(unreadInterval); };
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/settings/refresh', { method: 'POST', credentials: 'include' });
    } catch {}
    setTimeout(() => setRefreshing(false), 3000);
  };

  const formatTime = (iso) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const dark = theme === 'dark';

  const navLinkClass = ({ isActive }) =>
    `px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-all ${
      isActive
        ? dark ? 'bg-slate-800 text-white' : 'bg-slate-900 text-white'
        : dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
    }`;

  return (
    <header className={`sticky top-0 z-50 border-b ${
      dark ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200'
    } backdrop-blur-sm`}>
      <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <NavLink to="/" className={`font-sans font-bold text-base tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
            Meridian
          </NavLink>
          {user && (
            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/" end className={navLinkClass}>News</NavLink>
              <NavLink to="/shlob" className={navLinkClass}>Shlob</NavLink>
              <NavLink to="/watchlist" className={navLinkClass}>Watchlist</NavLink>
              <NavLink to="/portfolio" className={navLinkClass}>Portfolio</NavLink>
              <NavLink to="/friends" className={({ isActive }) => navLinkClass({ isActive }) + ' relative'}>
                Friends
                {unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-blue-500 text-white min-w-[16px] text-center leading-tight">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </NavLink>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <>
              <span className={`hidden lg:inline text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                {formatTime(lastUpdated)}
              </span>
              <TickerAutocomplete
                value={headerSearch}
                onChange={setHeaderSearch}
                onSelect={(symbol) => { setHeaderSearch(''); navigate(`/ticker/${symbol}`); }}
                onEnter={(val) => { if (val.trim()) { setHeaderSearch(''); navigate(`/ticker/${val.trim()}`); } }}
                placeholder="Go to ticker..."
                inputClassName={`w-36 px-3 py-1.5 rounded-md border text-xs font-mono ${
                  dark
                    ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500'
                    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                } focus:outline-none focus:ring-2 focus:ring-slate-400/30`}
              />
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={`px-3 py-1 text-xs font-medium rounded-md border transition-all ${
                  dark
                    ? 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                    : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-400'
                } disabled:opacity-40`}
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </>
          )}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-md transition-colors ${
              dark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-900'
            }`}
          >
            {dark ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
            )}
          </button>
          {user && <UserMenu />}
        </div>
      </div>
      {user && (
        <nav className="md:hidden flex items-center gap-1 px-6 pb-2 overflow-x-auto">
          <NavLink to="/" end className={navLinkClass}>News</NavLink>
          <NavLink to="/shlob" className={navLinkClass}>Shlob</NavLink>
          <NavLink to="/watchlist" className={navLinkClass}>Watchlist</NavLink>
          <NavLink to="/portfolio" className={navLinkClass}>Portfolio</NavLink>
          <NavLink to="/friends" className={({ isActive }) => navLinkClass({ isActive }) + ' relative'}>
            Friends
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-blue-500 text-white min-w-[16px] text-center leading-tight">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </NavLink>
        </nav>
      )}
    </header>
  );
}

function AppContent() {
  const { theme } = useTheme();
  const { user, loading } = useAuth();

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-900' : 'bg-[#fafafa]'}`}>
      <Header />
      <main className="max-w-[1440px] mx-auto px-6 py-6">
        <Routes>
          <Route path="/login" element={user && !loading ? <Navigate to="/" replace /> : <LoginView />} />
          <Route path="/" element={<ProtectedRoute><NewsFeed /></ProtectedRoute>} />
          <Route path="/filings" element={<Navigate to="/" replace />} />
          <Route path="/earnings" element={<ProtectedRoute><EarningsView /></ProtectedRoute>} />
          <Route path="/social" element={<Navigate to="/" replace />} />
          <Route path="/shlob" element={<ProtectedRoute><ShlobView /></ProtectedRoute>} />
          <Route path="/watchlist" element={<ProtectedRoute><WatchlistView /></ProtectedRoute>} />
          <Route path="/portfolio" element={<ProtectedRoute><PortfolioView /></ProtectedRoute>} />
          <Route path="/ticker/:symbol" element={<ProtectedRoute><TickerDetail /></ProtectedRoute>} />
          <Route path="/friends" element={<ProtectedRoute><FriendsView /></ProtectedRoute>} />
          <Route path="/compare/:userId" element={<ProtectedRoute><CompareView /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
