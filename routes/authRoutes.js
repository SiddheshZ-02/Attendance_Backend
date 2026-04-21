const express = require('express');
const router = express.Router();
const {
  loginUser,
  logoutUser,
  logoutAllDevices,
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
const { loginLimiter, refreshLimiter } = require('../middleware/authRateLimit');

// Dev-only escape hatch — set ENABLE_AUTH_DEBUG_ROUTES=true in .env (never in production).
if (process.env.ENABLE_AUTH_DEBUG_ROUTES === 'true') {
  router.get('/fix-company', protect, async (req, res) => {
    if (req.user.companyId) return res.json({ message: 'Already has company' });
    const company = await Company.findOne();
    if (!company) return res.status(404).json({ message: 'No company found' });
    await User.findByIdAndUpdate(req.user._id, { companyId: company._id });
    res.json({ message: 'Company assigned', companyId: company._id });
  });
}

// ── Auth Routes ──────────────────────────────────────────────────
router.post('/login', loginLimiter, loginUser);
router.post('/logout', protect, logoutUser);
router.post('/logout-all', protect, logoutAllDevices);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.post('/forgot-password', forgotPassword);
// Token in JSON body `{ token, newPassword }` (primary). Optional legacy: `POST /reset-password/:token` with same body.
router.post('/reset-password', resetPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/refresh', refreshLimiter, refreshAccessToken);
router.get('/colleagues', protect, getColleagues);
router.get('/birthdays', protect, getUpcomingBirthdays);

module.exports = router;
