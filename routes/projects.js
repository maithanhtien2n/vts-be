const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const upload  = require('../middleware/upload');
const { authenticate, adminOnly, requireEditPerm, requireDeletePerm } = require('../middleware/auth');

router.use(authenticate);

async function emitProjectNotif(req, name, action, changes = []) {
  if (!req.user) return;
  try {
    const notif = await Notification.create({
      targetType: 'project', customerName: name,
      updatedBy: req.user.displayName || req.user.username, action, changes,
    });
    req.app.get('io')?.to('admins').emit('customer-notification', {
      _id: notif._id, targetType: 'project', customerName: name,
      updatedBy: req.user.displayName || req.user.username, action, changes, createdAt: notif.createdAt,
    });
  } catch {}
}

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
    const changes = [
      { field: 'ຊື່ໂຄງການ', from: '', to: project.name || '' },
      project.description ? { field: 'ລາຍລະອຽດ',  from: '', to: project.description } : null,
      project.location    ? { field: 'ໂລເຄຊັ້ນ',   from: '', to: project.location    } : null,
      ...((project.images || []).map(img => ({ field: 'image', from: '', to: typeof img === 'string' ? img : img.url }))),
    ].filter(Boolean);
    emitProjectNotif(req, project.name, 'create', changes);
  } catch (err) {
    const msg = err.code === 11000
      ? 'ຊື່ໂຄງການນີ້ມີຢູ່ແລ້ວ / Project name already exists'
      : err.message;
    res.status(400).json({ message: msg });
  }
});

router.put('/:id', requireEditPerm, async (req, res) => {
  try {
    const before = await Project.findById(req.params.id).lean();
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(project);
    const PROJ_FIELDS = { name: 'ຊື່ໂຄງການ', description: 'ລາຍລະອຽດ', location: 'ໂລເຄຊັ້ນ' };
    const changes = Object.entries(PROJ_FIELDS)
      .filter(([k]) => Object.prototype.hasOwnProperty.call(req.body, k))
      .map(([k, label]) => {
        const from = String(before?.[k] ?? '').trim();
        const to   = String(req.body[k] ?? '').trim();
        return from !== to ? { field: label, from, to } : null;
      }).filter(Boolean);
    emitProjectNotif(req, project.name, 'update', changes);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', requireDeletePerm, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    await Project.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ message: 'Deleted' });
    if (project) emitProjectNotif(req, project.name, 'delete');
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
    const imageChanges = newImgs.map(img => ({ field: 'image', from: '', to: img.url }));
    emitProjectNotif(req, project.name, 'upload_image', imageChanges);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id/images', requireEditPerm, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Not found' });
    const { imageUrl } = req.body;
    const imageObj = project.images.find(i => i.url === imageUrl);
    const uploadedBy = imageObj?.uploadedBy || '—';
    const uploadedAt = imageObj?.createdAt ? new Date(imageObj.createdAt).toISOString() : '';
    project.images = project.images.filter(i => i.url !== imageUrl);
    await project.save();
    res.json(project);
    emitProjectNotif(req, project.name, 'delete_image', [{ field: 'ລົບຮູບ', from: uploadedBy, to: uploadedAt }]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
