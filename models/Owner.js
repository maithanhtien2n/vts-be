const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema({
  name:  { type: String, default: '', trim: true },
  link:  { type: String, default: '', trim: true },
  photo: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Owner', ownerSchema);
