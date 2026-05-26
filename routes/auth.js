const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'vts_secret';
const sign = (id) => jwt.sign({ id }, SECRET, { expiresIn: '7d' });

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    res.json({
      token: sign(user._id),
      user: { _id: user._id, username: user.username, displayName: user.displayName, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const { _id, username, displayName, role } = req.user;
  res.json({ _id, username, displayName, role });
});

module.exports = router;
