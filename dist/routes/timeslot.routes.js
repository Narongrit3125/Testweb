"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// Get timeslots, optionally filter by doctor or date
router.get('/', async (req, res) => {
    try {
        const { doctorId, date } = req.query;
        let whereClause = {};
        if (doctorId)
            whereClause.doctorId = Number(doctorId);
        if (date) {
            const targetDate = new Date(String(date));
            const nextDate = new Date(targetDate);
            nextDate.setDate(targetDate.getDate() + 1);
            whereClause.startTime = {
                gte: targetDate,
                lt: nextDate
            };
        }
        const timeslots = await db_1.default.timeslot.findMany({
            where: whereClause,
            include: {
                Doctor: {
                    select: { firstName: true, lastName: true }
                }
            }
        });
        res.json(timeslots);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
