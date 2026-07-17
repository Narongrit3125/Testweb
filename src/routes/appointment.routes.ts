import { Router } from 'express';
import prisma from '../db';
import { broadcastUpdate } from '../services/realtime.service';

const router = Router();

// GET /api/appointment - Search by date, doctorname, HN
router.get('/', async (req, res) => {
  try {
    const { date, doctorName, hn } = req.query;
    
    let whereClause: any = {};
    
    if (hn) {
      whereClause.Patient = { hn: String(hn) };
    }
    
    if (doctorName) {
      whereClause.Timeslot = {
        Doctor: {
          OR: [
            { firstName: { contains: String(doctorName) } },
            { lastName: { contains: String(doctorName) } }
          ]
        }
      };
    }
    
    if (date) {
      const targetDate = new Date(String(date));
      const nextDate = new Date(targetDate);
      nextDate.setDate(targetDate.getDate() + 1);
      if (whereClause.Timeslot) {
        whereClause.Timeslot.startTime = { gte: targetDate, lt: nextDate };
      } else {
        whereClause.Timeslot = { startTime: { gte: targetDate, lt: nextDate } };
      }
    }
    
    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        Patient: true,
        Timeslot: {
          include: { Doctor: true }
        }
      }
    });
    
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointment - Create an appointment
router.post('/', async (req, res) => {
  try {
    const { patientId, timeslotId } = req.body;
    if (!patientId || !timeslotId) {
      return res.status(400).json({ error: 'patientId and timeslotId are required' });
    }

    // Use transaction to ensure concurrency safety
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Check if timeslot exists
      const timeslot = await tx.timeslot.findUnique({ where: { id: parseInt(timeslotId) } });
      if (!timeslot) throw new Error('Timeslot not found');

      // 2. Check 1-day advance booking
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      if (timeslot.startTime < tomorrow) {
        throw new Error('Must book at least 1 day in advance');
      }

      // 3. Check capacity
      const currentBookings = await tx.appointment.count({
        where: { timeslotId: parseInt(timeslotId), status: 'BOOKED' }
      });
      if (currentBookings >= timeslot.maxCapacity) {
        throw new Error('Timeslot is full'); // User requirement: "หากเต็มให้แจ้งว่าเต็ม"
      }

      // 4. Max 1 queue per day per patient
      const slotDateStart = new Date(timeslot.startTime);
      slotDateStart.setHours(0,0,0,0);
      const slotDateEnd = new Date(slotDateStart);
      slotDateEnd.setDate(slotDateEnd.getDate() + 1);

      const existingBookingToday = await tx.appointment.findFirst({
        where: {
          patientId: parseInt(patientId),
          status: 'BOOKED',
          Timeslot: {
            startTime: {
              gte: slotDateStart,
              lt: slotDateEnd
            }
          }
        }
      });

      if (existingBookingToday) {
        throw new Error('Patient can only book 1 appointment per day');
      }

      // Create appointment
      const newAppt = await tx.appointment.create({
        data: {
          patientId: parseInt(patientId),
          timeslotId: parseInt(timeslotId),
          status: 'BOOKED'
        },
        include: {
          Patient: true,
          Timeslot: { include: { Doctor: true } }
        }
      });
      
      return newAppt;
    });

    // Notify Nurses in real-time
    broadcastUpdate('NEW_APPOINTMENT', result);

    res.status(201).json(result);

  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Error creating appointment' });
  }
});

// DELETE /api/appointment/:id - Cancel an appointment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const appointment = await prisma.appointment.findUnique({
      where: { id: parseInt(id) },
      include: { Timeslot: true }
    });
    
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    
    // Check 1-day advance cancellation
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (appointment.Timeslot.startTime < tomorrow) {
      return res.status(400).json({ error: 'Must cancel at least 1 day in advance' });
    }

    const updated = await prisma.appointment.update({
      where: { id: parseInt(id) },
      data: { status: 'CANCELLED' }
    });

    // Notify Nurses in real-time
    broadcastUpdate('CANCEL_APPOINTMENT', { id: updated.id, status: 'CANCELLED', timeslotId: updated.timeslotId });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
