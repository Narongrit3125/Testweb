"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Get patient data (can be accessed by any authorized role)
router.get('/', (req, res) => {
    try {
        const { hn } = req.query;
        if (hn) {
            const patient = db_1.default.prepare('SELECT * FROM Patient WHERE hn = ?').get(String(hn));
            if (!patient)
                return res.status(404).json({ error: 'Patient not found' });
            return res.json(patient);
        }
        const patients = db_1.default.prepare('SELECT * FROM Patient LIMIT 100').all();
        res.json(patients);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Register a new patient
router.post('/', (req, res) => {
    try {
        const { hn, firstName, lastName, phone } = req.body;
        if (!hn || !firstName || !lastName) {
            return res.status(400).json({ error: 'hn, firstName, and lastName are required' });
        }
        // Check if hn already exists
        const existing = db_1.default.prepare('SELECT 1 FROM Patient WHERE hn = ?').get(hn);
        if (existing) {
            return res.status(400).json({ error: 'HN already exists in system' });
        }
        const result = db_1.default.prepare(`
      INSERT INTO Patient (hn, firstName, lastName, phone, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(hn, firstName, lastName, phone || null);
        const newPatient = db_1.default.prepare('SELECT * FROM Patient WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newPatient);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
exports.default = router;
