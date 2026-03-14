const express = require('express');
const router = express.Router();
const {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} = require('../controllers/holidayController');
const { protect, admin } = require('../middleware/authMiddleware');

// ─── Holiday Routes ───────────────────────────────────────────────
// GET    /api/holidays        → list all holidays for current company (All authenticated users)
// POST   /api/holidays        → create new holiday (Admin only)
// PUT    /api/holidays/:id    → update holiday (Admin only)
// DELETE /api/holidays/:id    → delete holiday (Admin only)

router.get('/', protect, getHolidays);
router.post('/', protect, admin, createHoliday);

router.put('/:id', protect, admin, updateHoliday);
router.delete('/:id', protect, admin, deleteHoliday);

module.exports = router;
