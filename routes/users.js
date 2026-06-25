const router = require('express').Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

async function emitStaffNotif(req, name, action, changes = []) {
  if (!req.user) return;
  try {
    const notif = await Notification.create({
      targetType: 'staff', customerName: name,
      updatedBy: req.user.displayName || req.user.username, action, changes,
    });
    req.app.get('io')?.to('admins').emit('customer-notification', {
      _id: notif._id, targetType: 'staff', customerName: name,
      updatedBy: req.user.displayName || req.user.username, action, changes, createdAt: notif.createdAt,
    });
  } catch {}
}

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
    emitStaffNotif(req, displayName || username, 'create');
  } catch (err) {
    const msg = err.code === 11000 ? 'Username already exists' : err.message;
    res.status(400).json({ message: msg });
  }
});

// PUT /api/users/:id  (admin only)
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { username, displayName, role, permissions, assignedProjects, assignedStaff, phones } = req.body;
    const before = await User.findById(req.params.id).select('-password').lean();
    const updateData = { username, displayName, role };
    if (permissions !== undefined) updateData.permissions = permissions;
    if (assignedProjects !== undefined) updateData.assignedProjects = assignedProjects;
    if (assignedStaff !== undefined) updateData.assignedStaff = assignedStaff;
    if (phones !== undefined) updateData.phones = phones;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
    // Compute changes
    const USER_FIELDS = {
      username: 'Username', displayName: 'ຊື່ສະແດງ', role: 'ບົດບາດ', phones: 'ເບີໂທ'
    };
    const ROLE_LABELS = { staff: 'ພະນັກງານ', partner: 'ຮຸ້ນສ່ວນ', admin: 'ແອັດມິນ', super_admin: 'ເຈົ້າຂອງ' };
    const changes = [];
    for (const [key, label] of Object.entries(USER_FIELDS)) {
      if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;
      let from = before?.[key];
      let to = req.body[key];
      if (key === 'role') {
        from = ROLE_LABELS[from] || from || '';
        to = ROLE_LABELS[to] || to || '';
      }
      if (Array.isArray(from)) from = from.join(', ');
      if (Array.isArray(to)) to = to.join(', ');
      from = from == null ? '' : String(from).trim();
      to = to == null ? '' : String(to).trim();
      if (from !== to) changes.push({ field: label, from, to });
    }
    // Check permission changes
    const permMap = { view: 'ເບິ່ງ', edit: 'ແກ້ໄຂ', insert: 'ເພີ່ມ', update: 'ອັບໂຫລດ', delete: 'ລົບ', deleteImage: 'ລົບຮູບ' };
    if (permissions !== undefined) {
      const fromPerms = Object.entries(permMap).filter(([k]) => before?.permissions?.[k]).map(([, v]) => v).join(', ');
      const toPerms = Object.entries(permMap).filter(([k]) => permissions[k]).map(([, v]) => v).join(', ');
      if (fromPerms !== toPerms) changes.push({ field: 'ສິດ', from: fromPerms, to: toPerms });
    }
    // Check project changes
    if (assignedProjects !== undefined) {
      const Project = require('../models/Project');
      const fromIds = (before?.assignedProjects || []).map(i => i.toString());
      const toIds = (assignedProjects || []).map(i => i.toString());
      if (fromIds.length > 0 || toIds.length > 0) {
        const projs = await Project.find({ _id: { $in: [...fromIds, ...toIds] } }).select('name').lean();
        const nameMap = {};
        projs.forEach(p => nameMap[p._id.toString()] = p.name);
        const fromNames = fromIds.map(id => nameMap[id] || id).filter(Boolean);
        const toNames = toIds.map(id => nameMap[id] || id).filter(Boolean);
        const fromStr = fromNames.join(', ');
        const toStr = toNames.join(', ');
        if (fromStr !== toStr) changes.push({ field: 'ໂຄງການ', from: fromStr, to: toStr });
      }
    }
    // Check staff changes
    if (assignedStaff !== undefined) {
      const fromIds = (before?.assignedStaff || []).map(i => i.toString());
      const toIds = (assignedStaff || []).map(i => i.toString());
      if (fromIds.length > 0 || toIds.length > 0) {
        const staffUsers = await User.find({ _id: { $in: [...fromIds, ...toIds] } }).select('displayName username').lean();
        const nameMap = {};
        staffUsers.forEach(u => nameMap[u._id.toString()] = u.displayName || u.username);
        const fromNames = fromIds.map(id => nameMap[id] || id).filter(Boolean);
        const toNames = toIds.map(id => nameMap[id] || id).filter(Boolean);
        const fromStr = fromNames.join(', ');
        const toStr = toNames.join(', ');
        if (fromStr !== toStr) changes.push({ field: 'ພະນັກງານ', from: fromStr, to: toStr });
      }
    }
    emitStaffNotif(req, user.displayName || user.username, 'update', changes);
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
    const ROLE_LABELS = { staff: 'ພະນັກງານ', partner: 'ຮຸ້ນສ່ວນ', admin: 'ແອັດມິນ' };
    const PERM_MAP    = { view: 'ເບິ່ງ', insert: 'ເພີ່ມ', edit: 'ແກ້ໄຂ', update: 'ອັບໂຫຼດ', delete: 'ລົບ' };
    const roleLabel = ROLE_LABELS[update.role] || update.role || '';
    const permStr = update.permissions
      ? Object.entries(PERM_MAP).filter(([k]) => update.permissions[k]).map(([, v]) => v).join(' / ')
      : '';
    const notifChanges = [
      ...(roleLabel ? [{ field: 'ບົດບາດ', from: '', to: roleLabel }] : []),
      ...(permStr   ? [{ field: 'ສິດ', from: '', to: permStr }] : []),
    ];
    if (req.body.parentPartnerName) {
      notifChanges.push({ field: 'ພາຍໃຕ້ຮຸ້ນສ່ວນ', from: '', to: req.body.parentPartnerName });
    }
    if (update.assignedProjects?.length) {
      Project.find({ _id: { $in: update.assignedProjects } }).select('name').lean()
        .then(projs => {
          if (projs.length) notifChanges.push({ field: 'ໂຄງການ', from: '', to: projs.map(p => p.name).join(', ') });
          emitStaffNotif(req, user.displayName || user.username, 'approve', notifChanges);
        })
        .catch(() => emitStaffNotif(req, user.displayName || user.username, 'approve', notifChanges));
    } else {
      emitStaffNotif(req, user.displayName || user.username, 'approve', notifChanges);
    }
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
    if (user.status === 'pending') {
      emitStaffNotif(req, user.displayName || user.username, 'reject', [
        { field: 'ອີເມວ', from: '', to: user.email || '' },
      ]);
    } else {
      emitStaffNotif(req, user.displayName || user.username, 'delete');
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
