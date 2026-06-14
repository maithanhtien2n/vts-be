const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, unique: true },
  description: { type: String, default: '' },
  location:    { type: String, default: '' },
  images:      [{ url: String, uploadedBy: String, createdAt: { type: Date, default: Date.now } }],
  active:      { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
