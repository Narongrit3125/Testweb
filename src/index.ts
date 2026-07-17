import express from 'express';
import cors from 'cors';
import { streamEvents } from './services/realtime.service';

import patientRoutes from './routes/patient.routes';
import employeeRoutes from './routes/employee.routes';
import timeslotRoutes from './routes/timeslot.routes';
import appointmentRoutes from './routes/appointment.routes';

const app = express();

app.use(cors());
app.use(express.json());

// Real-time SSE endpoint for nurses
app.get('/api/events', streamEvents);

// API Routes
app.use('/api/patient', patientRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/timeslot', timeslotRoutes);
app.use('/api/appointment', appointmentRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
