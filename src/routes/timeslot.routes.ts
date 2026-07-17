import { Router } from 'express';
import prisma from '../db';

const router = Router();

// Get timeslots, optionally filter by doctor or date
router.get('/', async (req, res) => {
  try {
    const { doctorId, date } = req.query;
    let whereClause: any = {};
    
    if (doctorId) whereClause.doctorId = Number(doctorId);
    if (date) {
      const targetDate = new Date(String(date));
      const nextDate = new Date(targetDate);
      nextDate.setDate(targetDate.getDate() + 1);
      
      whereClause.startTime = {
        gte: targetDate,
        lt: nextDate
      };
    }
    
    const timeslots = await prisma.timeslot.findMany({
      where: whereClause,
      include: {
        Doctor: {
          select: { firstName: true, lastName: true }
        }
      }
    });
    res.json(timeslots);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
