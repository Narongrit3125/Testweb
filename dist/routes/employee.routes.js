"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Get employee data (e.g. list of doctors)
router.get('/', (req, res) => {
    try {
        const { role } = req.query;
        let employees;
        if (role) {
            employees = db_1.default.prepare('SELECT id, firstName, lastName, role FROM Employee WHERE UPPER(role) = ?').all(String(role).toUpperCase());
        }
        else {
            employees = db_1.default.prepare('SELECT id, firstName, lastName, role FROM Employee').all();
        }
        res.json(employees);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
