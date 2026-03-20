const express = require('express');
const router = express.Router();
const {
  loginUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  getColleagues,
  getUpcomingBirthdays,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Company = require('../models/Company');

// ─── TEMP FIX ROUTE ───
router.get('/fix-company', protect, async (req, res) => {
  if (req.user.companyId) return res.json({ message: 'Already has company' });
  const company = await Company.findOne();
  if (!company) return res.status(404).json({ message: 'No company found' });
  await User.findByIdAndUpdate(req.user._id, { companyId: company._id });
  res.json({ message: 'Company assigned', companyId: company._id });
});

// ── Auth Routes ──────────────────────────────────────────────────
router.post('/login', loginUser);
router.post('/logout', protect, logoutUser);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/refresh', refreshAccessToken);
router.get('/colleagues', protect, getColleagues);
router.get('/birthdays', protect, getUpcomingBirthdays);

module.exports = router;