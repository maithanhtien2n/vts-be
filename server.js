require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB connected');
    const User = require('./models/User');
    const exists = await User.findOne({ username: 'admin' });
    if (!exists) {
      await User.create({ username: 'admin', displayName: 'Administrator', password: 'admin123', role: 'admin' });
      console.log('Default admin created: admin / admin123');
    }
    // Auto-seed customer types if collection is empty
    const CustomerType = require('./models/CustomerType');
    const { SEED } = require('./routes/customerTypes');
    const typeCount = await CustomerType.countDocuments();
    if (typeCount === 0) {
      await CustomerType.insertMany(SEED);
      console.log(`Customer types seeded: ${SEED.length} types`);
    }
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/customer-types', require('./routes/customerTypes').router);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
