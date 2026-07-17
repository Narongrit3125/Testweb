import { Router } from 'express';
import prisma from '../db';
import { auth } from '../middleware/auth';

const router = Router();

// Get patient data (can be accessed by any authorized role)
router.get('/', async (req, res) => {
  try {
    const { hn } = req.query;
    if (hn) {
      const patient = await prisma.patient.findUnique({ where: { hn: String(hn) } });
      if (!patient) return res.status(404).json({ error: 'Patient not found' });
      return res.json(patient);
    }
    const patients = await prisma.patient.findMany({ take: 100 }); // Limit to 100 for safety
    res.json(patients);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
