const router = require('express').Router();
const User = require('../models/User');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

// GET /users/staff-list — minimal name+phones for all authenticated users (staff lookup in HomeView)
router.get('/staff-list', async (req, res) => {
  try {
    const users = await User.find({ status: 'active', deactivated: { $ne: true } })
      .select('displayName username phones role');
    res.json(users.map(u => ({
      _id:   u._id,
      name:  u.displayName || u.username,
      phones: u.phones ?? [],
      role:  u.role,
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users  (admin only)
router.get('/', adminOnly, async (req, res) => {
  try {
    const filter = { status: 'active', deactivated: { $ne: true } };
    if (req.query.all === '1') delete filter.deactivated;
    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users/deactivated  (admin only)
router.get('/deactivated', adminOnly, async (req, res) => {
  try {
    const users = await User.find({ status: 'active', deactivated: true }).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/:id/deactivate  (admin only)
router.put('/:id/deactivate', adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { deactivated: true },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/:id/reactivate  (admin only)
router.put('/:id/reactivate', adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { deactivated: false },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/me  (any authenticated user — update own phones)
router.put('/me', async (req, res) => {
  try {
    const { phones } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { phones },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
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
    const { username, displayName, role, permissions, assignedProjects, phones } = req.body;
    const updateData = { username, displayName, role };
    if (permissions !== undefined) updateData.permissions = permissions;
    if (assignedProjects !== undefined) updateData.assignedProjects = assignedProjects;
    if (phones !== undefined) updateData.phones = phones;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
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
    const update = { status: 'active' };
    if (req.body.role) update.role = req.body.role;
    if (req.body.permissions) update.permissions = req.body.permissions;
    if (req.body.assignedProjects !== undefined) update.assignedProjects = req.body.assignedProjects;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
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

module.exports = router;
