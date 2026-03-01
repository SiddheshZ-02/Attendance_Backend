const express = require('express');
const router = express.Router();
const {
  submitLeaveRequest,
  getMyLeaveRequests,
  cancelLeaveRequest
} = require('../controllers/leaveController');
const { protect } = require('../middleware/authMiddleware');

router.post('/request', protect, submitLeaveRequest);
router.get('/my-requests', protect, getMyLeaveRequests);
router.delete('/request/:id', protect, cancelLeaveRequest);

module.exports = router;
