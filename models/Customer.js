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
  customerType: { type: [String], default: ['new'] },
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  notes: { type: String, default: '' },
  assignedStaff: { type: String, default: '' },
  owners: [{ name: { type: String }, photo: { type: String }, link: { type: String } }],
  images: { type: [mongoose.Schema.Types.Mixed], default: [] },
  waBizPhone: { type: String, default: '' },
  contactedAt: { type: Date },
  lastContactedBy: { type: String, default: '' },
  lastContactedAt: { type: Date },
  contactLog: [contactLogSchema],
  updatedBy: { type: String, default: '' }
}, { timestamps: true });

customerSchema.post('init', function () {
  const doc = this.toObject();
  if (this.images && this.images.length) {
    this.images = this.images.map(i => typeof i === 'string' ? { url: i } : i);
  }
  // migrate old single-string customerType to array
  if (typeof this.customerType === 'string') {
    this.customerType = this.customerType ? [this.customerType] : ['new'];
  } else if (!Array.isArray(this.customerType) || this.customerType.length === 0) {
    this.customerType = ['new'];
  }
  // migrate old single owner fields to new owners array
  if (doc.ownerName && !this.owners?.length) {
    this.owners = [{ name: doc.ownerName, photo: doc.ownerPhoto || '', link: doc.ownerLink || '' }];
  }
  if (!this.owners) {
    this.owners = [];
  }
});

customerSchema.pre('save', async function (next) {
  if (this.isNew && !this.no) {
    const last = await this.constructor.findOne({}, {}, { sort: { no: -1 } });
    this.no = last ? last.no + 1 : 1;
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
