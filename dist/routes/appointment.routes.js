"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const realtime_service_1 = require("../services/realtime.service");
const router = (0, express_1.Router)();
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
        const params = [];
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
        const rows = db_1.default.prepare(query).all(...params);
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
    }
    catch (error) {
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
        const runTransaction = db_1.default.transaction(() => {
            // 1. Check if timeslot exists
            const timeslot = db_1.default.prepare('SELECT * FROM Timeslot WHERE id = ?').get(Number(timeslotId));
            if (!timeslot)
                throw new Error('Timeslot not found');
            // 2. Check 1-day advance booking
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const timeslotStart = new Date(timeslot.startTime);
            if (timeslotStart < tomorrow) {
                throw new Error('Must book at least 1 day in advance');
            }
            // 3. Check capacity
            const resultCount = db_1.default.prepare("SELECT count(*) AS count FROM Appointment WHERE timeslotId = ? AND status = 'BOOKED'").get(Number(timeslotId));
            const currentBookings = resultCount ? resultCount.count : 0;
            if (currentBookings >= timeslot.maxCapacity) {
                throw new Error('Timeslot is full');
            }
            // 4. Max 1 queue per day per patient
            const existingBookingToday = db_1.default.prepare(`
        SELECT 1 FROM Appointment a
        JOIN Timeslot t ON a.timeslotId = t.id
        WHERE a.patientId = ? AND a.status = 'BOOKED' AND date(t.startTime) = date(?)
      `).get(Number(patientId), timeslot.startTime);
            if (existingBookingToday) {
                throw new Error('Patient can only book 1 appointment per day');
            }
            // Create appointment
            const insertResult = db_1.default.prepare(`
        INSERT INTO Appointment (patientId, timeslotId, status, date, createdAt, updatedAt)
        VALUES (?, ?, 'BOOKED', datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run(Number(patientId), Number(timeslotId));
            const newApptId = insertResult.lastInsertRowid;
            // Fetch details of the newly created appointment
            const row = db_1.default.prepare(`
        SELECT a.id AS apptId, a.status AS apptStatus, a.date AS apptDate, a.createdAt AS apptCreatedAt, a.updatedAt AS apptUpdatedAt,
               p.id AS patientId, p.hn AS patientHn, p.firstName AS patientFirstName, p.lastName AS patientLastName, p.phone AS patientPhone, p.createdAt AS patientCreatedAt, p.updatedAt AS patientUpdatedAt,
               t.id AS timeslotId, t.startTime AS timeslotStartTime, t.endTime AS timeslotEndTime, t.maxCapacity AS timeslotMaxCapacity, t.createdAt AS timeslotCreatedAt, t.updatedAt AS timeslotUpdatedAt,
               d.id AS doctorId, d.firstName AS doctorFirstName, d.lastName AS doctorLastName, d.role AS doctorRole, d.createdAt AS doctorCreatedAt, d.updatedAt AS doctorUpdatedAt
        FROM Appointment a
        JOIN Patient p ON a.patientId = p.id
        JOIN Timeslot t ON a.timeslotId = t.id
        JOIN Employee d ON t.doctorId = d.id
        WHERE a.id = ?
      `).get(newApptId);
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
        (0, realtime_service_1.broadcastUpdate)('NEW_BOOKING', { appointment: result });
        res.status(201).json(result);
    }
    catch (error) {
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
        const appointment = db_1.default.prepare(`
      SELECT a.id, a.timeslotId, t.startTime, p.hn AS patientHn 
      FROM Appointment a
      JOIN Timeslot t ON a.timeslotId = t.id
      JOIN Patient p ON a.patientId = p.id
      WHERE a.id = ?
    `).get(Number(id));
        if (!appointment)
            return res.status(404).json({ error: 'Appointment not found' });
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
        const row = db_1.default.prepare(`
      SELECT a.id AS apptId, a.status AS apptStatus, a.date AS apptDate, a.createdAt AS apptCreatedAt, a.updatedAt AS apptUpdatedAt,
             p.id AS patientId, p.hn AS patientHn, p.firstName AS patientFirstName, p.lastName AS patientLastName, p.phone AS patientPhone, p.createdAt AS patientCreatedAt, p.updatedAt AS patientUpdatedAt,
             t.id AS timeslotId, t.startTime AS timeslotStartTime, t.endTime AS timeslotEndTime, t.maxCapacity AS timeslotMaxCapacity, t.createdAt AS timeslotCreatedAt, t.updatedAt AS timeslotUpdatedAt,
             d.id AS doctorId, d.firstName AS doctorFirstName, d.lastName AS doctorLastName, d.role AS doctorRole, d.createdAt AS doctorCreatedAt, d.updatedAt AS doctorUpdatedAt
      FROM Appointment a
      JOIN Patient p ON a.patientId = p.id
      JOIN Timeslot t ON a.timeslotId = t.id
      JOIN Employee d ON t.doctorId = d.id
      WHERE a.id = ?
    `).get(Number(id));
        db_1.default.prepare(`
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
        (0, realtime_service_1.broadcastUpdate)('CANCEL_BOOKING', { appointment: fullAppt });
        res.json({ id: Number(id), status: 'CANCELLED', timeslotId: appointment.timeslotId });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
