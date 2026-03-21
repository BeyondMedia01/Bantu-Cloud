const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// GET all TaxBands
router.get('/', async (req, res) => {
  try {
    const bands = await prisma.taxBand.findMany({
      orderBy: { bandNumber: 'asc' }
    });
    res.json(bands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE a new TaxBand
router.post('/', async (req, res) => {
  try {
    const band = await prisma.taxBand.create({
      data: {
        ...req.body,
        effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined
      }
    });
    res.json(band);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a TaxBand
router.put('/:id', async (req, res) => {
  try {
    const band = await prisma.taxBand.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined
      }
    });
    res.json(band);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a TaxBand
router.delete('/:id', async (req, res) => {
  try {
    await prisma.taxBand.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'TaxBand deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
