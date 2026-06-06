require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const passport = require("./middleware/passport");

const app = express();

app.use(cors());
app.use(express.json());
app.use(passport.initialize());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("MongoDB connected");
    const User = require("./models/User");
    const exists = await User.findOne({ role: "admin" });
    if (!exists && process.env.ADMIN_EMAIL) {
      await User.create({
        username: "admin",
        displayName: "Administrator",
        email: process.env.ADMIN_EMAIL,
        role: "admin",
        status: "active",
      });
      console.log(`Default admin created for: ${process.env.ADMIN_EMAIL}`);
    }
    // Auto-seed customer types if collection is empty
    const CustomerType = require("./models/CustomerType");
    const { SEED } = require("./routes/customerTypes");
    const typeCount = await CustomerType.countDocuments();
    if (typeCount === 0) {
      await CustomerType.insertMany(SEED);
      console.log(`Customer types seeded: ${SEED.length} types`);
    }
  })
  .catch((err) => console.error("MongoDB error:", err));

app.use("/auth", require("./routes/auth"));
app.use("/users", require("./routes/users"));
app.use("/customers", require("./routes/customers"));
app.use("/projects", require("./routes/projects"));
app.use("/customer-types", require("./routes/customerTypes").router);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
