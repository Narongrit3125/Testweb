"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const realtime_service_1 = require("../services/realtime.service");
const router = (0, express_1.Router)();
// Get timeslots, optionally filter by doctor or date
router.get('/', (req, res) => {
    try {
        const { doctorId, date } = req.query;
        let query = `
      SELECT t.id, t.doctorId, t.startTime, t.endTime, t.maxCapacity, t.createdAt, t.updatedAt,
             e.firstName AS doctorFirstName, e.lastName AS doctorLastName,
             (SELECT COUNT(*) FROM Appointment a WHERE a.timeslotId = t.id AND a.status = 'BOOKED') AS bookingsCount
      FROM Timeslot t
      JOIN Employee e ON t.doctorId = e.id
      WHERE 1=1
    `;
        const params = [];
        if (doctorId) {
            query += ' AND t.doctorId = ?';
            params.push(Number(doctorId));
        }
        if (date) {
            query += ' AND date(t.startTime) = date(?)';
            params.push(String(date));
        }
        const rows = db_1.default.prepare(query).all(...params);
        // Format to match the previous structure: { Doctor: { firstName, lastName } }
        const timeslots = rows.map(row => ({
            id: row.id,
            doctorId: row.doctorId,
            startTime: row.startTime,
            endTime: row.endTime,
            maxCapacity: row.maxCapacity,
            bookingsCount: row.bookingsCount,
            remainingCapacity: Math.max(0, row.maxCapacity - row.bookingsCount),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            Doctor: {
                firstName: row.doctorFirstName,
                lastName: row.doctorLastName
            }
        }));
        res.json(timeslots);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create a new timeslot
router.post('/', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader !== 'Bearer doctor123' && authHeader !== 'Bearer nurse123') {
            return res.status(401).json({ error: 'Unauthorized: Staff passcode required' });
        }
        const { doctorId, startTime, endTime, maxCapacity } = req.body;
        if (!doctorId || !startTime || !endTime || !maxCapacity) {
            return res.status(400).json({ error: 'doctorId, startTime, endTime, and maxCapacity are required' });
        }
        // Verify doctor exists
        const doctor = db_1.default.prepare("SELECT 1 FROM Employee WHERE id = ? AND role = 'DOCTOR'").get(Number(doctorId));
        if (!doctor) {
            return res.status(400).json({ error: 'Doctor not found or employee is not a doctor' });
        }
        const result = db_1.default.prepare(`
      INSERT INTO Timeslot (doctorId, startTime, endTime, maxCapacity, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(Number(doctorId), String(startTime), String(endTime), Number(maxCapacity));
        const newTimeslot = db_1.default.prepare('SELECT * FROM Timeslot WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newTimeslot);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
// DELETE /api/timeslot/:id - Delete a timeslot and cancel all active bookings in it
router.delete('/:id', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader !== 'Bearer doctor123' && authHeader !== 'Bearer nurse123') {
            return res.status(401).json({ error: 'Unauthorized: Staff passcode required' });
        }
        const { id } = req.params;
        const timeslotRow = db_1.default.prepare('SELECT * FROM Timeslot WHERE id = ?').get(Number(id));
        if (!timeslotRow) {
            return res.status(404).json({ error: 'Timeslot not found' });
        }
        // Find all active booked appointments under this timeslot
        const activeAppointments = db_1.default.prepare(`
      SELECT a.id, p.hn, p.firstName, p.lastName, p.phone, t.startTime, t.endTime, d.firstName AS docFirstName, d.lastName AS docLastName
      FROM Appointment a
      JOIN Patient p ON a.patientId = p.id
      JOIN Timeslot t ON a.timeslotId = t.id
      JOIN Employee d ON t.doctorId = d.id
      WHERE a.timeslotId = ? AND a.status = 'BOOKED'
    `).all(Number(id));
        // Run cancellation & deletion inside transaction
        const runTransaction = db_1.default.transaction(() => {
            // 1. Cancel all appointments
            db_1.default.prepare(`
        UPDATE Appointment 
        SET status = 'CANCELLED', updatedAt = datetime('now', 'localtime') 
        WHERE timeslotId = ?
      `).run(Number(id));
            // 2. Delete timeslot
            db_1.default.prepare('DELETE FROM Timeslot WHERE id = ?').run(Number(id));
        });
        runTransaction();
        // Broadcast cancellation events for each cancelled booking
        activeAppointments.forEach(appt => {
            (0, realtime_service_1.broadcastUpdate)('CANCEL_BOOKING', {
                appointment: {
                    id: appt.id,
                    status: 'CANCELLED',
                    timeslotId: Number(id),
                    Patient: { hn: appt.hn, firstName: appt.firstName, lastName: appt.lastName, phone: appt.phone },
                    Timeslot: {
                        doctorId: timeslotRow.doctorId,
                        startTime: appt.startTime,
                        endTime: appt.endTime,
                        Doctor: { firstName: appt.docFirstName, lastName: appt.docLastName }
                    }
                }
            });
        });
        res.json({ success: true, cancelledCount: activeAppointments.length });
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
// PATCH /api/timeslot/:id - Modify timeslot max capacity
router.patch('/:id', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader !== 'Bearer doctor123' && authHeader !== 'Bearer nurse123') {
            return res.status(401).json({ error: 'Unauthorized: Staff passcode required' });
        }
        const { id } = req.params;
        const { maxCapacity } = req.body;
        if (maxCapacity === undefined || isNaN(Number(maxCapacity)) || Number(maxCapacity) <= 0) {
            return res.status(400).json({ error: 'Valid maxCapacity is required' });
        }
        const timeslot = db_1.default.prepare('SELECT * FROM Timeslot WHERE id = ?').get(Number(id));
        if (!timeslot) {
            return res.status(404).json({ error: 'Timeslot not found' });
        }
        // Get current booking count
        const resultCount = db_1.default.prepare("SELECT count(*) AS count FROM Appointment WHERE timeslotId = ? AND status = 'BOOKED'").get(Number(id));
        const bookingsCount = resultCount ? resultCount.count : 0;
        if (Number(maxCapacity) < bookingsCount) {
            return res.status(400).json({ error: `Cannot reduce capacity below current active bookings count (${bookingsCount})` });
        }
        db_1.default.prepare(`
      UPDATE Timeslot 
      SET maxCapacity = ?, updatedAt = datetime('now', 'localtime') 
      WHERE id = ?
    `).run(Number(maxCapacity), Number(id));
        const updatedTimeslot = db_1.default.prepare('SELECT * FROM Timeslot WHERE id = ?').get(Number(id));
        res.json(updatedTimeslot);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
exports.default = router;
