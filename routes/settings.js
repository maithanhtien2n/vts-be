const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const Setting = require('../models/Setting');
const { authenticate, adminOnly } = require('../middleware/auth');

const LOGO_FILE = 'vts-logo.jpg';
const LOGO_KEY  = 'logoVersion';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename:    (req, file, cb) => cb(null, LOGO_FILE),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|gif/.test(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  },
  limits: { fileSize: 3 * 1024 * 1024 },
});

// GET /settings  — public, returns { logoVersion }
router.get('/', async (req, res) => {
  try {
    const s = await Setting.findOne({ key: LOGO_KEY });
    res.json({ logoVersion: s ? Number(s.value) : null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /settings/logo  — admin, upload new logo
router.post('/logo', authenticate, adminOnly, upload.single('logo'), async (req, res) => {
  try {
    const version = Date.now();
    await Setting.findOneAndUpdate(
      { key: LOGO_KEY },
      { value: String(version) },
      { upsert: true, new: true }
    );
    res.json({ logoVersion: version });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /settings/logo  — admin, reset to default
router.delete('/logo', authenticate, adminOnly, async (req, res) => {
  try {
    await Setting.deleteOne({ key: LOGO_KEY });
    const filePath = path.join(__dirname, '../uploads', LOGO_FILE);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ logoVersion: null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
