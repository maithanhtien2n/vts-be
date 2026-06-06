const express = require('express');
const router = express.Router();
const CustomerType = require('../models/CustomerType');

const SEED = [
  { value: 'new',             label: 'ລູກຄ້າໃໝ່',           color: '#1565C0', icon: 'fas fa-user-plus',           order: 0  },
  { value: 'interested_land', label: 'ສົນໃຈທີ່ດິນ',         color: '#558B2F', icon: 'fas fa-map-pin',             order: 1  },
  { value: 'planning_visit',  label: 'ນັດເບິ່ງທີ່ດິນ',       color: '#00838F', icon: 'fas fa-calendar-check',      order: 2  },
  { value: 'follow_up',       label: 'ຕິດຕາມ',              color: '#E65100', icon: 'fas fa-phone-volume',         order: 3  },
  { value: 'likely_rebuy',    label: 'ມີແນວໂນ້ມຊື້ຄືນ',     color: '#6A1B9A', icon: 'fas fa-star',                order: 4  },
  { value: 'purchased',       label: 'ຊື້ແລ້ວ',              color: '#2E7D32', icon: 'fas fa-circle-check',        order: 5  },
  { value: 'out_of_province', label: 'ຕ່າງແຂວງ',            color: '#283593', icon: 'fas fa-map',                 order: 6  },
  { value: 'different_area',  label: 'ຫາທີ່ດິນຕ່າງພື້ນທີ່', color: '#00695C', icon: 'fas fa-map-location-dot',    order: 7  },
  { value: 'blocked',         label: 'ບ່ອນ',                 color: '#C62828', icon: 'fas fa-ban',                 order: 8  },
  { value: 'not_ready',       label: 'ຍັງບໍ່ພ້ອມ',          color: '#FF8F00', icon: 'fas fa-clock',               order: 9  },
  { value: 'read_no_reply',   label: 'ອ່ານແລ້ວບໍ່ຕອບ',      color: '#BF360C', icon: 'fas fa-comment-dots',        order: 10 },
  { value: 'unread',          label: 'ຍັງບໍ່ໄດ້ອ່ານ',       color: '#546E7A', icon: 'fas fa-comment-slash',       order: 11 },
  { value: 'repeat',          label: 'ລູກຄ້າຊ້ຳ',           color: '#4527A0', icon: 'fas fa-user-gear',           order: 12 },
  { value: 'purchased_team',  label: 'ຊື້ຜ່ານທີມ',          color: '#1B5E20', icon: 'fas fa-users',               order: 13 },
  { value: 'other',           label: 'ອື່ນໆ',                color: '#37474F', icon: 'fas fa-ellipsis',            order: 14 },
  { value: 'sell_for_us',     label: 'ຝາກຂາຍ',              color: '#F57F17', icon: 'fas fa-city',                order: 15 },
  { value: 'responding',      label: 'ຕອບຄຳຖາມ',            color: '#0277BD', icon: 'fas fa-reply',               order: 16 },
  { value: 'task',            label: 'ວຽກທີ່ຕ້ອງເຮັດ',       color: '#D84315', icon: 'fas fa-clipboard-check',    order: 17 },
  { value: 'visited_land',    label: 'ເບິ່ງທີ່ດິນແລ້ວ',     color: '#827717', icon: 'fas fa-eye',                 order: 18 },
];

// GET / — all types sorted by order
router.get('/', async (req, res) => {
  try {
    const types = await CustomerType.find().sort({ order: 1, createdAt: 1 });
    res.json(types);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function slugify(str) {
  return (str || '').toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// POST / — create
router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.value && body.label) {
      const base = slugify(body.label);
      const exists = await CustomerType.findOne({ value: base });
      body.value = exists ? `${base}_${Date.now()}` : base;
    }
    const type = await CustomerType.create(body);
    res.status(201).json(type);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /:id — update
router.put('/:id', async (req, res) => {
  try {
    const type = await CustomerType.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!type) return res.status(404).json({ message: 'Not found' });
    res.json(type);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /:id — delete
router.delete('/:id', async (req, res) => {
  try {
    const type = await CustomerType.findByIdAndDelete(req.params.id);
    if (!type) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /seed — seed only if empty
router.post('/seed', async (req, res) => {
  try {
    const count = await CustomerType.countDocuments();
    if (count > 0) return res.json({ message: 'Already seeded', count });
    await CustomerType.insertMany(SEED);
    res.json({ message: 'Seeded', count: SEED.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { router, SEED };
