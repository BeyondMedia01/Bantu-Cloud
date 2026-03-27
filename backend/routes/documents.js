const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// Configure multer for local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only images, PDFs and Word docs are allowed'));
  }
});

// GET /api/documents/employee/:employeeId
router.get('/employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    const { employeeId } = req.params;

    // BOLA Check: Verify employee belongs to the user's company
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { companyId: true }
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const documents = await prisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching documents' });
  }
});

// POST /api/documents/upload
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { employeeId, name, type } = req.body;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    // BOLA Check: Verify target employee belongs to the user's company
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { companyId: true }
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const document = await prisma.employeeDocument.create({
      data: {
        employeeId,
        name: name || req.file.originalname,
        type: type || 'OTHER',
        fileUrl: `/uploads/documents/${req.file.filename}`,
        size: req.file.size,
        mimeType: req.file.mimetype
      }
    });

    res.status(201).json(document);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Upload failed' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await prisma.employeeDocument.findUnique({
      where: { id },
      include: { employee: { select: { companyId: true } } }
    });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // BOLA Check: Verify document belongs to the user's company
    if (req.companyId && doc.employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Delete file from disk — guard against path traversal
    const uploadsBase = path.resolve(__dirname, '../uploads');
    const filePath = path.resolve(__dirname, '..', doc.fileUrl);
    if (!filePath.startsWith(uploadsBase + path.sep) && !filePath.startsWith(uploadsBase)) {
      console.error('[documents] Blocked suspicious fileUrl:', doc.fileUrl);
      return res.status(400).json({ message: 'Invalid document path' });
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.employeeDocument.delete({ where: { id } });
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Delete failed' });
  }
});

module.exports = router;
