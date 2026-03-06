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
      showToast('Timetable uploaded successfully! âœ“');
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
    let curRawCell = null;
    let startIdx   = 0;

    for (let j = 0; j <= cells.length; j++) {
      const rawCell = j < cells.length ? (cells[j] ? String(cells[j]).trim() : null) : null;
      const isNewCell = rawCell && rawCell !== curRawCell;
      const isEnd = j === cells.length;

      if ((isNewCell || isEnd) && curSubject !== null) {
        // Calculate time range: from timeSlots[startIdx] start â†’ timeSlots[j-1] end
        const tStart = slotStart(timeSlots[startIdx] || '');
        const tEnd   = slotEnd(timeSlots[Math.min(j, timeSlots.length) - 1] || '');
        periods.push({
          time: `${tStart} - ${tEnd}`,
          subject: curSubject,
          teacher: '',
          room: curRoom
        });
      }

      if (rawCell && (isNewCell || curSubject === null)) {
        const { subject, room } = extractSubjectRoom(rawCell);
        curSubject = subject;
        curRoom    = room;
        curRawCell = rawCell;
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
  // Normalize: "9.30AM-10.30AM" â†’ "9:30 AM - 10:30 AM"
  return raw.replace(/\./g, ':').replace(/([APap][Mm])/g, ' $1').trim();
}

function slotStart(slot) {
  if (!slot) return '';
  const m = slot.match(/^(.+?)\s*[-â€“]\s*(.+)$/);
  return m ? m[1].trim() : slot.trim();
}

function slotEnd(slot) {
  if (!slot) return '';
  const m = slot.match(/^(.+?)\s*[-â€“]\s*(.+)$/);
  return m ? m[2].trim() : slot.trim();
}

function extractSubjectRoom(raw) {
  if (!raw) return { subject: '', room: '' };
  let room = '';
  let subject = raw.trim();

  // Pattern 1: Room code at end â€” "Subject C-205", "Subject C-127", "IOT C-133"
  // Room = letter(s)-number(s) at the very end, e.g. C-205, C-127, C-133
  const roomEndMatch = subject.match(/\s+([A-Z]{1,4}-\d{1,4}[A-Z]?)\s*$/i);
  if (roomEndMatch) {
    room = roomEndMatch[1].trim();
    subject = subject.slice(0, subject.length - roomEndMatch[0].length).trim();
    return { subject, room };
  }

  // Pattern 2: Room in brackets at end â€” "Subject (C-205)"
  const bracketMatch = subject.match(/\(([A-Z]{1,4}-?\d{1,4}[A-Z]?)\)\s*$/i);
  if (bracketMatch) {
    room = bracketMatch[1].trim();
    subject = subject.replace(bracketMatch[0], '').trim();
    return { subject, room };
  }

  // Pattern 3: Lab room â€” "Lab-1", "LAB-4" etc at end
  const labMatch = subject.match(/\s+((?:CSE\s+)?Lab[-\s]?\d+)\s*$/i);
  if (labMatch) {
    room = labMatch[1].trim();
    subject = subject.slice(0, subject.length - labMatch[0].length).trim();
    return { subject, room };
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

// ==================== LAB ASSIGNMENT DATA ====================
// Structure per subject: { lab:{written,verified,deadline}, learning:{...}, assignment:{...} }
const LAB_STORAGE_KEY = 'campuskit_lab';
let labData = JSON.parse(localStorage.getItem(LAB_STORAGE_KEY) || '{}');

function saveLabData() {
  localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(labData));
}

function getLabEntry(subject) {
  if (!labData[subject]) labData[subject] = {};
  const s = labData[subject];
  if (!s.lab)        s.lab        = { written: false, verified: false, deadline: '' };
  if (!s.learning)   s.learning   = { written: false, verified: false, deadline: '' };
  if (!s.assignment) s.assignment = { written: false, verified: false, deadline: '' };
  return s;
}

function getLabSubjects() {
  const nonAcademic = ['Lunch','Library','BASKET-II','Mentor','Job Readiness','Skill Course'];
  const seen = new Set();
  const subjects = [];
  DAYS.forEach(day => {
    (TIMETABLE[day] || []).forEach(p => {
      if (p.subject && !nonAcademic.includes(p.subject) && !seen.has(p.subject)) {
        seen.add(p.subject);
        subjects.push(p.subject);
      }
    });
  });
  return subjects;
}

function toggleLabField(subject, type, field) {
  const entry = getLabEntry(subject);
  entry[type][field] = !entry[type][field];
  if (field === 'written' && !entry[type].written) entry[type].verified = false;
  saveLabData();
  renderLabPage();
}

function saveLabTypeDeadline(subject, type, val) {
  const entry = getLabEntry(subject);
  entry[type].deadline = val;
  saveLabData();
  renderLabPage();
}

function renderLabTypeRow(label, icon, type, entry, escapedSubject, today) {
  const d = entry[type];
  const deadlinePassed = d.deadline && d.deadline < today;
  const deadlineSoon   = d.deadline && !deadlinePassed && d.deadline <= new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0];

  return `
    <div class="lab-type-section ${d.written ? (d.verified ? 'lts-done' : 'lts-written') : ''}">
      <div class="lab-type-header">
        <span class="lab-type-icon">${icon}</span>
        <span class="lab-type-title">${label}</span>
        ${d.verified ? '<span class="lts-badge-done">&#10003; Verified</span>' : d.written ? '<span class="lts-badge-written">&#9998; Written</span>' : ''}
      </div>
      <div class="lab-toggle-group">
        <span class="lab-toggle-label">Likha?</span>
        <div class="lab-toggle-btns">
          <button class="lab-btn ${!d.written ? 'lab-btn-no active' : 'lab-btn-no'}" onclick="toggleLabField('${escapedSubject}','${type}','written')">
            ${d.written ? '&#10007; Nahi' : '&#10007; Nahi Likha'}
          </button>
          <button class="lab-btn ${d.written ? 'lab-btn-yes active' : 'lab-btn-yes'}" onclick="toggleLabField('${escapedSubject}','${type}','written')">
            ${d.written ? '&#10003; Likh Liya!' : '&#10003; Likha'}
          </button>
        </div>
      </div>
      ${d.written ? `
      <div class="lab-toggle-group">
        <span class="lab-toggle-label">Verify Hua?</span>
        <div class="lab-toggle-btns">
          <button class="lab-btn ${!d.verified ? 'lab-btn-no active' : 'lab-btn-no'}" onclick="toggleLabField('${escapedSubject}','${type}','verified')">
            ${d.verified ? '&#10007; Nahi' : '&#10007; Nahi Hua'}
          </button>
          <button class="lab-btn ${d.verified ? 'lab-btn-yes active' : 'lab-btn-yes'}" onclick="toggleLabField('${escapedSubject}','${type}','verified')">
            ${d.verified ? '&#10003; Verified! &#9989;' : '&#10003; Ho Gaya'}
          </button>
        </div>
      </div>` : ''}
      <div class="lab-deadline-mini">
        <label class="lab-deadline-label"><i class="fa-solid fa-calendar-check"></i> Submit date:</label>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input type="date" class="lab-deadline-input" value="${d.deadline || ''}"
            onchange="saveLabTypeDeadline('${escapedSubject}','${type}',this.value)" />
          ${d.deadline ? `<div class="lab-deadline-badge ${deadlinePassed ? 'deadline-passed' : deadlineSoon ? 'deadline-soon' : 'deadline-ok'}">
            ${deadlinePassed ? '&#9888; Nikal gayi!' : deadlineSoon ? '&#9200; ' + formatDate(d.deadline) : '&#128197; ' + formatDate(d.deadline)}
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

function renderLabPage() {
  const container = document.getElementById('lab-page-content');
  if (!container) return;

  if (!hasTimetable()) {
    container.innerHTML = `
      <div class="lab-empty-state">
        <div class="lab-empty-icon">&#128197;</div>
        <h3>Pehle Timetable Upload Karo!</h3>
        <p>Timetable se subjects automatically aa jayenge</p>
        <button class="btn-goto-tt" onclick="showPage('timetable')"><i class="fa-solid fa-calendar-plus"></i> Timetable Upload Karo</button>
      </div>`;
    return;
  }

  const subjects = getLabSubjects();
  if (subjects.length === 0) {
    container.innerHTML = `<div class="lab-empty-state"><div class="lab-empty-icon">&#128218;</div><h3>Koi subject nahi mila</h3></div>`;
    return;
  }

  const today = getTodayDateStr();
  const TYPES = ['lab','learning','assignment'];
  let totalItems = subjects.length * 3;
  let writtenCount = 0, verifiedCount = 0;
  subjects.forEach(s => {
    const e = getLabEntry(s);
    TYPES.forEach(t => {
      if (e[t].written)  writtenCount++;
      if (e[t].verified) verifiedCount++;
    });
  });

  let html = `
    <div class="lab-stats-bar">
      <div class="lab-stat">
        <div class="lab-stat-val">${writtenCount}/${totalItems}</div>
        <div class="lab-stat-label">&#9997;&#65039; Written</div>
      </div>
      <div class="lab-stat-divider"></div>
      <div class="lab-stat">
        <div class="lab-stat-val">${verifiedCount}/${totalItems}</div>
        <div class="lab-stat-label">&#9989; Verified</div>
      </div>
      <div class="lab-stat-divider"></div>
      <div class="lab-stat">
        <div class="lab-stat-val">${totalItems - writtenCount}</div>
        <div class="lab-stat-label">&#8987; Pending</div>
      </div>
    </div>
    <div class="lab-list">`;

  subjects.forEach(subject => {
    const entry = getLabEntry(subject);
    const color = subjectColor(subject);
    const escapedSubject = subject.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const allDone = TYPES.every(t => entry[t].verified);
    const anyWritten = TYPES.some(t => entry[t].written);

    html += `
      <div class="lab-card ${allDone ? 'lab-all-done' : anyWritten ? 'lab-written' : ''}" style="border-left-color:${color};">
        <div class="lab-subject-name" style="color:${color};">${subject}</div>
        ${renderLabTypeRow('Lab Record', '&#128300;', 'lab', entry, escapedSubject, today)}
        ${renderLabTypeRow('Learning Record', '&#128214;', 'learning', entry, escapedSubject, today)}
        ${renderLabTypeRow('Assignment', '&#128221;', 'assignment', entry, escapedSubject, today)}
      </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ==================== NAVIGATION ====================
let currentPage = 'home';

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');

  const titles = { home: 'CampusKit', timetable: 'Class Timetable', khata: 'Khata Book', mess: 'Mess Menu', budget: 'Pocket Money', lab: 'Lab Assignments' };
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
  if (page === 'lab') renderLabPage();
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
    btn.textContent = DAY_SHORT[shortIdx] + (day === today ? ' â˜…' : '');
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
    content.innerHTML = `<div class="no-class"><i class="fa-solid fa-umbrella-beach"></i><p>No class today!<br/>Enjoy your day ðŸ˜´</p></div>`;
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
        ðŸ½ï¸ â”€â”€ Lunch Break (${p.time}) â”€â”€</div>`;
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
        ${isCurrent ? '<span class="period-now-badge">â— Ongoing</span>' : ''}
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
  if (greetEl) greetEl.textContent = name ? `Hello, ${name}! ðŸ‘‹` : 'Hello! ðŸ‘‹';
  const streak = getStreak();
  if (streakEl) {
    streakEl.innerHTML = streak > 0
      ? `<span class="streak-badge">ðŸ”¥ ${streak} day${streak>1?'s':''}</span>` : '';
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
    <div class="aajkadin-header">âš¡ Aaj Ka Din</div>
    <div class="aajkadin-grid">

      <!-- Next Class -->
      <div class="akd-card class-card" onclick="showPage('timetable')">
        <div class="akd-icon">ðŸ“š</div>
        <div class="akd-info">
          <div class="akd-label">Next Class</div>
          ${nextCls
            ? `<div class="akd-value">${nextCls.subject}</div>
               <div class="akd-sub">${nextCls.ongoing ? 'ðŸŸ¢ Ongoing' : nextCls.time.split('-')[0].trim()}</div>`
            : `<div class="akd-value" style="color:var(--text-muted);font-size:13px;">No more classes ðŸŽ‰</div>`
          }
        </div>
      </div>

      <!-- Mess Today -->
      <div class="akd-card mess-card-home" onclick="showPage('mess')">
        <div class="akd-icon">${todayMess ? todayMess.icon : 'ðŸ½ï¸'}</div>
        <div class="akd-info">
          <div class="akd-label">${todayMess ? todayMess.label : 'Mess Menu'}</div>
          ${todayMess
            ? `<div class="akd-value" style="font-size:12px;line-height:1.4;">${todayMess.items.split(',').slice(0,2).join(', ')}&hellip;</div>
               <div class="akd-sub">${todayMess.mess === 'north' ? 'ðŸ  North' : 'ðŸ  South'}</div>`
            : `<div class="akd-value" style="color:var(--text-muted);font-size:13px;">Tap to check menu</div>`
          }
        </div>
      </div>

      <!-- Budget -->
      <div class="akd-card budget-card-home" onclick="showPage('budget')">
        <div class="akd-icon">ðŸ’°</div>
        <div class="akd-info">
          <div class="akd-label">Pocket Money</div>
          ${budgetData.monthly > 0
            ? `<div class="akd-value ${left<0?'danger-text':''}">â‚¹${Math.abs(left).toLocaleString('en-IN')} ${left<0?'over':'left'}</div>
               <div class="akd-sub">Spent â‚¹${spent.toLocaleString('en-IN')}</div>`
            : `<div class="akd-value" style="color:var(--primary);font-size:12px;">+ Set monthly budget</div>`
          }
        </div>
      </div>

      <!-- Khata -->
      <div class="akd-card khata-card-home" onclick="showPage('khata')">
        <div class="akd-icon">ðŸ“’</div>
        <div class="akd-info">
          <div class="akd-label">Khata</div>
          <div class="akd-value" style="color:#22C55E;font-size:13px;">â†“ â‚¹${totalLena.toLocaleString('en-IN')}</div>
          <div class="akd-sub" style="color:#EF4444;">â†‘ â‚¹${totalDena.toLocaleString('en-IN')}</div>
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
      <div class="ksb-value">â‚¹${totalLena.toLocaleString('en-IN')}</div>
    </div>
    <div class="ksb-card dena">
      <div class="ksb-label">I Need to Pay</div>
      <div class="ksb-value">â‚¹${totalDena.toLocaleString('en-IN')}</div>
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
        <div class="khata-txn-count">${person.phone ? `<i class="fa-brands fa-whatsapp" style="color:#25D366"></i> +91 ${person.phone} &nbsp;Â·&nbsp; ` : ''}${person.transactions.length} transaction${person.transactions.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="khata-amount">
        <div class="amount ${amountClass}">â‚¹${Math.abs(net).toLocaleString('en-IN')}</div>
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
  let netText = net > 0 ? `â‚¹${net.toLocaleString('en-IN')} to receive` :
                net < 0 ? `â‚¹${Math.abs(net).toLocaleString('en-IN')} to pay` : 'Settled âœ“';

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
          <div class="txn-note">${t.note || 'â€”'}</div>
          <div class="txn-date">${formatDate(t.date)}</div>
          <span class="txn-type-badge ${t.type}">${t.type === 'lena' ? 'To Receive' : 'To Pay'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="txn-amount ${t.type}">${t.type === 'lena' ? '+' : '-'}â‚¹${t.amount.toLocaleString('en-IN')}</div>
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
    msg = `Hi ${person.naam}, you owe me â‚¹${net.toLocaleString('en-IN')}. Let me know when you're free. ðŸ™`;
  } else if (net < 0) {
    msg = `Hi ${person.naam}, I owe you â‚¹${Math.abs(net).toLocaleString('en-IN')}. Just reminding myself. ðŸ™`;
  } else {
    msg = `Hi ${person.naam}, our dues are all settled. Thanks! âœ…`;
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
const STORAGE_PIN    = 'campuskit_pin';
const STORAGE_SESS   = 'campuskit_session';
const STORAGE_NAME   = 'campuskit_username';
const STORAGE_GENDER = 'campuskit_gender';

let selectedGender = localStorage.getItem('campuskit_gender') || 'male';

function selectGender(g) {
  selectedGender = g;
  document.getElementById('gender-male').classList.toggle('active', g === 'male');
  document.getElementById('gender-female').classList.toggle('active', g === 'female');
}
function getUserGender() {
  return localStorage.getItem(STORAGE_GENDER) || 'male';
}
function getHonorific() {
  return getUserGender() === 'female' ? 'didi' : 'bhaiya';
}

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
  localStorage.setItem(STORAGE_GENDER, selectedGender);
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
    // Very first time â€” ask for name
    pinStep = 'name';
    showNameStep();
    setLoginUITitleOnly('Welcome! ðŸ‘‹', 'Tell us your name to get started');
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
    setLoginUI(`Welcome back, ${name}! ðŸ‘‹`, 'Enter your PIN to open the app');
  }
}

function setLoginUITitleOnly(title, sub) {
  document.getElementById('login-title').textContent = title;
  document.getElementById('login-sub').textContent   = sub;
}

function hidLoginShowApp() {
  document.getElementById('login-screen').style.display = 'none';
  // Now do normal splash â†’ app flow
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
    setLoginUI('Confirm Your PIN', 'Enter the same PIN again to confirm');
  }
  else if (pinStep === 'confirm') {
    if (pinBuffer === pinFirst) {
      localStorage.setItem(STORAGE_PIN, pinFirst);
      localStorage.setItem(STORAGE_SESS, 'true');
      showPinSuccess('PIN set successfully! âœ“');
      setTimeout(() => hidLoginShowApp(), 700);
    } else {
      showPinError('PIN did not match â€” please try again');
      pinStep = 'setup';
      pinFirst = '';
      setTimeout(() => setLoginUI('Set Your PIN', 'Create a 4-digit PIN to secure your app'), 900);
    }
  }
  else if (pinStep === 'login') {
    const saved = localStorage.getItem(STORAGE_PIN);
    if (pinBuffer === saved) {
      localStorage.setItem(STORAGE_SESS, 'true');
      showPinSuccess('âœ“');
      setTimeout(() => hidLoginShowApp(), 400);
    } else {
      showPinError('Wrong PIN â€” please try again');
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

const BUDGET_CATS = ['ðŸ” Food', 'ðŸšŒ Travel', 'ðŸ›ï¸ Shopping', 'ðŸ“š Study', 'ðŸ’Š Health', 'ðŸŽ® Fun', 'ðŸ“¦ Other'];
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
              ${monthly > 0 ? `â‚¹${monthly.toLocaleString('en-IN')} âœŽ` : '+ Set Budget'}
            </button>
          </div>
        </div>
        <div class="budget-left-badge ${danger ? 'danger' : warn ? 'warn' : 'safe'}">
          <div class="blb-amount">â‚¹${Math.abs(left).toLocaleString('en-IN')}</div>
          <div class="blb-label">${left < 0 ? 'Over!' : 'Left'}</div>
        </div>
      </div>
      ${monthly > 0 ? `
      <div class="budget-bar-wrap">
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width:${pct}%;background:${barColor};"></div>
        </div>
        <div class="budget-bar-labels">
          <span>Spent â‚¹${spent.toLocaleString('en-IN')}</span>
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
      <div class="expense-cat-icon">${e.cat ? e.cat.split(' ')[0] : 'ðŸ“¦'}</div>
      <div class="expense-info">
        <div class="expense-note">${e.note || e.cat || 'Expense'}</div>
        <div class="expense-date">${e.cat || ''}  Â·  ${formatDate(e.date)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="expense-amount">â‚¹${e.amount.toLocaleString('en-IN')}</div>
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
  showToast('Budget set ho gaya! âœ“');
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
  showToast('Expense add ho gaya! âœ“');
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

const MEAL_ICONS = { breakfast: 'ðŸŒ…', lunch: 'â˜€ï¸', snacks: 'ðŸµ', dinner: 'ðŸŒ™' };
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
    btn.textContent = DAY_SHORT[i] + (isToday ? ' â˜…' : '');
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
          ${isCurrentMeal ? '<span class="mess-now-badge">â— Now</span>' : ''}
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
