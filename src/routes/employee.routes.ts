import { Router } from 'express';
import db from '../db';

const router = Router();

// Get employee data (e.g. list of doctors)
router.get('/', (req, res) => {
  try {
    const { role } = req.query;
    let employees;
    if (role) {
      employees = db.prepare('SELECT id, firstName, lastName, role FROM Employee WHERE UPPER(role) = ?').all(String(role).toUpperCase());
    } else {
      employees = db.prepare('SELECT id, firstName, lastName, role FROM Employee').all();
    }
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
