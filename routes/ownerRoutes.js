const express = require('express');
const router = express.Router();
const {
  createCompany,
  getOwnerCompanies,
  getCompanyAdmins,
} = require('../controllers/ownerController');
const { protect, owner } = require('../middleware/authMiddleware');

router.post('/companies', protect, owner, createCompany);
router.get('/companies', protect, owner, getOwnerCompanies);
router.get('/companies/:id/admins', protect, owner, getCompanyAdmins);

module.exports = router;

