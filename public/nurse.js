// State Management
let nurseEventSource = null;

// DOM Elements
const nurseAppointmentsBody = document.getElementById('nurse-appointments-body');
const filterHn = document.getElementById('filter-hn');
const filterDoctor = document.getElementById('filter-doctor');
const filterDate = document.getElementById('filter-date');
const btnClearFilters = document.getElementById('btn-clear-filters');
const statTotal = document.getElementById('stat-total');
const statCancelled = document.getElementById('stat-cancelled');

const passcodeScreen = document.getElementById('passcode-screen');
const inputPasscode = document.getElementById('input-passcode');
const passcodeError = document.getElementById('passcode-error');
const btnVerifyPasscode = document.getElementById('btn-verify-passcode');
const nursePortal = document.getElementById('nurse-portal');

const toastContainer = document.getElementById('toast-container');

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkPasscode();
});

function checkPasscode() {
  const passcode = sessionStorage.getItem('nurse_passcode');
  if (passcode === 'nurse123') {
    passcodeScreen.style.display = 'none';
    nursePortal.classList.add('active');
    loadNurseAppointments();
    startRealTimeUpdates();
  } else {
    passcodeScreen.style.display = 'flex';
    nursePortal.classList.remove('active');
  }
}

function verifyPasscode() {
  const passcode = inputPasscode.value.trim();
  if (passcode === 'nurse123') {
    sessionStorage.setItem('nurse_passcode', passcode);
    passcodeError.classList.add('hidden');
    
    // Animate out
    passcodeScreen.style.opacity = '0';
    setTimeout(() => {
      passcodeScreen.style.display = 'none';
      nursePortal.classList.add('active');
      loadNurseAppointments();
      startRealTimeUpdates();
    }, 400);
    
    showToast('ยืนยันรหัสผ่านสำเร็จ', 'ยินดีต้อนรับเข้าสู่ระบบงานพยาบาล', 'success');
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

  // Filters
  filterHn.addEventListener('input', debounce(loadNurseAppointments, 300));
  filterDoctor.addEventListener('input', debounce(loadNurseAppointments, 300));
  filterDate.addEventListener('input', debounce(loadNurseAppointments, 300));
  btnClearFilters.addEventListener('click', clearNurseFilters);
}

// ================= DASHBOARD LOADER =================
async function loadNurseAppointments() {
  const hn = filterHn.value.trim();
  const doc = filterDoctor.value.trim();
  const rawDate = filterDate.value.trim();
  const date = parseBEToAD(rawDate);
  
  let url = '/api/appointment?';
  const params = [];
  if (hn) params.push(`hn=${encodeURIComponent(hn)}`);
  if (doc) params.push(`doctorName=${encodeURIComponent(doc)}`);
  if (date) params.push(`date=${encodeURIComponent(date)}`);
  
  url += params.join('&');
  
  try {
    const passcode = sessionStorage.getItem('nurse_passcode') || '';
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${passcode}`
      }
    });

    if (res.status === 401) {
      sessionStorage.removeItem('nurse_passcode');
      checkPasscode();
      return;
    }

    const appts = await res.json();
    renderNurseAppointments(appts);
    updateNurseStats(appts);
  } catch (err) {
    showToast('ดึงข้อมูลล้มเหลว', 'ไม่สามารถโหลดตารางข้อมูลจองคิวทั้งหมดได้', 'error');
  }
}

function renderNurseAppointments(appts, highlightId = null) {
  nurseAppointmentsBody.innerHTML = '';
  
  if (appts.length === 0) {
    nurseAppointmentsBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center placeholder-text">ไม่มีข้อมูลตารางนัดหมายที่ตรงตามเงื่อนไข</td>
      </tr>
    `;
    return;
  }
  
  // Sort: Booking date descending or Appointment start time ascending
  appts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  appts.forEach((appt, idx) => {
    const tr = document.createElement('tr');
    if (highlightId && appt.id === highlightId) {
      tr.className = 'new-row-pulse';
    }
    
    const isBooked = appt.status === 'BOOKED';
    const statusText = isBooked ? 'จองคิวสำเร็จ' : 'ยกเลิกแล้ว';
    const badgeClass = isBooked ? 'status-booked' : 'status-cancelled';
    
    const startTimeStr = formatDateTime(appt.Timeslot.startTime);
    const endTimeStr = formatTime(appt.Timeslot.endTime);
    const createdAtStr = formatDateTime(appt.createdAt);
    const patientName = `${appt.Patient.firstName} ${appt.Patient.lastName}`;
    const doctorName = `${appt.Timeslot.Doctor.firstName} ${appt.Timeslot.Doctor.lastName}`;

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${appt.Patient.hn}</strong></td>
      <td>${patientName}</td>
      <td>${doctorName}</td>
      <td>${startTimeStr} - ${endTimeStr}</td>
      <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
      <td>${createdAtStr}</td>
      <td>
        ${isBooked ? `<button class="btn-danger btn-sm" onclick="cancelAppointment(${appt.id})">ยกเลิกคิว</button>` : '<span class="text-secondary">-</span>'}
      </td>
    `;
    
    nurseAppointmentsBody.appendChild(tr);
  });
}

function updateNurseStats(appts) {
  const total = appts.filter(a => a.status === 'BOOKED').length;
  const cancelled = appts.filter(a => a.status === 'CANCELLED').length;
  
  statTotal.textContent = total;
  statCancelled.textContent = cancelled;
}

function clearNurseFilters() {
  filterHn.value = '';
  filterDoctor.value = '';
  filterDate.value = '';
  loadNurseAppointments();
  showToast('รีเซ็ตสำเร็จ', 'ล้างการกรองข้อมูลแล้ว', 'success');
}

// ================= PATIENT REGISTRATION =================


// ================= REAL-TIME live SYNCRONIZATION =================
function startRealTimeUpdates() {
  if (nurseEventSource) {
    nurseEventSource.close();
  }

  // EventSource connects to SSE server
  nurseEventSource = new EventSource('/api/events');

  nurseEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'NEW_BOOKING') {
        showToast(
          'มีการจองคิวใหม่!', 
          `คนไข้ HN ${data.appointment.Patient.hn} จองตรวจกับ ${data.appointment.Timeslot.Doctor.firstName} ${data.appointment.Timeslot.Doctor.lastName}`, 
          'success'
        );
        loadNurseAppointments();
      } else if (data.type === 'CANCEL_BOOKING') {
        showToast(
          'คิวตรวจถูกยกเลิก', 
          `คนไข้ HN ${data.appointment.Patient.hn} ยกเลิกการจองนัดหมายแพทย์`, 
          'error'
        );
        loadNurseAppointments();
      }
    } catch (err) {
      console.error('Failed to parse SSE payload:', err);
    }
  };

  nurseEventSource.onerror = () => {
    console.warn('SSE connection disconnected. Attempting to reconnect...');
  };
}

// Make cancelAppointment global so onclick handles it
window.cancelAppointment = async function(apptId) {
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกคิวจองนี้?')) return;
  
  try {
    const passcode = sessionStorage.getItem('nurse_passcode') || '';
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
    
    showToast('ยกเลิกสำเร็จ', 'ยกเลิกคิวนัดหมายเรียบร้อยแล้ว', 'success');
    loadNurseAppointments();
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

function parseBEToAD(dateStr) {
  if (!dateStr) return '';
  let parts = [];
  if (dateStr.includes('/')) {
    parts = dateStr.split('/');
  } else if (dateStr.includes('-')) {
    parts = dateStr.split('-');
  }
  if (parts.length === 3) {
    let day, month, year;
    if (parts[0].length === 4) {
      year = parseInt(parts[0]);
      month = parts[1];
      day = parts[2];
    } else {
      day = parts[0];
      month = parts[1];
      year = parseInt(parts[2]);
    }
    if (year > 2400) {
      year -= 543;
    }
    const paddedMonth = month.toString().padStart(2, '0');
    const paddedDay = day.toString().padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }
  return dateStr;
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

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
