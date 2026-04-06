/* ===========================
   app.js - 完整应用逻辑 v3
=========================== */

// ===== 数据存储 =====
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); triggerSync(); },
};
function userKey(k) { return `app_${currentUser}_${k}`; }

// ===== 全局状态 =====
let currentUser = null;
let isDiaryUnlocked = false;
let currentTab = 'schedule';

// 日记
let editingDiaryId = null;
let selectedMood = '😊';
let diaryImages = [];   // [{dataUrl, name}]

// 随手记
let editingNoteId = null;
let selectedNoteColor = 'white';
let noteImages = [];

// 日程
let editingScheduleId = null;
let schedType = 'once';
let selectedWeekdays = [];
let selectedSchedColor = 'blue';
let currentWeekOffset = 0;

// 记账
let editingFinanceId = null;
let selectedFinanceType = 'expense';
let selectedCategory = null;
let financeMonth = new Date();

// ===== 颜色配置 =====
const SCHED_COLORS = {
  blue:   { bg: '#dbeafe', text: '#1d4ed8' },
  green:  { bg: '#dcfce7', text: '#15803d' },
  orange: { bg: '#ffedd5', text: '#c2410c' },
  pink:   { bg: '#fce7f3', text: '#be185d' },
  purple: { bg: '#ede9fe', text: '#6d28d9' },
  gray:   { bg: '#f3f4f6', text: '#374151' },
};

// ===== 记账分类（新版）=====
// 支出分组：必要支出、餐饮、生活、不必须、其他
const EXPENSE_GROUPS = [
  {
    label: '必要支出',
    cats: [
      {emoji:'🏠',label:'房租'},{emoji:'💊',label:'医疗'},{emoji:'⚡',label:'水电'},
      {emoji:'🚌',label:'交通'},{emoji:'📚',label:'教育'},
    ]
  },
  {
    label: '餐饮',
    cats: [
      {emoji:'🍔',label:'外卖'},{emoji:'🍜',label:'正餐'},{emoji:'☕',label:'咖啡'},
      {emoji:'🛒',label:'超市'},
    ]
  },
  {
    label: '生活',
    cats: [
      {emoji:'🧴',label:'日用'},{emoji:'👕',label:'服饰'},{emoji:'💄',label:'美容'},
      {emoji:'🐾',label:'宠物'},
    ]
  },
  {
    label: '不必须',
    cats: [
      {emoji:'🎮',label:'游戏'},{emoji:'🎬',label:'娱乐'},{emoji:'🛍️',label:'购物'},
      {emoji:'✈️',label:'旅行'},
    ]
  },
  {
    label: '其他',
    cats: [
      {emoji:'📦',label:'其他'},
    ]
  },
];

const INCOME_GROUPS = [
  {
    label: '收入来源',
    cats: [
      {emoji:'💼',label:'工资'},{emoji:'📈',label:'投资'},{emoji:'🎁',label:'礼金'},
      {emoji:'🔧',label:'兼职'},{emoji:'💰',label:'其他'},
    ]
  }
];

// 扁平化分类列表（用于存储时匹配）
function flattenGroups(groups) {
  return groups.flatMap(g => g.cats);
}

// ===== 工具函数 =====
function uuid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function todayStr() { return new Date().toISOString().slice(0,10); }

function showToast(msg, dur=2200) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function closeModalOnOverlay(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

function formatDateShort(ds) {
  if (!ds) return '';
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('zh-CN', {month:'short', day:'numeric'});
}
function formatRelTime(ds) {
  const d = new Date(ds), now = new Date(), diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff/3600000) + '小时前';
  const days = Math.floor(diff/86400000);
  if (days < 7) return days + '天前';
  return d.toLocaleDateString('zh-CN', {month:'short', day:'numeric'});
}

// ===== 同步状态 =====
let syncTimer = null;
function triggerSync() {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.querySelector('.sync-dot').className = 'sync-dot syncing';
  document.getElementById('syncText').textContent = '同步中';
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    el.querySelector('.sync-dot').className = 'sync-dot synced';
    document.getElementById('syncText').textContent = '已同步';
  }, 700);
}

// ==========================
// ===== 账号系统 =====
// ==========================
function getUsers() { return DB.get('app_users') || {}; }
function saveUsers(u) { localStorage.setItem('app_users', JSON.stringify(u)); }

function switchAuthTab(tab) {
  document.getElementById('loginForm').style.display    = tab==='login'    ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab==='register' ? 'block' : 'none';
  document.getElementById('forgotStep1').style.display  = tab==='forgot'   ? 'block' : 'none';
  document.getElementById('forgotStep2').style.display  = 'none'; // step2 只由 forgotVerify 打开

  document.getElementById('loginTabBtn').classList.toggle('active',    tab==='login');
  document.getElementById('registerTabBtn').classList.toggle('active', tab==='register');
  document.getElementById('loginError').textContent    = '';
  document.getElementById('registerError').textContent = '';

  if (tab === 'forgot') {
    document.getElementById('forgotUsername').value  = '';
    document.getElementById('forgotDiaryPin').value  = '';
    document.getElementById('forgotStep1Error').textContent = '';
  }
}

function doLogin() {
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value;
  const rememberMe = document.getElementById('rememberMe').checked;
  const autoLogin = document.getElementById('autoLogin').checked;
  const err = document.getElementById('loginError');
  if (!u || !p) { err.textContent = '请填写账号和密码'; return; }
  const users = getUsers();
  if (!users[u]) { err.textContent = '账号不存在'; return; }
  if (users[u].password !== hashSimple(p)) { err.textContent = '密码错误'; return; }
  currentUser = u;
  isDiaryUnlocked = false;
  document.getElementById('navUsername').textContent = u;
  document.getElementById('settingsUsername').textContent = u;
  
  // 保存记住密码和自动登录设置
  if (rememberMe || autoLogin) {
    localStorage.setItem('app_remember_user', u);
    localStorage.setItem('app_remember_pwd', hashSimple(p));
    localStorage.setItem('app_auto_login', autoLogin ? 'true' : 'false');
  } else {
    localStorage.removeItem('app_remember_user');
    localStorage.removeItem('app_remember_pwd');
    localStorage.removeItem('app_auto_login');
  }
  
  showPage('mainPage');
  initMainPage();
  err.textContent = '';
  document.getElementById('loginPassword').value = '';
  showToast('欢迎回来，' + u + ' 👋');
}

function doRegister() {
  const u = document.getElementById('regUsername').value.trim();
  const p = document.getElementById('regPassword').value;
  const pin = document.getElementById('regDiaryPin').value;
  const err = document.getElementById('registerError');
  if (!u || !p) { err.textContent = '请填写账号和密码'; return; }
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(u)) { err.textContent = '账号只能含字母、数字、下划线（2-20位）'; return; }
  if (p.length < 6) { err.textContent = '密码至少6位'; return; }
  if (pin && !/^\d{4,8}$/.test(pin)) { err.textContent = '日记密码需为4-8位数字'; return; }
  const users = getUsers();
  if (users[u]) { err.textContent = '账号已存在'; return; }
  users[u] = { password: hashSimple(p), diaryPin: hashSimple(pin || '1234'), createdAt: new Date().toISOString() };
  saveUsers(users);
  showToast('注册成功！请登录 🎉');
  switchAuthTab('login');
  document.getElementById('loginUsername').value = u;
  err.textContent = '';
}

// 忘记密码 - 步骤1：用日记密码验证身份
let _forgotVerifiedUser = null;
function forgotVerify() {
  const u   = document.getElementById('forgotUsername').value.trim();
  const pin = document.getElementById('forgotDiaryPin').value;
  const err = document.getElementById('forgotStep1Error');
  if (!u || !pin) { err.textContent = '请填写账号和日记密码'; return; }
  const users = getUsers();
  if (!users[u]) { err.textContent = '账号不存在'; return; }
  if (users[u].diaryPin !== hashSimple(pin)) { err.textContent = '日记密码错误，验证失败'; return; }
  // 验证通过 → 进入步骤2
  _forgotVerifiedUser = u;
  err.textContent = '';
  document.getElementById('forgotStep1').style.display = 'none';
  document.getElementById('forgotNewPwd').value  = '';
  document.getElementById('forgotNewPwd2').value = '';
  document.getElementById('forgotStep2Error').textContent = '';
  document.getElementById('forgotStep2').style.display = 'block';
  setTimeout(() => document.getElementById('forgotNewPwd').focus(), 80);
}

// 忘记密码 - 步骤2：重置登录密码
function forgotReset() {
  const p1  = document.getElementById('forgotNewPwd').value;
  const p2  = document.getElementById('forgotNewPwd2').value;
  const err = document.getElementById('forgotStep2Error');
  if (!p1 || !p2) { err.textContent = '请填写新密码'; return; }
  if (p1.length < 6) { err.textContent = '密码至少6位'; return; }
  if (p1 !== p2) { err.textContent = '两次输入的密码不一致'; return; }
  const users = getUsers();
  users[_forgotVerifiedUser].password = hashSimple(p1);
  saveUsers(users);
  const savedUser = _forgotVerifiedUser;
  _forgotVerifiedUser = null;
  showToast('密码已重置，请重新登录 ✅');
  switchAuthTab('login');
  document.getElementById('loginUsername').value = savedUser;
}

function doLogout() {
  currentUser = null; isDiaryUnlocked = false;
  sessionStorage.removeItem('app_current_user');
  sessionStorage.removeItem('app_diary_unlocked');
  // 清除自动登录，但保留记住的账号密码
  localStorage.removeItem('app_auto_login');
  document.getElementById('autoLogin').checked = false;
  showPage('authPage');
  showToast('已退出登录');
}

function hashSimple(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h<<5)-h)+s.charCodeAt(i); h|=0; }
  return h.toString(16);
}

// ===== 日记密码锁 =====
function enterDiarySection() {
  if (isDiaryUnlocked) { activateSection('diary'); return; }
  document.getElementById('diaryPinInput').value = '';
  document.getElementById('diaryPinError').textContent = '';
  showPage('diaryLockPage');
}

function verifyDiaryPin() {
  const pin = document.getElementById('diaryPinInput').value;
  const err = document.getElementById('diaryPinError');
  if (!pin) { err.textContent = '请输入密码'; return; }
  const users = getUsers();
  if (users[currentUser].diaryPin !== hashSimple(pin)) {
    err.textContent = '密码错误';
    document.getElementById('diaryPinInput').value = ''; return;
  }
  isDiaryUnlocked = true;
  showPage('mainPage');
  showToast('日记已解锁 🔓');
  activateSection('diary');
  renderDiaryList();
}

function resetDiaryLock() {
  isDiaryUnlocked = false;
  sessionStorage.setItem('app_diary_unlocked', 'false');
  showToast('日记已重新锁定 🔒');
}

function saveDiaryPin() {
  const old = document.getElementById('oldPin').value;
  const nw  = document.getElementById('newPin').value;
  const err = document.getElementById('changePinError');
  if (!old || !nw) { err.textContent = '请填写完整'; return; }
  const users = getUsers();
  if (users[currentUser].diaryPin !== hashSimple(old)) { err.textContent = '当前密码错误'; return; }
  if (!/^\d{4,8}$/.test(nw)) { err.textContent = '新密码需为4-8位数字'; return; }
  users[currentUser].diaryPin = hashSimple(nw);
  saveUsers(users);
  closeModal('changePinModal');
  err.textContent = '';
  showToast('日记密码已修改 ✅');
}

// ===== 主页面初始化 =====
function initMainPage() {
  document.getElementById('settingsUsername').textContent = currentUser;
  currentWeekOffset = 0;
  initFinanceMonth();
  // 默认显示日程（不触发密码验证）
  currentTab = 'schedule';
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('tab-schedule');
  if (tabEl) tabEl.classList.add('active');
  activateSection('schedule');
}

// ===== Tab 切换 =====
function switchTab(tab) {
  if (tab === 'diary' && !isDiaryUnlocked) { enterDiarySection(); return; }
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('tab-' + tab);
  if (tabEl) tabEl.classList.add('active');
  activateSection(tab);
}

function activateSection(tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const secMap = {
    diary:'diarySection', notes:'notesSection',
    schedule:'scheduleSection', finance:'financeSection', more:'moreSection'
  };
  const sec = document.getElementById(secMap[tab]);
  if (sec) sec.classList.add('active');
  if (tab === 'diary')    renderDiaryList();
  if (tab === 'notes')    renderNotesList();
  if (tab === 'schedule') { renderTimetable(); renderScheduleList(); }
  if (tab === 'finance')  { renderFinanceSummary(); renderFinanceList(); }
}

// ==========================
// ===== 图片上传通用逻辑 =====
// ==========================
function handleImgUpload(event, type) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  const arr = type === 'diary' ? diaryImages : noteImages;
  const previewEl = document.getElementById(type === 'diary' ? 'diaryImgPreview' : 'noteImgPreview');

  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      arr.push({ dataUrl: e.target.result, name: file.name });
      renderImgPreview(type);
    };
    reader.readAsDataURL(file);
  });
  // 清空 input 以便重复选同一文件
  event.target.value = '';
}

function renderImgPreview(type) {
  const arr = type === 'diary' ? diaryImages : noteImages;
  const el  = document.getElementById(type === 'diary' ? 'diaryImgPreview' : 'noteImgPreview');
  el.innerHTML = arr.map((img, i) => `
    <div class="img-preview-item">
      <img src="${img.dataUrl}" alt="${escHtml(img.name)}" />
      <div class="img-preview-remove" onclick="removeImg(${i},'${type}')">✕</div>
    </div>`).join('');
}

function removeImg(idx, type) {
  if (type === 'diary') { diaryImages.splice(idx, 1); renderImgPreview('diary'); }
  else                  { noteImages.splice(idx, 1);  renderImgPreview('note');  }
}

// ==========================
// ===== 日记模块 =====
// ==========================
function getDiaries() { return DB.get(userKey('diaries')) || []; }
function saveDiaries(l) { DB.set(userKey('diaries'), l); }

function renderDiaryList() {
  const list = getDiaries();
  const q = (document.getElementById('diarySearch').value || '').toLowerCase();
  const filtered = list
    .filter(d => !q || d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
    .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  const el = document.getElementById('diaryList');
  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">📓</span><p>${q?'没有找到相关日记':'还没有日记，点右上角开始记录'}</p></div>`;
    return;
  }
  el.innerHTML = filtered.map(d => {
    const imgs = d.images && d.images.length
      ? `<div class="diary-img-strip">${d.images.slice(0,4).map(img=>`<img class="diary-img-thumb" src="${img.dataUrl}" />`).join('')}</div>`
      : '';
    return `<div class="card" onclick="openDiaryEditor('${d.id}')">
      <div class="diary-card-top">
        <div class="diary-card-title">${escHtml(d.title)||'无标题'}</div>
        <div class="diary-card-meta">
          <span class="diary-mood">${d.mood}</span>
          <span class="diary-date">${formatRelTime(d.createdAt)}</span>
        </div>
      </div>
      <div class="diary-preview">${escHtml(d.content)}</div>
      ${imgs}
      <div class="diary-weather">${d.weather} · ${new Date(d.createdAt).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'})}</div>
      <div class="card-actions">
        <button class="action-btn edit" onclick="event.stopPropagation();openDiaryEditor('${d.id}')">✏️</button>
        <button class="action-btn delete" onclick="event.stopPropagation();deleteDiary('${d.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function openDiaryEditor(id) {
  editingDiaryId = id || null;
  const d = id ? getDiaries().find(x=>x.id===id) : null;
  document.getElementById('diaryModalTitle').textContent = d ? '编辑日记' : '新建日记';
  document.getElementById('diaryTitleInput').value  = d ? d.title   : '';
  document.getElementById('diaryContentInput').value = d ? d.content : '';
  document.getElementById('diaryWeather').value = d ? d.weather : '☀️';
  selectedMood = d ? d.mood : '😊';
  diaryImages = d && d.images ? JSON.parse(JSON.stringify(d.images)) : [];
  document.querySelectorAll('.mood-opt').forEach(e=>e.classList.toggle('selected', e.dataset.mood===selectedMood));
  renderImgPreview('diary');
  openModal('diaryModal');
  setTimeout(()=>document.getElementById('diaryTitleInput').focus(), 80);
}

function selectMood(el) {
  document.querySelectorAll('.mood-opt').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected'); selectedMood = el.dataset.mood;
}

function saveDiary() {
  const title   = document.getElementById('diaryTitleInput').value.trim();
  const content = document.getElementById('diaryContentInput').value.trim();
  const weather = document.getElementById('diaryWeather').value;
  if (!content && !diaryImages.length) { showToast('请写点内容或添加图片 ✍️'); return; }
  const list = getDiaries();
  if (editingDiaryId) {
    const i = list.findIndex(d=>d.id===editingDiaryId);
    if (i>-1) list[i] = {...list[i], title, content, mood:selectedMood, weather, images:[...diaryImages], updatedAt:new Date().toISOString()};
  } else {
    list.unshift({id:uuid(), title, content, mood:selectedMood, weather, images:[...diaryImages], createdAt:new Date().toISOString()});
  }
  saveDiaries(list);
  closeModal('diaryModal');
  renderDiaryList();
  showToast(editingDiaryId ? '日记已更新 ✅' : '日记已保存 📝');
}

function deleteDiary(id) {
  saveDiaries(getDiaries().filter(d=>d.id!==id));
  renderDiaryList(); showToast('日记已删除 🗑️');
}

// ==========================
// ===== 随手记 =====
// ==========================
function getNotes() { return DB.get(userKey('notes')) || []; }
function saveNotes(l) { DB.set(userKey('notes'), l); }

function renderNotesList() {
  const q = (document.getElementById('notesSearch').value||'').toLowerCase();
  const list = getNotes()
    .filter(n => !q || (n.title||'').toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const el = document.getElementById('notesList');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">✏️</span><p>${q?'没有匹配的便签':'还没有便签，点右上角新建'}</p></div>`;
    return;
  }
  el.innerHTML = list.map(n => {
    const imgHtml = n.images && n.images.length
      ? `<img class="note-img-thumb" src="${n.images[0].dataUrl}" />`
      : '';
    return `<div class="note-card note-bg-${n.color}" onclick="openNoteEditor('${n.id}')">
      ${n.title?`<div class="note-card-title">${escHtml(n.title)}</div>`:''}
      <div class="note-card-content">${escHtml(n.content)}</div>
      ${imgHtml}
      <div class="note-card-date">${formatRelTime(n.createdAt)}</div>
      <div class="card-actions">
        <button class="action-btn edit" onclick="event.stopPropagation();openNoteEditor('${n.id}')">✏️</button>
        <button class="action-btn delete" onclick="event.stopPropagation();deleteNote('${n.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function openNoteEditor(id) {
  editingNoteId = id || null;
  const n = id ? getNotes().find(x=>x.id===id) : null;
  document.getElementById('noteModalTitle').textContent = n ? '编辑便签' : '新建便签';
  document.getElementById('noteTitleInput').value   = n ? n.title   : '';
  document.getElementById('noteContentInput').value = n ? n.content : '';
  selectedNoteColor = n ? n.color : 'white';
  noteImages = n && n.images ? JSON.parse(JSON.stringify(n.images)) : [];
  document.querySelectorAll('.color-opt').forEach(e=>e.classList.toggle('selected', e.dataset.color===selectedNoteColor));
  renderImgPreview('note');
  openModal('noteModal');
  setTimeout(()=>document.getElementById('noteContentInput').focus(), 80);
}

function selectNoteColor(el) {
  document.querySelectorAll('.color-opt').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected'); selectedNoteColor = el.dataset.color;
}

function saveNote() {
  const title   = document.getElementById('noteTitleInput').value.trim();
  const content = document.getElementById('noteContentInput').value.trim();
  if (!content && !noteImages.length) { showToast('请写点内容或添加图片'); return; }
  const list = getNotes();
  if (editingNoteId) {
    const i = list.findIndex(n=>n.id===editingNoteId);
    if (i>-1) list[i] = {...list[i], title, content, color:selectedNoteColor, images:[...noteImages], updatedAt:new Date().toISOString()};
  } else {
    list.unshift({id:uuid(), title, content, color:selectedNoteColor, images:[...noteImages], createdAt:new Date().toISOString()});
  }
  saveNotes(list);
  closeModal('noteModal');
  renderNotesList();
  showToast(editingNoteId ? '便签已更新' : '便签已保存 ✅');
}

function deleteNote(id) {
  saveNotes(getNotes().filter(n=>n.id!==id));
  renderNotesList(); showToast('便签已删除 🗑️');
}

// ==========================
// ===== 日程 - 课程表 =====
// ==========================
function getSchedules() { return DB.get(userKey('schedules')) || []; }
function saveSchedules(l) { DB.set(userKey('schedules'), l); }

const TT_START_HOUR  = 8;
const TT_END_HOUR    = 22;
const TT_SLOT_HEIGHT = 52; // px per hour

function getWeekStart(offset=0) {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day===0?6:day-1) + offset*7);
  monday.setHours(0,0,0,0);
  return monday;
}

function changeWeek(delta) {
  currentWeekOffset += delta;
  renderTimetable(); renderScheduleList();
}
function goToToday() {
  currentWeekOffset = 0;
  renderTimetable(); renderScheduleList();
}

// ===== 渲染课程表 =====
function renderTimetable() {
  const ws = getWeekStart(currentWeekOffset);
  const today = new Date(); today.setHours(0,0,0,0);
  const isCurrentWeek = currentWeekOffset === 0;

  // 周标签
  const we = new Date(ws); we.setDate(ws.getDate()+6);
  document.getElementById('weekLabel').textContent = isCurrentWeek ? '本周' :
    `${ws.toLocaleDateString('zh-CN',{month:'short',day:'numeric'})} – ${we.toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}`;

  // 表头
  const DAYS = ['一','二','三','四','五','六','日'];
  const headerEl = document.getElementById('timetableHeader');
  let headerHTML = '<div class="tt-header-cell"></div>';
  for (let i=0; i<7; i++) {
    const d = new Date(ws); d.setDate(ws.getDate()+i);
    const isToday = d.getTime()===today.getTime();
    headerHTML += `<div class="tt-header-cell ${isToday?'today-col':''}">
      ${DAYS[i]}<span class="tt-header-date">${d.getDate()}</span>
    </div>`;
  }
  headerEl.innerHTML = headerHTML;

  // 时间轴
  const timesEl = document.getElementById('timetableTimes');
  let timesHTML = '';
  for (let h=TT_START_HOUR; h<TT_END_HOUR; h++) {
    timesHTML += `<div class="tt-time-slot">${h}</div>`;
  }
  timesEl.innerHTML = timesHTML;

  // 格子
  const gridEl = document.getElementById('timetableGrid');
  gridEl.style.height = (TT_END_HOUR-TT_START_HOUR)*TT_SLOT_HEIGHT + 'px';

  let gridHTML = '';
  for (let col=0; col<7; col++) {
    const d = new Date(ws); d.setDate(ws.getDate()+col);
    const isToday = d.getTime()===today.getTime();
    const dateStr = d.toISOString().slice(0,10);
    gridHTML += `<div class="tt-col ${isToday?'today-col':''}" data-date="${dateStr}">`;
    for (let h=0; h<(TT_END_HOUR-TT_START_HOUR); h++) {
      gridHTML += `<div class="tt-row-line" style="top:${h*TT_SLOT_HEIGHT}px"></div>`;
    }
    // 点击空白区域快速添加日程
    gridHTML += `<div class="tt-col-clickzone" onclick="onTimetableColClick(event,'${dateStr}')"></div>`;
    gridHTML += '</div>';
  }
  gridEl.innerHTML = gridHTML;

  // 渲染事件块
  const allScheds = getSchedules();
  const cols = gridEl.querySelectorAll('.tt-col');

  for (let col=0; col<7; col++) {
    const d = new Date(ws); d.setDate(ws.getDate()+col);
    const dateStr = d.toISOString().slice(0,10);
    const dow = d.getDay();

    const dayEvents = allScheds.filter(s => {
      if (s.schedType==='once')   return s.date===dateStr;
      if (s.schedType==='daily')  return true;
      if (s.schedType==='weekly') return s.weekdays && s.weekdays.includes(dow);
      return false;
    });

    dayEvents.forEach(ev => {
      const block = createEventBlock(ev);
      if (block) cols[col].appendChild(block);
    });
  }

  // 当前时间线
  if (isCurrentWeek) {
    const now = new Date();
    const nowH = now.getHours() + now.getMinutes()/60;
    if (nowH >= TT_START_HOUR && nowH < TT_END_HOUR) {
      const todayDow = today.getDay();
      const colIdx   = todayDow===0 ? 6 : todayDow-1;
      const top      = (nowH - TT_START_HOUR) * TT_SLOT_HEIGHT;
      const line     = document.createElement('div');
      line.className = 'tt-now-line'; line.style.top = top + 'px';
      line.innerHTML = '<div class="tt-now-dot"></div>';
      cols[colIdx].appendChild(line);
    }
  }
}

// ===== 点击课程表空白区域快速添加 =====
function onTimetableColClick(event, dateStr) {
  // 如果点到的是事件块，不触发
  if (event.target.classList.contains('tt-event') || event.target.closest('.tt-event')) return;

  // 根据点击 Y 坐标计算时间
  const col = event.currentTarget.closest('.tt-col');
  const colRect = col.getBoundingClientRect();
  const relY = event.clientY - colRect.top + col.parentElement.parentElement.scrollTop;
  const hourOffset = relY / TT_SLOT_HEIGHT;
  const startH = Math.floor(TT_START_HOUR + hourOffset);
  const startM = Math.round(((TT_START_HOUR + hourOffset) - startH) * 60 / 15) * 15;
  const clampedH = Math.min(Math.max(startH, TT_START_HOUR), TT_END_HOUR - 1);
  const timeStart = `${String(clampedH).padStart(2,'0')}:${String(startM%60).padStart(2,'0')}`;
  const endH = Math.min(clampedH + 1, TT_END_HOUR);
  const timeEnd   = `${String(endH).padStart(2,'0')}:00`;

  // 打开日程编辑器，预填日期和时间
  openScheduleEditorWithPreset(dateStr, timeStart, timeEnd);
}

function openScheduleEditorWithPreset(dateStr, timeStart, timeEnd) {
  editingScheduleId = null;
  schedType = 'once';
  selectedWeekdays = [];
  selectedSchedColor = 'blue';

  document.getElementById('scheduleModalTitle').textContent = '添加日程';
  document.getElementById('scheduleTitle').value = '';
  document.getElementById('scheduleDate').value  = dateStr;
  document.getElementById('scheduleTimeStart').value = timeStart;
  document.getElementById('scheduleTimeEnd').value   = timeEnd;
  document.getElementById('scheduleNote').value = '';

  document.querySelectorAll('.sched-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type==='once'));
  updateSchedTypeFields();
  document.querySelectorAll('.wd-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.sched-color-opt').forEach(b => b.classList.toggle('selected', b.dataset.c==='blue'));

  openModal('scheduleModal');
  setTimeout(()=>document.getElementById('scheduleTitle').focus(), 80);
}

function createEventBlock(ev) {
  if (!ev.timeStart) return null;
  const [sh,sm] = ev.timeStart.split(':').map(Number);
  const startH = sh + sm/60;
  if (startH < TT_START_HOUR || startH >= TT_END_HOUR) return null;

  let endH = startH + 1;
  if (ev.timeEnd) {
    const [eh,em] = ev.timeEnd.split(':').map(Number);
    endH = eh + em/60;
  }
  endH = Math.min(endH, TT_END_HOUR);

  const top    = (startH - TT_START_HOUR) * TT_SLOT_HEIGHT;
  const height = Math.max((endH - startH) * TT_SLOT_HEIGHT - 2, 18);

  const el = document.createElement('div');
  el.className = 'tt-event';
  el.dataset.c = ev.color || 'blue';
  el.style.top    = top + 'px';
  el.style.height = height + 'px';
  el.innerHTML = `
    <div class="tt-event-title">${escHtml(ev.title)}</div>
    ${height>30?`<div class="tt-event-time">${ev.timeStart}${ev.timeEnd?'–'+ev.timeEnd:''}</div>`:''}
    ${height>50&&ev.note?`<div class="tt-event-note">${escHtml(ev.note)}</div>`:''}
  `;
  el.onclick = (e) => { e.stopPropagation(); showSchedDetail(ev.id); };
  return el;
}

// 周事项列表
function renderScheduleList() {
  const ws = getWeekStart(currentWeekOffset);
  const dates = Array.from({length:7}, (_,i) => {
    const d = new Date(ws); d.setDate(ws.getDate()+i);
    return d.toISOString().slice(0,10);
  });
  const dows = Array.from({length:7}, (_,i) => {
    const d = new Date(ws); d.setDate(ws.getDate()+i); return d.getDay();
  });

  const all = getSchedules();
  const weekEvents = all.filter(s => {
    if (s.schedType==='once')   return dates.includes(s.date);
    if (s.schedType==='daily')  return true;
    if (s.schedType==='weekly') return s.weekdays && s.weekdays.some(d=>dows.includes(d));
    return false;
  }).sort((a,b) => (a.timeStart||'99:99').localeCompare(b.timeStart||'99:99'));

  document.getElementById('scheduleListTitle').textContent = currentWeekOffset===0 ? '本周全部日程' : '当周全部日程';

  const el = document.getElementById('scheduleList');
  if (!weekEvents.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">🗓️</span><p>本周还没有日程</p></div>`;
    return;
  }

  const colorBar = {blue:'#1d4ed8',green:'#15803d',orange:'#c2410c',pink:'#be185d',purple:'#6d28d9',gray:'#374151'};
  el.innerHTML = weekEvents.map(s => {
    const typeBadge = s.schedType==='daily'  ? '<span class="sched-type-badge daily">每日</span>' :
                      s.schedType==='weekly' ? '<span class="sched-type-badge weekly">每周</span>' : '';
    return `<div class="card">
      <div class="sched-list-card">
        <div class="sched-list-color-bar" style="background:${colorBar[s.color||'blue']}"></div>
        <div class="sched-list-info">
          <div class="sched-list-title">${escHtml(s.title)}${typeBadge}</div>
          <div class="sched-list-meta">
            ${s.timeStart ? s.timeStart+(s.timeEnd?'–'+s.timeEnd:'') : '全天'}
            ${s.schedType==='once'?` · ${formatDateShort(s.date)}`:''}
            ${s.schedType==='weekly'?` · 每周${(s.weekdays||[]).map(d=>['日','一','二','三','四','五','六'][d]).join('、')}`:''}
            ${s.note?' · '+escHtml(s.note):''}
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="action-btn edit" onclick="event.stopPropagation();openScheduleEditor('${s.id}')">✏️</button>
        <button class="action-btn delete" onclick="event.stopPropagation();deleteSchedule('${s.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

// 日程详情弹窗（点击图表事件触发）
function showSchedDetail(id) {
  const s = getSchedules().find(x=>x.id===id);
  if (!s) return;
  document.getElementById('schedDetailTitle').textContent = s.title;
  const typeTxt = s.schedType==='daily' ? '每日固定' :
                  s.schedType==='weekly' ? `每周 ${(s.weekdays||[]).map(d=>['日','一','二','三','四','五','六'][d]).join('、')}` : '单次';
  document.getElementById('schedDetailBody').innerHTML = `
    <div class="sched-detail-row"><span class="sched-detail-label">类型</span><span>${typeTxt}</span></div>
    ${s.schedType==='once'?`<div class="sched-detail-row"><span class="sched-detail-label">日期</span><span>${formatDateShort(s.date)}</span></div>`:''}
    <div class="sched-detail-row"><span class="sched-detail-label">时间</span><span>${s.timeStart||'未设置'}${s.timeEnd?'–'+s.timeEnd:''}</span></div>
    ${s.note?`<div class="sched-detail-row"><span class="sched-detail-label">备注</span><span>${escHtml(s.note)}</span></div>`:''}
  `;
  document.getElementById('schedDetailDelete').onclick = () => { closeModal('schedDetailModal'); deleteSchedule(id); };
  document.getElementById('schedDetailEdit').onclick   = () => { closeModal('schedDetailModal'); openScheduleEditor(id); };
  openModal('schedDetailModal');
}

// 日程编辑弹窗
function openScheduleEditor(id) {
  editingScheduleId = id || null;
  const s = id ? getSchedules().find(x=>x.id===id) : null;
  document.getElementById('scheduleModalTitle').textContent = s ? '编辑日程' : '添加日程';
  document.getElementById('scheduleTitle').value     = s ? s.title     : '';
  document.getElementById('scheduleDate').value      = s && s.schedType==='once' ? s.date : todayStr();
  document.getElementById('scheduleTimeStart').value = s ? s.timeStart||'' : '';
  document.getElementById('scheduleTimeEnd').value   = s ? s.timeEnd||''   : '';
  document.getElementById('scheduleNote').value      = s ? s.note||''      : '';

  schedType          = s ? s.schedType : 'once';
  selectedWeekdays   = s && s.schedType==='weekly' ? [...s.weekdays] : [];
  selectedSchedColor = s ? s.color||'blue' : 'blue';

  document.querySelectorAll('.sched-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type===schedType));
  updateSchedTypeFields();
  document.querySelectorAll('.wd-btn').forEach(b => b.classList.toggle('selected', selectedWeekdays.includes(parseInt(b.dataset.day))));
  document.querySelectorAll('.sched-color-opt').forEach(b => b.classList.toggle('selected', b.dataset.c===selectedSchedColor));

  openModal('scheduleModal');
  setTimeout(()=>document.getElementById('scheduleTitle').focus(), 80);
}

function selectSchedType(el) {
  document.querySelectorAll('.sched-type-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active'); schedType = el.dataset.type;
  updateSchedTypeFields();
}
function updateSchedTypeFields() {
  document.getElementById('schedOnceFields').style.display   = schedType==='once'   ? 'block' : 'none';
  document.getElementById('schedWeeklyFields').style.display = schedType==='weekly' ? 'block' : 'none';
}
function toggleWeekday(el) {
  const d = parseInt(el.dataset.day);
  const idx = selectedWeekdays.indexOf(d);
  if (idx>-1) selectedWeekdays.splice(idx,1); else selectedWeekdays.push(d);
  el.classList.toggle('selected', selectedWeekdays.includes(d));
}
function selectSchedColor(el) {
  document.querySelectorAll('.sched-color-opt').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected'); selectedSchedColor = el.dataset.c;
}

function saveSchedule() {
  const title     = document.getElementById('scheduleTitle').value.trim();
  const date      = document.getElementById('scheduleDate').value;
  const timeStart = document.getElementById('scheduleTimeStart').value;
  const timeEnd   = document.getElementById('scheduleTimeEnd').value;
  const note      = document.getElementById('scheduleNote').value.trim();
  if (!title) { showToast('请输入日程标题'); return; }
  if (schedType==='once'   && !date)                       { showToast('请选择日期'); return; }
  if (schedType==='weekly' && selectedWeekdays.length===0) { showToast('请选择至少一天'); return; }

  const list = getSchedules();
  const item = {
    id: editingScheduleId || uuid(), title, schedType,
    color: selectedSchedColor, timeStart, timeEnd, note,
    createdAt: new Date().toISOString(),
  };
  if (schedType==='once')   item.date = date;
  if (schedType==='weekly') item.weekdays = [...selectedWeekdays];

  if (editingScheduleId) {
    const i = list.findIndex(s=>s.id===editingScheduleId);
    if (i>-1) list[i] = item;
  } else {
    list.push(item);
  }
  saveSchedules(list);
  closeModal('scheduleModal');
  renderTimetable(); renderScheduleList();
  showToast(editingScheduleId ? '日程已更新 ✅' : '日程已添加 🗓️');
}

function deleteSchedule(id) {
  saveSchedules(getSchedules().filter(s=>s.id!==id));
  renderTimetable(); renderScheduleList();
  showToast('日程已删除 🗑️');
}

function deleteFixedSchedule(id) {
  saveSchedules(getSchedules().filter(s=>s.id!==id));
  renderTimetable(); renderScheduleList();
  openFixedScheduleModal(); // 刷新固定日程列表
  showToast('日程已删除 🗑️');
}

function openFixedScheduleModal() {
  const list = getSchedules().filter(s=>s.schedType==='daily'||s.schedType==='weekly');
  const el = document.getElementById('fixedScheduleList');
  const colorBar = {blue:'#1d4ed8',green:'#15803d',orange:'#c2410c',pink:'#be185d',purple:'#6d28d9',gray:'#374151'};
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">📌</span><p>还没有固定日程</p></div>`;
  } else {
    el.innerHTML = list.map(s=>`
      <div class="fixed-item">
        <div class="fixed-item-color" style="background:${colorBar[s.color||'blue']}"></div>
        <div class="fixed-item-info">
          <div class="fixed-item-title">${escHtml(s.title)}</div>
          <div class="fixed-item-meta">
            ${s.schedType==='daily'?'每日':'每周'+(s.weekdays||[]).map(d=>['日','一','二','三','四','五','六'][d]).join('、')}
            ${s.timeStart?' · '+s.timeStart+(s.timeEnd?'–'+s.timeEnd:''):''}
          </div>
        </div>
        <button class="action-btn edit" onclick="closeModal('fixedScheduleModal');openScheduleEditor('${s.id}')">✏️</button>
        <button class="action-btn delete" onclick="event.stopPropagation();deleteFixedSchedule('${s.id}')">🗑️</button>
      </div>`).join('');
  }
  openModal('fixedScheduleModal');
}

// ==========================
// ===== 记账 =====
// ==========================
function getFinances() { return DB.get(userKey('finances')) || []; }
function saveFinances(l) { DB.set(userKey('finances'), l); }

function initFinanceMonth() { financeMonth = new Date(); updateMonthLabel(); }
function updateMonthLabel() {
  document.getElementById('currentMonthLabel').textContent =
    financeMonth.toLocaleDateString('zh-CN',{year:'numeric',month:'long'});
}
function changeMonth(delta) {
  financeMonth = new Date(financeMonth.getFullYear(), financeMonth.getMonth()+delta, 1);
  updateMonthLabel(); renderFinanceSummary(); renderFinanceList();
}

function renderFinanceSummary() {
  const y=financeMonth.getFullYear(), m=financeMonth.getMonth();
  const data = getFinances().filter(f=>{ const d=new Date(f.date); return d.getFullYear()===y&&d.getMonth()===m; });
  const income  = data.filter(f=>f.type==='income').reduce((s,f)=>s+f.amount,0);
  const expense = data.filter(f=>f.type==='expense').reduce((s,f)=>s+f.amount,0);
  document.getElementById('monthIncome').textContent  = '¥'+income.toFixed(2);
  document.getElementById('monthExpense').textContent = '¥'+expense.toFixed(2);
  const bal = income - expense;
  document.getElementById('monthBalance').textContent = (bal>=0?'¥':'-¥')+Math.abs(bal).toFixed(2);
}

function renderFinanceList() {
  const y=financeMonth.getFullYear(), m=financeMonth.getMonth();
  const filtered = getFinances()
    .filter(f=>{ const d=new Date(f.date); return d.getFullYear()===y&&d.getMonth()===m; })
    .sort((a,b)=>new Date(b.date)-new Date(a.date));
  const el = document.getElementById('financeList');
  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">💰</span><p>本月暂无账单</p></div>`;
    return;
  }
  el.innerHTML = filtered.map(f=>`
    <div class="card">
      <div class="finance-card">
        <div class="finance-cat-icon ${f.type}">${f.categoryEmoji}</div>
        <div class="finance-info">
          <div class="finance-info-top">
            <span class="finance-category">${escHtml(f.category)}</span>
            <span class="finance-amount ${f.type}">${f.type==='expense'?'-':'+'}¥${f.amount.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
            <span class="finance-note">${escHtml(f.note)||''}</span>
            <span class="finance-date-small">${new Date(f.date).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}</span>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="action-btn edit" onclick="event.stopPropagation();openFinanceEditor('${f.id}')">✏️</button>
        <button class="action-btn delete" onclick="event.stopPropagation();deleteFinance('${f.id}')">🗑️</button>
      </div>
    </div>`).join('');
}

function openFinanceEditor(id) {
  editingFinanceId = id || null;
  const f = id ? getFinances().find(x=>x.id===id) : null;
  document.getElementById('financeModalTitle').textContent = f ? '编辑账单' : '添加账单';

  if (f) {
    // 编辑模式：回填数据
    document.getElementById('financeAmount').value = f.amount;
    document.getElementById('financeNote').value   = f.note || '';
    document.getElementById('financeDate').value   = f.date;
    selectedFinanceType = f.type;

    // 找回分类索引
    const groups = f.type==='expense' ? EXPENSE_GROUPS : INCOME_GROUPS;
    let idx = 0, found = null;
    for (const g of groups) {
      for (const c of g.cats) {
        if (c.label === f.category) { found = idx; break; }
        idx++;
      }
      if (found !== null) break;
    }
    selectedCategory = found;
  } else {
    // 新增模式
    document.getElementById('financeAmount').value = '';
    document.getElementById('financeNote').value   = '';
    document.getElementById('financeDate').value   = todayStr();
    selectedFinanceType = 'expense';
    selectedCategory = null;
  }

  document.getElementById('expenseBtn').classList.toggle('active', selectedFinanceType==='expense');
  document.getElementById('incomeBtn').classList.toggle('active', selectedFinanceType==='income');
  renderCategoryGrid();
  openModal('financeModal');
  setTimeout(()=>document.getElementById('financeAmount').focus(), 80);
}

function selectFinanceType(type) {
  selectedFinanceType = type; selectedCategory = null;
  document.getElementById('expenseBtn').classList.toggle('active', type==='expense');
  document.getElementById('incomeBtn').classList.toggle('active', type==='income');
  renderCategoryGrid();
}

// 渲染分类网格（支持分组）
function renderCategoryGrid() {
  const groups = selectedFinanceType==='expense' ? EXPENSE_GROUPS : INCOME_GROUPS;
  let html = '';
  let globalIdx = 0;
  groups.forEach(group => {
    html += `<div class="cat-group-title">${group.label}</div>`;
    html += `<div class="category-grid">`;
    group.cats.forEach(c => {
      const idx = globalIdx;
      html += `<div class="cat-item ${selectedCategory===idx?'selected':''}" onclick="selectCat(${idx})">
        <span class="cat-emoji">${c.emoji}</span>
        <span class="cat-label">${c.label}</span>
      </div>`;
      globalIdx++;
    });
    html += `</div>`;
  });
  document.getElementById('categoryGrid').innerHTML = html;
}

function selectCat(idx) { selectedCategory = idx; renderCategoryGrid(); }

// 通过全局索引获取分类
function getCatByGlobalIdx(type, idx) {
  const groups = type==='expense' ? EXPENSE_GROUPS : INCOME_GROUPS;
  let i = 0;
  for (const g of groups) {
    for (const c of g.cats) {
      if (i === idx) return c;
      i++;
    }
  }
  return null;
}

function saveFinance() {
  const amount = parseFloat(document.getElementById('financeAmount').value);
  const note   = document.getElementById('financeNote').value.trim();
  const date   = document.getElementById('financeDate').value;
  if (!amount || amount<=0) { showToast('请输入有效金额'); return; }
  if (selectedCategory === null) { showToast('请选择分类'); return; }
  if (!date) { showToast('请选择日期'); return; }
  const cat  = getCatByGlobalIdx(selectedFinanceType, selectedCategory);
  if (!cat) { showToast('分类错误，请重新选择'); return; }
  const list = getFinances();
  if (editingFinanceId) {
    const i = list.findIndex(f=>f.id===editingFinanceId);
    if (i>-1) {
      list[i] = { ...list[i], type: selectedFinanceType, amount, category: cat.label, categoryEmoji: cat.emoji, note, date, updatedAt: new Date().toISOString() };
    }
  } else {
    list.push({
      id: uuid(), type: selectedFinanceType,
      amount, category: cat.label, categoryEmoji: cat.emoji,
      note, date, createdAt: new Date().toISOString()
    });
  }
  saveFinances(list);
  closeModal('financeModal');
  renderFinanceSummary(); renderFinanceList();
  showToast(editingFinanceId ? '账单已更新 ✅' : '账单已添加 ✅');
}

function deleteFinance(id) {
  saveFinances(getFinances().filter(f=>f.id!==id));
  renderFinanceSummary(); renderFinanceList();
  showToast('账单已删除 🗑️');
}

// ===== 导出数据 =====
function exportData() {
  const data = {
    diaries:   DB.get(userKey('diaries'))||[],
    notes:     DB.get(userKey('notes'))||[],
    schedules: DB.get(userKey('schedules'))||[],
    finances:  DB.get(userKey('finances'))||[],
    exportAt:  new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `myspace_${currentUser}_${todayStr()}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('数据已导出 📤');
}

// ==========================
// ===== WiFi 同步（局域网 WebRTC） =====
// ==========================
let wifiSyncMode = 'send'; // 'send' | 'receive'
let myPeerId = null;
let peerConnection = null;
let dataChannel = null;
let isReceiving = false;

// 简单的信令服务器模拟（使用 localStorage 作为同设备测试，实际使用 WebSocket 或轮询）
// 这里我们使用一种基于随机码的本地发现机制
const SYNC_SERVER_URL = 'wss://ws.postman-echo.com/raw'; // 公共测试 WebSocket，实际应自建

function openWifiSyncModal() {
  openModal('wifiSyncModal');
  refreshSyncCode();
  resetSyncUI();
}

function switchSyncMode(mode) {
  wifiSyncMode = mode;
  document.getElementById('modeSend').classList.toggle('active', mode === 'send');
  document.getElementById('modeReceive').classList.toggle('active', mode === 'receive');
  document.getElementById('sendPanel').style.display = mode === 'send' ? 'block' : 'none';
  document.getElementById('receivePanel').style.display = mode === 'receive' ? 'block' : 'none';
  resetSyncUI();
}

function resetSyncUI() {
  document.getElementById('sendStatus').textContent = '';
  document.getElementById('sendStatus').className = 'sync-status';
  document.getElementById('receiveStatus').textContent = isReceiving ? '正在接收连接...' : '点击「开始接收」启动服务';
  document.getElementById('receiveStatus').className = isReceiving ? 'sync-status waiting' : 'sync-status';
  document.getElementById('syncProgress').style.display = 'none';
  document.getElementById('progressFill').style.width = '0%';
}

function refreshSyncCode() {
  // 生成4位随机码
  myPeerId = Math.random().toString(36).substring(2, 6).toUpperCase();
  document.getElementById('mySyncCode').textContent = myPeerId;
}

// 使用 BroadcastChannel API 实现同局域网发现（现代浏览器支持）
// 对于跨设备，使用 WebRTC + 手动信令
let broadcastChannel = null;

function initBroadcastChannel() {
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel('myspace_wifi_sync');
      broadcastChannel.onmessage = handleBroadcastMessage;
    } catch (e) {
      console.log('BroadcastChannel not supported');
    }
  }
}

function handleBroadcastMessage(event) {
  const msg = event.data;
  if (!msg || msg.type !== 'myspace_sync') return;
  
  // 验证账号
  if (msg.username !== currentUser) return;
  
  switch (msg.action) {
    case 'discover':
      // 接收方响应发现请求
      if (isReceiving && msg.targetCode === myPeerId) {
        broadcastChannel.postMessage({
          type: 'myspace_sync',
          action: 'discover_response',
          code: myPeerId,
          username: currentUser,
          to: msg.from
        });
      }
      break;
      
    case 'discover_response':
      // 发送方收到响应
      if (msg.to === myPeerId) {
        onPeerDiscovered(msg.code);
      }
      break;
      
    case 'offer':
      // 接收方收到 WebRTC offer
      if (isReceiving && msg.targetCode === myPeerId) {
        handleWebRTCOffer(msg.offer, msg.from);
      }
      break;
      
    case 'answer':
      // 发送方收到 answer
      if (msg.to === myPeerId) {
        handleWebRTCAnswer(msg.answer);
      }
      break;
      
    case 'ice_candidate':
      handleICECandidate(msg.candidate, msg.to);
      break;
      
    case 'sync_data':
      if (msg.to === myPeerId || isReceiving) {
        receiveSyncData(msg.data);
      }
      break;
  }
}

// 开始接收模式
async function startReceiveSync() {
  initBroadcastChannel();
  isReceiving = true;
  
  document.getElementById('startReceiveBtn').style.display = 'none';
  document.getElementById('stopReceiveBtn').style.display = 'block';
  document.getElementById('receiveStatus').textContent = '正在等待连接... (连接码: ' + myPeerId + ')';
  document.getElementById('receiveStatus').className = 'sync-status waiting';
  
  showToast('已启动接收服务，连接码: ' + myPeerId);
}

function stopReceiveSync() {
  isReceiving = false;
  closePeerConnection();
  
  document.getElementById('startReceiveBtn').style.display = 'block';
  document.getElementById('stopReceiveBtn').style.display = 'none';
  document.getElementById('receiveStatus').textContent = '已停止接收';
  document.getElementById('receiveStatus').className = 'sync-status';
}

// 开始发送模式
async function startSendSync() {
  const targetCode = document.getElementById('targetCode').value.trim().toUpperCase();
  if (!targetCode || targetCode.length !== 4) {
    showToast('请输入4位连接码');
    return;
  }
  
  initBroadcastChannel();
  myPeerId = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  const statusEl = document.getElementById('sendStatus');
  statusEl.textContent = '正在查找设备...';
  statusEl.className = 'sync-status syncing';
  
  // 发送发现请求
  broadcastChannel.postMessage({
    type: 'myspace_sync',
    action: 'discover',
    from: myPeerId,
    targetCode: targetCode,
    username: currentUser
  });
  
  // 等待响应（3秒超时）
  setTimeout(() => {
    if (statusEl.textContent === '正在查找设备...') {
      statusEl.textContent = '未找到设备，请检查连接码或确保在同一网络';
      statusEl.className = 'sync-status error';
    }
  }, 3000);
}

function onPeerDiscovered(peerCode) {
  const statusEl = document.getElementById('sendStatus');
  statusEl.textContent = '找到设备，正在建立连接...';
  statusEl.className = 'sync-status syncing';
  
  // 创建 WebRTC 连接
  createPeerConnection(peerCode, true);
}

// WebRTC 连接
function createPeerConnection(targetCode, isInitiator) {
  closePeerConnection();
  
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  peerConnection = new RTCPeerConnection(config);
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      broadcastChannel.postMessage({
        type: 'myspace_sync',
        action: 'ice_candidate',
        candidate: event.candidate,
        from: myPeerId,
        to: targetCode
      });
    }
  };
  
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === 'connected') {
      onPeerConnected(isInitiator);
    } else if (state === 'failed' || state === 'disconnected') {
      onPeerDisconnected();
    }
  };
  
  if (isInitiator) {
    // 创建数据通道
    dataChannel = peerConnection.createDataChannel('sync', {
      ordered: true
    });
    setupDataChannel(dataChannel, true);
    
    // 创建 offer
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        broadcastChannel.postMessage({
          type: 'myspace_sync',
          action: 'offer',
          offer: peerConnection.localDescription,
          from: myPeerId,
          targetCode: targetCode,
          username: currentUser
        });
      });
  } else {
    // 接收方等待数据通道
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel(dataChannel, false);
    };
  }
}

async function handleWebRTCOffer(offer, from) {
  createPeerConnection(from, false);
  
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  
  broadcastChannel.postMessage({
    type: 'myspace_sync',
    action: 'answer',
    answer: answer,
    from: myPeerId,
    to: from
  });
  
  document.getElementById('receiveStatus').textContent = '正在建立安全连接...';
}

async function handleWebRTCAnswer(answer) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleICECandidate(candidate, to) {
  if (peerConnection && candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  }
}

function setupDataChannel(channel, isSender) {
  channel.onopen = () => {
    if (isSender) {
      sendSyncData();
    }
  };
  
  channel.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleDataChannelMessage(msg, isSender);
  };
  
  channel.onclose = () => {
    onPeerDisconnected();
  };
}

function onPeerConnected(isSender) {
  if (isSender) {
    document.getElementById('sendStatus').textContent = '已连接，正在同步数据...';
    document.getElementById('sendStatus').className = 'sync-status connected';
    document.getElementById('syncProgress').style.display = 'block';
  } else {
    document.getElementById('receiveStatus').textContent = '已连接，等待接收数据...';
    document.getElementById('receiveStatus').className = 'sync-status connected';
  }
}

function onPeerDisconnected() {
  if (wifiSyncMode === 'send') {
    const statusEl = document.getElementById('sendStatus');
    if (!statusEl.textContent.includes('完成')) {
      statusEl.textContent = '连接已断开';
      statusEl.className = 'sync-status error';
    }
  } else {
    document.getElementById('receiveStatus').textContent = '连接已断开';
    document.getElementById('receiveStatus').className = 'sync-status';
  }
}

function closePeerConnection() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

// 发送同步数据
function sendSyncData() {
  const data = {
    diaries: DB.get(userKey('diaries')) || [],
    notes: DB.get(userKey('notes')) || [],
    schedules: DB.get(userKey('schedules')) || [],
    finances: DB.get(userKey('finances')) || [],
    syncAt: new Date().toISOString(),
    fromDevice: navigator.userAgent.slice(0, 50)
  };
  
  // 分块发送大数据
  const chunkSize = 16000; // WebRTC 数据通道建议大小
  const jsonStr = JSON.stringify(data);
  const totalChunks = Math.ceil(jsonStr.length / chunkSize);
  
  updateProgress(10, '正在准备数据...');
  
  // 发送元数据
  dataChannel.send(JSON.stringify({
    type: 'metadata',
    totalChunks: totalChunks,
    totalSize: jsonStr.length
  }));
  
  // 分块发送
  let sentChunks = 0;
  for (let i = 0; i < totalChunks; i++) {
    const chunk = jsonStr.slice(i * chunkSize, (i + 1) * chunkSize);
    dataChannel.send(JSON.stringify({
      type: 'chunk',
      index: i,
      data: chunk
    }));
    sentChunks++;
    updateProgress(10 + Math.floor((sentChunks / totalChunks) * 80), `正在发送... ${sentChunks}/${totalChunks}`);
  }
  
  // 发送完成标记
  dataChannel.send(JSON.stringify({ type: 'complete' }));
  updateProgress(100, '同步完成！');
  
  document.getElementById('sendStatus').textContent = '数据同步完成！';
  showToast('数据同步成功 ✅');
  
  setTimeout(() => {
    closePeerConnection();
  }, 2000);
}

// 接收同步数据
let receivingChunks = [];
let receivingMetadata = null;

function handleDataChannelMessage(msg, isSender) {
  if (isSender) {
    // 发送方收到确认
    if (msg.type === 'received') {
      document.getElementById('sendStatus').textContent = '对方已接收数据';
    }
    return;
  }
  
  // 接收方处理消息
  switch (msg.type) {
    case 'metadata':
      receivingChunks = [];
      receivingMetadata = msg;
      document.getElementById('receiveStatus').textContent = `正在接收数据 (0/${msg.totalChunks})...`;
      document.getElementById('syncProgress').style.display = 'block';
      updateProgress(5, '开始接收...');
      break;
      
    case 'chunk':
      receivingChunks[msg.index] = msg.data;
      const receivedCount = receivingChunks.filter(Boolean).length;
      updateProgress(5 + Math.floor((receivedCount / receivingMetadata.totalChunks) * 90), 
        `正在接收... ${receivedCount}/${receivingMetadata.totalChunks}`);
      document.getElementById('receiveStatus').textContent = `正在接收数据 (${receivedCount}/${receivingMetadata.totalChunks})...`;
      break;
      
    case 'complete':
      // 重组数据
      try {
        const jsonStr = receivingChunks.join('');
        const data = JSON.parse(jsonStr);
        receiveSyncData(data);
        
        // 发送确认
        dataChannel.send(JSON.stringify({ type: 'received' }));
        updateProgress(100, '接收完成！');
        document.getElementById('receiveStatus').textContent = '数据接收完成！';
      } catch (e) {
        console.error('Parse error:', e);
        document.getElementById('receiveStatus').textContent = '数据解析失败';
        document.getElementById('receiveStatus').className = 'sync-status error';
      }
      break;
  }
}

function receiveSyncData(data) {
  // 合并数据（与导入逻辑相同）
  let stats = { diaries: 0, notes: 0, schedules: 0, finances: 0 };
  
  if (Array.isArray(data.diaries)) {
    const existing = getDiaries();
    const map = new Map(existing.map(d => [d.id, d]));
    data.diaries.forEach(d => { if (d && d.id) map.set(d.id, d); });
    saveDiaries(Array.from(map.values()));
    stats.diaries = data.diaries.length;
  }
  
  if (Array.isArray(data.notes)) {
    const existing = getNotes();
    const map = new Map(existing.map(n => [n.id, n]));
    data.notes.forEach(n => { if (n && n.id) map.set(n.id, n); });
    saveNotes(Array.from(map.values()));
    stats.notes = data.notes.length;
  }
  
  if (Array.isArray(data.schedules)) {
    const existing = getSchedules();
    const map = new Map(existing.map(s => [s.id, s]));
    data.schedules.forEach(s => { if (s && s.id) map.set(s.id, s); });
    saveSchedules(Array.from(map.values()));
    stats.schedules = data.schedules.length;
  }
  
  if (Array.isArray(data.finances)) {
    const existing = getFinances();
    const map = new Map(existing.map(f => [f.id, f]));
    data.finances.forEach(f => { if (f && f.id) map.set(f.id, f); });
    saveFinances(Array.from(map.values()));
    stats.finances = data.finances.length;
  }
  
  // 刷新当前页面
  if (currentTab === 'diary') renderDiaryList();
  if (currentTab === 'notes') renderNotesList();
  if (currentTab === 'schedule') { renderTimetable(); renderScheduleList(); }
  if (currentTab === 'finance') { renderFinanceSummary(); renderFinanceList(); }
  
  const total = stats.diaries + stats.notes + stats.schedules + stats.finances;
  showToast(`同步成功 ✅ 共${total}条数据`);
  
  setTimeout(() => {
    stopReceiveSync();
    closeModal('wifiSyncModal');
  }, 1500);
}

function updateProgress(percent, text) {
  document.getElementById('progressFill').style.width = percent + '%';
  document.getElementById('progressText').textContent = text;
}

// ===== 导入数据 =====
function importData(input) {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      // 验证数据结构
      if (!data || typeof data !== 'object') {
        showToast('文件格式错误 ❌');
        return;
      }
      
      // 统计导入数量
      let stats = { diaries: 0, notes: 0, schedules: 0, finances: 0 };
      
      // 合并策略：以 id 为唯一标识，新数据覆盖旧数据
      if (Array.isArray(data.diaries)) {
        const existing = getDiaries();
        const map = new Map(existing.map(d => [d.id, d]));
        data.diaries.forEach(d => { if (d && d.id) map.set(d.id, d); });
        saveDiaries(Array.from(map.values()));
        stats.diaries = data.diaries.length;
      }
      
      if (Array.isArray(data.notes)) {
        const existing = getNotes();
        const map = new Map(existing.map(n => [n.id, n]));
        data.notes.forEach(n => { if (n && n.id) map.set(n.id, n); });
        saveNotes(Array.from(map.values()));
        stats.notes = data.notes.length;
      }
      
      if (Array.isArray(data.schedules)) {
        const existing = getSchedules();
        const map = new Map(existing.map(s => [s.id, s]));
        data.schedules.forEach(s => { if (s && s.id) map.set(s.id, s); });
        saveSchedules(Array.from(map.values()));
        stats.schedules = data.schedules.length;
      }
      
      if (Array.isArray(data.finances)) {
        const existing = getFinances();
        const map = new Map(existing.map(f => [f.id, f]));
        data.finances.forEach(f => { if (f && f.id) map.set(f.id, f); });
        saveFinances(Array.from(map.values()));
        stats.finances = data.finances.length;
      }
      
      // 刷新当前页面显示
      renderDiaryList();
      renderNotesList();
      renderTimetable(); renderScheduleList();
      renderFinanceSummary(); renderFinanceList();
      
      const total = stats.diaries + stats.notes + stats.schedules + stats.finances;
      showToast(`导入成功 ✅ 共${total}条数据`);
      
    } catch (err) {
      showToast('文件解析失败 ❌');
      console.error('Import error:', err);
    } finally {
      // 清空 input，允许重复选择同一文件
      input.value = '';
    }
  };
  
  reader.onerror = () => {
    showToast('文件读取失败 ❌');
    input.value = '';
  };
  
  reader.readAsText(file);
}

// ===== 键盘快捷键 =====
document.addEventListener('keydown', e => {
  if (e.key==='Escape') document.querySelectorAll('.modal-overlay.active').forEach(m=>m.classList.remove('active'));
  if (e.key==='Enter' && document.getElementById('authPage').classList.contains('active')) {
    document.getElementById('loginForm').style.display!=='none' ? doLogin() : doRegister();
  }
});
document.getElementById('diaryPinInput').addEventListener('keydown', e => { if(e.key==='Enter') verifyDiaryPin(); });

// ===== 页面加载：恢复会话 =====
window.addEventListener('DOMContentLoaded', () => {
  const u  = sessionStorage.getItem('app_current_user');
  const ul = sessionStorage.getItem('app_diary_unlocked');
  
  // 检查是否有记住的账号密码
  const rememberedUser = localStorage.getItem('app_remember_user');
  const rememberedPwd = localStorage.getItem('app_remember_pwd');
  const autoLogin = localStorage.getItem('app_auto_login') === 'true';
  
  // 填充记住的账号密码
  if (rememberedUser && rememberedPwd) {
    document.getElementById('loginUsername').value = rememberedUser;
    document.getElementById('rememberMe').checked = true;
    document.getElementById('autoLogin').checked = autoLogin;
  }
  
  // 优先恢复当前会话
  if (u && (DB.get('app_users')||{})[u]) {
    currentUser = u;
    isDiaryUnlocked = ul === 'true';
    document.getElementById('navUsername').textContent = u;
    document.getElementById('settingsUsername').textContent = u;
    showPage('mainPage');
    initMainPage();
    return;
  }
  
  // 自动登录
  if (autoLogin && rememberedUser && rememberedPwd) {
    const users = getUsers();
    if (users[rememberedUser] && users[rememberedUser].password === rememberedPwd) {
      currentUser = rememberedUser;
      isDiaryUnlocked = false;
      document.getElementById('navUsername').textContent = rememberedUser;
      document.getElementById('settingsUsername').textContent = rememberedUser;
      showPage('mainPage');
      initMainPage();
      showToast('欢迎回来，' + rememberedUser + ' 👋');
    }
  }
});
window.addEventListener('beforeunload', () => {
  if (currentUser) {
    sessionStorage.setItem('app_current_user', currentUser);
    sessionStorage.setItem('app_diary_unlocked', isDiaryUnlocked ? 'true' : 'false');
  }
});

// ===== 跨标签页同步 =====
window.addEventListener('storage', e => {
  if (!currentUser) return;
  const watchKeys = [userKey('diaries'),userKey('notes'),userKey('schedules'),userKey('finances')];
  if (watchKeys.includes(e.key)) {
    if (currentTab==='diary')    renderDiaryList();
    if (currentTab==='notes')    renderNotesList();
    if (currentTab==='schedule') { renderTimetable(); renderScheduleList(); }
    if (currentTab==='finance')  { renderFinanceSummary(); renderFinanceList(); }
    showToast('已从其他标签页同步 🔄');
  }
});
