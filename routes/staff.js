const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');

router.get('/', async (req, res) => {
  try {
    const staff = await Staff.find({ active: true }).sort({ name: 1 });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const member = await Staff.create(req.body);
    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const member = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(member);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Staff.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
