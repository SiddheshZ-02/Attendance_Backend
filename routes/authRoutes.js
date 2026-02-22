const express = require('express');
const router = express.Router();
const {
  loginUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// ─── Auth Routes ───────────────────────────────────────────────────────────────
// POST /api/auth/login           → login with email + password
// POST /api/auth/logout          → logout [Protected]
router.post('/login', loginUser);
router.post('/logout', protect, logoutUser);

// ─── Profile Routes ────────────────────────────────────────────────────────────
// GET  /api/auth/profile         → get current user profile [Protected]
// PUT  /api/auth/profile         → update name, phone, department, password [Protected]
router
  .route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

// ─── Password Reset Routes ─────────────────────────────────────────────────────
// POST /api/auth/forgot-password → request reset token (sent via email in prod)
// POST /api/auth/reset-password  → reset password using token
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);


module.exports = router;