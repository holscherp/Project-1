import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import NewsFeed from './views/NewsFeed.jsx';
import FilingsView from './views/FilingsView.jsx';
import EarningsView from './views/EarningsView.jsx';
import ChatView from './views/ChatView.jsx';
import WatchlistView from './views/WatchlistView.jsx';
import TickerDetail from './views/TickerDetail.jsx';

function Header() {
  const { theme, toggleTheme } = useTheme();
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.last_updated) setLastUpdated(data.last_updated);
      } catch {}
    };
    fetchSettings();
    const interval = setInterval(fetchSettings, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/settings/refresh', { method: 'POST' });
    } catch {}
    setTimeout(() => setRefreshing(false), 3000);
  };

  const formatTime = (iso) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const navLinkClass = ({ isActive }) =>
    `px-3 py-1.5 text-sm font-medium rounded transition-colors ${
      isActive
        ? 'bg-accent-blue text-white'
        : theme === 'dark'
          ? 'text-navy-400 hover:text-navy-200 hover:bg-navy-700'
          : 'text-navy-600 hover:text-navy-900 hover:bg-navy-100'
    }`;

  return (
    <header className={`sticky top-0 z-50 border-b backdrop-blur-sm ${
      theme === 'dark' ? 'bg-navy-900/95 border-navy-700' : 'bg-white/95 border-navy-200'
    }`}>
      <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <NavLink to="/" className="font-mono font-bold text-lg tracking-wider text-accent-green">
            MERIDIAN
          </NavLink>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>News</NavLink>
            <NavLink to="/filings" className={navLinkClass}>Filings</NavLink>
            <NavLink to="/earnings" className={navLinkClass}>Earnings</NavLink>
            <NavLink to="/chat" className={navLinkClass}>Chat</NavLink>
            <NavLink to="/watchlist" className={navLinkClass}>Watchlist</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className={`hidden lg:inline text-xs font-mono ${theme === 'dark' ? 'text-navy-500' : 'text-navy-400'}`}>
            Updated: {formatTime(lastUpdated)}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
              theme === 'dark'
                ? 'border-navy-600 text-navy-400 hover:text-accent-green hover:border-accent-green'
                : 'border-navy-300 text-navy-500 hover:text-accent-green hover:border-accent-green'
            } disabled:opacity-50`}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded transition-colors ${
              theme === 'dark' ? 'text-navy-400 hover:text-amber-400' : 'text-navy-500 hover:text-navy-900'
            }`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
            )}
          </button>
        </div>
      </div>
      {/* Mobile nav */}
      <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
        <NavLink to="/" end className={navLinkClass}>News</NavLink>
        <NavLink to="/filings" className={navLinkClass}>Filings</NavLink>
        <NavLink to="/earnings" className={navLinkClass}>Earnings</NavLink>
        <NavLink to="/chat" className={navLinkClass}>Chat</NavLink>
        <NavLink to="/watchlist" className={navLinkClass}>Watchlist</NavLink>
      </nav>
    </header>
  );
}

function AppContent() {
  const { theme } = useTheme();

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-navy-900' : 'bg-white'}`}>
      <Header />
      <main className="max-w-[1600px] mx-auto px-4 py-4">
        <Routes>
          <Route path="/" element={<NewsFeed />} />
          <Route path="/filings" element={<FilingsView />} />
          <Route path="/earnings" element={<EarningsView />} />
          <Route path="/chat" element={<ChatView />} />
          <Route path="/watchlist" element={<WatchlistView />} />
          <Route path="/ticker/:symbol" element={<TickerDetail />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}
