"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Get employee data (e.g. list of doctors)
router.get('/', async (req, res) => {
    try {
        const { role } = req.query;
        const filter = role ? { role: String(role).toUpperCase() } : {};
        const employees = await db_1.default.employee.findMany({
            where: filter,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true
            }
        });
        res.json(employees);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
