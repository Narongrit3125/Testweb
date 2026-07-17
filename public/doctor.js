// State Management
let currentDoctor = null;
let doctorEventSource = null;
let doctorsList = [];

// DOM Elements
const doctorAccessSection = document.getElementById('doctor-access');
const doctorWorkspaceSection = document.getElementById('doctor-workspace');
const selectDoctorLogin = document.getElementById('select-doctor-login');
const btnDoctorLogin = document.getElementById('btn-doctor-login');
const btnDoctorLogout = document.getElementById('btn-doctor-logout');

const activeDoctorBadge = document.getElementById('doctor-active-badge');
const activeDoctorName = document.getElementById('active-doctor-name');

const tsStart = document.getElementById('ts-start');
const tsEnd = document.getElementById('ts-end');
const tsCapacity = document.getElementById('ts-capacity');
const btnCreateTimeslot = document.getElementById('btn-create-timeslot');

const doctorAppointmentsBody = document.getElementById('doctor-appointments-body');
const toastContainer = document.getElementById('toast-container');

const passcodeScreen = document.getElementById('passcode-screen');
const inputPasscode = document.getElementById('input-passcode');
const passcodeError = document.getElementById('passcode-error');
const btnVerifyPasscode = document.getElementById('btn-verify-passcode');

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkPasscode();
  
  // Set default timeslot start/end to tomorrow 09:00 / 12:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateStr = tomorrow.toISOString().split('T')[0];
  tsStart.value = `${tomorrowDateStr}T09:00`;
  tsEnd.value = `${tomorrowDateStr}T12:00`;
});

function checkPasscode() {
  const passcode = sessionStorage.getItem('doctor_passcode');
  if (passcode === 'doctor123') {
    passcodeScreen.style.display = 'none';
    doctorAccessSection.classList.add('active');
    loadDoctorsList();
  } else {
    passcodeScreen.style.display = 'flex';
    doctorAccessSection.classList.remove('active');
  }
}

function verifyPasscode() {
  const passcode = inputPasscode.value.trim();
  if (passcode === 'doctor123') {
    sessionStorage.setItem('doctor_passcode', passcode);
    passcodeError.classList.add('hidden');
    
    // Animate out
    passcodeScreen.style.opacity = '0';
    setTimeout(() => {
      passcodeScreen.style.display = 'none';
      doctorAccessSection.classList.add('active');
      loadDoctorsList();
    }, 400);
    
    showToast('ยืนยันรหัสผ่านสำเร็จ', 'เข้าสู่ระบบบริหารจัดการแพทย์เรียบร้อยแล้ว', 'success');
  } else {
    passcodeError.classList.remove('hidden');
    showToast('รหัสผ่านไม่ถูกต้อง', 'กรุณาระบุรหัสผ่านให้ถูกต้อง', 'error');
  }
}

function setupEventListeners() {
  // Passcode verification
  btnVerifyPasscode.addEventListener('click', verifyPasscode);
  inputPasscode.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPasscode();
  });

  btnDoctorLogin.addEventListener('click', handleDoctorLogin);
  btnDoctorLogout.addEventListener('click', handleDoctorLogout);
  btnCreateTimeslot.addEventListener('click', handleTimeslotCreation);
}

// ================= DOCTORS LIST LOADER =================
async function loadDoctorsList() {
  try {
    const res = await fetch('/api/employee?role=DOCTOR');
    doctorsList = await res.json();
    
    selectDoctorLogin.innerHTML = '<option value="">-- โปรดเลือกแพทย์ --</option>';
    doctorsList.forEach(doc => {
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = `${doc.firstName} ${doc.lastName}`;
      selectDoctorLogin.appendChild(option);
    });
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อแพทย์ได้', 'error');
  }
}

// ================= LOGIN / LOGOUT =================
function handleDoctorLogin() {
  const docId = selectDoctorLogin.value;
  if (!docId) {
    showToast('กรุณาเลือกแพทย์', 'โปรดเลือกชื่อแพทย์เพื่อเข้าใช้งานระบบ', 'error');
    return;
  }
  
  currentDoctor = doctorsList.find(d => d.id === Number(docId));
  if (!currentDoctor) return;
  
  // Update Header UI
  activeDoctorName.innerHTML = `<i class="fa-solid fa-user-md"></i> ${currentDoctor.firstName} ${currentDoctor.lastName}`;
  activeDoctorBadge.classList.remove('hidden');
  
  // Switch Views
  doctorAccessSection.classList.remove('active');
  doctorWorkspaceSection.classList.add('active');
  
  // Load data and listen to events
  loadDoctorAppointments();
  startRealTimeUpdates();
  
  showToast('เข้าสู่ระบบสำเร็จ', `สวัสดีคุณหมอ ${currentDoctor.firstName} ยินดีต้อนรับสู่ระบบงานแพทย์`, 'success');
}

function handleDoctorLogout() {
  currentDoctor = null;
  
  // Disconnect SSE
  if (doctorEventSource) {
    doctorEventSource.close();
    doctorEventSource = null;
  }
  
  // Update Header UI
  activeDoctorBadge.classList.add('hidden');
  
  // Reset Form Inputs
  selectDoctorLogin.value = '';
  
  // Switch Views
  doctorWorkspaceSection.classList.remove('active');
  doctorAccessSection.classList.add('active');
  
  showToast('ออกจากระบบสำเร็จ', 'ลงชื่อออกจากระบบงานแพทย์เรียบร้อยแล้ว', 'success');
}

// ================= TIMESLOT CREATION =================
async function handleTimeslotCreation() {
  if (!currentDoctor) return;
  
  const startStr = tsStart.value;
  const endStr = tsEnd.value;
  const capacity = tsCapacity.value;

  if (!startStr || !endStr || !capacity) {
    showToast('กรอกข้อมูลไม่ครบ', 'กรุณาระบุเวลาเริ่มต้น เวลาสิ้นสุด และจำนวนคิวรับตรวจสูงสุด', 'error');
    return;
  }

  const startTimeISO = new Date(startStr).toISOString();
  const endTimeISO = new Date(endStr).toISOString();

  if (new Date(startTimeISO) >= new Date(endTimeISO)) {
    showToast('เวลาไม่ถูกต้อง', 'เวลาเริ่มต้นต้องมาก่อนเวลาสิ้นสุดตรวจ', 'error');
    return;
  }

  try {
    const passcode = sessionStorage.getItem('doctor_passcode') || '';
    const res = await fetch('/api/timeslot', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${passcode}`
      },
      body: JSON.stringify({
        doctorId: currentDoctor.id,
        startTime: startTimeISO,
        endTime: endTimeISO,
        maxCapacity: Number(capacity)
      })
    });

    const data = await res.json();
    if (res.status === 401) {
      sessionStorage.removeItem('doctor_passcode');
      checkPasscode();
      return;
    }

    if (!res.ok) {
      showToast('สร้างรอบตรวจล้มเหลว', data.error || 'กรุณาลองใหม่อีกครั้ง', 'error');
      return;
    }

    showToast('เปิดช่วงเวลาสำเร็จ', 'ระบบเปิดตารางเวลาตรวจใหม่ของท่านเรียบร้อยแล้ว', 'success');
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ล้มเหลวในการส่งข้อมูลตารางเวลาใหม่', 'error');
  }
}

// ================= APPOINTMENTS LOADER =================
async function loadDoctorAppointments() {
  if (!currentDoctor) return;
  
  try {
    const passcode = sessionStorage.getItem('doctor_passcode') || '';
    const res = await fetch('/api/appointment', {
      headers: {
        'Authorization': `Bearer ${passcode}`
      }
    });

    if (res.status === 401) {
      sessionStorage.removeItem('doctor_passcode');
      checkPasscode();
      return;
    }

    const allAppts = await res.json();
    
    // Filter appointments for this doctor only
    const myAppts = allAppts.filter(appt => appt.Timeslot.doctorId === currentDoctor.id);
    
    renderDoctorAppointments(myAppts);
  } catch (err) {
    showToast('ดึงข้อมูลล้มเหลว', 'ไม่สามารถโหลดตารางจองคิวตรวจของท่านได้', 'error');
  }
}

function renderDoctorAppointments(appts, highlightId = null) {
  doctorAppointmentsBody.innerHTML = '';
  
  if (appts.length === 0) {
    doctorAppointmentsBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center placeholder-text">ยังไม่มีข้อมูลการจองคิวตรวจของคุณหมอในขณะนี้</td>
      </tr>
    `;
    return;
  }
  
  // Sort: Booking date descending
  appts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  appts.forEach((appt, idx) => {
    const tr = document.createElement('tr');
    if (highlightId && appt.id === highlightId) {
      tr.className = 'new-row-pulse';
    }
    
    const isBooked = appt.status === 'BOOKED';
    const statusText = isBooked ? 'จองตรวจสำเร็จ' : 'ยกเลิกแล้ว';
    const badgeClass = isBooked ? 'status-booked' : 'status-cancelled';
    
    const startTimeStr = formatDateTime(appt.Timeslot.startTime);
    const endTimeStr = formatTime(appt.Timeslot.endTime);
    const patientName = `${appt.Patient.firstName} ${appt.Patient.lastName}`;
    const phone = appt.Patient.phone || '-';

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${appt.Patient.hn}</strong></td>
      <td>${patientName}</td>
      <td>${startTimeStr} - ${endTimeStr}</td>
      <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
      <td>${phone}</td>
      <td>
        ${isBooked ? `<button class="btn-danger btn-sm" onclick="cancelAppointment(${appt.id})">ยกเลิกคิว</button>` : '<span class="text-secondary">-</span>'}
      </td>
    `;
    
    doctorAppointmentsBody.appendChild(tr);
  });
}

// ================= REAL-TIME EVENT SINK =================
function startRealTimeUpdates() {
  if (doctorEventSource) {
    doctorEventSource.close();
  }

  doctorEventSource = new EventSource('/api/events');

  doctorEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!currentDoctor) return;

      // Only care about events related to this logged-in doctor
      if (data.appointment.Timeslot.doctorId === currentDoctor.id) {
        if (data.type === 'NEW_BOOKING') {
          showToast(
            'คนไข้ใหม่จองตรวจ!', 
            `คนไข้ HN ${data.appointment.Patient.hn} (${data.appointment.Patient.firstName}) ได้เลือกจองคิวรอบเวลา ${formatTime(data.appointment.Timeslot.startTime)}`, 
            'success'
          );
          loadDoctorAppointments();
        } else if (data.type === 'CANCEL_BOOKING') {
          showToast(
            'คิวตรวจถูกยกเลิก', 
            `คนไข้ HN ${data.appointment.Patient.hn} ยกเลิกการจองรอบเวลา ${formatTime(data.appointment.Timeslot.startTime)}`, 
            'error'
          );
          loadDoctorAppointments();
        }
      }
    } catch (err) {
      console.error('Failed to parse SSE payload:', err);
    }
  };

  doctorEventSource.onerror = () => {
    console.warn('SSE connection disconnected. Attempting to reconnect...');
  };
}

// Make cancelAppointment global so onclick handles it
window.cancelAppointment = async function(apptId) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกคิวจองนี้ของคนไข้?')) return;
  
  try {
    const passcode = sessionStorage.getItem('doctor_passcode') || '';
    const res = await fetch(`/api/appointment/${apptId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${passcode}`
      }
    });
    
    const data = await res.json();
    if (!res.ok) {
      showToast('ไม่สามารถยกเลิกได้', data.error || 'กรุณาลองใหม่อีกครั้ง', 'error');
      return;
    }
    
    showToast('ยกเลิกสำเร็จ', 'ยกเลิกคิวนัดหมายของคนไข้เรียบร้อยแล้ว', 'success');
    loadDoctorAppointments();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'ล้มเหลวในการส่งคำขอยกเลิกนัดหมาย', 'error');
  }
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
