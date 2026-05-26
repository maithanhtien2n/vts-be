const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  value:  { type: String, required: true, unique: true, trim: true },
  label:  { type: String, required: true, trim: true },
  color:  { type: String, default: '#1877F2' },
  icon:   { type: String, default: 'fas fa-user' },
  order:  { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('CustomerType', schema);
