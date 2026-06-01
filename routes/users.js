const router = require('express').Router();
const User = require('../models/User');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

// GET /api/users  (admin only)
router.get('/', adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/users  (admin only)
router.post('/', adminOnly, async (req, res) => {
  try {
    const { username, displayName, password, role } = req.body;
    const user = await User.create({ username, displayName, password, role });
    const { _id, username: u, displayName: d, role: r } = user;
    res.status(201).json({ _id, username: u, displayName: d, role: r });
  } catch (err) {
    const msg = err.code === 11000 ? 'Username already exists' : err.message;
    res.status(400).json({ message: msg });
  }
});

// PUT /api/users/:id  (admin only)
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { username, displayName, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { username, displayName, role },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /api/users/pending  (admin only)
router.get('/pending', adminOnly, async (req, res) => {
  try {
    const users = await User.find({ status: 'pending' }).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/:id/approve  (admin only)
router.put('/:id/approve', adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/users/:id  (admin only)
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/:id/password
router.put('/:id/password', async (req, res) => {
  try {
    const isSelf = req.params.id === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (isSelf && !isAdmin) {
      const { oldPassword } = req.body;
      if (!(await user.comparePassword(oldPassword))) {
        return res.status(401).json({ message: 'Wrong current password' });
      }
    }

    user.password = req.body.newPassword;
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
