const express = require('express');
const router  = express.Router();
const Owner   = require('../models/Owner');
const Notification = require('../models/Notification');
const upload  = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

async function emitOwnerNotif(req, owner, action) {
  if (!['staff', 'partner'].includes(req.user?.role)) return;
  try {
    const notif = await Notification.create({
      targetType:   'owner',
      customerName: owner.name,
      updatedBy:    req.user.displayName || req.user.username,
      action,
    });
    req.app.get('io')?.to('admins').emit('customer-notification', {
      _id:          notif._id,
      targetType:   'owner',
      customerName: owner.name,
      updatedBy:    req.user.displayName || req.user.username,
      action,
      createdAt:    notif.createdAt,
    });
  } catch {}
}

// GET all
router.get('/', async (req, res) => {
  try {
    const owners = await Owner.find().sort({ createdAt: -1 });
    res.json(owners);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const { name, link, photo } = req.body;
    const owner = await Owner.create({ name, link, photo });
    res.status(201).json(owner);
    emitOwnerNotif(req, owner, 'create');
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const { name, link, photo } = req.body;
    const owner = await Owner.findByIdAndUpdate(
      req.params.id,
      { name, link, photo },
      { new: true }
    );
    if (!owner) return res.status(404).json({ message: 'Not found' });
    res.json(owner);
    emitOwnerNotif(req, owner, 'update');
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const owner = await Owner.findById(req.params.id);
    if (!owner) return res.status(404).json({ message: 'Not found' });
    await Owner.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
    emitOwnerNotif(req, owner, 'delete');
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST upload photo
router.post('/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const photo = `/uploads/${req.file.filename}`;
    const owner = await Owner.findByIdAndUpdate(req.params.id, { photo }, { new: true });
    if (!owner) return res.status(404).json({ message: 'Not found' });
    res.json({ photo });
    emitOwnerNotif(req, owner, 'upload_image');
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
