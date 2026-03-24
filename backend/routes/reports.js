const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { 
  generateP16PDF, 
  generateP2PDF, 
  generateNSSA_P4A,
  generateIT7PDF
} = require('../utils/pdfService');

const { 
  getSettingAsNumber,
  getSettingAsString
} = require('../lib/systemSettings');

const router = express.Router();

// --- Report Domains ---
router.use('/', require('./reports/employees'));
router.use('/', require('./reports/loans'));
router.use('/', require('./reports/statutory'));
router.use('/', require('./reports/payroll'));

module.exports = router;
