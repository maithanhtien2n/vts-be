const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const upload  = require('../middleware/upload');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const query = { active: true };
    if (['staff', 'partner'].includes(req.user.role)) {
      const allowed = (req.user.assignedProjects ?? []).map(p => p.toString());
      query._id = { $in: allowed };
    }
    const projects = await Project.find(query).sort({ name: 1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const project = await Project.create(req.body);
    res.status(201).json(project);
  } catch (err) {
    const msg = err.code === 11000
      ? 'ຊື່ໂຄງການນີ້ມີຢູ່ແລ້ວ / Project name already exists'
      : err.message;
    res.status(400).json({ message: msg });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(project);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await Project.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/images', upload.array('images', 10), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Not found' });
    const newImgs = req.files.map(f => ({
      url: `/uploads/${f.filename}`,
      uploadedBy: req.body.uploadedBy || '',
    }));
    project.images.push(...newImgs);
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
