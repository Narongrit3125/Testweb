import { Router } from 'express';
import db from '../db';
import { broadcastUpdate } from '../services/realtime.service';

const router = Router();

// GET /api/appointment - Search by date, doctorname, HN
router.get('/', (req, res) => {
  try {
    const { date, doctorName, hn } = req.query;

    const authHeader = req.headers.authorization;
    const isStaff = authHeader === 'Bearer nurse123' || authHeader === 'Bearer doctor123';

    // If querying without HN, restrict to verified staff only
    if (!hn && !isStaff) {
      return res.status(401).json({ error: 'Unauthorized: Staff passcode required' });
    }

    let query = `
      SELECT a.id AS apptId, a.status AS apptStatus, a.date AS apptDate, a.createdAt AS apptCreatedAt, a.updatedAt AS apptUpdatedAt,
             p.id AS patientId, p.hn AS patientHn, p.firstName AS patientFirstName, p.lastName AS patientLastName, p.phone AS patientPhone, p.createdAt AS patientCreatedAt, p.updatedAt AS patientUpdatedAt,
             t.id AS timeslotId, t.startTime AS timeslotStartTime, t.endTime AS timeslotEndTime, t.maxCapacity AS timeslotMaxCapacity, t.createdAt AS timeslotCreatedAt, t.updatedAt AS timeslotUpdatedAt,
             d.id AS doctorId, d.firstName AS doctorFirstName, d.lastName AS doctorLastName, d.role AS doctorRole, d.createdAt AS doctorCreatedAt, d.updatedAt AS doctorUpdatedAt
      FROM Appointment a
      JOIN Patient p ON a.patientId = p.id
      JOIN Timeslot t ON a.timeslotId = t.id
      JOIN Employee d ON t.doctorId = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (hn) {
      query += ' AND p.hn = ?';
      params.push(String(hn));
    }

    if (doctorName) {
      query += ' AND (d.firstName LIKE ? OR d.lastName LIKE ?)';
      params.push(`%${doctorName}%`, `%${doctorName}%`);
    }

    if (date) {
      query += ' AND date(t.startTime) = date(?)';
      params.push(String(date));
    }

    const rows = db.prepare(query).all(...params) as any[];

    const appointments = rows.map(row => ({
      id: row.apptId,
      patientId: row.patientId,
      timeslotId: row.timeslotId,
      status: row.apptStatus,
      date: row.apptDate,
      createdAt: row.apptCreatedAt,
      updatedAt: row.apptUpdatedAt,
      Patient: {
        id: row.patientId,
        hn: row.patientHn,
        firstName: row.patientFirstName,
        lastName: row.patientLastName,
        phone: row.patientPhone,
        createdAt: row.patientCreatedAt,
        updatedAt: row.patientUpdatedAt
      },
      Timeslot: {
        id: row.timeslotId,
        doctorId: row.doctorId,
        startTime: row.timeslotStartTime,
        endTime: row.timeslotEndTime,
        maxCapacity: row.timeslotMaxCapacity,
        createdAt: row.timeslotCreatedAt,
        updatedAt: row.timeslotUpdatedAt,
        Doctor: {
          id: row.doctorId,
          firstName: row.doctorFirstName,
          lastName: row.doctorLastName,
          role: row.doctorRole,
          createdAt: row.doctorCreatedAt,
          updatedAt: row.doctorUpdatedAt
        }
      }
    }));

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appointment - Create an appointment
router.post('/', (req, res) => {
  try {
    const { patientId, timeslotId } = req.body;
    if (!patientId || !timeslotId) {
      return res.status(400).json({ error: 'patientId and timeslotId are required' });
    }

    const runTransaction = db.transaction(() => {
      // 1. Check if timeslot exists
      const timeslot = db.prepare('SELECT * FROM Timeslot WHERE id = ?').get(Number(timeslotId)) as any;
      if (!timeslot) throw new Error('Timeslot not found');

      // 2. Check 1-day advance booking
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const timeslotStart = new Date(timeslot.startTime);

      if (timeslotStart < tomorrow) {
        throw new Error('Must book at least 1 day in advance');
      }

      // 3. Check capacity
      const resultCount = db.prepare("SELECT count(*) AS count FROM Appointment WHERE timeslotId = ? AND status = 'BOOKED'").get(Number(timeslotId)) as any;
      const currentBookings = resultCount ? resultCount.count : 0;
      if (currentBookings >= timeslot.maxCapacity) {
        throw new Error('Timeslot is full');
      }

      // 4. Max 1 queue per day per patient
      const existingBookingToday = db.prepare(`
        SELECT 1 FROM Appointment a
        JOIN Timeslot t ON a.timeslotId = t.id
        WHERE a.patientId = ? AND a.status = 'BOOKED' AND date(t.startTime) = date(?)
      `).get(Number(patientId), timeslot.startTime);

      if (existingBookingToday) {
        throw new Error('Patient can only book 1 appointment per day');
      }

      // Create appointment
      const insertResult = db.prepare(`
        INSERT INTO Appointment (patientId, timeslotId, status, date, createdAt, updatedAt)
        VALUES (?, ?, 'BOOKED', datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run(Number(patientId), Number(timeslotId));

      const newApptId = insertResult.lastInsertRowid;

      // Fetch details of the newly created appointment
      const row = db.prepare(`
        SELECT a.id AS apptId, a.status AS apptStatus, a.date AS apptDate, a.createdAt AS apptCreatedAt, a.updatedAt AS apptUpdatedAt,
               p.id AS patientId, p.hn AS patientHn, p.firstName AS patientFirstName, p.lastName AS patientLastName, p.phone AS patientPhone, p.createdAt AS patientCreatedAt, p.updatedAt AS patientUpdatedAt,
               t.id AS timeslotId, t.startTime AS timeslotStartTime, t.endTime AS timeslotEndTime, t.maxCapacity AS timeslotMaxCapacity, t.createdAt AS timeslotCreatedAt, t.updatedAt AS timeslotUpdatedAt,
               d.id AS doctorId, d.firstName AS doctorFirstName, d.lastName AS doctorLastName, d.role AS doctorRole, d.createdAt AS doctorCreatedAt, d.updatedAt AS doctorUpdatedAt
        FROM Appointment a
        JOIN Patient p ON a.patientId = p.id
        JOIN Timeslot t ON a.timeslotId = t.id
        JOIN Employee d ON t.doctorId = d.id
        WHERE a.id = ?
      `).get(newApptId) as any;

      return {
        id: row.apptId,
        patientId: row.patientId,
        timeslotId: row.timeslotId,
        status: row.apptStatus,
        date: row.apptDate,
        createdAt: row.apptCreatedAt,
        updatedAt: row.apptUpdatedAt,
        Patient: {
          id: row.patientId,
          hn: row.patientHn,
          firstName: row.patientFirstName,
          lastName: row.patientLastName,
          phone: row.patientPhone,
          createdAt: row.patientCreatedAt,
          updatedAt: row.patientUpdatedAt
        },
        Timeslot: {
          id: row.timeslotId,
          doctorId: row.doctorId,
          startTime: row.timeslotStartTime,
          endTime: row.timeslotEndTime,
          maxCapacity: row.timeslotMaxCapacity,
          createdAt: row.timeslotCreatedAt,
          updatedAt: row.timeslotUpdatedAt,
          Doctor: {
            id: row.doctorId,
            firstName: row.doctorFirstName,
            lastName: row.doctorLastName,
            role: row.doctorRole,
            createdAt: row.doctorCreatedAt,
            updatedAt: row.doctorUpdatedAt
          }
        }
      };
    });

    const result = runTransaction();

    // Notify Nurses in real-time
    broadcastUpdate('NEW_BOOKING', { appointment: result });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Error creating appointment' });
  }
});

// DELETE /api/appointment/:id - Cancel an appointment
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { hn } = req.query; // Patient HN passed by client
    const authHeader = req.headers.authorization;
    const isStaff = authHeader === 'Bearer nurse123' || authHeader === 'Bearer doctor123';

    if (!isStaff && !hn) {
      return res.status(401).json({ error: 'Unauthorized: Passcode or patient HN is required' });
    }

    const appointment = db.prepare(`
      SELECT a.id, a.timeslotId, t.startTime, p.hn AS patientHn 
      FROM Appointment a
      JOIN Timeslot t ON a.timeslotId = t.id
      JOIN Patient p ON a.patientId = p.id
      WHERE a.id = ?
    `).get(Number(id)) as any;

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    // If patient is canceling, verify they own this appointment and satisfy the 1-day advance rule
    if (!isStaff) {
      if (appointment.patientHn !== String(hn)) {
        return res.status(403).json({ error: 'Forbidden: You cannot cancel another patient\'s appointment' });
      }

      // Check 1-day advance cancellation for patients
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const timeslotStart = new Date(appointment.startTime);

      if (timeslotStart < tomorrow) {
        return res.status(400).json({ error: 'Must cancel at least 1 day in advance' });
      }
    }

    // Fetch full cancelled appointment details to broadcast BEFORE setting it to cancelled so we have the relation data
    const row = db.prepare(`
      SELECT a.id AS apptId, a.status AS apptStatus, a.date AS apptDate, a.createdAt AS apptCreatedAt, a.updatedAt AS apptUpdatedAt,
             p.id AS patientId, p.hn AS patientHn, p.firstName AS patientFirstName, p.lastName AS patientLastName, p.phone AS patientPhone, p.createdAt AS patientCreatedAt, p.updatedAt AS patientUpdatedAt,
             t.id AS timeslotId, t.startTime AS timeslotStartTime, t.endTime AS timeslotEndTime, t.maxCapacity AS timeslotMaxCapacity, t.createdAt AS timeslotCreatedAt, t.updatedAt AS timeslotUpdatedAt,
             d.id AS doctorId, d.firstName AS doctorFirstName, d.lastName AS doctorLastName, d.role AS doctorRole, d.createdAt AS doctorCreatedAt, d.updatedAt AS doctorUpdatedAt
      FROM Appointment a
      JOIN Patient p ON a.patientId = p.id
      JOIN Timeslot t ON a.timeslotId = t.id
      JOIN Employee d ON t.doctorId = d.id
      WHERE a.id = ?
    `).get(Number(id)) as any;

    db.prepare(`
      UPDATE Appointment 
      SET status = 'CANCELLED', updatedAt = datetime('now', 'localtime') 
      WHERE id = ?
    `).run(Number(id));

    const fullAppt = {
      id: row.apptId,
      patientId: row.patientId,
      timeslotId: row.timeslotId,
      status: 'CANCELLED',
      date: row.apptDate,
      createdAt: row.apptCreatedAt,
      updatedAt: row.apptUpdatedAt,
      Patient: {
        id: row.patientId,
        hn: row.patientHn,
        firstName: row.patientFirstName,
        lastName: row.patientLastName,
        phone: row.patientPhone,
        createdAt: row.patientCreatedAt,
        updatedAt: row.patientUpdatedAt
      },
      Timeslot: {
        id: row.timeslotId,
        doctorId: row.doctorId,
        startTime: row.timeslotStartTime,
        endTime: row.timeslotEndTime,
        maxCapacity: row.timeslotMaxCapacity,
        createdAt: row.timeslotCreatedAt,
        updatedAt: row.timeslotUpdatedAt,
        Doctor: {
          id: row.doctorId,
          firstName: row.doctorFirstName,
          lastName: row.doctorLastName,
          role: row.doctorRole,
          createdAt: row.doctorCreatedAt,
          updatedAt: row.doctorUpdatedAt
        }
      }
    };

    // Notify Nurses & Doctors in real-time
    broadcastUpdate('CANCEL_BOOKING', { appointment: fullAppt });

    res.json({ id: Number(id), status: 'CANCELLED', timeslotId: appointment.timeslotId });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/appointment/:id - Reschedule an appointment
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { timeslotId } = req.body;
    const { hn } = req.query; // Patient HN query param
    const authHeader = req.headers.authorization;
    const isStaff = authHeader === 'Bearer nurse123' || authHeader === 'Bearer doctor123';

    if (!timeslotId) {
      return res.status(400).json({ error: 'timeslotId is required' });
    }

    if (!isStaff && !hn) {
      return res.status(401).json({ error: 'Unauthorized: Passcode or patient HN is required' });
    }

    // 1. Find the old appointment and verify ownership
    const oldAppt = db.prepare(`
      SELECT a.id, a.patientId, a.timeslotId, t.startTime, p.hn AS patientHn
      FROM Appointment a
      JOIN Timeslot t ON a.timeslotId = t.id
      JOIN Patient p ON a.patientId = p.id
      WHERE a.id = ?
    `).get(Number(id)) as any;

    if (!oldAppt) return res.status(404).json({ error: 'Appointment not found' });

    if (!isStaff && oldAppt.patientHn !== String(hn)) {
      return res.status(403).json({ error: 'Forbidden: You cannot reschedule another patient\'s appointment' });
    }

    // 2. Check 1-day advance limit on the old appointment (must edit at least 1 day before the old appointment start)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (!isStaff) {
      const oldTimeslotStart = new Date(oldAppt.startTime);
      if (oldTimeslotStart < tomorrow) {
        return res.status(400).json({ error: 'Must reschedule at least 1 day in advance of your current appointment' });
      }
    }

    // 3. Find the new timeslot and check 1-day advance booking constraint
    const newTimeslot = db.prepare('SELECT * FROM Timeslot WHERE id = ?').get(Number(timeslotId)) as any;
    if (!newTimeslot) return res.status(404).json({ error: 'New timeslot not found' });

    const newTimeslotStart = new Date(newTimeslot.startTime);
    if (newTimeslotStart < tomorrow) {
      return res.status(400).json({ error: 'New timeslot must be at least 1 day in advance' });
    }

    // 4. Check capacity of the new timeslot
    const resultCount = db.prepare("SELECT count(*) AS count FROM Appointment WHERE timeslotId = ? AND status = 'BOOKED'").get(Number(timeslotId)) as any;
    const currentBookings = resultCount ? resultCount.count : 0;
    if (currentBookings >= newTimeslot.maxCapacity) {
      return res.status(400).json({ error: 'New timeslot is full' });
    }

    // 5. Check if patient has another active booking on the new date (excluding the current appointment itself)
    const existingBookingToday = db.prepare(`
      SELECT 1 FROM Appointment a
      JOIN Timeslot t ON a.timeslotId = t.id
      WHERE a.patientId = ? AND a.status = 'BOOKED' AND date(t.startTime) = date(?) AND a.id != ?
    `).get(oldAppt.patientId, newTimeslot.startTime, Number(id));

    if (existingBookingToday) {
      return res.status(400).json({ error: 'Patient already has an appointment booked on this day' });
    }

    // Run transaction
    const runTransaction = db.transaction(() => {
      // Update appointment
      db.prepare(`
        UPDATE Appointment 
        SET timeslotId = ?, updatedAt = datetime('now', 'localtime') 
        WHERE id = ?
      `).run(Number(timeslotId), Number(id));

      // Fetch the full details of the updated appointment
      const row = db.prepare(`
        SELECT a.id AS apptId, a.status AS apptStatus, a.date AS apptDate, a.createdAt AS apptCreatedAt, a.updatedAt AS apptUpdatedAt,
               p.id AS patientId, p.hn AS patientHn, p.firstName AS patientFirstName, p.lastName AS patientLastName, p.phone AS patientPhone, p.createdAt AS patientCreatedAt, p.updatedAt AS patientUpdatedAt,
               t.id AS timeslotId, t.startTime AS timeslotStartTime, t.endTime AS timeslotEndTime, t.maxCapacity AS timeslotMaxCapacity, t.createdAt AS timeslotCreatedAt, t.updatedAt AS timeslotUpdatedAt,
               d.id AS doctorId, d.firstName AS doctorFirstName, d.lastName AS doctorLastName, d.role AS doctorRole, d.createdAt AS doctorCreatedAt, d.updatedAt AS doctorUpdatedAt
        FROM Appointment a
        JOIN Patient p ON a.patientId = p.id
        JOIN Timeslot t ON a.timeslotId = t.id
        JOIN Employee d ON t.doctorId = d.id
        WHERE a.id = ?
      `).get(Number(id)) as any;

      return {
        id: row.apptId,
        patientId: row.patientId,
        timeslotId: row.timeslotId,
        status: row.apptStatus,
        date: row.apptDate,
        createdAt: row.apptCreatedAt,
        updatedAt: row.apptUpdatedAt,
        Patient: {
          id: row.patientId,
          hn: row.patientHn,
          firstName: row.patientFirstName,
          lastName: row.patientLastName,
          phone: row.patientPhone,
          createdAt: row.patientCreatedAt,
          updatedAt: row.patientUpdatedAt
        },
        Timeslot: {
          id: row.timeslotId,
          doctorId: row.doctorId,
          startTime: row.timeslotStartTime,
          endTime: row.timeslotEndTime,
          maxCapacity: row.timeslotMaxCapacity,
          createdAt: row.timeslotCreatedAt,
          updatedAt: row.timeslotUpdatedAt,
          Doctor: {
            id: row.doctorId,
            firstName: row.doctorFirstName,
            lastName: row.doctorLastName,
            role: row.doctorRole,
            createdAt: row.doctorCreatedAt,
            updatedAt: row.doctorUpdatedAt
          }
        }
      };
    });

    const result = runTransaction();

    // Fetch the old appointment details for cancelling SSE
    const oldTimeslot = db.prepare('SELECT * FROM Timeslot WHERE id = ?').get(oldAppt.timeslotId) as any;
    const oldDoc = db.prepare('SELECT * FROM Employee WHERE id = ?').get(oldTimeslot.doctorId) as any;
    
    // Broadcast CANCEL_BOOKING for the old timeslot
    broadcastUpdate('CANCEL_BOOKING', {
      appointment: {
        id: Number(id),
        status: 'CANCELLED',
        timeslotId: oldAppt.timeslotId,
        Patient: { hn: oldAppt.patientHn },
        Timeslot: {
          doctorId: oldTimeslot.doctorId,
          startTime: oldTimeslot.startTime,
          endTime: oldTimeslot.endTime,
          Doctor: { firstName: oldDoc.firstName, lastName: oldDoc.lastName }
        }
      }
    });

    // Broadcast NEW_BOOKING for the new timeslot
    broadcastUpdate('NEW_BOOKING', { appointment: result });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
