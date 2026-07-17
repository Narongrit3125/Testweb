"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Get patient data (can be accessed by any authorized role)
router.get('/', async (req, res) => {
    try {
        const { hn } = req.query;
        if (hn) {
            const patient = await db_1.default.patient.findUnique({ where: { hn: String(hn) } });
            if (!patient)
                return res.status(404).json({ error: 'Patient not found' });
            return res.json(patient);
        }
        const patients = await db_1.default.patient.findMany({ take: 100 }); // Limit to 100 for safety
        res.json(patients);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
