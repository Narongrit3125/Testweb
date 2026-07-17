import { Router } from 'express';
import prisma from '../db';

const router = Router();

// Get employee data (e.g. list of doctors)
router.get('/', async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role ? { role: String(role).toUpperCase() } : {};
    
    const employees = await prisma.employee.findMany({
      where: filter,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true
      }
    });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
