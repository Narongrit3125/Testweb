"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const realtime_service_1 = require("./services/realtime.service");
const patient_routes_1 = __importDefault(require("./routes/patient.routes"));
const employee_routes_1 = __importDefault(require("./routes/employee.routes"));
const timeslot_routes_1 = __importDefault(require("./routes/timeslot.routes"));
const appointment_routes_1 = __importDefault(require("./routes/appointment.routes"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
// Real-time SSE endpoint for nurses
app.get('/api/events', realtime_service_1.streamEvents);
// API Routes
app.use('/api/patient', patient_routes_1.default);
app.use('/api/employee', employee_routes_1.default);
app.use('/api/timeslot', timeslot_routes_1.default);
app.use('/api/appointment', appointment_routes_1.default);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
