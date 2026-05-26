const mongoose = require('mongoose');

const contactLogSchema = new mongoose.Schema({
  staff: { type: String, required: true },
  note: { type: String, default: '' },
  date: { type: Date, default: Date.now }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  no: { type: Number },
  phone: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  customerType: { type: String, default: 'new' },
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  notes: { type: String, default: '' },
  assignedStaff: { type: String, default: '' },
  images: [{ type: String }],
  lastContactedBy: { type: String, default: '' },
  lastContactedAt: { type: Date },
  contactLog: [contactLogSchema]
}, { timestamps: true });

customerSchema.pre('save', async function (next) {
  if (this.isNew && !this.no) {
    const last = await this.constructor.findOne({}, {}, { sort: { no: -1 } });
    this.no = last ? last.no + 1 : 1;
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
