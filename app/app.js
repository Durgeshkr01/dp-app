// ============================================================
// MERA APP - Complete Logic
// ============================================================

// ==================== TIMETABLE DATA (Dynamic) ====================
const DAYS      = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TT_STORAGE_KEY = 'dp_timetable';

// Load timetable from localStorage (or empty)
let TIMETABLE = JSON.parse(localStorage.getItem(TT_STORAGE_KEY) || 'null') || {};

function hasTimetable() {
  return Object.keys(TIMETABLE).length > 0 && DAYS.some(d => (TIMETABLE[d] || []).length > 0);
}

// ==================== EXCEL UPLOAD & PARSER ====================
function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const parsed = parseSheetRows(rows);
      if (!parsed) { showToast('Format sahi nahi lag raha! Check karo.'); return; }
      TIMETABLE = parsed;
      localStorage.setItem(TT_STORAGE_KEY, JSON.stringify(TIMETABLE));
      showToast('Timetable successfully upload ho gaya! ✓');
      renderTimetable();
      renderHomeSummary();
    } catch (err) {
      showToast('File read karne mein error aaya!');
    }
    event.target.value = ''; // reset so same file can be re-uploaded
  };
  reader.readAsArrayBuffer(file);
}

function parseSheetRows(rows) {
  if (!rows || rows.length < 2) return null;

  // Find header row: contains time-like strings in columns 1+
  let headerIdx = -1;
  let timeSlots = [];
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i];
    if (!r) continue;
    const times = r.slice(1).filter(c => c && /\d[:.]\d/.test(String(c)));
    if (times.length >= 2) {
      headerIdx = i;
      timeSlots = r.slice(1).map(t => t ? formatTimeSlot(String(t)) : null).filter(Boolean);
      break;
    }
  }
  if (headerIdx === -1) return null;

  const result = {};
  DAYS.forEach(d => result[d] = []);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const dayRaw = String(row[0]).trim();
    const dayKey = DAYS.find(d => d.toLowerCase() === dayRaw.toLowerCase());
    if (!dayKey) continue;

    const periods = [];
    const cells = row.slice(1, timeSlots.length + 1);

    let curSubject = null;
    let curRoom    = '';
    let startIdx   = 0;

    for (let j = 0; j <= cells.length; j++) {
      const rawCell = j < cells.length ? (cells[j] ? String(cells[j]).trim() : null) : null;
      const isNewSubject = rawCell && rawCell !== curSubject;
      const isEnd = j === cells.length;

      if ((isNewSubject || isEnd) && curSubject !== null) {
        // Calculate time range: from timeSlots[startIdx] start → timeSlots[j-1] end
        const tStart = slotStart(timeSlots[startIdx] || '');
        const tEnd   = slotEnd(timeSlots[Math.min(j, timeSlots.length) - 1] || '');
        periods.push({
          time: `${tStart} - ${tEnd}`,
          subject: curSubject,
          teacher: '',
          room: curRoom
        });
      }

      if (rawCell && (isNewSubject || curSubject === null)) {
        const { subject, room } = extractSubjectRoom(rawCell);
        curSubject = subject;
        curRoom    = room;
        startIdx   = j;
      } else if (!rawCell && curSubject === null) {
        startIdx = j + 1; // skip leading empty
      }
    }

    result[dayKey] = periods;
  }

  return result;
}

function formatTimeSlot(raw) {
  // Normalize: "9.30AM-10.30AM" → "9:30 AM - 10:30 AM"
  return raw.replace(/\./g, ':').replace(/([APap][Mm])/g, ' $1').trim();
}

function slotStart(slot) {
  if (!slot) return '';
  const m = slot.match(/^(.+?)\s*[-–]\s*(.+)$/);
  return m ? m[1].trim() : slot.trim();
}

function slotEnd(slot) {
  if (!slot) return '';
  const m = slot.match(/^(.+?)\s*[-–]\s*(.+)$/);
  return m ? m[2].trim() : slot.trim();
}

function extractSubjectRoom(raw) {
  if (!raw) return { subject: '', room: '' };
  // Try to extract room code: patterns like C-205, G1, Lab-1, R-101
  const roomMatch = raw.match(/\b([A-Z]{1,3}-\d+|\bLab-\d+\b|\bGround\b)/);
  let room = '';
  let subject = raw.trim();
  if (roomMatch) {
    room = roomMatch[0];
    subject = raw.replace(roomMatch[0], '').trim().replace(/\s+/g, ' ');
  }
  return { subject, room };
}


// Subject colors
const SUBJECT_COLORS = {
  "Information Security (CISCO)":                          "#EF4444",
  "Job Readiness":                                         "#F59E0B",
  "BASKET-II":                                             "#10B981",
  "Lunch":                                                 "#F97316",
  "Industrial IOT & Automation":                           "#3B82F6",
  "Industrial IOT & Automation (G1) / Prompt Engg. (G2)": "#3B82F6",
  "Industrial IOT & Automation (G2) / Prompt Engg. (G1)": "#3B82F6",
  "Domain Project":                                        "#8B5CF6",
  "RDBS Practical":                                        "#06B6D4",
  "Relational & Distributed DBs":                         "#06B6D4",
  "Library":                                               "#6B7280",
  "Prompt Engineering (ChatGPT)":                          "#EC4899",
  "Skill Course":                                          "#84CC16",
  "Mentor":                                                "#14B8A6",
  "Info Security (G2) / System Integration DYMOLA (G1)":  "#EF4444",
  "Info Security (G1) / System Integration DYMOLA (G2)":  "#EF4444",
};
const DEFAULT_COLORS = ["#6C63FF","#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6"];

function subjectColor(name) {
  return SUBJECT_COLORS[name] || DEFAULT_COLORS[name.charCodeAt(0) % DEFAULT_COLORS.length];
}
function nameColor(name) {
  return DEFAULT_COLORS[name.toUpperCase().charCodeAt(0) % DEFAULT_COLORS.length];
}

// ==================== KHATA BOOK DATA ====================
// Structure: [{ id, naam, transactions: [{id, type:'lena'|'dena', amount, note, date}] }]
let khataData = JSON.parse(localStorage.getItem('khataData') || '[]');
let currentType = 'lena';
let currentTxnType = 'lena';
let editingPersonId = null;  // for detail view
let currentPersonId = null;  // for transaction modal

function saveKhataToStorage() {
  localStorage.setItem('khataData', JSON.stringify(khataData));
}

// ==================== NAVIGATION ====================
let currentPage = 'home';

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');

  const titles = { home: 'DP', timetable: 'Class Timetable', khata: 'Khata Book' };
  document.getElementById('page-title').textContent = titles[page];

  const khataHeaderBtn = document.getElementById('khata-header-btn');
  khataHeaderBtn.style.display = page === 'khata' ? 'flex' : 'none';

  // Show upload icon only on timetable page
  document.getElementById('tt-upload-btn').style.display = page === 'timetable' ? 'flex' : 'none';

  currentPage = page;

  if (page === 'timetable') renderTimetable();
  if (page === 'khata') renderKhataList();
  if (page === 'home') renderHomeSummary();
}

// ==================== TIMETABLE ====================
let selectedDay = null;

function getTodayName() {
  const d = new Date().getDay(); // 0=Sun
  const map = [6,0,1,2,3,4,5]; // convert: Sun=>idx6, Mon=>0...
  return DAYS[map[d]];
}

function renderTimetable() {
  const uploadScreen = document.getElementById('tt-upload-screen');
  const ttMain       = document.getElementById('tt-main');

  if (!hasTimetable()) {
    uploadScreen.style.display = 'flex';
    ttMain.classList.add('hidden');
    return;
  }

  uploadScreen.style.display = 'none';
  ttMain.classList.remove('hidden');

  const tabsEl = document.getElementById('day-tabs');
  const today = getTodayName();
  if (!selectedDay) selectedDay = today;

  // Only show days that have data
  const activeDays = DAYS.filter(d => d === 'Sunday' || (TIMETABLE[d] && TIMETABLE[d].length > 0));

  tabsEl.innerHTML = '';
  activeDays.forEach((day, i) => {
    const shortIdx = DAYS.indexOf(day);
    const btn = document.createElement('button');
    btn.className = 'day-tab' + (day === selectedDay ? ' active' : '') + (day === today && day !== selectedDay ? ' today' : '');
    btn.textContent = DAY_SHORT[shortIdx] + (day === today ? ' ★' : '');
    btn.onclick = () => { selectedDay = day; renderTimetable(); };
    tabsEl.appendChild(btn);
  });

  if (!activeDays.includes(selectedDay)) selectedDay = activeDays[0];
  renderDaySchedule(selectedDay);
}

function getCurrentPeriod(periods) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (let p of periods) {
    if (!p.time.includes('-')) continue;
    const [startStr, endStr] = p.time.split('-').map(s => s.trim());
    const startMins = parseTime(startStr);
    const endMins = parseTime(endStr);
    if (nowMins >= startMins && nowMins < endMins) return p;
  }
  return null;
}

function parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + (m || 0);
}

function renderDaySchedule(day) {
  const content = document.getElementById('timetable-content');
  const periods = TIMETABLE[day] || [];

  if (day === 'Sunday' || periods.length === 0) {
    content.innerHTML = `<div class="no-class"><i class="fa-solid fa-umbrella-beach"></i><p>Aaj koi class nahi hai!<br/>Araam karo 😴</p></div>`;
    return;
  }

  const today = getTodayName();
  const currentPeriod = (day === today) ? getCurrentPeriod(periods) : null;

  content.innerHTML = periods.map(p => {
    const isCurrent = currentPeriod && currentPeriod.time === p.time && currentPeriod.subject === p.subject;
    const isLunch = p.subject === 'Lunch';
    const isSpecial = ['Library', 'BASKET-II', 'Mentor'].includes(p.subject);
    const color = subjectColor(p.subject);

    if (isLunch) {
      return `<div style="text-align:center;padding:8px 0;color:var(--text-muted);font-size:13px;font-weight:600;">
        🍽️ ── Lunch Break (${p.time}) ──</div>`;
    }

    if (isSpecial) {
      return `<div class="period-card" style="border-left-color:${color};opacity:0.75;">
        <div class="period-time">${p.time.replace(' - ','<br/>')}</div>
        <div class="period-info">
          <div class="period-subject" style="color:var(--text-muted)">${p.subject}</div>
        </div>
      </div>`;
    }

    return `<div class="period-card ${isCurrent ? 'current' : ''}" style="border-left-color:${isCurrent ? 'var(--green)' : color};">
      <div class="period-time">${p.time.replace(' - ','<br/>')}</div>
      <div class="period-info">
        <div class="period-subject">${p.subject}</div>
        ${p.teacher ? `<div class="period-teacher">${p.teacher}</div>` : ''}
        ${isCurrent ? '<span class="period-now-badge">● Abhi ho rahi hai</span>' : ''}
      </div>
      ${p.room ? `<div class="period-room">${p.room}</div>` : ''}
    </div>`;
  }).join('');
}

// ==================== HOME SUMMARY ====================
function renderHomeSummary() {
  const today = getTodayName();
  const todayPeriods = hasTimetable()
    ? (TIMETABLE[today] || []).filter(p => !['Lunch','Library','BASKET-II','Mentor'].includes(p.subject))
    : [];
  const subjects = [...new Set(todayPeriods.map(p => p.subject))];

  let totalLena = 0, totalDena = 0;
  khataData.forEach(person => {
    let net = getNetAmount(person);
    if (net > 0) totalLena += net;
    else if (net < 0) totalDena += Math.abs(net);
  });

  const summaryEl = document.getElementById('home-summary');
  summaryEl.innerHTML = `
    <div class="summary-row">
      <div class="summary-card green">
        <div class="sc-label">Lena Baki</div>
        <div class="sc-value">₹${totalLena.toLocaleString('en-IN')}</div>
      </div>
      <div class="summary-card red">
        <div class="sc-label">Dena Baki</div>
        <div class="sc-value">₹${totalDena.toLocaleString('en-IN')}</div>
      </div>
    </div>
    <div class="summary-row">
      <div class="summary-card today-class">
        <div class="today-label">Aaj ki classes (${today})</div>
        <div class="today-subjects">
          ${!hasTimetable()
            ? '<span style="color:var(--primary);font-size:13px;font-weight:600;">📂 Timetable upload karo — Timetable tab mein jao</span>'
            : subjects.length > 0
              ? subjects.map(s => `<span class="subject-chip" style="background:${subjectColor(s)}20;color:${subjectColor(s)}">${s}</span>`).join('')
              : '<span style="color:var(--text-muted);font-size:13px;">Koi class nahi 🎉</span>'
          }
        </div>
      </div>
    </div>
  `;
}

// ==================== KHATA BOOK ====================
function getNetAmount(person) {
  let net = 0;
  person.transactions.forEach(t => {
    if (t.type === 'lena') net += t.amount;
    else net -= t.amount;
  });
  return net;
}

function renderKhataList() {
  const searchVal = document.getElementById('search-input').value.toLowerCase();
  const listEl = document.getElementById('khata-list');
  const emptyEl = document.getElementById('khata-empty');

  let filtered = khataData.filter(p => p.naam.toLowerCase().includes(searchVal));

  // Summary bar
  let totalLena = 0, totalDena = 0;
  khataData.forEach(p => {
    const net = getNetAmount(p);
    if (net > 0) totalLena += net;
    else if (net < 0) totalDena += Math.abs(net);
  });
  document.getElementById('khata-summary-bar').innerHTML = `
    <div class="ksb-card lena">
      <div class="ksb-label">Mujhe Milega</div>
      <div class="ksb-value">₹${totalLena.toLocaleString('en-IN')}</div>
    </div>
    <div class="ksb-card dena">
      <div class="ksb-label">Mujhe Dena Hai</div>
      <div class="ksb-value">₹${totalDena.toLocaleString('en-IN')}</div>
    </div>
  `;

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  // Sort: highest net first
  filtered.sort((a, b) => Math.abs(getNetAmount(b)) - Math.abs(getNetAmount(a)));

  listEl.innerHTML = filtered.map(person => {
    const net = getNetAmount(person);
    const initials = person.naam.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const color = nameColor(person.naam);
    const lastTxn = person.transactions[person.transactions.length - 1];
    const note = lastTxn ? (lastTxn.note || formatDate(lastTxn.date)) : 'Koi entry nahi';

    let amountClass = net > 0 ? 'lena' : net < 0 ? 'dena' : 'settled';
    let typeLabel = net > 0 ? 'Lena Hai' : net < 0 ? 'Dena Hai' : 'Settled';
    let labelClass = net > 0 ? 'lena-label' : net < 0 ? 'dena-label' : 'settled-label';

    return `<div class="khata-item" onclick="openDetail('${person.id}')">
      <div class="khata-avatar" style="background:${color}">${initials}</div>
      <div class="khata-info">
        <div class="khata-naam">${person.naam}</div>
        <div class="khata-note">${note}</div>
        <div class="khata-txn-count">${person.phone ? `<i class="fa-brands fa-whatsapp" style="color:#25D366"></i> +91 ${person.phone} &nbsp;·&nbsp; ` : ''}${person.transactions.length} transaction${person.transactions.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="khata-amount">
        <div class="amount ${amountClass}">₹${Math.abs(net).toLocaleString('en-IN')}</div>
        <div class="type-label ${labelClass}">${typeLabel}</div>
      </div>
    </div>`;
  }).join('');
}

// ---- Add New Person ----
function openAddKhata() {
  editingPersonId = null;
  document.getElementById('modal-title').textContent = 'Naya Khata';
  document.getElementById('input-naam').value = '';
  document.getElementById('input-phone').value = '';
  document.getElementById('input-amount').value = '';
  document.getElementById('input-note').value = '';
  document.getElementById('input-date').value = getTodayDateStr();
  setType('lena');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function setType(type) {
  currentType = type;
  document.getElementById('btn-lena').classList.toggle('active', type === 'lena');
  document.getElementById('btn-dena').classList.toggle('active', type === 'dena');
}

function saveKhata() {
  const naam = document.getElementById('input-naam').value.trim();
  const phone = document.getElementById('input-phone').value.trim().replace(/\D/g,'');
  const amount = parseFloat(document.getElementById('input-amount').value);
  const note = document.getElementById('input-note').value.trim();
  const date = document.getElementById('input-date').value;

  if (!naam) { showToast('Naam likhna zaroori hai!'); return; }
  if (!amount || amount <= 0) { showToast('Amount sahi likho!'); return; }
  if (phone && phone.length !== 10) { showToast('Phone number 10 digit ka hona chahiye!'); return; }

  const txn = { id: Date.now().toString(), type: currentType, amount, note, date };

  // Check if person already exists
  let existing = khataData.find(p => p.naam.toLowerCase() === naam.toLowerCase());
  if (existing) {
    existing.transactions.push(txn);
    if (phone) existing.phone = phone; // update phone if provided
    showToast(`${naam} ki entry update ho gayi!`);
  } else {
    khataData.push({ id: Date.now().toString(), naam, phone, transactions: [txn] });
    showToast(`${naam} ka khata khul gaya!`);
  }

  saveKhataToStorage();
  renderKhataList();
  closeAllModals();
}

// ---- Detail View ----
function openDetail(personId) {
  currentPersonId = personId;
  const person = khataData.find(p => p.id === personId);
  if (!person) return;

  const net = getNetAmount(person);
  const color = nameColor(person.naam);
  const initials = person.naam.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);

  let netClass = net > 0 ? 'lena' : net < 0 ? 'dena' : 'settled';
  let netText = net > 0 ? `₹${net.toLocaleString('en-IN')} lena hai` :
                net < 0 ? `₹${Math.abs(net).toLocaleString('en-IN')} dena hai` : 'Settled ✓';

  document.getElementById('detail-header').innerHTML = `
    <div class="detail-avatar" style="background:${color}">${initials}</div>
    <div>
      <div class="detail-name">${person.naam}</div>
      <div class="detail-net ${netClass}">${netText}</div>
      ${person.phone ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;"><i class="fa-brands fa-whatsapp" style="color:#25D366"></i> +91 ${person.phone}</div>` : ''}
    </div>
  `;

  // Show/hide WhatsApp button
  const waBtn = document.getElementById('btn-whatsapp');
  waBtn.style.display = person.phone ? 'block' : 'none';

  const txns = [...person.transactions].reverse();
  if (txns.length === 0) {
    document.getElementById('detail-transactions').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">Koi transaction nahi</p>';
  } else {
    document.getElementById('detail-transactions').innerHTML = txns.map((t, i) => `
      <div class="txn-row">
        <div class="txn-left">
          <div class="txn-note">${t.note || '—'}</div>
          <div class="txn-date">${formatDate(t.date)}</div>
          <span class="txn-type-badge ${t.type}">${t.type === 'lena' ? 'Lena Hai' : 'Dena Hai'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="txn-amount ${t.type}">${t.type === 'lena' ? '+' : '-'}₹${t.amount.toLocaleString('en-IN')}</div>
          <button onclick="deleteTxn('${person.id}','${t.id}',event)" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px;font-size:14px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('detail-overlay').classList.remove('hidden');
}

function deleteTxn(personId, txnId, event) {
  event.stopPropagation();
  const person = khataData.find(p => p.id === personId);
  if (!person) return;
  person.transactions = person.transactions.filter(t => t.id !== txnId);
  saveKhataToStorage();
  renderKhataList();
  openDetail(personId); // refresh
}

function deletePerson() {
  if (!currentPersonId) return;
  const person = khataData.find(p => p.id === currentPersonId);
  if (!person) return;
  if (!confirm(`"${person.naam}" ka poora khata delete karna hai?`)) return;
  khataData = khataData.filter(p => p.id !== currentPersonId);
  saveKhataToStorage();
  renderKhataList();
  closeDetail();
  showToast('Khata delete ho gaya!');
}

// ---- WhatsApp Reminder ----
function sendWhatsAppReminder() {
  const person = khataData.find(p => p.id === currentPersonId);
  if (!person || !person.phone) return;

  const net = getNetAmount(person);
  let msg = '';
  if (net > 0) {
    msg = `Bhai ${person.naam}, tumse ₹${net.toLocaleString('en-IN')} lene hain mere. Jab free ho toh bata dena. 🙏`;
  } else if (net < 0) {
    msg = `Bhai ${person.naam}, mujhe tumhe ₹${Math.abs(net).toLocaleString('en-IN')} dene hain. Remind kar raha hoon. 🙏`;
  } else {
    msg = `Bhai ${person.naam}, hamara hisaab settle ho gaya hai. Thanks! ✅`;
  }

  const url = `https://wa.me/91${person.phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ---- Add Transaction ----
function openAddTransaction() {
  document.getElementById('txn-person-name').textContent = 
    khataData.find(p => p.id === currentPersonId)?.naam || '';
  document.getElementById('txn-amount').value = '';
  document.getElementById('txn-note').value = '';
  document.getElementById('txn-date').value = getTodayDateStr();
  setTxnType('lena');
  document.getElementById('txn-overlay').classList.remove('hidden');
}

function setTxnType(type) {
  currentTxnType = type;
  document.getElementById('txn-btn-lena').classList.toggle('active', type === 'lena');
  document.getElementById('txn-btn-dena').classList.toggle('active', type === 'dena');
}

function saveTransaction() {
  const amount = parseFloat(document.getElementById('txn-amount').value);
  const note = document.getElementById('txn-note').value.trim();
  const date = document.getElementById('txn-date').value;

  if (!amount || amount <= 0) { showToast('Amount sahi likho!'); return; }

  const person = khataData.find(p => p.id === currentPersonId);
  if (!person) return;

  person.transactions.push({ id: Date.now().toString(), type: currentTxnType, amount, note, date });
  saveKhataToStorage();
  renderKhataList();
  closeTxnModal();
  openDetail(currentPersonId);
  showToast('Entry add ho gayi!');
}

// ==================== MODAL HELPERS ====================
function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) closeAllModals();
}
function closeAllModals() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
function closeDetail(e) {
  if (!e || e.target === document.getElementById('detail-overlay')) {
    document.getElementById('detail-overlay').classList.add('hidden');
    currentPersonId = null;
  }
}
function closeTxnModal(e) {
  if (!e || e.target === document.getElementById('txn-overlay')) {
    document.getElementById('txn-overlay').classList.add('hidden');
  }
}

// ==================== UTILITY ====================
function getTodayDateStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

// ==================== AUTH / LOGIN ====================
const STORAGE_PIN   = 'dp_pin';
const STORAGE_SESS  = 'dp_session';

let pinBuffer = '';
let pinStep = 'setup';   // 'setup' | 'confirm' | 'login'
let pinFirst = '';       // stores first entry during setup confirm

function initAuth() {
  const hasPin = localStorage.getItem(STORAGE_PIN);
  const hasSession = localStorage.getItem(STORAGE_SESS) === 'true';

  if (hasPin && hasSession) {
    // Already logged in — go straight to app
    hidLoginShowApp();
    return;
  }

  // Show login screen
  document.getElementById('login-screen').style.display = 'flex';

  if (!hasPin) {
    pinStep = 'setup';
    setLoginUI('Apna PIN Set Karo', 'Pehli baar hai — naya 4-digit PIN banao');
  } else {
    pinStep = 'login';
    setLoginUI('Welcome Back! 👋', 'PIN daalo aur app open karo');
  }
}

function hidLoginShowApp() {
  document.getElementById('login-screen').style.display = 'none';
  // Now do normal splash → app flow
  setTimeout(() => {
    document.getElementById('splash').style.opacity = '0';
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('main-app').classList.remove('hidden');
      showPage('home');
    }, 500);
  }, 800);
}

function setLoginUI(title, sub) {
  document.getElementById('login-title').textContent = title;
  document.getElementById('login-sub').textContent   = sub;
  pinBuffer = '';
  updateDots();
}

function pressKey(num) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += num;
  updateDots();
  if (pinBuffer.length === 4) {
    setTimeout(() => handlePinComplete(), 150);
  }
}

function pressDelete() {
  if (pinBuffer.length > 0) {
    pinBuffer = pinBuffer.slice(0, -1);
    updateDots();
  }
  clearPinError();
}

function updateDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('dot-' + i);
    dot.classList.toggle('filled', i < pinBuffer.length);
    dot.classList.remove('error');
  }
}

function handlePinComplete() {
  if (pinStep === 'setup') {
    pinFirst = pinBuffer;
    pinStep = 'confirm';
    setLoginUI('PIN Dobara Daalo', 'Confirm karne ke liye same PIN daalo');
  }
  else if (pinStep === 'confirm') {
    if (pinBuffer === pinFirst) {
      localStorage.setItem(STORAGE_PIN, pinFirst);
      localStorage.setItem(STORAGE_SESS, 'true');
      showPinSuccess('PIN set ho gaya! ✓');
      setTimeout(() => hidLoginShowApp(), 700);
    } else {
      showPinError('PIN match nahi hua — dobara try karo');
      pinStep = 'setup';
      pinFirst = '';
      setTimeout(() => setLoginUI('Apna PIN Set Karo', 'Pehli baar hai — naya 4-digit PIN banao'), 900);
    }
  }
  else if (pinStep === 'login') {
    const saved = localStorage.getItem(STORAGE_PIN);
    if (pinBuffer === saved) {
      localStorage.setItem(STORAGE_SESS, 'true');
      showPinSuccess('✓');
      setTimeout(() => hidLoginShowApp(), 400);
    } else {
      showPinError('Galat PIN — phir try karo');
      shakeDots();
      pinBuffer = '';
      updateDots();
    }
  }
}

function showPinError(msg) {
  const el = document.getElementById('pin-error');
  el.textContent = msg;
  for (let i = 0; i < 4; i++) document.getElementById('dot-' + i).classList.add('error');
}

function clearPinError() {
  document.getElementById('pin-error').textContent = '';
}

function showPinSuccess(msg) {
  const el = document.getElementById('pin-error');
  el.style.color = '#22C55E';
  el.textContent = msg;
}

function shakeDots() {
  const dotsEl = document.getElementById('pin-dots');
  dotsEl.classList.remove('shake');
  void dotsEl.offsetWidth; // reflow
  dotsEl.classList.add('shake');
}

function doLogout() {
  if (!confirm('Logout karna hai?')) return;
  localStorage.removeItem(STORAGE_SESS);
  // Reset and reload
  location.reload();
}

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', () => {
  selectedDay = getTodayName();
  initAuth();
});

// ==================== PWA SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
