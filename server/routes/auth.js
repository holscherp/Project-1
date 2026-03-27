import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router();

// ── Passport configuration ─────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim();
const GOOGLE_CALLBACK_URL = (process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback').trim();

const oauthConfigured = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

if (oauthConfigured) {
passport.use(new GoogleStrategy(
  {
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL,
  },
  (accessToken, refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value || '';
      const name = profile.displayName || email;
      const avatarUrl = profile.photos?.[0]?.value || null;
      const now = new Date().toISOString();

      let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

      if (!user) {
        const id = uuidv4();
        db.prepare(
          'INSERT INTO users (id, google_id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(id, googleId, email, name, avatarUrl, now);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      } else {
        // Update name/avatar in case they changed
        db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE google_id = ?')
          .run(name, avatarUrl, googleId);
        user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
      }

      done(null, user);
    } catch (err) {
      done(err);
    }
  }
));
} // end if (oauthConfigured)

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    done(null, user || null);
  } catch (err) {
    done(err);
  }
});

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/auth/google — initiate OAuth
router.get('/google', (req, res, next) => {
  if (!oauthConfigured) {
    return res.status(503).send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// GET /api/auth/google/callback — handle callback
router.get('/google/callback', (req, res, next) => {
  if (!oauthConfigured) return res.redirect('/login?error=oauth_not_configured');
  passport.authenticate('google', { failureRedirect: '/login?error=oauth_failed' })(req, res, next);
}, (req, res) => {
  res.redirect('/');
});

// GET /api/auth/me — current user
router.get('/me', (req, res) => {
  res.json({ user: req.user || null });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

export default router;
