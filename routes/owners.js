const express = require('express');
const router  = express.Router();
const Owner   = require('../models/Owner');
const Notification = require('../models/Notification');
const upload  = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

async function emitOwnerNotif(req, owner, action, changes = []) {
  if (!req.user) return;
  try {
    const notif = await Notification.create({
      targetType:   'owner',
      customerName: owner.name,
      updatedBy:    req.user.displayName || req.user.username,
      action,
      changes,
    });
    req.app.get('io')?.to('admins').emit('customer-notification', {
      _id:          notif._id,
      targetType:   'owner',
      customerName: owner.name,
      updatedBy:    req.user.displayName || req.user.username,
      action,
      changes,
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
    const createChanges = [
      { field: 'ຊື່', from: '', to: owner.name || '' },
      ...(owner.link ? [{ field: 'ລິ້ງ', from: '', to: owner.link }] : []),
    ];
    emitOwnerNotif(req, owner, 'create', createChanges);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const { name, link, photo } = req.body;
    const before = await Owner.findById(req.params.id).lean();
    const owner = await Owner.findByIdAndUpdate(
      req.params.id,
      { name, link, photo },
      { new: true }
    );
    if (!owner) return res.status(404).json({ message: 'Not found' });
    res.json(owner);
    const FIELDS = { name: 'ຊື່', link: 'ລິ້ງ' };
    const changes = Object.entries(FIELDS)
      .filter(([k]) => Object.prototype.hasOwnProperty.call(req.body, k))
      .map(([k, label]) => {
        const from = String(before?.[k] ?? '').trim();
        const to   = String(req.body[k]  ?? '').trim();
        return from !== to ? { field: label, from, to } : null;
      }).filter(Boolean);
    // Detect photo change
    if (photo !== undefined) {
      const beforePhoto = String(before?.photo ?? '').trim();
      const toPhoto = String(photo ?? '').trim();
      if (beforePhoto !== toPhoto) {
        if (toPhoto && !beforePhoto) {
          changes.push({ field: 'ຮູບພາບ', from: '', to: 'ເພີ່ມຮູບ' });
        } else if (!toPhoto && beforePhoto) {
          changes.push({ field: 'ຮູບພາບ', from: '', to: 'ລົບຮູບ' });
        }
      }
    }
    emitOwnerNotif(req, owner, 'update', changes);
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
    emitOwnerNotif(req, owner, 'upload_image', [{ field: 'ຮູບພາບ', from: '', to: photo }]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE photo
router.delete('/:id/photo', async (req, res) => {
  try {
    const owner = await Owner.findById(req.params.id);
    if (!owner) return res.status(404).json({ message: 'Not found' });
    await Owner.findByIdAndUpdate(req.params.id, { photo: '' });
    res.json({ photo: '' });
    emitOwnerNotif(req, owner, 'delete_image', [{ field: 'ລົບຮູບ', from: owner.name, to: new Date().toISOString() }]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
