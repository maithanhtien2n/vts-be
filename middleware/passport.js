const passport = require('passport');
const User = require('../models/User');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // 1. Match by Google ID
      let user = await User.findOne({ googleId: profile.id });
      if (user) return done(null, user);

      const email = profile.emails?.[0]?.value || '';

      // 2. Match by email — links Google ID to existing account (e.g. seeded admin)
      if (email) {
        user = await User.findOne({ email });
        if (user) {
          user.googleId = profile.id;
          if (!user.avatar) user.avatar = profile.photos?.[0]?.value || '';
          await user.save();
          return done(null, user);
        }
      }

      // 3. Create new pending account
      const base = email.split('@')[0] || profile.id;
      user = await User.create({
        username: base + '_google',
        email,
        displayName: profile.displayName || base,
        googleId: profile.id,
        avatar: profile.photos?.[0]?.value || '',
        role: 'staff',
        status: 'pending',
      });
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }));
} else {
  console.warn('Google OAuth not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
