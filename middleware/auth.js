const jwt = require('jsonwebtoken');
const User = require('../models/User');

const SECRET = process.env.JWT_SECRET || 'vts_secret';

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    req.user = await User.findById(payload.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

const ADMIN_ROLES = ['admin', 'super_admin'];

function adminOnly(req, res, next) {
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ message: 'Admin only' });
  }
  next();
}

function requireEditPerm(req, res, next) {
  const u = req.user;
  const privileged = ['admin', 'super_admin', 'partner'].includes(u?.role);
  if (privileged || u?.permissions?.edit) return next();
  return res.status(403).json({ message: 'ບໍ່ມີສິດແກ້ໄຂ' });
}

function requireDeletePerm(req, res, next) {
  const u = req.user;
  const privileged = ['admin', 'super_admin', 'partner'].includes(u?.role);
  if (privileged || u?.permissions?.delete) return next();
  return res.status(403).json({ message: 'ບໍ່ມີສິດລົບ' });
}

module.exports = { authenticate, adminOnly, requireEditPerm, requireDeletePerm };
