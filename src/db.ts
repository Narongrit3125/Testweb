import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'dev.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables if they do not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS Patient (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hn TEXT UNIQUE NOT NULL,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    phone TEXT,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS Employee (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    role TEXT DEFAULT 'NURSE',
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS Timeslot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctorId INTEGER NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    maxCapacity INTEGER NOT NULL,
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (doctorId) REFERENCES Employee (id)
  );

  CREATE TABLE IF NOT EXISTS Appointment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patientId INTEGER NOT NULL,
    timeslotId INTEGER NOT NULL,
    status TEXT DEFAULT 'BOOKED',
    date TEXT DEFAULT (datetime('now', 'localtime')),
    createdAt TEXT DEFAULT (datetime('now', 'localtime')),
    updatedAt TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (patientId) REFERENCES Patient (id),
    FOREIGN KEY (timeslotId) REFERENCES Timeslot (id),
    UNIQUE(patientId, timeslotId)
  );
`);

// Seed initial data if database is empty
const patientCount = (db.prepare('SELECT count(*) AS count FROM Patient').get() as any).count;
if (patientCount === 0) {
  db.exec(`
    INSERT INTO Patient (hn, firstName, lastName, phone, createdAt, updatedAt) VALUES
    ('HN001', 'สมชาย', 'ดีใจ', '0812345678', datetime('now', 'localtime'), datetime('now', 'localtime')),
    ('HN002', 'สมศรี', 'รักดี', '0898765432', datetime('now', 'localtime'), datetime('now', 'localtime')),
    ('HN003', 'สมพงษ์', 'มุ่งมั่น', '0855555555', datetime('now', 'localtime'), datetime('now', 'localtime'));

    INSERT INTO Employee (firstName, lastName, role, createdAt, updatedAt) VALUES
    ('นพ.วิชัย', 'ใจดี', 'DOCTOR', datetime('now', 'localtime'), datetime('now', 'localtime')),
    ('พญ.สุดา', 'เก่งการแพทย์', 'DOCTOR', datetime('now', 'localtime'), datetime('now', 'localtime')),
    ('วิภา', 'รักษาดี', 'NURSE', datetime('now', 'localtime'), datetime('now', 'localtime')),
    ('นารี', 'ช่วยแพทย์', 'NURSE', datetime('now', 'localtime'), datetime('now', 'localtime'));

    -- Note: Timeslots in the future for testing booking constraints
    INSERT INTO Timeslot (doctorId, startTime, endTime, maxCapacity, createdAt, updatedAt) VALUES
    (1, '2026-07-20T09:00:00.000Z', '2026-07-20T12:00:00.000Z', 5, datetime('now', 'localtime'), datetime('now', 'localtime')),
    (1, '2026-07-21T09:00:00.000Z', '2026-07-21T12:00:00.000Z', 5, datetime('now', 'localtime'), datetime('now', 'localtime')),
    (2, '2026-07-20T13:00:00.000Z', '2026-07-20T16:00:00.000Z', 3, datetime('now', 'localtime'), datetime('now', 'localtime')),
    (2, '2026-07-22T13:00:00.000Z', '2026-07-22T16:00:00.000Z', 3, datetime('now', 'localtime'), datetime('now', 'localtime'));

    INSERT INTO Appointment (patientId, timeslotId, status, date, createdAt, updatedAt) VALUES
    (1, 1, 'BOOKED', datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime')),
    (2, 3, 'BOOKED', datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'));
  `);
}

export default db;
