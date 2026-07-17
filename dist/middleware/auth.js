"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const auth = (roles) => {
    return (req, res, next) => {
        try {
            // For testing without real auth, we could mock it. 
            // In a real system, you'd extract the Bearer token.
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).json({ error: 'No token provided' });
            }
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            if (roles.length > 0 && !roles.includes(decoded.role)) {
                return res.status(403).json({ error: 'Permission denied' });
            }
            req.user = decoded;
            next();
        }
        catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    };
};
exports.auth = auth;
