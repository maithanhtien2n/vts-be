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
    if (!req.body._suppressNotif) {
      const changes = [
        { field: 'ຊື່ໂຄງການ', from: '', to: project.name || '' },
        project.description ? { field: 'ລາຍລະອຽດ',  from: '', to: project.description } : null,
        project.location    ? { field: 'ໂລເຄຊັ້ນ',   from: '', to: project.location    } : null,
      ].filter(Boolean);
      emitProjectNotif(req, project.name, 'create', changes);
    }
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
    if (changes.length && !req.body._suppressNotif) {
      emitProjectNotif(req, project.name, 'update', changes);
    }
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

    if (req.body._asCreate === 'true') {
      // Combined create + images notification
      const changes = [
        { field: 'ຊື່ໂຄງການ', from: '', to: req.body.createName || '' },
        req.body.createDesc ? { field: 'ລາຍລະອຽດ', from: '', to: req.body.createDesc } : null,
        req.body.createLocation ? { field: 'ໂລເຄຊັ້ນ', from: '', to: req.body.createLocation } : null,
      ].filter(Boolean);
      const imageChanges = newImgs.map(img => ({ field: 'image', from: '', to: img.url }));
      imageChanges.push({ field: 'ຖ້ອຍຕົວ', from: '', to: `ເພີ່ມ ${newImgs.length} ຮູບ` });
      emitProjectNotif(req, project.name, 'create', [...changes, ...imageChanges]);
    } else if (req.body._combined === 'true') {
      // Combined edit notification (PUT is suppressed)
      const changes = [];

      // Text field changes
      if (req.body.editName) changes.push({ field: 'ຊື່ໂຄງການ', from: '', to: req.body.editName });
      if (req.body.editDesc) changes.push({ field: 'ລາຍລະອຽດ', from: '', to: req.body.editDesc });
      if (req.body.editLoc) changes.push({ field: 'ໂລເຄຊັ້ນ', from: '', to: req.body.editLoc });

      if (newImgs.length) {
        changes.push(...newImgs.map(img => ({ field: 'image', from: '', to: img.url })));
        changes.push({ field: 'ຖ້ອຍຕົວ', from: '', to: `ເພີ່ມ ${newImgs.length} ຮູບ` });
      }
      const delCount = parseInt(req.body.deletedCount) || 0;
      if (delCount) {
        changes.push({ field: 'image_deleted', from: '', to: '' });
        changes.push({ field: 'ຖ້ອຍຕົວ', from: '', to: `ລົບ ${delCount} ຮູບ` });
      }
      if (changes.length) emitProjectNotif(req, project.name, 'update', changes);
    } else {
      const count = newImgs.length;
      const imageChanges = newImgs.map(img => ({ field: 'image', from: '', to: img.url }));
      imageChanges.push({ field: 'ຖ້ອຍຕົວ', from: '', to: `ເພີ່ມ ${count} ຮູບ` });
      emitProjectNotif(req, project.name, 'update', imageChanges);
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id/images', requireEditPerm, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Not found' });
    const { imageUrl } = req.body;
    project.images = project.images.filter(i => i.url !== imageUrl);
    await project.save();
    res.json(project);
    if (!req.body._suppressNotif) {
      emitProjectNotif(req, project.name, 'update', [
        { field: 'image_deleted', from: '', to: imageUrl },
        { field: 'ຖ້ອຍຕົວ', from: '', to: 'ລົບ 1 ຮູບ' },
      ]);
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
