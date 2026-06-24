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
    const { name, link, photo, _suppressNotif } = req.body;
    const owner = await Owner.create({ name, link, photo });
    res.status(201).json(owner);
    if (!_suppressNotif) {
      const createChanges = [
        { field: 'ຊື່', from: '', to: owner.name || '' },
        ...(owner.link ? [{ field: 'ລິ້ງ', from: '', to: owner.link }] : []),
      ];
      emitOwnerNotif(req, owner, 'create', createChanges);
    }
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update
router.put('/:id', async (req, res) => {
  try {
    const { name, link, photo, originalPhoto, _asCreate } = req.body;
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
        const from = _asCreate ? '' : String(before?.[k] ?? '').trim();
        const to   = String(req.body[k]  ?? '').trim();
        return to ? { field: label, from, to } : null;
      }).filter(Boolean);
    if (photo !== undefined && originalPhoto !== undefined) {
      const origPhoto = String(originalPhoto).trim();
      const toPhoto = String(photo).trim();
      if (origPhoto !== toPhoto) {
        if (toPhoto && !origPhoto) {
          changes.push({ field: 'ເພີ່ມຮູບ', from: '', to: toPhoto });
        } else if (!toPhoto && origPhoto) {
          changes.push({ field: 'ລົບຮູບ', from: '', to: origPhoto });
        }
      }
    }
    if (changes.length) emitOwnerNotif(req, owner, _asCreate ? 'create' : 'update', changes);
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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
