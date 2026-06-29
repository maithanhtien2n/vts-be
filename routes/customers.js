const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const Customer = require('../models/Customer');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const upload = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');

const TRACKED_FIELDS = {
  name:          'ຊື່ລູກຄ້າ',
  phone:         'ເບີໂທ',
  customerType:  'ປະເພດ',
  projects:      'ໂຄງການ',
  notes:         'ລາຍລະອຽດ',
  assignedStaff: 'ພະນັກງານ',
  ownerName:     'ເຈົ້າຂອງລູກຄ້າ',
  owners:        'ເຈົ້າຂອງລູກຄ້າ',
  contactedAt:   'ວັນທີລູກຄ້າທັກມາ',
};

function toDateStr(val) {
  if (val == null || val === '') return '';
  const d = new Date(val);
  return isNaN(d) ? String(val).trim() : d.toISOString().split('T')[0];
}

function computeChanges(before, body) {
  const changes = [];
  for (const [key, label] of Object.entries(TRACKED_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    let from = before ? before[key] : undefined;
    let to   = body[key];
    if (key === 'contactedAt') {
      from = toDateStr(from);
      to   = toDateStr(to);
    } else {
      if (Array.isArray(from)) from = from.join(', ');
      if (Array.isArray(to))   to   = to.join(', ');
      from = from == null ? '' : String(from).trim();
      to   = to   == null ? '' : String(to).trim();
    }
    if (from !== to) changes.push({ field: label, from, to });
  }
  return changes;
}

async function emitCustomerNotif(req, customer, action, changes = []) {
  if (!req.user) return;
  try {
    const notif = await Notification.create({
      customerId:    customer._id,
      customerName:  customer.name,
      customerPhone: customer.phone,
      updatedBy:     req.user.displayName || req.user.username,
      action,
      changes,
    });
    req.app.get('io')?.to('admins').emit('customer-notification', {
      _id:           notif._id,
      customerId:    customer._id,
      customerName:  customer.name,
      customerPhone: customer.phone,
      updatedBy:     req.user.displayName || req.user.username,
      action,
      changes,
      createdAt:     notif.createdAt,
    });
  } catch {}
}

router.use(authenticate);

// Upsert by phone: update safe fields only, preserve images/contactLog/no
async function upsertCustomer(data) {
  const updateFields = {};
  if (data.name)                    updateFields.name          = data.name;
  if (data.customerType?.length)    updateFields.customerType  = data.customerType;
  if (data.projects?.length)        updateFields.projects      = data.projects;
  if (data.contactedAt)             updateFields.contactedAt   = data.contactedAt;
  if (data.notes)                   updateFields.notes         = data.notes;
  if (data.owners       != null)   updateFields.owners        = data.owners;
  if (data.ownerName     != null)   updateFields.ownerName     = data.ownerName;
  if (data.ownerLink     != null)   updateFields.ownerLink     = data.ownerLink;
  if (data.ownerPhoto    != null)   updateFields.ownerPhoto    = data.ownerPhoto;
  if (data.updatedBy)               updateFields.updatedBy     = data.updatedBy;

  const phone = String(data.phone || '').trim();
  const existing = await Customer.findOne({ phone }).lean();

  if (existing) {
    const updated = await Customer.findByIdAndUpdate(
      existing._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate('projects', 'name');
    return { customer: updated, created: false, before: existing };
  } else {
    const customer = new Customer(data);
    await customer.save();
    await customer.populate('projects', 'name');
    return { customer, created: true, before: null };
  }
}

const TYPE_LABELS = {
  new: 'ลูกค้าใหม่',
  interested_land: 'สนใจที่ดิน',
  planning_visit: 'นัดดูที่ดิน',
  follow_up: 'ติดตาม',
  likely_rebuy: 'มีแนวโน้มซื้อซ้ำ',
  purchased: 'ซื้อแล้ว',
  out_of_province: 'ต่างจังหวัด',
  different_area: 'หาที่ดินต่างพื้นที่',
  blocked: 'บล็อก',
  not_ready: 'ยังไม่พร้อม',
  read_no_reply: 'อ่านแล้วไม่ตอบ',
  unread: 'ยังไม่อ่าน',
  repeat: 'ลูกค้าซ้ำ',
  purchased_team: 'ซื้อผ่านทีม',
  other: 'อื่นๆ',
  sell_for_us: 'ฝากขาย',
  responding: 'ตอบคำถาม',
  task: 'งานที่ต้องทำ',
  visited_land: 'ดูที่ดินแล้ว'
};

// GET all customers
router.get('/', async (req, res) => {
  try {
    const { search, type, project, staff, owner, dateFrom, dateTo, contactedFrom, contactedTo, page = 1, limit = 50 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }
    if (type) {
      const types = Array.isArray(type) ? type : type.split(',').map(t => t.trim()).filter(Boolean);
      query.customerType = { $in: types };
    }
    const isStaff   = req.user.role === 'staff';
    const isPartner = req.user.role === 'partner';

    // Staff: restrict to assignedProjects only
    const staffProjects = isStaff
      ? (req.user.assignedProjects?.map(p => p.toString()) ?? [])
      : null;

    // Helpers to match customers with no projects
    const noProjectCluses = [
      { projects: { $size: 0 } },
      { projects: { $exists: false } },
    ];

    if (isPartner) {
      // Partner sees: customers in their assignedProjects OR assigned by name + no-project customers
      const partnerProjects = (req.user.assignedProjects ?? []).map(p => p.toString());
      const partnerName     = req.user.displayName || req.user.username || '';

      if (project) {
        let requested = Array.isArray(project) ? project : project.split(',').map(p => p.trim()).filter(Boolean);
        requested = requested.filter(p => partnerProjects.includes(p));
        const orClauses = [];
        if (requested.length)  orClauses.push({ projects: { $in: requested } });
        if (partnerName)       orClauses.push({ assignedStaff: partnerName });
        orClauses.push(...noProjectCluses);
        query.$or = orClauses.length ? orClauses : [{ _id: null }];
      } else {
        const orClauses = [];
        if (partnerProjects.length) orClauses.push({ projects: { $in: partnerProjects } });
        if (partnerName)            orClauses.push({ assignedStaff: partnerName });
        orClauses.push(...noProjectCluses);
        if (orClauses.length) query.$or = orClauses;
      }
    } else if (project) {
      let requested = Array.isArray(project) ? project : project.split(',').map(p => p.trim()).filter(Boolean);
      if (staffProjects) requested = requested.filter(p => staffProjects.includes(p));
      if (requested.length) query.projects = requested.length === 1 ? requested[0] : { $in: requested };
      else if (staffProjects) query.projects = { $in: [] };
    } else if (staffProjects && staffProjects.length > 0) {
      // Staff has projects → their projects + no-project customers
      query.$or = [
        { projects: { $in: staffProjects } },
        ...noProjectCluses,
      ];
    } else if (staffProjects && staffProjects.length === 0) {
      // Staff has NO projects → only no-project customers
      query.$or = [...noProjectCluses];
    }
    if (staff) {
      const staffList = Array.isArray(staff) ? staff : staff.split(',').map(s => s.trim()).filter(Boolean);
      query.assignedStaff = staffList.length === 1
        ? { $regex: staffList[0], $options: 'i' }
        : { $in: staffList };
    }
    if (owner) {
      const ownerList = Array.isArray(owner) ? owner : owner.split(',').map(o => o.trim()).filter(Boolean);
      query['$or'] = (query['$or'] || []).concat(ownerList.map(n => ({ 'owners.name': n })));
    }
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom + 'T00:00:00+07:00');
      if (dateTo)   query.createdAt.$lte = new Date(dateTo + 'T23:59:59+07:00');
    }
    if (contactedFrom || contactedTo) {
      query.lastContactedAt = {};
      if (contactedFrom) query.lastContactedAt.$gte = new Date(contactedFrom + 'T00:00:00+07:00');
      if (contactedTo)   query.lastContactedAt.$lte = new Date(contactedTo + 'T23:59:59+07:00');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [customers, total] = await Promise.all([
      Customer.find(query)
        .populate('projects', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Customer.countDocuments(query)
    ]);

    res.json({ customers, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single customer
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate('projects', 'name');
    if (!customer) return res.status(404).json({ message: 'Not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create customer (phone-based upsert — preserves images, contactLog, no)
router.post('/', async (req, res) => {
  try {
    const { customer, created, before } = await upsertCustomer(req.body);
    res.status(created ? 201 : 200).json(customer);
    const changes = computeChanges(created ? null : before, req.body);
    emitCustomerNotif(req, customer, created ? 'create' : 'update', changes);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update customer
router.put('/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.images) {
      const now = new Date();
      body.images = body.images.map(img => {
        const obj = typeof img === 'string' ? { url: img } : { ...img };
        if (!obj.createdAt) obj.createdAt = now;
        obj.updatedAt = now;
        return obj;
      });
    }
    const before = await Customer.findById(req.params.id).lean();
    const customer = await Customer.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
      .populate('projects', 'name');
    if (!customer) return res.status(404).json({ message: 'Not found' });
    res.json(customer);
    const changes = computeChanges(before, body);
    emitCustomerNotif(req, customer, 'update', changes);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE customer
router.delete('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Not found' });
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
    emitCustomerNotif(req, customer, 'delete');
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST log contact
router.post('/:id/contact', async (req, res) => {
  try {
    const { staff, note } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      {
        $push: { contactLog: { staff, note, date: new Date() } },
        lastContactedBy: staff,
        lastContactedAt: new Date()
      },
      { new: true }
    ).populate('projects', 'name');
    res.json(customer);
    const changes = note ? [{ field: 'ບັນທຶກ', from: '', to: note }] : [];
    emitCustomerNotif(req, customer, 'contact', changes);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST upload images
router.post('/:id/images', upload.array('images', 10), async (req, res) => {
  try {
    const now = new Date();
    const uploadedBy = req.body.uploadedBy || '';
    const objs = req.files.map(f => ({ url: `/uploads/${f.filename}`, createdAt: now, updatedAt: now, uploadedBy }));
    await Customer.findByIdAndUpdate(req.params.id, {
      $push: { images: { $each: objs } },
      lastContactedBy: uploadedBy,
      lastContactedAt: now
    });
    let cust = await Customer.findById(req.params.id);
    cust.images = (cust.images || []).map(i => typeof i === 'string' ? { url: i } : i);
    res.json({ images: cust.images });
    const imageChanges = objs.map(o => ({ field: 'image', from: '', to: o.url }));
    emitCustomerNotif(req, cust, 'upload_image', imageChanges);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE image
router.delete('/:id/images', async (req, res) => {
  try {
    const u = req.user;
    const privileged = ['admin', 'super_admin', 'partner'].includes(u.role);
    if (!privileged && !u.permissions?.deleteImage) {
      return res.status(403).json({ message: 'ບໍ່ມີສິດລົບຮູບ' });
    }
    const { imageUrl } = req.body;
    const customer = await Customer.findById(req.params.id);
    const imageObj = customer.images.find(i => (typeof i === 'string' ? i : i.url) === imageUrl);
    const uploadedBy = imageObj?.uploadedBy || '—';
    const uploadedAt = imageObj?.createdAt ? new Date(imageObj.createdAt).toISOString() : '';
    customer.images = customer.images.filter(i => (typeof i === 'string' ? i : i.url) !== imageUrl);
    await customer.save();
    res.json({ images: customer.images });
    emitCustomerNotif(req, customer, 'delete_image', [{ field: 'ລົບຮູບ', from: uploadedBy, to: uploadedAt }]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET export Excel
function formatDate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

router.get('/export/excel', async (req, res) => {
  try {
    const customers = await Customer.find({}).populate('projects', 'name');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customers');

    sheet.columns = [
      { header: 'No.', key: 'no', width: 8 },
      { header: 'ເບີໂທ', key: 'phone', width: 16 },
      { header: 'ຊື່ລູກຄ້າ', key: 'name', width: 24 },
      { header: 'ປະເພດ', key: 'customerType', width: 20 },
      { header: 'ໂຄງການ', key: 'projects', width: 24 },
      { header: 'ພະນັກງານ', key: 'assignedStaff', width: 16 },
      { header: 'ລາຍລະອຽດ', key: 'notes', width: 30 },
      { header: 'ວັນທີທັກ', key: 'contactedAt', width: 20 }
    ];

    sheet.getColumn('phone').numFmt = '@';

    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'none' };
      cell.font = { name: 'Phetsarath OT', size: 11, color: { argb: 'FF000000' } };
    });

    customers.forEach(c => {
      const row = sheet.addRow({
        no: c.no,
        phone: c.phone,
        name: c.name,
        customerType: (Array.isArray(c.customerType) ? c.customerType : [c.customerType]).map(t => TYPE_LABELS[t] || t).join(', '),
        projects: c.projects.map(p => p.name).join(', '),
        assignedStaff: c.assignedStaff,
        notes: c.notes,
        contactedAt: c.contactedAt ? formatDate(c.contactedAt) : ''
      });
      row.eachCell(cell => { cell.font = { name: 'Phetsarath OT', size: 11 }; });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST import Excel
router.post('/import/excel', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'ກະລຸນາເລືອກໄຟລ໌ (No file uploaded)' });
    next();
  });
}, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];

    const TYPE_REVERSE = Object.fromEntries(Object.entries(TYPE_LABELS).map(([k, v]) => [v, k]));
    const results = { created: 0, updated: 0, errors: [] };

    // Read header row to map columns by name
    const headerRow = sheet.getRow(1);
    const headerValues = headerRow.values;
    const colMap = {};
    if (headerValues && typeof headerValues === 'object') {
      for (let i = 1; i <= headerRow.cellCount; i++) {
        const v = headerValues[i];
        if (!v) continue;
        const s = String(v).trim().toLowerCase();
        if (/ເບີ|โทร|phone|tel|mobile/i.test(s)) colMap.phone = i;
        else if (/ຊື່|ชื่อ|name|ນາມສະກຸນ/i.test(s)) colMap.name = i;
        else if (/ປະເພດ|ประเภท|type|customer.?type/i.test(s)) colMap.type = i;
        else if (/ໂຄງການ|โครงการ|project/i.test(s)) colMap.project = i;
        else if (/ພະນັກງານ|พนักงาน|staff|assigned/i.test(s)) colMap.staff = i;
        else if (/ໝາຍເຫດ|หมายเหตุ|note|notes/i.test(s)) colMap.notes = i;
        else if (/ວັນທີ|วันที่|contact|date|ທັກ/i.test(s)) colMap.contactedAt = i;
      }
    }

    if (!colMap.phone && !colMap.name) {
      return res.status(400).json({ message: 'ເບີໂທ ແລະ ຊື່ ແມ່ນຈຳເປັນ (Phone & Name required)' });
    }

    // Collect all unique project names from import file
    const importProjectNames = new Set();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const vals = row.values;
      const pn = colMap.project ? String(vals[colMap.project] || '').trim() : '';
      if (pn) importProjectNames.add(pn);
    });

    // Auto-create missing projects
    const existingProjects = await Project.find({}).lean();
    const existingNameMap = {};
    existingProjects.forEach(p => { existingNameMap[p.name.toLowerCase()] = true; });
    const toCreate = [...importProjectNames].filter(n => !existingNameMap[n.toLowerCase()]);
    if (toCreate.length) {
      await Project.insertMany(toCreate.map(name => ({ name })));
    }

    // Re-fetch all projects with their IDs
    const allProjects = await Project.find({}).lean();
    const projectNameMap = {};
    allProjects.forEach(p => { projectNameMap[p.name.toLowerCase()] = p._id; });

    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const vals = row.values;
      const phone = colMap.phone ? String(vals[colMap.phone] || '').trim() : '';
      const name = colMap.name ? String(vals[colMap.name] || '').trim() : '';
      if (!phone || !name) return;

      const projectName = colMap.project ? String(vals[colMap.project] || '').trim() : '';
      const projectId = projectName ? projectNameMap[projectName.toLowerCase()] : undefined;

      let contactedAt;
      if (colMap.contactedAt && vals[colMap.contactedAt]) {
        const raw = String(vals[colMap.contactedAt]).trim();
        const d = new Date(raw);
        if (!isNaN(d.getTime())) contactedAt = d;
      }

      rows.push({
        phone,
        name,
        customerType: colMap.type ? (TYPE_REVERSE[String(vals[colMap.type]).trim()] || 'new') : 'new',
        projects: projectId ? [projectId] : [],
        notes: colMap.notes ? String(vals[colMap.notes] || '') : '',
        assignedStaff: colMap.staff ? String(vals[colMap.staff] || '') : '',
        ...(contactedAt ? { contactedAt } : {})
      });
    });

    // Sequential to avoid race condition on auto-increment `no` field
    for (const r of rows) {
      await upsertCustomer(r);
    }

    res.json({ message: `Imported ${rows.length} customers`, count: rows.length });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ message: err.message || 'ເກີດຂໍ້ຜິດພາດ' });
  }
});

module.exports = router;
