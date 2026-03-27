import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function SocialView() {
  const { theme } = useTheme();
  const [accounts, setAccounts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');

  const dark = theme === 'dark';

  useEffect(() => {
    const fetchSocial = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/social');
        if (!res.ok) throw new Error('Failed to fetch social data');
        const data = await res.json();
        setAccounts(data.accounts || []);
        setPosts(data.posts || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSocial();
  }, []);

  const categories = ['all', ...new Set(accounts.map(a => a.category).filter(Boolean))];

  const filteredAccounts = activeCategory === 'all'
    ? accounts
    : accounts.filter(a => a.category === activeCategory);

  const filteredPosts = activeCategory === 'all'
    ? posts
    : posts.filter(p => {
        const account = accounts.find(a => a.account_handle === p.author_handle);
        return account && account.category === activeCategory;
      });

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) return <LoadingSpinner message="Loading social feeds..." />;
  if (error) return <ErrorMessage message={error} onRetry={() => window.location.reload()} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-xs font-bold uppercase tracking-widest ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          Social Feed
        </h1>
        <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
          {accounts.length} accounts tracked
        </span>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-all whitespace-nowrap ${
              activeCategory === cat
                ? dark ? 'bg-slate-800 text-white' : 'bg-slate-900 text-white'
                : dark ? 'text-slate-400 hover:text-white border border-slate-700' : 'text-slate-500 hover:text-slate-900 border border-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts sidebar */}
        <div className="lg:col-span-1">
          <h2 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            Tracked Accounts
          </h2>
          <div className="space-y-2">
            {filteredAccounts.map(account => (
              <div key={account.account_handle} className={`rounded-lg border p-4 ${
                dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-sm font-semibold ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {account.name}
                    </p>
                    <p className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                      @{account.account_handle}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                    dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {account.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Posts feed */}
        <div className="lg:col-span-2">
          <h2 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            Recent Posts
          </h2>
          {filteredPosts.length === 0 ? (
            <div className={`text-center py-16 rounded-lg border ${dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
              <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>No posts available yet.</p>
              <p className={`text-xs mt-2 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                Social feeds are fetched during the hourly update cycle via Nitter/RSS Bridge.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post, i) => (
                <div key={`${post.author_handle}-${i}`} className={`rounded-lg border p-5 ${
                  dark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
                        {post.author_name || post.author_handle}
                      </span>
                      <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                        @{post.author_handle}
                      </span>
                    </div>
                    <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {formatTime(post.created_at)}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {post.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
