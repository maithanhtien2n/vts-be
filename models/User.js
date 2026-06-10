const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, trim: true, default: '' },
  displayName: { type: String, trim: true, default: '' },
  password: { type: String },
  googleId: { type: String, sparse: true, unique: true },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
  status: { type: String, enum: ['active', 'pending', 'rejected'], default: 'active' },
  deactivated: { type: Boolean, default: false },
  permissions: {
    view:   { type: Boolean, default: true },
    edit:   { type: Boolean, default: false },
    insert: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
  },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
