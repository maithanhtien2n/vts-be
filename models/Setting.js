const mongoose = require('mongoose');
const SettingSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: String,
}, { timestamps: true });
module.exports = mongoose.model('Setting', SettingSchema);
