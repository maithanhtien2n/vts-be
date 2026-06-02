const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const Customer = require('../models/Customer');
const upload = require('../middleware/upload');

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
    const { search, type, project, staff, page = 1, limit = 50 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    if (type) {
      const types = Array.isArray(type) ? type : type.split(',').map(t => t.trim()).filter(Boolean);
      query.customerType = types.length === 1 ? types[0] : { $in: types };
    }
    if (project) {
      const projects = Array.isArray(project) ? project : project.split(',').map(p => p.trim()).filter(Boolean);
      query.projects = projects.length === 1 ? projects[0] : { $in: projects };
    }
    if (staff) {
      const staffList = Array.isArray(staff) ? staff : staff.split(',').map(s => s.trim()).filter(Boolean);
      query.assignedStaff = staffList.length === 1
        ? { $regex: staffList[0], $options: 'i' }
        : { $in: staffList };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [customers, total] = await Promise.all([
      Customer.find(query)
        .populate('projects', 'name')
        .sort({ no: 1 })
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

// POST create customer
router.post('/', async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    await customer.populate('projects', 'name');
    res.status(201).json(customer);
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
      body.images = body.images.map(img => ({
        ...(typeof img === 'string' ? { url: img } : img),
        updatedAt: now
      }));
    }
    const customer = await Customer.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
      .populate('projects', 'name');
    if (!customer) return res.status(404).json({ message: 'Not found' });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE customer
router.delete('/:id', async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
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
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST upload images
router.post('/:id/images', upload.array('images', 10), async (req, res) => {
  try {
    const now = new Date();
    const objs = req.files.map(f => ({ url: `/uploads/${f.filename}`, createdAt: now, updatedAt: now }));
    let customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $push: { images: { $each: objs } } },
      { new: true }
    );
    customer.images = customer.images.map(i => typeof i === 'string' ? { url: i } : i);
    res.json({ images: customer.images });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE image
router.delete('/:id/images', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const customer = await Customer.findById(req.params.id);
    customer.images = customer.images.filter(i => (typeof i === 'string' ? i : i.url) !== imageUrl);
    await customer.save();
    res.json({ images: customer.images });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET export Excel
router.get('/export/excel', async (req, res) => {
  try {
    const customers = await Customer.find({}).populate('projects', 'name');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customers');

    sheet.columns = [
      { header: 'No.', key: 'no', width: 8 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Type', key: 'customerType', width: 20 },
      { header: 'Projects', key: 'projects', width: 24 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Staff', key: 'assignedStaff', width: 16 },
      { header: 'Last Contacted By', key: 'lastContactedBy', width: 20 },
      { header: 'Last Contacted At', key: 'lastContactedAt', width: 20 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'none' };
      cell.font = { color: { argb: 'FF000000' } };
    });

    customers.forEach(c => {
      sheet.addRow({
        no: c.no,
        phone: c.phone,
        name: c.name,
        customerType: TYPE_LABELS[c.customerType] || c.customerType,
        projects: c.projects.map(p => p.name).join(', '),
        notes: c.notes,
        assignedStaff: c.assignedStaff,
        lastContactedBy: c.lastContactedBy,
        lastContactedAt: c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleString('th-TH') : ''
      });
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
router.post('/import/excel', upload.single('file'), async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];

    const TYPE_REVERSE = Object.fromEntries(Object.entries(TYPE_LABELS).map(([k, v]) => [v, k]));
    const results = { created: 0, updated: 0, errors: [] };

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const [, no, phone, name, typeLabel, , notes, assignedStaff] = row.values;
      if (!phone || !name) return;

      const customerType = TYPE_REVERSE[typeLabel] || 'new';
      results.created++;
    });

    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const vals = row.values;
      const phone = vals[2] ? String(vals[2]).trim() : null;
      const name = vals[3] ? String(vals[3]).trim() : null;
      if (!phone || !name) return;
      rows.push({
        phone,
        name,
        customerType: TYPE_REVERSE[vals[4]] || 'new',
        notes: vals[6] ? String(vals[6]) : '',
        assignedStaff: vals[7] ? String(vals[7]) : ''
      });
    });

    const ops = rows.map(r =>
      Customer.findOneAndUpdate({ phone: r.phone }, r, { upsert: true, new: true, runValidators: true })
    );
    await Promise.all(ops);

    res.json({ message: `Imported ${rows.length} customers`, count: rows.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
