import { Router } from 'express';
import db from '../db';

const router = Router();

// Get patient data (can be accessed by any authorized role)
router.get('/', (req, res) => {
  try {
    const { hn } = req.query;
    if (hn) {
      const patient = db.prepare('SELECT * FROM Patient WHERE hn = ?').get(String(hn));
      if (!patient) return res.status(404).json({ error: 'Patient not found' });
      return res.json(patient);
    }
    const patients = db.prepare('SELECT * FROM Patient LIMIT 100').all();
    res.json(patients);
  } catch (error) {
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
    const existing = db.prepare('SELECT 1 FROM Patient WHERE hn = ?').get(hn);
    if (existing) {
      return res.status(400).json({ error: 'HN already exists in system' });
    }

    const result = db.prepare(`
      INSERT INTO Patient (hn, firstName, lastName, phone, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(hn, firstName, lastName, phone || null);

    const newPatient = db.prepare('SELECT * FROM Patient WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newPatient);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
