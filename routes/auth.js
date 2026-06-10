const router = require('express').Router();
const jwt = require('jsonwebtoken');
const passport = require('../middleware/passport');
const { authenticate } = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'vts_secret';
const sign = (id) => jwt.sign({ id }, SECRET, { expiresIn: '7d' });

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const { _id, username, displayName, email, role, avatar, permissions } = req.user;
  res.json({ _id, username, displayName, email, role, avatar, permissions });
});

// GET /api/auth/google — initiate Google OAuth
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ message: 'Google OAuth not configured' });
  const opts = { scope: ['profile', 'email'], session: false };
  if (req.query.prompt) opts.prompt = req.query.prompt;
  passport.authenticate('google', opts)(req, res, next);
});

// GET /api/auth/google/callback — Google OAuth callback
router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ message: 'Google OAuth not configured' });
  passport.authenticate('google', { session: false, failureRedirect: (process.env.FRONTEND_URL || 'http://localhost:5173') + '/login' })(req, res, next);
}, (req, res) => {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (req.user.status === 'pending') {
    return res.redirect(`${frontend}/login?error=${encodeURIComponent('ບັນຊີຂອງທ່ານລໍຖ້າການອະນຸຍາດຈາກຜູ້ດູແລລະບົບ')}`);
  }
  if (req.user.status === 'rejected') {
    return res.redirect(`${frontend}/login?error=${encodeURIComponent('ບັນຊີຂອງທ່ານຖືກປະຕິເສດ')}`);
  }

  const token = sign(req.user._id);
  const user = {
    _id: req.user._id, username: req.user.username, email: req.user.email,
    displayName: req.user.displayName, role: req.user.role, status: req.user.status,
    avatar: req.user.avatar, permissions: req.user.permissions,
  };
  res.redirect(`${frontend}/login?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
});

module.exports = router;
