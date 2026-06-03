const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = /jpeg|jpg|png|gif|webp|xlsx|xls/;
  cb(null, allowed.test(ext));
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
