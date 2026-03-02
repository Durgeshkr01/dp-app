// ============================================================
// MERA APP - Complete Logic
// ============================================================

// ==================== TIMETABLE DATA (Dynamic) ====================
const DAYS      = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TT_STORAGE_KEY = 'campuskit_timetable';

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
      if (!parsed) { showToast('Invalid format! Please check your file.'); return; }
      TIMETABLE = parsed;
      localStorage.setItem(TT_STORAGE_KEY, JSON.stringify(TIMETABLE));
      showToast('Timetable uploaded successfully! ✓');
      renderTimetable();
      renderHomeSummary();
    } catch (err) {
      showToast('Error reading the file!');
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
let khataData = JSON.parse(localStorage.getItem('campuskit_khata') || '[]');
let currentType = 'lena';
let currentTxnType = 'lena';
let editingPersonId = null;  // for detail view
let currentPersonId = null;  // for transaction modal

function saveKhataToStorage() {
  localStorage.setItem('campuskit_khata', JSON.stringify(khataData));
}

// ==================== NAVIGATION ====================
let currentPage = 'home';

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');

  const titles = { home: 'CampusKit', timetable: 'Class Timetable', khata: 'Khata Book', mess: 'Mess Menu', budget: 'Pocket Money' };
  document.getElementById('page-title').textContent = titles[page] || 'CampusKit';

  const khataHeaderBtn = document.getElementById('khata-header-btn');
  khataHeaderBtn.style.display = page === 'khata' ? 'flex' : 'none';

  // Show upload icon only on timetable page
  document.getElementById('tt-upload-btn').style.display = page === 'timetable' ? 'flex' : 'none';

  currentPage = page;

  if (page === 'timetable') renderTimetable();
  if (page === 'khata') renderKhataList();
  if (page === 'home') renderHomeSummary();
  if (page === 'mess') renderMessMenu();
  if (page === 'budget') renderBudgetPage();
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
    content.innerHTML = `<div class="no-class"><i class="fa-solid fa-umbrella-beach"></i><p>No class today!<br/>Enjoy your day 😴</p></div>`;
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
        ${isCurrent ? '<span class="period-now-badge">● Ongoing</span>' : ''}
      </div>
      ${p.room ? `<div class="period-room">${p.room}</div>` : ''}
    </div>`;
  }).join('');
}

// ==================== HOME SUMMARY ====================
function getNextClass(day) {
  if (!hasTimetable()) return null;
  const periods = (TIMETABLE[day] || []).filter(p => !['Lunch','Library','BASKET-II','Mentor'].includes(p.subject));
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  for (let p of periods) {
    if (!p.time.includes('-')) continue;
    const [s, e] = p.time.split('-').map(x => parseTime(x.trim()));
    if (nowMins < e) return { ...p, ongoing: nowMins >= s };
  }
  return null;
}

function getTodayMess() {
  const mess  = getMessChoice();
  const day   = getTodayName();
  const meal  = getCurrentMealTime();
  if (!meal) return null;
  const items = MESS_MENU[mess][day][meal];
  return { meal, items, icon: MEAL_ICONS[meal], label: MEAL_LABELS[meal], mess };
}

function renderHomeSummary() {
  const greetEl = document.getElementById('welcome-greeting');
  const streakEl = document.getElementById('streak-badge');
  const name = getUserName();
  if (greetEl) greetEl.textContent = name ? `Hello, ${name}! 👋` : 'Hello! 👋';
  const streak = getStreak();
  if (streakEl) {
    streakEl.innerHTML = streak > 0
      ? `<span class="streak-badge">🔥 ${streak} day${streak>1?'s':''}</span>` : '';
  }

  const today    = getTodayName();
  const nextCls  = getNextClass(today);
  const todayMess= getTodayMess();
  const spent    = getTotalSpent();
  const left     = budgetData.monthly - spent;
  let totalLena = 0, totalDena = 0;
  khataData.forEach(p => {
    const net = getNetAmount(p);
    if (net > 0) totalLena += net; else if (net < 0) totalDena += Math.abs(net);
  });

  const summaryEl = document.getElementById('home-summary');
  summaryEl.innerHTML = `

    <!-- Aaj Ka Din glance -->
    <div class="aajkadin-header">⚡ Aaj Ka Din</div>
    <div class="aajkadin-grid">

      <!-- Next Class -->
      <div class="akd-card class-card" onclick="showPage('timetable')">
        <div class="akd-icon">📚</div>
        <div class="akd-info">
          <div class="akd-label">Next Class</div>
          ${nextCls
            ? `<div class="akd-value">${nextCls.subject}</div>
               <div class="akd-sub">${nextCls.ongoing ? '🟢 Ongoing' : nextCls.time.split('-')[0].trim()}</div>`
            : `<div class="akd-value" style="color:var(--text-muted);font-size:13px;">No more classes 🎉</div>`
          }
        </div>
      </div>

      <!-- Mess Today -->
      <div class="akd-card mess-card-home" onclick="showPage('mess')">
        <div class="akd-icon">${todayMess ? todayMess.icon : '🍽️'}</div>
        <div class="akd-info">
          <div class="akd-label">${todayMess ? todayMess.label : 'Mess Menu'}</div>
          ${todayMess
            ? `<div class="akd-value" style="font-size:12px;line-height:1.4;">${todayMess.items.split(',').slice(0,2).join(', ')}&hellip;</div>
               <div class="akd-sub">${todayMess.mess === 'north' ? '🏠 North' : '🏠 South'}</div>`
            : `<div class="akd-value" style="color:var(--text-muted);font-size:13px;">Tap to check menu</div>`
          }
        </div>
      </div>

      <!-- Budget -->
      <div class="akd-card budget-card-home" onclick="showPage('budget')">
        <div class="akd-icon">💰</div>
        <div class="akd-info">
          <div class="akd-label">Pocket Money</div>
          ${budgetData.monthly > 0
            ? `<div class="akd-value ${left<0?'danger-text':''}">₹${Math.abs(left).toLocaleString('en-IN')} ${left<0?'over':'left'}</div>
               <div class="akd-sub">Spent ₹${spent.toLocaleString('en-IN')}</div>`
            : `<div class="akd-value" style="color:var(--primary);font-size:12px;">+ Set monthly budget</div>`
          }
        </div>
      </div>

      <!-- Khata -->
      <div class="akd-card khata-card-home" onclick="showPage('khata')">
        <div class="akd-icon">📒</div>
        <div class="akd-info">
          <div class="akd-label">Khata</div>
          <div class="akd-value" style="color:#22C55E;font-size:13px;">↓ ₹${totalLena.toLocaleString('en-IN')}</div>
          <div class="akd-sub" style="color:#EF4444;">↑ ₹${totalDena.toLocaleString('en-IN')}</div>
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
      <div class="ksb-label">I Will Receive</div>
      <div class="ksb-value">₹${totalLena.toLocaleString('en-IN')}</div>
    </div>
    <div class="ksb-card dena">
      <div class="ksb-label">I Need to Pay</div>
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
    const note = lastTxn ? (lastTxn.note || formatDate(lastTxn.date)) : 'No entry';

    let amountClass = net > 0 ? 'lena' : net < 0 ? 'dena' : 'settled';
    let typeLabel = net > 0 ? 'To Receive' : net < 0 ? 'To Pay' : 'Settled';
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
  document.getElementById('modal-title').textContent = 'New Account';
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

  if (!naam) { showToast('Name is required!'); return; }
  if (!amount || amount <= 0) { showToast('Please enter a valid amount!'); return; }
  if (phone && phone.length !== 10) { showToast('Phone number must be 10 digits!'); return; }

  const txn = { id: Date.now().toString(), type: currentType, amount, note, date };

  // Check if person already exists
  let existing = khataData.find(p => p.naam.toLowerCase() === naam.toLowerCase());
  if (existing) {
    existing.transactions.push(txn);
    if (phone) existing.phone = phone; // update phone if provided
    showToast(`${naam}'s entry updated!`);
  } else {
    khataData.push({ id: Date.now().toString(), naam, phone, transactions: [txn] });
    showToast(`${naam}'s account created!`);
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
  let netText = net > 0 ? `₹${net.toLocaleString('en-IN')} to receive` :
                net < 0 ? `₹${Math.abs(net).toLocaleString('en-IN')} to pay` : 'Settled ✓';

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
    document.getElementById('detail-transactions').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">No transactions yet</p>';
  } else {
    document.getElementById('detail-transactions').innerHTML = txns.map((t, i) => `
      <div class="txn-row">
        <div class="txn-left">
          <div class="txn-note">${t.note || '—'}</div>
          <div class="txn-date">${formatDate(t.date)}</div>
          <span class="txn-type-badge ${t.type}">${t.type === 'lena' ? 'To Receive' : 'To Pay'}</span>
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
  if (!confirm(`Delete entire account of "${person.naam}"?`)) return;
  khataData = khataData.filter(p => p.id !== currentPersonId);
  saveKhataToStorage();
  renderKhataList();
  closeDetail();
  showToast('Account deleted!');
}

// ---- WhatsApp Reminder ----
function sendWhatsAppReminder() {
  const person = khataData.find(p => p.id === currentPersonId);
  if (!person || !person.phone) return;

  const net = getNetAmount(person);
  let msg = '';
  if (net > 0) {
    msg = `Hi ${person.naam}, you owe me ₹${net.toLocaleString('en-IN')}. Let me know when you're free. 🙏`;
  } else if (net < 0) {
    msg = `Hi ${person.naam}, I owe you ₹${Math.abs(net).toLocaleString('en-IN')}. Just reminding myself. 🙏`;
  } else {
    msg = `Hi ${person.naam}, our dues are all settled. Thanks! ✅`;
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

  if (!amount || amount <= 0) { showToast('Please enter a valid amount!'); return; }

  const person = khataData.find(p => p.id === currentPersonId);
  if (!person) return;

  person.transactions.push({ id: Date.now().toString(), type: currentTxnType, amount, note, date });
  saveKhataToStorage();
  renderKhataList();
  closeTxnModal();
  openDetail(currentPersonId);
  showToast('Entry added!');
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
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
const STORAGE_PIN   = 'campuskit_pin';
const STORAGE_SESS  = 'campuskit_session';
const STORAGE_NAME  = 'campuskit_username';

let pinBuffer = '';
let pinStep = 'setup';   // 'name' | 'setup' | 'confirm' | 'login'
let pinFirst = '';       // stores first entry during setup confirm

function showPinStep() {
  document.getElementById('name-step').style.display = 'none';
  const ps = document.getElementById('pin-step');
  ps.style.display = 'flex';
  ps.style.flexDirection = 'column';
  ps.style.alignItems = 'center';
}

function showNameStep() {
  document.getElementById('name-step').style.display = 'flex';
  document.getElementById('pin-step').style.display = 'none';
}

function submitName() {
  const val = document.getElementById('input-user-name').value.trim();
  if (!val) { document.getElementById('input-user-name').focus(); return; }
  localStorage.setItem(STORAGE_NAME, val);
  showPinStep();
  pinStep = 'setup';
  setLoginUI('Set Your PIN', 'Create a 4-digit PIN to secure your app');
}

function getUserName() {
  return localStorage.getItem(STORAGE_NAME) || '';
}

function initAuth() {
  const hasPin  = localStorage.getItem(STORAGE_PIN);
  const hasName = localStorage.getItem(STORAGE_NAME);
  const hasSession = localStorage.getItem(STORAGE_SESS) === 'true';

  if (hasPin && hasSession) {
    hidLoginShowApp();
    return;
  }

  // Show login screen
  document.getElementById('login-screen').style.display = 'flex';

  if (!hasName) {
    // Very first time — ask for name
    pinStep = 'name';
    showNameStep();
    setLoginUITitleOnly('Welcome! 👋', 'Tell us your name to get started');
    // Allow Enter key on name input
    document.getElementById('input-user-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') submitName();
    });
  } else if (!hasPin) {
    pinStep = 'setup';
    showPinStep();
    setLoginUI('Set Your PIN', 'Create a 4-digit PIN to secure your app');
  } else {
    pinStep = 'login';
    showPinStep();
    const name = getUserName();
    setLoginUI(`Welcome back, ${name}! 👋`, 'Enter your PIN to open the app');
  }
}

function setLoginUITitleOnly(title, sub) {
  document.getElementById('login-title').textContent = title;
  document.getElementById('login-sub').textContent   = sub;
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
      initGudiya(); // Start Gudiya mascot
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
    setLoginUI('Confirm Your PIN', 'Enter the same PIN again to confirm');
  }
  else if (pinStep === 'confirm') {
    if (pinBuffer === pinFirst) {
      localStorage.setItem(STORAGE_PIN, pinFirst);
      localStorage.setItem(STORAGE_SESS, 'true');
      showPinSuccess('PIN set successfully! ✓');
      setTimeout(() => hidLoginShowApp(), 700);
    } else {
      showPinError('PIN did not match — please try again');
      pinStep = 'setup';
      pinFirst = '';
      setTimeout(() => setLoginUI('Set Your PIN', 'Create a 4-digit PIN to secure your app'), 900);
    }
  }
  else if (pinStep === 'login') {
    const saved = localStorage.getItem(STORAGE_PIN);
    if (pinBuffer === saved) {
      localStorage.setItem(STORAGE_SESS, 'true');
      showPinSuccess('✓');
      setTimeout(() => hidLoginShowApp(), 400);
    } else {
      showPinError('Wrong PIN — please try again');
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
  if (!confirm('Are you sure you want to logout?')) return;
  localStorage.removeItem(STORAGE_SESS);
  // Reset and reload
  location.reload();
}

// ==================== DAILY STREAK ====================
const STREAK_KEY      = 'campuskit_streak';
const STREAK_DATE_KEY = 'campuskit_streak_date';

function updateStreak() {
  const today = new Date().toISOString().split('T')[0];
  const lastDate = localStorage.getItem(STREAK_DATE_KEY);
  let streak = parseInt(localStorage.getItem(STREAK_KEY) || '0');
  if (!lastDate) {
    streak = 1;
  } else if (lastDate === today) {
    return streak; // already counted today
  } else {
    const prev = new Date(); prev.setDate(prev.getDate() - 1);
    const yStr = prev.toISOString().split('T')[0];
    streak = (lastDate === yStr) ? streak + 1 : 1;
  }
  localStorage.setItem(STREAK_KEY, streak);
  localStorage.setItem(STREAK_DATE_KEY, today);
  return streak;
}
function getStreak() { return parseInt(localStorage.getItem(STREAK_KEY) || '0'); }

// ==================== POCKET MONEY / BUDGET ====================
const BUDGET_KEY = 'campuskit_budget';
let budgetData = JSON.parse(localStorage.getItem(BUDGET_KEY) || 'null') || { monthly: 0, expenses: [] };

function saveBudget() { localStorage.setItem(BUDGET_KEY, JSON.stringify(budgetData)); }

function getCurrentMonthExpenses() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  return budgetData.expenses.filter(e => e.date && e.date.startsWith(ym));
}
function getTotalSpent() {
  return getCurrentMonthExpenses().reduce((s, e) => s + e.amount, 0);
}

const BUDGET_CATS = ['🍔 Food', '🚌 Travel', '🛍️ Shopping', '📚 Study', '💊 Health', '🎮 Fun', '📦 Other'];
let budgetCatFilter = 'all';

function renderBudgetPage() {
  const monthly = budgetData.monthly;
  const spent   = getTotalSpent();
  const left    = monthly - spent;
  const pct     = monthly > 0 ? Math.min(100, Math.round((spent / monthly) * 100)) : 0;
  const danger  = pct >= 90;
  const warn    = pct >= 70;
  const barColor = danger ? '#EF4444' : warn ? '#F59E0B' : '#22C55E';

  document.getElementById('budget-page-content').innerHTML = `
    <!-- Setup / Summary -->
    <div class="budget-summary-card">
      <div class="budget-top-row">
        <div>
          <div class="budget-month-label">${new Date().toLocaleString('en-IN',{month:'long',year:'numeric'})}</div>
          <div class="budget-set-row">
            <span class="budget-set-label">Monthly Budget:</span>
            <button class="budget-edit-btn" onclick="openSetBudget()">
              ${monthly > 0 ? `₹${monthly.toLocaleString('en-IN')} ✎` : '+ Set Budget'}
            </button>
          </div>
        </div>
        <div class="budget-left-badge ${danger ? 'danger' : warn ? 'warn' : 'safe'}">
          <div class="blb-amount">₹${Math.abs(left).toLocaleString('en-IN')}</div>
          <div class="blb-label">${left < 0 ? 'Over!' : 'Left'}</div>
        </div>
      </div>
      ${monthly > 0 ? `
      <div class="budget-bar-wrap">
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width:${pct}%;background:${barColor};"></div>
        </div>
        <div class="budget-bar-labels">
          <span>Spent ₹${spent.toLocaleString('en-IN')}</span>
          <span>${pct}%</span>
        </div>
      </div>` : ''}
    </div>

    <!-- Add Expense -->
    <button class="btn-add-expense" onclick="openAddExpense()">
      <i class="fa-solid fa-plus"></i> Add Expense
    </button>

    <!-- Category Filter -->
    <div class="budget-cat-filter">
      <button class="cat-chip ${budgetCatFilter==='all'?'active':''}" onclick="setBudgetFilter('all')">All</button>
      ${BUDGET_CATS.map(c => `<button class="cat-chip ${budgetCatFilter===c?'active':''}" onclick="setBudgetFilter('${c}')">${c}</button>`).join('')}
    </div>

    <!-- Expense List -->
    ${renderExpenseList()}
  `;
}

function setBudgetFilter(cat) {
  budgetCatFilter = cat;
  renderBudgetPage();
}

function renderExpenseList() {
  let expenses = getCurrentMonthExpenses().slice().reverse();
  if (budgetCatFilter !== 'all') expenses = expenses.filter(e => e.cat === budgetCatFilter);
  if (expenses.length === 0) return `<div class="budget-empty"><i class="fa-solid fa-wallet"></i><p>Koi expense nahi abhi</p></div>`;
  return expenses.map(e => `
    <div class="expense-item">
      <div class="expense-cat-icon">${e.cat ? e.cat.split(' ')[0] : '📦'}</div>
      <div class="expense-info">
        <div class="expense-note">${e.note || e.cat || 'Expense'}</div>
        <div class="expense-date">${e.cat || ''}  ·  ${formatDate(e.date)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="expense-amount">₹${e.amount.toLocaleString('en-IN')}</div>
        <button onclick="deleteExpense('${e.id}',event)" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;padding:4px;"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>`).join('');
}

function deleteExpense(id, event) {
  event.stopPropagation();
  budgetData.expenses = budgetData.expenses.filter(e => e.id !== id);
  saveBudget();
  renderBudgetPage();
  renderHomeSummary();
}

// ---- Set Budget Modal ----
function openSetBudget() {
  document.getElementById('input-budget-amount').value = budgetData.monthly || '';
  document.getElementById('budget-set-overlay').classList.remove('hidden');
}
function saveMonthlyBudget() {
  const val = parseFloat(document.getElementById('input-budget-amount').value);
  if (!val || val <= 0) { showToast('Valid amount daalo!'); return; }
  budgetData.monthly = val;
  saveBudget();
  document.getElementById('budget-set-overlay').classList.add('hidden');
  renderBudgetPage();
  renderHomeSummary();
  showToast('Budget set ho gaya! ✓');
}

// ---- Add Expense Modal ----
let selectedExpCat = BUDGET_CATS[0];
function openAddExpense() {
  document.getElementById('input-exp-amount').value = '';
  document.getElementById('input-exp-note').value = '';
  document.getElementById('input-exp-date').value = getTodayDateStr();
  selectedExpCat = BUDGET_CATS[0];
  renderExpCatSelector();
  document.getElementById('expense-add-overlay').classList.remove('hidden');
}
function renderExpCatSelector() {
  document.getElementById('exp-cat-selector').innerHTML = BUDGET_CATS.map(c =>
    `<button class="exp-cat-btn ${selectedExpCat===c?'active':''}" onclick="selectExpCat('${c}')">${c}</button>`
  ).join('');
}
function selectExpCat(cat) {
  selectedExpCat = cat;
  renderExpCatSelector();
}
function saveExpense() {
  const amount = parseFloat(document.getElementById('input-exp-amount').value);
  const note   = document.getElementById('input-exp-note').value.trim();
  const date   = document.getElementById('input-exp-date').value;
  if (!amount || amount <= 0) { showToast('Amount daalo!'); return; }
  budgetData.expenses.push({ id: Date.now().toString(), amount, cat: selectedExpCat, note, date });
  saveBudget();
  renderBudgetPage();
  renderHomeSummary();
  document.getElementById('expense-add-overlay').classList.add('hidden');
  showToast('Expense add ho gaya! ✓');
}

// ==================== MESS MENU DATA ====================
const MESS_STORAGE_KEY = 'campuskit_mess_choice';

const MESS_MENU = {
  north: {
    Monday:    { breakfast: "Methi Puri (3), Uppma (2 spn), Alu Matar Curry",                          lunch: "Rice, Dal, Mix Veg Fry, Besan Curry, Dahi",                                   snacks: "Boiled Black Chhan Mix (1 Cup)",       dinner: "Rice, Dal, Roti, Lau Chanadal Curry, Kheer" },
    Tuesday:   { breakfast: "Idili (2), Bara (3), Alu Matar Curry, Chatney",                            lunch: "Rice, Dal, Alu Chana Curry (Bengal Gram), Veg Fry",                           snacks: "Sprout Salad (1 cup)",                 dinner: "Rice, Dal Fry, Alu Kabuli Chana Masala, Triangle Papad" },
    Wednesday: { breakfast: "Puri (3), Idili (2), Kabuli Alu Chana Curry, Chatney",                    lunch: "Rice, Dal, Pokodi Curry, Veg Chips",                                          snacks: "Dahi Bada (2 piece)",                  dinner: "Rice, Dal, Roti, Chicken Curry (NV) / Paneer Curry (V), Round Papad" },
    Thursday:  { breakfast: "Idili (2), Upma, Alu Matar Curry, Chatney",                               lunch: "Rice, Dal, Mix Veg Curry, Dahi, Brinjal",                                     snacks: "Alu Chop (2 piece)",                   dinner: "Rice, Dal, Roti, Mix Veg Chilli, Gulab Jam / Laddu" },
    Friday:    { breakfast: "Puri (3), Masala Upama, Aludum",                                          lunch: "Rice, Dal, Alu Drumstick Mix Besara, Veg Chips",                              snacks: "Sweet Corn (1 cup)",                   dinner: "Rice, Dal, Roti, Egg Masala 2pc (NV) / Paneer Masala (V)" },
    Saturday:  { breakfast: "Poha (3), Idili (2), Alu Chana Curry, Chatney",                          lunch: "Rice, Dal, Soyabean Curry, Papad",                                            snacks: "Peanut & Moong Boiled (1 Cup)",        dinner: "Rice, Dal, Roti, Dal Tadaka, Suji Halwa (1st & 3rd) / Malpua (2nd & 4th)" },
    Sunday:    { breakfast: "Chakuli (1), Masala Uppma, Matar Curry",                                  lunch: "Veg Pulao, Dahi Raita, Green Matar Alu Curry, Triangle Papad",                snacks: "Sambar Bada (2 piece)",               dinner: "Fried Rice, Kachumbar, Chicken Butter Masala (NV) / Paneer Butter Masala (V), Papad" },
  },
  south: {
    Monday:    { breakfast: "Vada (3), Idili (2), White Chutny, Alam Chutney",                         lunch: "Rice, Dal Cahru, Soybean Chana Curry / Cabbage Tomato Curry, Curd",          snacks: "Boiled Black Chhan Mix (1 Cup)",       dinner: "Rice, Sambar, Curd, Semiya Kheer, Alu Gobi or Alu Beans Boiled Fry" },
    Tuesday:   { breakfast: "Tamato Upma, Uttapam (2), White Chatny",                                  lunch: "Rice, Sambar, Cabbage Fry, Curd & Pickle",                                   snacks: "Sprout Salad (1 cup)",                 dinner: "Pulihora, Aloo Khurma, Curd" },
    Wednesday: { breakfast: "Puri (2), Upama (2), Alu Matar Curry, Chutney",                          lunch: "Rice, Curd, Rasam, Chatny, Matar Curry, Chips",                              snacks: "Dahi Bada (2 piece)",                  dinner: "Rice, Chicken Fry (NV) / Paneer Curry (V), Sambhar" },
    Thursday:  { breakfast: "Onion Bonda (3), Idilli (2), Coconut Chutney, Ginger Chutney",           lunch: "Rice, Tomato Dal, Curd, Pickle, Potato Fry",                                 snacks: "Alu Chop (2 piece)",                   dinner: "Rice, Dahi Charu, Rasam, Kabuli Chana Curry, Suji Halwa / Rice Payas" },
    Friday:    { breakfast: "Masala Upama, Idili (3), White Chutney, Matar Curry",                    lunch: "Rice, Leafy Dal, Brinjal Curry, Curd, Chips",                                snacks: "Sweet Corn (1 cup)",                   dinner: "Egg Fried Rice / Paneer Fried Rice, Dahi Raita (1st & 3rd) / White Rice, Egg Curry (NV) / Paneer Curry, Rasam (2nd & 4th)" },
    Saturday:  { breakfast: "Small Punugulu (10), Upama, White Chutney, Alam Chatny",                 lunch: "Rice, Sambar, Curd, Pickle, Chana Potato Greavy Curry",                      snacks: "Peanut & Moong Boiled (1 Cup)",        dinner: "Rice, Roti (3 nos.), Sambar, Chana Masala, Curd" },
    Sunday:    { breakfast: "Sambar Idili (4), Coconut Chutney",                                       lunch: "Veg Pulao, Alu Khurma, Raita",                                                snacks: "Sambar Bada (2 piece)",               dinner: "Bagara Rice, Chicken Curry (NV) / Baby Corn / Paneer Curry (V), Raita" },
  }
};

const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', snacks: '🍵', dinner: '🌙' };
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', dinner: 'Dinner' };

let selectedMessDay = null;
let selectedMess = 'north'; // 'north' | 'south'

function getMessChoice() {
  return localStorage.getItem(MESS_STORAGE_KEY) || 'north';
}
function setMessChoice(choice) {
  selectedMess = choice;
  localStorage.setItem(MESS_STORAGE_KEY, choice);
}

function renderMessMenu() {
  selectedMess = getMessChoice();
  const today = getTodayName();
  if (!selectedMessDay) selectedMessDay = today;

  // Tab buttons - mess selector
  const northBtn = document.getElementById('mess-north-btn');
  const southBtn = document.getElementById('mess-south-btn');
  northBtn.classList.toggle('active', selectedMess === 'north');
  southBtn.classList.toggle('active', selectedMess === 'south');

  // Day tabs
  const tabsEl = document.getElementById('mess-day-tabs');
  tabsEl.innerHTML = '';
  DAYS.forEach((day, i) => {
    const btn = document.createElement('button');
    const isToday = day === today;
    btn.className = 'day-tab' + (day === selectedMessDay ? ' active' : '') + (isToday && day !== selectedMessDay ? ' today' : '');
    btn.textContent = DAY_SHORT[i] + (isToday ? ' ★' : '');
    btn.onclick = () => { selectedMessDay = day; renderMessMenu(); };
    tabsEl.appendChild(btn);
  });

  // Menu content
  const content = document.getElementById('mess-content');
  const dayMenu = MESS_MENU[selectedMess][selectedMessDay];

  content.innerHTML = Object.keys(MEAL_ICONS).map(meal => {
    const isCurrentMeal = (meal === getCurrentMealTime());
    return `
      <div class="mess-meal-card ${isCurrentMeal ? 'current-meal' : ''}">
        <div class="mess-meal-header">
          <span class="mess-meal-icon">${MEAL_ICONS[meal]}</span>
          <span class="mess-meal-label">${MEAL_LABELS[meal]}</span>
          ${isCurrentMeal ? '<span class="mess-now-badge">● Now</span>' : ''}
        </div>
        <div class="mess-meal-items">${dayMenu[meal]}</div>
      </div>`;
  }).join('');
}

function getCurrentMealTime() {
  const h = new Date().getHours();
  if (h >= 6 && h < 10)  return 'breakfast';
  if (h >= 12 && h < 15) return 'lunch';
  if (h >= 16 && h < 18) return 'snacks';
  if (h >= 19 && h < 22) return 'dinner';
  return null;
}

function switchMess(choice) {
  setMessChoice(choice);
  renderMessMenu();
}

// ==================== GUDIYA 👧 - SMART TALKING MASCOT ====================
let gudiyaIndex = 0;
let gudiyaMessages = [];
let gudiyaBubbleTimer = null;

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'raat';
  if (h < 12) return 'subah';
  if (h < 17) return 'dopahar';
  if (h < 21) return 'shaam';
  return 'raat';
}

function buildGudiyaMessages() {
  const name = getUserName() || 'Bhaiya';
  const firstName = name.split(' ')[0];
  const time = getTimeGreeting();
  const today = getTodayName();
  const streak = getStreak();
  const nextCls = hasTimetable() ? getNextClass(today) : null;
  const totalClasses = hasTimetable()
    ? (TIMETABLE[today] || []).filter(p => !['Lunch','Library','BASKET-II','Mentor'].includes(p.subject)).length
    : 0;
  const todayMess = getTodayMess();
  const spent = getTotalSpent();
  const monthly = budgetData.monthly;
  const left = monthly - spent;
  const pct = monthly > 0 ? Math.round((spent / monthly) * 100) : 0;
  let totalLena = 0, totalDena = 0;
  khataData.forEach(p => {
    const net = getNetAmount(p);
    if (net > 0) totalLena += net; else if (net < 0) totalDena += Math.abs(net);
  });
  const isWeekend = today === 'Saturday' || today === 'Sunday';
  const msgs = [];

  // ---- Time-based greetings ----
  if (time === 'subah') {
    msgs.push(`Good morning ${firstName}! ☀️ Uth gaye? Chalo aaj ka din shuru karte hain!`);
    msgs.push(`Subah subah aap aa gaye! Main to wait kar rhi thi ${firstName} bhaiya! 😊`);
    msgs.push(`Gudiya ko bhi neend aa rhi thi, but aapke liye jag gayi! 🥱😊`);
  } else if (time === 'dopahar') {
    msgs.push(`${firstName} bhaiya! Dopahar ho gyi, lunch kiya? 🍽️`);
    msgs.push(`Hello ${firstName}! Dopahar mein bhi padhai? Waah! 👏`);
    msgs.push(`Garmi mein paani peete rehna ${firstName} bhaiya! 💧`);
  } else if (time === 'shaam') {
    msgs.push(`Good evening ${firstName}! Kaisa rha aaj ka din? 🌇`);
    msgs.push(`Shaam ho gyi ${firstName} bhaiya! Thoda rest karo! 😊`);
    msgs.push(`Shaam ki chai pee lo ${firstName} bhaiya! ☕ Fresh feel aayega!`);
  } else {
    msgs.push(`${firstName} bhaiya! Itni raat ko? Soja na! 🌙😴`);
    msgs.push(`Aree ${firstName}! Raat ho gyi, kal subah jaldi uthna hai na? 🥺`);
    msgs.push(`Gudiya bhi so rhi thi, aapne jaga diya! 😴 Jaldi sona haan!`);
  }

  // ---- Class-related ----
  if (totalClasses >= 5) {
    msgs.push(`Aaj to ${totalClasses} class hain ${firstName} bhaiya! 😵 But tension mat lo, ek ek karke nikal jayengi!`);
    msgs.push(`${totalClasses} class! Bahut zyada hain aaj 😤 But aap strong ho bhaiya! 💪`);
  } else if (totalClasses >= 3) {
    msgs.push(`Aaj ${totalClasses} class hain, normal din hai ${firstName} bhaiya! 📚`);
  } else if (totalClasses > 0) {
    msgs.push(`Aaj sirf ${totalClasses} class! Maza aayega aaj to! 😎`);
    msgs.push(`Kya baat hai! Sirf ${totalClasses} class, baaki time masti! 🎉`);
  }

  if (nextCls) {
    if (nextCls.ongoing) {
      msgs.push(`Abhi ${nextCls.subject} chal rhi hai! Dhyan se suno bhaiya! 📖`);
      msgs.push(`${nextCls.subject} mein ho abhi? Focus karo ${firstName} bhaiya! 🎯`);
    } else {
      msgs.push(`Next class ${nextCls.subject} hai, tayyar ho jao bhaiya! 📚`);
      msgs.push(`${nextCls.subject} aane wala hai! Time: ${nextCls.time.split('-')[0].trim()} ⏰`);
    }
  } else if (hasTimetable() && !isWeekend) {
    msgs.push(`Aaj ki sab class khatam ho gayi! 🎉 Ab maza karo bhaiya!`);
    msgs.push(`No more class! Gudiya bhi khush hai! 🥳`);
  }

  if (isWeekend) {
    msgs.push(`Aaj ${today} hai! Weekend mein enjoy karo ${firstName} bhaiya! 🎮`);
    msgs.push(`Weekend! No class! Party time! 🥳🎉`);
  }

  // ---- Mess ----
  if (todayMess) {
    const firstItem = todayMess.items.split(',')[0].trim();
    const yummy = todayMess.items.toLowerCase().includes('paneer') || todayMess.items.toLowerCase().includes('chicken');
    msgs.push(`${todayMess.label} mein ${firstItem} hai aaj! ${yummy ? 'Yummyyy! 🤤' : '😋'}`);
    msgs.push(`${firstName} bhaiya! ${todayMess.label} ka menu dekha? ${firstItem}! ${yummy ? 'Maza aayega! 🤤' : 'Achha hai! 👍'}`);
  }

  // ---- Budget ----
  if (monthly > 0) {
    if (pct >= 90) {
      msgs.push(`Bhaiya budget ALMOST khatam! 😱 Sirf ₹${Math.abs(left)} bacha hai! Sambhal ke! 🥺`);
      msgs.push(`Budget ka ${pct}% kharcha ho chuka! ${firstName} bhaiya dhyan do! 😬`);
    } else if (pct >= 70) {
      msgs.push(`Budget ka ${pct}% kharcha ho gaya hai! Thoda slow karo bhaiya! 😅`);
    } else if (pct < 30 && spent > 0) {
      msgs.push(`Budget ache se chal rha hai! ₹${left} bacha hai! Well done ${firstName} bhaiya! 💪`);
    } else if (pct >= 30 && pct < 70) {
      msgs.push(`₹${left} bacha hai budget mein! Normal pace hai ${firstName} bhaiya! 👍`);
    }
  } else {
    msgs.push(`Bhaiya monthly budget set nahi kiya! Budget page pe jao na! 💰`);
  }

  // ---- Streak ----
  if (streak >= 10) {
    msgs.push(`OMG! ${streak} din ka streak! 🔥🔥🔥 ${firstName} bhaiya aap to legend ho! 🏆`);
  } else if (streak >= 7) {
    msgs.push(`Waah! ${streak} din ka streak! 🔥🔥 Champion bhaiya! 🏆`);
  } else if (streak >= 3) {
    msgs.push(`${streak} din ka streak! 🔥 Maza aa gaya! Keep going bhaiya!`);
  } else if (streak === 1) {
    msgs.push(`Aaj pehla din hai! Kal bhi aana, streak banayenge! 🔥`);
  }

  // ---- Khata ----
  if (totalLena > 0) {
    msgs.push(`Logon se ₹${totalLena.toLocaleString('en-IN')} lena hai! Yaad dila do unko bhaiya! 😤`);
  }
  if (totalDena > 0) {
    msgs.push(`₹${totalDena.toLocaleString('en-IN')} dena hai logon ko! Bhool mat jaana bhaiya! 😊`);
  }

  // ---- Random fun / motivational ----
  msgs.push(`${firstName} bhaiya aap best ho! Main hamesha yahan hoon! 🥰`);
  msgs.push(`Padhai important hai but health bhi! Paani pee lo bhaiya! 💧`);
  msgs.push(`Aaj kuch naya seekho! Har din better banna hai na! 📈`);
  msgs.push(`Main Gudiya hoon! Aapki chhoti helper! 👧 Tap karo aur suno!`);
  msgs.push(`Hostel ka khana kha ke bore ho gaye? Weekend pe bahar khana bhaiya! 🍕`);
  msgs.push(`Ek smile do ${firstName} bhaiya! 😊 Gudiya khush ho jayegi!`);
  msgs.push(`Kya pata kal exam aa jaye? Thoda thoda padh lo daily! 📝`);
  msgs.push(`Friends ke saath time spend karo, college life ek baar aati hai! 🫂`);
  msgs.push(`${firstName} bhaiya, aapka CampusKit app bahut achha hai! 😍`);
  msgs.push(`Agar koi tension hai to deep breath lo! Sab theek hoga! 🌈`);

  return msgs;
}

function getGudiyaMessage() {
  if (gudiyaMessages.length === 0 || gudiyaIndex >= gudiyaMessages.length) {
    gudiyaMessages = buildGudiyaMessages();
    // Shuffle for variety
    for (let i = gudiyaMessages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gudiyaMessages[i], gudiyaMessages[j]] = [gudiyaMessages[j], gudiyaMessages[i]];
    }
    gudiyaIndex = 0;
  }
  return gudiyaMessages[gudiyaIndex++];
}

function showGudiyaBubble(withVoice = true) {
  const msg = getGudiyaMessage();
  const bubble = document.getElementById('gudiya-bubble');
  const textEl = document.getElementById('gudiya-text');
  textEl.textContent = msg;
  bubble.classList.remove('hidden');
  // Re-trigger animation
  bubble.classList.remove('gudiya-pop');
  void bubble.offsetWidth;
  bubble.classList.add('gudiya-pop');

  // Speak if voice enabled
  if (withVoice) speakGudiya(msg);

  // Auto-hide after speech ends or 7 sec
  clearTimeout(gudiyaBubbleTimer);
  gudiyaBubbleTimer = setTimeout(() => hideGudiyaBubble(), 7000);
}

function hideGudiyaBubble() {
  const bubble = document.getElementById('gudiya-bubble');
  if (bubble) {
    bubble.classList.add('hidden');
    bubble.classList.remove('gudiya-pop');
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function toggleGudiyaBubble() {
  const bubble = document.getElementById('gudiya-bubble');
  if (bubble.classList.contains('hidden')) {
    showGudiyaBubble(true);
  } else {
    hideGudiyaBubble();
    setTimeout(() => showGudiyaBubble(true), 250);
  }
}

function speakGudiya(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  // Remove emojis for cleaner speech
  const clean = text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[●•✓✎⚡↑↓]/gu, '').replace(/\s+/g,' ').trim();

  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'hi-IN';
  utter.rate = 0.92;    // Slightly slow = natural feel
  utter.pitch = 1.35;   // Soft high = young girl, not robotic
  utter.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  let picked = null;

  // BEST: Google Hindi voices (most natural, available on Android/Chrome)
  picked = voices.find(v => /google/i.test(v.name) && v.lang.startsWith('hi'));

  // Microsoft Online (Neural) voices — very natural sounding
  if (!picked) picked = voices.find(v => /online|neural/i.test(v.name) && v.lang.startsWith('hi'));

  // Microsoft Swara (decent Hindi female)
  if (!picked) picked = voices.find(v => /swara|kalpana|neerja|sapna/i.test(v.name));

  // Any Hindi female
  if (!picked) picked = voices.find(v => v.lang.startsWith('hi') && /female|woman|girl/i.test(v.name));

  // Any Hindi voice
  if (!picked) picked = voices.find(v => v.lang.startsWith('hi'));

  // Google English India female (sounds natural in Hinglish)
  if (!picked) picked = voices.find(v => /google/i.test(v.name) && /en.in/i.test(v.lang));

  // Microsoft Neerja (en-IN female, good for Hinglish)
  if (!picked) picked = voices.find(v => /neerja|sapna/i.test(v.name));

  // Any en-IN female
  if (!picked) picked = voices.find(v => v.lang === 'en-IN' && /female|woman/i.test(v.name));

  // Fallback: Any female sounding voice
  if (!picked) picked = voices.find(v => /zira|hazel|susan|samantha|karen|moira/i.test(v.name));

  if (picked) utter.voice = picked;

  // Auto-hide bubble when speech ends
  utter.onend = () => {
    clearTimeout(gudiyaBubbleTimer);
    gudiyaBubbleTimer = setTimeout(() => hideGudiyaBubble(), 2000);
  };

  window.speechSynthesis.speak(utter);
}

function initGudiya() {
  // Pre-load voices (async in some browsers)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
  // Auto-greet after 1.5s
  setTimeout(() => showGudiyaBubble(true), 1500);
}

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', () => {
  selectedDay = getTodayName();
  selectedMessDay = getTodayName();
  updateStreak();
  initAuth();
});

// ==================== PWA SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
