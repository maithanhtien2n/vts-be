const router = require('express').Router();
const jwt = require('jsonwebtoken');
const passport = require('../middleware/passport');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'vts_secret';
const sign = (id) => jwt.sign({ id }, SECRET, { expiresIn: '7d' });

// POST /api/auth/login  (accepts username or email)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const isEmail = username && username.includes('@');
    const user = isEmail
      ? await User.findOne({ email: username.toLowerCase().trim() })
      : await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (user.status === 'pending') {
      return res.status(403).json({ message: 'ບັນຊີຂອງທ່ານລໍຖ້າການອະນຸຍາດຈາກຜູ້ດູແລລະບົບ' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ message: 'ບັນຊີຂອງທ່ານຖືກປະຕິເສດ' });
    }
    res.json({
      token: sign(user._id),
      user: { _id: user._id, username: user.username, email: user.email, displayName: user.displayName, role: user.role, status: user.status },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login/email
router.post('/login/email', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    let user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      const username = email.split('@')[0] + '_' + Date.now();
      user = await User.create({ username, email: email.toLowerCase().trim(), displayName: email.split('@')[0], password, role: 'staff', status: 'pending' });
      return res.status(403).json({ message: 'ບັນຊີຂອງທ່ານລໍຖ້າການອະນຸຍາດຈາກຜູ້ດູແລລະບົບ' });
    }
    if (user.status === 'pending') {
      return res.status(403).json({ message: 'ບັນຊີຂອງທ່ານລໍຖ້າການອະນຸຍາດຈາກຜູ້ດູແລລະບົບ' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ message: 'ບັນຊີຂອງທ່ານຖືກປະຕິເສດ' });
    }
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    res.json({
      token: sign(user._id),
      user: { _id: user._id, username: user.username, email: user.email, displayName: user.displayName, role: user.role, status: user.status },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ message: 'ອີເມວນີ້ຖືກໃຊ້ແລ້ວ / Email already exists' });
    }
    const username = email.split('@')[0] + '_' + Date.now();
    await User.create({
      username,
      email: email.toLowerCase().trim(),
      displayName: displayName || email.split('@')[0],
      password,
      role: 'staff',
      status: 'pending',
    });
    res.status(201).json({ message: 'ບັນຊີຂອງທ່ານລໍຖ້າການອະນຸຍາດຈາກຜູ້ດູແລລະບົບ' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const { _id, username, displayName, email, role, avatar } = req.user;
  res.json({ _id, username, displayName, email, role, avatar });
});

// GET /api/auth/google — initiate Google OAuth
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ message: 'Google OAuth not configured' });
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

// GET /api/auth/google/callback — Google OAuth callback
router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ message: 'Google OAuth not configured' });
  passport.authenticate('google', { session: false, failureRedirect: (process.env.FRONTEND_URL || 'http://localhost:5173') + '/login' })(req, res, next);
}, (req, res) => {
  const token = sign(req.user._id);
  const user = {
    _id: req.user._id, username: req.user.username, email: req.user.email,
    displayName: req.user.displayName, role: req.user.role, status: req.user.status, avatar: req.user.avatar,
  };
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontend}/login?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
});

module.exports = router;
