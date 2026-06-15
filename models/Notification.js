const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  targetType:   { type: String, enum: ['customer', 'owner', 'project', 'staff', 'customer_type'], default: 'customer' },
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String },
  customerPhone:{ type: String },
  updatedBy:    { type: String },
  action: {
    type: String,
    enum: ['create', 'update', 'delete', 'contact', 'upload_image', 'delete_image'],
    default: 'update',
  },
  changes: [{
    _id:   false,
    field: { type: String },
    from:  { type: String },
    to:    { type: String },
  }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

module.exports = mongoose.model('Notification', schema);
