const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const Notification = require('../models/Notification');

router.use(authenticate);

router.get('/', async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.json([]);
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const notifs = await Notification.find()
      .sort({ createdAt: -1 }).limit(limit).lean();
    res.json(notifs.map(n => ({
      ...n,
      isRead: Array.isArray(n.readBy) && n.readBy.some(id => id.equals(req.user._id)),
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
