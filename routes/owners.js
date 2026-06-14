const express = require('express');
const router  = express.Router();
const Owner   = require('../models/Owner');
const upload  = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

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
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await Owner.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
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

module.exports = router;
