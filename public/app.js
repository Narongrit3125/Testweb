// State Management
let currentPatient = null;
let selectedTimeslotId = null;
let doctorsList = [];
let patientAppointments = [];
let reschedulingApptId = null;

// DOM Elements
const inputHn = document.getElementById('input-hn');
const btnSearchPatient = document.getElementById('btn-search-patient');
const patientNotfound = document.getElementById('patient-notfound');

const bookingContainer = document.getElementById('booking-container');
const selectDoctor = document.getElementById('select-doctor');
const inputBookingDate = document.getElementById('input-booking-date');
const timeslotsGrid = document.getElementById('timeslots-grid');
const btnSubmitBooking = document.getElementById('btn-submit-booking');

// Registration DOM Elements
const regHn = document.getElementById('reg-hn');
const regPhone = document.getElementById('reg-phone');
const regFirstname = document.getElementById('reg-firstname');
const regLastname = document.getElementById('reg-lastname');
const btnRegisterPatient = document.getElementById('btn-register-patient');

const patientProfileCard = document.getElementById('patient-profile-card');
const profileName = document.getElementById('profile-name');
const profileHn = document.getElementById('profile-hn');
const profilePhone = document.getElementById('profile-phone');
const btnPatientLogout = document.getElementById('btn-patient-logout');
const patientAppointmentsList = document.getElementById('patient-appointments-list');
const rescheduleBanner = document.getElementById('reschedule-banner');
const rescheduleInfo = document.getElementById('reschedule-info');
const btnCancelReschedule = document.getElementById('btn-cancel-reschedule');

const toastContainer = document.getElementById('toast-container');

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadDoctorsList();
  
  // Set default booking date to tomorrow (since booking must be at least 1 day in advance)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  inputBookingDate.min = tomorrow.toISOString().split('T')[0];
  inputBookingDate.value = tomorrow.toISOString().split('T')[0];
});

// ================= EVENT LISTENERS =================
function setupEventListeners() {
  // Patient Search
  btnSearchPatient.addEventListener('click', handlePatientSearch);
  inputHn.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handlePatientSearch();
  });

  // Patient Registration
  btnRegisterPatient.addEventListener('click', handlePatientRegistration);

  // Booking Form Filters
  selectDoctor.addEventListener('change', loadTimeslots);
  inputBookingDate.addEventListener('change', () => {
    const val = inputBookingDate.value;
    const label = document.getElementById('booking-date-be-label');
    if (val && label) {
      const d = new Date(val);
      const formatted = d.toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      label.textContent = `ตรงกับ: ${formatted}`;
    } else if (label) {
      label.textContent = '';
    }
    loadTimeslots();
  });

  // Submit Booking
  btnSubmitBooking.addEventListener('click', submitBooking);

  // Patient Logout
  btnPatientLogout.addEventListener('click', logoutPatient);

  // Cancel Reschedule
  if (btnCancelReschedule) {
    btnCancelReschedule.addEventListener('click', () => {
      cancelReschedule();
    });
  }
}

// ================= DOCTORS LOADER =================
async function loadDoctorsList() {
  try {
    const res = await fetch('/api/employee?role=DOCTOR');
    doctorsList = await res.json();
    
    // Populate select doctor dropdown (Patient portal)
    selectDoctor.innerHTML = '<option value="">-- แสดงแพทย์ทุกคนที่ว่าง --</option>';
    doctorsList.forEach(doc => {
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = `${doc.firstName} ${doc.lastName} (แพทย์ตรวจ)`;
      selectDoctor.appendChild(option);
    });
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อแพทย์ได้', 'error');
  }
}

// ================= PATIENT SYSTEM =================
async function handlePatientSearch() {
  const hn = inputHn.value.trim();
  if (!hn) return;

  try {
    patientNotfound.classList.add('hidden');
    const res = await fetch(`/api/patient?hn=${hn}`);
    
    if (res.status === 404) {
      patientNotfound.classList.remove('hidden');
      logoutPatient();
      return;
    }
    
    const patient = await res.json();
    loginPatient(patient);
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ไม่สามารถค้นหาข้อมูลคนไข้ได้', 'error');
  }
}

async function handlePatientRegistration() {
  const hn = regHn.value.trim();
  const phone = regPhone.value.trim();
  const firstName = regFirstname.value.trim();
  const lastName = regLastname.value.trim();

  if (!hn || !firstName || !lastName) {
    showToast('กรอกข้อมูลไม่ครบ', 'กรุณาระบุเลข HN, ชื่อจริง และนามสกุล', 'error');
    return;
  }

  try {
    const res = await fetch('/api/patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hn, phone, firstName, lastName })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast('ลงทะเบียนไม่สำเร็จ', data.error || 'กรุณาลองใหม่อีกครั้ง', 'error');
      return;
    }

    showToast('ลงทะเบียนสำเร็จ', `ลงทะเบียนคนไข้ใหม่เรียบร้อยแล้ว`, 'success');
    
    // Clear registration fields
    regHn.value = '';
    regPhone.value = '';
    regFirstname.value = '';
    regLastname.value = '';

    // Automatically log in the newly registered patient
    loginPatient(data);

  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ล้มเหลวในการลงทะเบียนคนไข้ใหม่', 'error');
  }
}

function loginPatient(patient) {
  currentPatient = patient;
  
  // Show Profile Card
  profileName.textContent = `${patient.firstName} ${patient.lastName}`;
  profileHn.textContent = patient.hn;
  profilePhone.textContent = patient.phone || '-';
  patientProfileCard.classList.remove('hidden');
  
  // Enable booking card
  bookingContainer.classList.remove('disabled-state');
  
  // Load patient's appointments
  loadPatientAppointments();
  
  // If doctor and date are selected, load slots
  loadTimeslots();
  
  showToast('เข้าสู่ระบบสำเร็จ', `สวัสดีคุณ ${patient.firstName} ยินดีต้อนรับสู่ระบบ`, 'success');
}

function logoutPatient() {
  currentPatient = null;
  inputHn.value = '';
  patientProfileCard.classList.add('hidden');
  bookingContainer.classList.add('disabled-state');
  patientAppointmentsList.innerHTML = '<p class="placeholder-text text-center">กรุณาเข้าสู่ระบบเพื่อแสดงคิวจองของคุณ</p>';
  timeslotsGrid.innerHTML = '<p class="placeholder-text text-center">กรุณาระบุวันที่เพื่อดูช่วงเวลาของแพทย์</p>';
  btnSubmitBooking.disabled = true;
  selectedTimeslotId = null;
  cancelReschedule();
  showToast('ออกจากระบบ', 'ออกจากระบบคนไข้เรียบร้อยแล้ว', 'success');
}

async function loadPatientAppointments() {
  if (!currentPatient) return;
  
  try {
    const res = await fetch(`/api/appointment?hn=${currentPatient.hn}`);
    patientAppointments = await res.json();
    
    renderPatientAppointments(patientAppointments);
  } catch (err) {
    showToast('ดึงข้อมูลล้มเหลว', 'ไม่สามารถโหลดรายการจองคิวของคุณได้', 'error');
  }
}

function renderPatientAppointments(appts) {
  patientAppointmentsList.innerHTML = '';
  
  if (appts.length === 0) {
    patientAppointmentsList.innerHTML = '<p class="placeholder-text text-center">ยังไม่มีการจองคิวนัดหมายของคุณ</p>';
    return;
  }
  
  // Sort: booked first, then by date descending
  appts.sort((a, b) => {
    if (a.status === 'BOOKED' && b.status === 'CANCELLED') return -1;
    if (a.status === 'CANCELLED' && b.status === 'BOOKED') return 1;
    return new Date(a.Timeslot.startTime) - new Date(b.Timeslot.startTime);
  });

  appts.forEach(appt => {
    const card = document.createElement('div');
    card.className = 'appt-card';
    
    const isBooked = appt.status === 'BOOKED';
    const statusText = isBooked ? 'จองแล้ว' : 'ยกเลิกแล้ว';
    const badgeClass = isBooked ? 'status-booked' : 'status-cancelled';
    
    const startTimeStr = formatDateTime(appt.Timeslot.startTime);
    const endTimeStr = formatTime(appt.Timeslot.endTime);
    
    const doctorName = `${appt.Timeslot.Doctor.firstName} ${appt.Timeslot.Doctor.lastName}`;

    card.innerHTML = `
      <div class="appt-info">
        <h4>แพทย์ผู้ตรวจ: ${doctorName}</h4>
        <p><i class="fa-regular fa-calendar-check"></i> วันนัด: ${startTimeStr} - ${endTimeStr}</p>
        <p><i class="fa-solid fa-notes-medical"></i> รหัสการจอง: #${appt.id}</p>
        <span class="status-badge ${badgeClass}">${statusText}</span>
      </div>
      ${isBooked ? `
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="btn-secondary btn-sm" onclick="startReschedule(${appt.id})">เลื่อนนัด</button>
          <button class="btn-danger btn-sm" onclick="cancelAppointment(${appt.id})">ยกเลิกนัด</button>
        </div>
      ` : ''}
    `;
    
    patientAppointmentsList.appendChild(card);
  });
}

// Make cancelAppointment global so onclick handles it
window.cancelAppointment = async function(apptId) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกคิวจองนี้?')) return;
  if (!currentPatient) return;
  
  try {
    const res = await fetch(`/api/appointment/${apptId}?hn=${currentPatient.hn}`, {
      method: 'DELETE'
    });
    
    const data = await res.json();
    if (!res.ok) {
      showToast('ไม่สามารถยกเลิกได้', data.error || 'กรุณาลองใหม่อีกครั้ง', 'error');
      return;
    }
    
    showToast('ยกเลิกสำเร็จ', 'ยกเลิกคิวนัดหมายเรียบร้อยแล้ว', 'success');
    loadPatientAppointments();
    loadTimeslots(); // Refresh capacity in UI
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ล้มเหลวในการส่งคำขอยกเลิกนัดหมาย', 'error');
  }
};

// ================= TIMESLOT LOADER =================
async function loadTimeslots() {
  if (!currentPatient) return;
  
  const docId = selectDoctor.value;
  const dateStr = inputBookingDate.value;
  
  if (!dateStr) {
    timeslotsGrid.innerHTML = '<p class="placeholder-text text-center">กรุณาระบุวันที่เพื่อดูช่วงเวลาของแพทย์</p>';
    btnSubmitBooking.disabled = true;
    selectedTimeslotId = null;
    return;
  }
  
  try {
    let url = `/api/timeslot?date=${dateStr}`;
    if (docId) {
      url += `&doctorId=${docId}`;
    }

    const res = await fetch(url);
    const slots = await res.json();
    
    renderTimeslots(slots);
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ล้มเหลวในการดึงตารางเวลาของแพทย์', 'error');
  }
}

function renderTimeslots(slots) {
  timeslotsGrid.innerHTML = '';
  selectedTimeslotId = null;
  btnSubmitBooking.disabled = true;
  
  if (slots.length === 0) {
    timeslotsGrid.innerHTML = '<p class="placeholder-text text-center">วันที่เลือกยังไม่มีตารางเวลาแพทย์ทำการ</p>';
    return;
  }
  
  slots.forEach(slot => {
    const isFull = slot.remainingCapacity <= 0;
    const isPassed = new Date(slot.startTime) <= new Date();
    
    const item = document.createElement('div');
    if (isPassed || isFull) {
      item.className = 'timeslot-item full';
    } else {
      item.className = 'timeslot-item';
    }
    
    const startStr = formatTime(slot.startTime);
    const endStr = formatTime(slot.endTime);
    const doctorNameStr = `แพทย์: ${slot.Doctor.firstName} ${slot.Doctor.lastName}`;
    
    if (isPassed) {
      item.innerHTML = `
        <div class="timeslot-time">${startStr} - ${endStr}</div>
        <div class="timeslot-doctor" style="font-size: 0.78rem; margin: 4px 0; font-weight: 500;">${doctorNameStr}</div>
        <div class="timeslot-capacity">หมดเวลาจอง</div>
      `;
    } else if (isFull) {
      item.innerHTML = `
        <div class="timeslot-time">${startStr} - ${endStr}</div>
        <div class="timeslot-doctor" style="font-size: 0.78rem; margin: 4px 0; font-weight: 500; color: var(--accent-color);">${doctorNameStr}</div>
        <div class="timeslot-capacity">เต็มแล้ว (${slot.bookingsCount}/${slot.maxCapacity})</div>
      `;
    } else {
      item.innerHTML = `
        <div class="timeslot-time">${startStr} - ${endStr}</div>
        <div class="timeslot-doctor" style="font-size: 0.78rem; margin: 4px 0; font-weight: 500; color: var(--accent-color);">${doctorNameStr}</div>
        <div class="timeslot-capacity">ว่าง ${slot.remainingCapacity}/${slot.maxCapacity} คน</div>
      `;
    }
    
    if (!isFull && !isPassed) {
      item.addEventListener('click', () => {
        // De-select old
        const oldSelected = timeslotsGrid.querySelector('.timeslot-item.selected');
        if (oldSelected) oldSelected.classList.remove('selected');
        
        item.classList.add('selected');
        selectedTimeslotId = slot.id;
        btnSubmitBooking.disabled = false;
      });
    }
    
    timeslotsGrid.appendChild(item);
  });
}

// ================= BOOKING SUBMISSION =================
async function submitBooking() {
  if (!currentPatient || !selectedTimeslotId) return;
  
  try {
    let res;
    if (reschedulingApptId !== null) {
      res = await fetch(`/api/appointment/${reschedulingApptId}?hn=${currentPatient.hn}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeslotId: selectedTimeslotId
        })
      });
    } else {
      res = await fetch('/api/appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: currentPatient.id,
          timeslotId: selectedTimeslotId
        })
      });
    }
    
    const data = await res.json();
    if (!res.ok) {
      showToast(reschedulingApptId !== null ? 'เลื่อนนัดล้มเหลว' : 'จองคิวล้มเหลว', data.error || 'กรุณาลองใหม่อีกครั้ง', 'error');
      return;
    }
    
    showToast(
      reschedulingApptId !== null ? 'เลื่อนนัดสำเร็จ' : 'จองคิวสำเร็จ', 
      reschedulingApptId !== null ? 'เปลี่ยนแปลงวันเวลานัดหมายเรียบร้อยแล้ว' : 'ระบบบันทึกคิวนัดหมายของท่านเรียบร้อยแล้ว', 
      'success'
    );
    
    // Reset selection and mode
    if (reschedulingApptId !== null) {
      cancelReschedule();
    } else {
      selectedTimeslotId = null;
      btnSubmitBooking.disabled = true;
    }
    
    // Reload schedules
    loadPatientAppointments();
    loadTimeslots();
    
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ล้มเหลวในการส่งข้อมูลคำขอ', 'error');
  }
}

// ================= APPOINTMENT RESCHEDULING =================
window.startReschedule = function(apptId) {
  const appt = patientAppointments.find(a => a.id === apptId);
  if (!appt) return;
  
  reschedulingApptId = appt.id;
  
  // Show banner & details
  rescheduleBanner.classList.remove('hidden');
  const startTimeStr = formatDateTime(appt.Timeslot.startTime);
  const docName = `${appt.Timeslot.Doctor.firstName} ${appt.Timeslot.Doctor.lastName}`;
  rescheduleInfo.textContent = `คิวที่ #${appt.id} (แพทย์: ${docName}, วันนัดเดิม: ${startTimeStr.split(' ')[0]} ${startTimeStr.split(' ')[1]})`;
  
  // Auto fill form
  selectDoctor.value = appt.Timeslot.doctorId;
  const originalDate = new Date(appt.Timeslot.startTime).toISOString().split('T')[0];
  inputBookingDate.value = originalDate;
  
  // Trigger BE date label change
  const label = document.getElementById('booking-date-be-label');
  if (label) {
    const d = new Date(originalDate);
    const formatted = d.toLocaleDateString('th-TH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    label.textContent = `ตรงกับ: ${formatted}`;
  }
  
  loadTimeslots();
  
  // Update submit button text
  btnSubmitBooking.innerHTML = '<i class="fa-solid fa-users-gear"></i> ยืนยันการเลื่อนนัดหมาย';
  btnSubmitBooking.disabled = true; // wait for new slot select
  
  // Scroll to booking area
  bookingContainer.scrollIntoView({ behavior: 'smooth' });
};

window.cancelReschedule = function() {
  reschedulingApptId = null;
  rescheduleBanner.classList.add('hidden');
  btnSubmitBooking.innerHTML = '<i class="fa-solid fa-circle-check"></i> ยืนยันการจองคิวนัดหมาย';
  
  selectedTimeslotId = null;
  btnSubmitBooking.disabled = true;
  
  // Load slots for tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  inputBookingDate.value = tomorrow.toISOString().split('T')[0];
  selectDoctor.value = '';
  
  const label = document.getElementById('booking-date-be-label');
  if (label) {
    const d = new Date(inputBookingDate.value);
    const formatted = d.toLocaleDateString('th-TH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    label.textContent = `ตรงกับ: ${formatted}`;
  }
  
  loadTimeslots();
};

// ================= UTILITY FUNCTIONS =================
function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function showToast(title, message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <div class="toast-content">
      <h5>${title}</h5>
      <p>${message}</p>
    </div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;
  
  toastContainer.appendChild(toast);
  
  // Close actions
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.remove();
  });
  
  // Auto remove
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('slide-out');
      setTimeout(() => toast.remove(), 400);
    }
  }, 4000);
}
