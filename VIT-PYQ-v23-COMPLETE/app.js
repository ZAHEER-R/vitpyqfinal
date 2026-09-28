/* VIT PYQ's — production-feel client */
const BADGE_ICON = {
  bronze: '<i class="fas fa-medal" style="color:#cd7f32"></i>',
  silver: '<i class="fas fa-medal" style="color:#c0c0c0"></i>',
  gold: '<i class="fas fa-medal" style="color:#fbbf24"></i>',
  platinum: '<i class="fas fa-gem" style="color:#a78bfa"></i>',
  diamond: '<i class="fas fa-gem" style="color:#22d3ee"></i>',
  ruby: '<i class="fas fa-gem" style="color:#e11d48"></i>'
};
const BADGE_ORDER = ['bronze','silver','gold','platinum','diamond','ruby'];
const ADMIN_EMAIL = 'admin@vitstudent.ac.in';
const ADMIN_PASS = 'admin2026';
const YEARS = [];
for (let y = 2026; y >= 2015; y--) YEARS.push(String(y));
const CAMPUSES = ['Vellore','Chennai','Amaravathi','Bhopal','Bangalore'];

let state = {
  user: null,
  papers: [],
  users: [],
  messages: [],
  privateChats: {},
  activeFriendId: null,
  homeFilters: { cat: [], sem: [], campus: [], year: [], q: '' },
  lbTab: 'uploads',
  pendingFile: null,
  pendingFileData: null,
  carouselIndex: 0,
  carouselTimer: null
};

function load() {
  state.papers = JSON.parse(localStorage.getItem('vitpyq_papers') || '[]');
  state.users = JSON.parse(localStorage.getItem('vitpyq_users') || '[]');
  state.messages = JSON.parse(localStorage.getItem('vitpyq_chat') || '[]');
  state.privateChats = JSON.parse(localStorage.getItem('vitpyq_pchat') || '{}');
  state.users.forEach(u => {
    if (!u.friends) u.friends = [];
    if (!u.requests) u.requests = [];
    if (!u.items) u.items = [];
    if (u.isPublic === undefined) u.isPublic = true;
    if (!u.downloadHistory) u.downloadHistory = [];
    if (!u.uploadHistory) u.uploadHistory = [];
    if (u.terminated === undefined) u.terminated = false;
    if (!u.isAdmin && !u.subUntil) {
      // will be set on first updateUI via ensureSubscription
    }
  });
  state.user = null;
  localStorage.removeItem('vitpyq_uid');
  save();
}

function save() {
  localStorage.setItem('vitpyq_papers', JSON.stringify(state.papers));
  localStorage.setItem('vitpyq_users', JSON.stringify(state.users));
  localStorage.setItem('vitpyq_chat', JSON.stringify(state.messages));
  localStorage.setItem('vitpyq_pchat', JSON.stringify(state.privateChats));
  if (state.user) localStorage.setItem('vitpyq_uid', state.user.id);
  else localStorage.removeItem('vitpyq_uid');
}

function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 2000);
}


function formatCount(n) {
  n = Number(n) || 0;
  if (n <= 1000) return n.toLocaleString();
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(n / 1000) + 'K';
}

function formatWalletBalance(user) {
  return user && user.isAdmin ? 'Unlimited' : (Number(user && user.vcash) || 0).toLocaleString();
}

function openUserProfile(userId) {
  if (!userId) return;
  const u = state.users.find(x => x.id === userId);
  if (!u) { toast('User not found', 'error'); return; }
  if (u.terminated) { toast('This account has been terminated', 'error'); return; }
  openUserModal(u.id);
}

function showPrivateProfileModal(u) {
  const modal = document.getElementById('userModal');
  if (!modal) return;
  document.getElementById('modalName').textContent = u.displayName || u.username;
  document.getElementById('modalAvatar').src = u.avatar || defaultAvatar(u.displayName);
  document.getElementById('modalUser').textContent = '@' + (u.username || '');
  document.getElementById('modalBranch').textContent = 'Private Account';
  document.getElementById('modalVcash').textContent = '—';
  document.getElementById('modalUploads').textContent = '—';
  document.getElementById('modalDownloads').textContent = '—';
  const visits = document.getElementById('modalVisits');
  if (visits) visits.textContent = '—';
  const hist = document.getElementById('modalHistoryBox');
  if (hist) {
    hist.style.display = 'block';
    hist.innerHTML = `<div class="private-msg"><i class="fas fa-lock"></i><p>This account is private.</p>
      <button class="btn-primary" onclick="sendFriendRequest('${u.id}'); closeUserModal();"><i class="fas fa-user-plus"></i> Send Friend Request</button></div>`;
  }
  modal.classList.add('show');
}

function badgeHtml(b) { return BADGE_ICON[b] || BADGE_ICON.bronze; }

function defaultAvatar(name) {
  const initials = (name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="#343a48" width="80" height="80"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#eef0f4" font-size="28" font-family="Inter,sans-serif" font-weight="600">${initials}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function isVitStudentEmail(email) {
  return !!(email && String(email).toLowerCase().endsWith('@vitstudent.ac.in'));
}
function isAdminEmail(email) {
  return !!(email && String(email).toLowerCase() === String(ADMIN_EMAIL).toLowerCase());
}
/** @deprecated use isVitStudentEmail — kept for older call sites */
function isVitEmail(email) {
  return isVitStudentEmail(email);
}


function formatChatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const ageMs = now - d;
  const oneYear = 365.25 * 24 * 60 * 60 * 1000;
  if (ageMs > oneYear || year !== now.getFullYear()) {
    return day + ' ' + month + ' ' + year;
  }
  return day + ' ' + month;
}

function sameChatDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function escapeHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function semLabel(s) {
  return s === 'Fall' ? 'Fall Semester' : s === 'Winter' ? 'Winter Semester' : s;
}
function semIcon(s) {
  return s === 'Fall' ? '<i class="fas fa-leaf"></i>' : '<i class="fas fa-snowflake"></i>';
}

/* ---------- Neural cursor background ---------- */
function initNeural() {
  const canvas = document.getElementById('neuralCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [], mouse = { x: -999, y: -999 };
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('touchmove', e => {
    if (e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
  }, { passive: true });

  const count = Math.min(70, Math.floor((window.innerWidth * window.innerHeight) / 18000));
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.8 + 0.6
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 140) {
        p.vx += dx / dist * 0.02;
        p.vy += dy / dist * 0.02;
      }
      const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
      if (speed > 1.2) { p.vx *= 0.95; p.vy *= 0.95; }
    }
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 110) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(139,124,247,${0.18 * (1 - d/110)})`;
          ctx.lineWidth = 0.8;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(167,139,250,0.55)';
      ctx.fill();
    }
    // lines to cursor
    for (const p of particles) {
      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < 160) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(52,211,153,${0.25 * (1 - d/160)})`;
        ctx.lineWidth = 1;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* Navigation */
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'home') { renderHomePapers(); startCarousel(); }
  else stopCarousel();
  if (id === 'papers') renderPapers();
  if (id === 'store') updateStoreVcash();
  if (id === 'leaderboard') renderLeaderboard();
  if (id === 'chat') renderChat();
  if (id === 'profile') renderProfile();
  if (id === 'admin') renderAdmin();
  closeMenu();
}

function navTo(id) {
  if ((id === 'upload' || id === 'profile' || id === 'store' || id === 'chat') && !state.user) {
    toast('Please login first', 'error');
    showSection('auth');
    return;
  }
  if (id === 'admin' && !(state.user && state.user.isAdmin)) {
    toast('Admin only', 'error');
    return;
  }
  showSection(id);
}

function toggleMobileMenu() {
  document.getElementById('sideMenu').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}
function closeMenu() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

/* Auth */
function switchAuth(mode) {
  document.getElementById('loginTab').classList.toggle('active', mode==='login');
  document.getElementById('regTab').classList.toggle('active', mode==='register');
  document.getElementById('loginForm').classList.toggle('hidden', mode!=='login');
  document.getElementById('registerForm').classList.toggle('hidden', mode!=='register');
}

function googleLogin() {
  const email = prompt('Continue with Google — enter your VIT email (@vitstudent.ac.in only):');
  if (!email) return;
  const em = email.trim().toLowerCase();
  if (!isVitStudentEmail(em)) {
    toast('Google login is only for @vitstudent.ac.in emails. Use email/password for Gmail, Yahoo, Outlook, etc.', 'error');
    return;
  }
  // terminated check
  const banned = JSON.parse(localStorage.getItem('vitpyq_terminated') || '{}');
  if (banned[em]) { alert(banned[em].message || 'Account terminated'); return; }
  let user = state.users.find(u => u.email.toLowerCase() === em);
  if (!user) {
    const uname = em.split('@')[0].replace(/[^a-z0-9]/gi,'').slice(0,12) || 'user';
    user = {
      id: 'u' + Date.now(), firstName: uname, lastName: '', username: uname.toLowerCase(),
      branch: 'VIT', email: em, password: '',
      displayName: uname, avatar: '', badge: 'bronze',
      vcash: 30000, uploads: 0, downloads: 0, visits: 1, isAdmin: isAdminEmail(em), items: [], friends: [], requests: [],
      isPublic: true, downloadHistory: [], uploadHistory: [], terminated: false, notifs: [],
      authVia: 'google'
    };
    state.users.push(user);
  } else {
    if (user.terminated) { toast(user.terminateMsg || 'Account terminated', 'error'); return; }
    user.visits = (user.visits || 0) + 1;
  }
  state.user = user;
  save(); updateUI();
  if (!user._welcomed) {
    toast('Welcome! +30,000 ZX bonus credited', 'success');
    user._welcomed = true;
  } else {
    toast('Welcome, ' + user.displayName + '!', 'success');
  }
  showSection('home');
}

function handleRegister(e) {
  e.preventDefault();
  const first = document.getElementById('regFirst').value.trim();
  const last = document.getElementById('regLast').value.trim();
  const username = document.getElementById('regUser').value.trim().toLowerCase();
  const branch = document.getElementById('regBranch').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPass').value;
  if (!email || !email.includes('@')) { toast('Enter a valid email', 'error'); return; }
  // VIT student emails cannot sign up with password — Google only
  if (isVitStudentEmail(email)) {
    toast('@vitstudent.ac.in accounts must use Continue with Google. Email/password signup is for Gmail, Yahoo, Outlook, etc.', 'error');
    return;
  }
  if (state.users.some(u => u.email === email)) { toast('Email already registered — please login', 'error'); return; }
  if (state.users.some(u => u.username === username)) { toast('Username taken', 'error'); return; }
  if (!password || password.length < 6) { toast('Password min 6 characters', 'error'); return; }
  const user = {
    id: 'u' + Date.now(), firstName: first, lastName: last, username, branch, email, password,
    displayName: (first + ' ' + last).trim(), avatar: '', badge: 'bronze',
    vcash: 30000, uploads: 0, downloads: 0, visits: 1, isAdmin: false, items: [], friends: [], requests: [],
    isPublic: true, downloadHistory: [], uploadHistory: [], terminated: false, notifs: [],
    authVia: 'password'
  };
  state.users.push(user);
  state.user = user;
  save(); updateUI();
  const rf = document.getElementById('registerForm');
  if (rf) rf.reset();
  toast('Account created! +30,000 ZX welcome bonus credited', 'success');
  showSection('home');
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPass').value;
  // VIT student emails (except admin) must use Google — no password login
  if (isVitStudentEmail(email) && !isAdminEmail(email)) {
    toast('@vitstudent.ac.in students must use Continue with Google. Password login is for other emails (Gmail, Yahoo, Outlook…).', 'error');
    return;
  }
  const user = state.users.find(u => u.email === email && u.password === password);
  if (!user) { toast('Invalid email or password', 'error'); return; }
  if (user.terminated) {
    toast(user.terminateMsg || 'Your account has been terminated by Admin.', 'error');
    return;
  }
  user.visits = (user.visits || 0) + 1;
  state.user = user;
  save(); updateUI();
  toast('Welcome back, ' + user.displayName + '!', 'success');
  showSection('home');
}

function logout() {
  state.user = null;
  save(); updateUI();
  toast('Logged out');
  showSection('home');
  closeMenu();
}


/* ===== Subscriptions ===== */
function ensureSubscription(user) {
  if (!user || user.isAdmin) return;
  const now = Date.now();
  const yearMs = 365.25 * 24 * 60 * 60 * 1000;
  const sixMo = 182.625 * 24 * 60 * 60 * 1000;
  if (!user.subUntil) {
    user.subUntil = now + yearMs;
    user.subPlan = '1 Year Free';
    user.subExtensions = 0;
    user.subLastUploadMilestone = 0;
  }
  // Extend for every 30 uploads completed
  const uploads = user.uploads || 0;
  const milestones = Math.floor(uploads / 30);
  const already = user.subLastUploadMilestone || 0;
  if (milestones > already) {
    const extra = milestones - already;
    user.subUntil = Math.max(user.subUntil || now, now) + extra * sixMo;
    user.subExtensions = (user.subExtensions || 0) + extra;
    user.subLastUploadMilestone = milestones;
    user.subPlan = user.subExtensions > 0
      ? '1 Year Free + ' + (user.subExtensions * 6) + ' mo extension'
      : '1 Year Free';
    if (state.user && state.user.id === user.id) {
      toast('+' + (extra * 6) + ' months subscription for uploading 30 papers!', 'success');
    }
  }
  // Sync to state.user if same
  if (state.user && state.user.id === user.id) {
    state.user.subUntil = user.subUntil;
    state.user.subPlan = user.subPlan;
    state.user.subExtensions = user.subExtensions;
    state.user.subLastUploadMilestone = user.subLastUploadMilestone;
  }
}

function formatSubDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function updateSubscriptionUI() {
  const guest = document.getElementById('subGuestMsg');
  const active = document.getElementById('subActiveMsg');
  if (!guest || !active) return;
  if (!state.user) {
    guest.style.display = 'block';
    active.style.display = 'none';
    return;
  }
  ensureSubscription(state.user);
  const u = state.users.find(x => x.id === state.user.id);
  if (u) ensureSubscription(u);
  guest.style.display = 'none';
  active.style.display = 'block';
  const plan = document.getElementById('subPlanName');
  const till = document.getElementById('subTill');
  const hint = document.getElementById('subHint');
  if (plan) plan.textContent = state.user.subPlan || '1 Year Free';
  if (till) {
    const end = state.user.subUntil;
    const alive = end && end > Date.now();
    till.textContent = alive
      ? 'Valid until ' + formatSubDate(end)
      : 'Expired on ' + formatSubDate(end) + ' — upload 30 papers to extend';
  }
  if (hint) {
    const uploads = state.user.uploads || 0;
    const next = 30 - (uploads % 30);
    if (uploads > 0 && uploads % 30 === 0) {
      hint.textContent = 'Milestone reached! Next +6 months at ' + (uploads + 30) + ' uploads.';
    } else {
      hint.textContent = 'Upload ' + next + ' more paper' + (next === 1 ? '' : 's') + ' for +6 months extension. (' + uploads + '/30 toward next)';
    }
  }
}

function updateUI() {
  const logged = !!state.user;
  document.getElementById('loginBtn').style.display = logged ? 'none' : '';
  document.getElementById('userChip').style.display = logged ? 'flex' : 'none';
  document.getElementById('sideProfile').style.display = logged ? 'flex' : 'none';
  document.getElementById('sideGuest').style.display = logged ? 'none' : 'block';
  document.getElementById('profileLink').style.display = logged ? '' : 'none';
  document.getElementById('logoutLink').style.display = logged ? '' : 'none';
  document.getElementById('adminLink').style.display = (logged && state.user.isAdmin) ? '' : 'none';
  // Keep hamburger available so Admin can always reopen menu after navigation
  const mm = document.querySelector('.mobile-menu-btn');
  if (mm) {
    if (logged && state.user.isAdmin) mm.classList.add('force-show');
    else mm.classList.remove('force-show');
  }
  const nb = document.getElementById('notifBtn');
  if (nb) nb.style.display = logged ? 'flex' : 'none';
  if (logged) updateNotifDot();

  if (logged) {
    const av = state.user.avatar || defaultAvatar(state.user.displayName);
    document.getElementById('navAvatar').src = av;
    document.getElementById('navBadge').innerHTML = badgeHtml(state.user.badge);
    document.getElementById('navUserName').textContent = state.user.displayName.split(' ')[0];
    document.getElementById('sideAvatar').src = av;
    document.getElementById('sideBadge').innerHTML = badgeHtml(state.user.badge);
    document.getElementById('sideName').textContent = state.user.displayName;
    document.getElementById('sideVcash').textContent = formatWalletBalance(state.user) + ' ZX';
  }
  document.getElementById('statStudents').textContent = formatCount(state.users.filter(u => !u.isAdmin).length);
  document.getElementById('statPapers').textContent = formatCount(state.papers.length);
  // New uploads badge
  updateNewUploadsBadge();
  if (state.user && !state.user.isAdmin) ensureSubscription(state.user);
  updateSubscriptionUI();
}

function updateNewUploadsBadge() {
  const threeDays = 24 * 60 * 60 * 1000; /* 24 hours */
  const now = Date.now();
  const count = state.papers.filter(p => p.createdAt && (now - p.createdAt) <= threeDays).length;
  const badge = document.getElementById('newUploadBadge');
  const btn = document.getElementById('newUploadsToggle');
  if (badge) {
    if (count > 0) {
      badge.style.display = 'flex';
      badge.textContent = count > 99 ? '99+' : String(count);
    } else {
      badge.style.display = 'none';
    }
  }
}

/* Home filters + live search */
function buildYearChecks() {
  const box = document.getElementById('yearChecks');
  if (!box) return;
  box.innerHTML = YEARS.map(y =>
    `<label class="fchip"><input type="checkbox" data-filter="year" value="${y}" onchange="applyHomeFilters()" /> ${y}</label>`
  ).join(' ');
}

function toggleFilterBar(force) {
  const bar = document.getElementById('filterBar');
  const btn = document.getElementById('filterToggleBtn');
  if (!bar) return;
  if (force === false) {
    bar.classList.remove('open');
    if (btn) btn.classList.remove('open');
    return;
  }
  bar.classList.toggle('open');
  if (btn) btn.classList.toggle('open', bar.classList.contains('open'));
}

function applyHomeFilters() {
  applyHomeFiltersFromState();
}

function clearHomeFilters() {
  document.querySelectorAll('#filterBar input[type="checkbox"], .filter-bar input[type="checkbox"]').forEach(c => c.checked = false);
  document.querySelectorAll('.campus-pill').forEach(p => p.classList.remove('active'));
  state.homeFilters = { cat: [], sem: [], campus: [], year: [], q: state.homeFilters.q || '' };
  renderHomePapers();
  renderNewHighlight();
}

function filterCampusHome(campus) {
  // Toggle: click same campus again clears filter
  const wasActive = document.querySelector(`.campus-pill[data-campus="${campus}"]`)?.classList.contains('active');
  document.querySelectorAll('.campus-pill').forEach(p => p.classList.remove('active'));
  if (wasActive) {
    state.homeFilters.campus = [];
  } else {
    document.querySelector(`.campus-pill[data-campus="${campus}"]`)?.classList.add('active');
    state.homeFilters.campus = [campus];
  }
  // keep other filters
  applyHomeFiltersFromState();
}

function applyHomeFiltersFromState() {
  // merge checkbox filters with campus from pills
  const f = {
    cat: [],
    sem: [],
    campus: state.homeFilters.campus || [],
    year: [],
    q: state.homeFilters.q || ''
  };
  document.querySelectorAll('input[data-filter="cat"]:checked').forEach(el => f.cat.push(el.value));
  document.querySelectorAll('input[data-filter="sem"]:checked').forEach(el => f.sem.push(el.value));
  document.querySelectorAll('input[data-filter="year"]:checked').forEach(el => f.year.push(el.value));
  // if pills set campus, use that exclusively
  state.homeFilters = f;
  renderHomePapers();
  renderNewHighlight();
}

function liveSearchHome(q) {
  state.homeFilters.q = (q || '').toLowerCase().trim();
  const homeInput = document.getElementById('homeSearch');
  const navInput = document.getElementById('globalSearch');
  if (homeInput && document.activeElement !== homeInput) homeInput.value = q || '';
  if (navInput && document.activeElement !== navInput) navInput.value = q || '';
  renderHomePapers();
}

function filteredPapers(filters) {
  const f = filters || state.homeFilters || {};
  const cats = f.cat || [];
  const sems = f.sem || [];
  const campuses = f.campus || [];
  const years = (f.year || []).map(String);
  const q = (f.q || '').toLowerCase().trim();
  return state.papers.filter(p => {
    if (cats.length && !cats.includes(p.category)) return false;
    if (sems.length && !sems.includes(p.semester)) return false;
    if (campuses.length) {
      const pc = p.campus || 'Vellore';
      if (!campuses.includes(pc)) return false;
    }
    if (years.length && !years.includes(String(p.year))) return false;
    if (q) {
      const hay = ((p.subject || '') + ' ' + (p.code || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function paperCardHtml(p, compact) {
  const catClass = p.category === 'CAT1' ? 'cat1' : p.category === 'CAT2' ? 'cat2' : 'fat';
  const catLabel = p.category === 'CAT1' ? 'CAT 1' : p.category === 'CAT2' ? 'CAT 2' : 'FAT';
  const isPdf = (p.fileName || '').toLowerCase().endsWith('.pdf') || (p.fileData || '').startsWith('data:application/pdf') || (typeof p.fileData === 'string' && p.fileData.includes('.pdf'));
  const isExternal = p.fileData && (p.fileData.startsWith('http://') || p.fileData.startsWith('https://'));
  let thumb;
  const isHttp = p.fileData && /^https?:\/\//i.test(p.fileData);
  const isDataPdf = p.fileData && String(p.fileData).startsWith('data:application/pdf');
  // Mobile-safe paper preview card (never dark blank). Data-URLs can use iframe; remote URLs use styled card.
  const paperCard = `<div class="thumb-paper-card">
      <div class="tpc-top"><i class="fas fa-file-alt"></i> ${escapeHtml((p.code || 'PAPER').toString().slice(0, 16))}</div>
      <div class="tpc-title">${escapeHtml((p.subject || 'Question Paper').toString().slice(0, 42))}</div>
      <div class="tpc-meta">${escapeHtml(String(p.year || ''))} · ${escapeHtml(p.campus || 'VIT')}</div>
    </div>`;
  if (p.fileData && isDataPdf) {
    const base = p.fileData.split('#')[0];
    const src = base + '#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH';
    thumb = paperCard + `<iframe class="pdf-thumb" src="${src}" title="preview" scrolling="no" loading="lazy" onload="var c=this.previousElementSibling;if(c)c.style.display='none'"></iframe>`;
  } else if (p.fileData && isPdf && isHttp) {
    // Remote PDF (Supabase): browsers block embed on many mobiles — show clean paper card only
    thumb = paperCard;
  } else if (p.fileData && !isPdf) {
    thumb = `<img src="${p.fileData}" alt="" draggable="false" />`;
  } else {
    thumb = paperCard;
  }
  const likes = p.likes || 0;
  const liked = state.user && (p.likedBy || []).includes(state.user.id);
  const uploader = state.users.find(u => u.id === p.uploaderId);
  const upName = uploader ? (uploader.username || uploader.displayName || 'User') : 'Unknown';
  const upId = p.uploaderId || '';
  // Star rating average
  const ratings = p.ratings || {};
  const ratingVals = Object.values(ratings).map(Number).filter(n => n >= 1 && n <= 5);
  const ratingCount = ratingVals.length;
  const ratingAvg = ratingCount ? (ratingVals.reduce((a,b)=>a+b,0) / ratingCount) : 0;
  const starsHtml = ratingCount
    ? `<div class="thumb-rating" title="${ratingAvg.toFixed(1)} / 5"><span class="stars">${'★'.repeat(Math.round(ratingAvg))}${'☆'.repeat(5-Math.round(ratingAvg))}</span> <span class="rating-count">(${ratingCount})</span></div>`
    : `<div class="thumb-rating" style="color:var(--muted)"><span class="stars">☆☆☆☆☆</span> <span class="rating-count">(0)</span></div>`;
  return `<div class="paper-thumb-card">
    <div class="thumb-frame">${thumb}</div>
    <div class="thumb-body">
      <div class="thumb-uploader" onclick="event.stopPropagation(); openUserProfile('${upId}')" title="View profile">
        <i class="fas fa-user-circle"></i> <span class="uploader-name">@${escapeHtml(upName)}</span>
      </div>
      <h3>${escapeHtml(p.subject)}</h3>
      <div class="thumb-meta">${escapeHtml(p.code)}${p.attribute ? ' · ' + escapeHtml(p.attribute) : ''} · ${p.year} · ${escapeHtml(p.campus || 'Vellore')}</div>
      ${starsHtml}
      <div class="thumb-tags">
        <span class="tag ${catClass}">${catLabel}</span>
        <span class="tag">${semIcon(p.semester)} ${semLabel(p.semester)}</span>
      </div>
      <div class="thumb-stats">
        <span><i class="fas fa-eye"></i> ${p.views || 0}</span>
        <span><i class="fas fa-download"></i> ${p.downloads || 0}</span>
        <button type="button" class="like-btn ${liked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleLike('${p.id}')">
          <i class="${liked ? 'fas' : 'far'} fa-heart"></i> ${likes}
        </button>
        <button type="button" class="report-btn" title="Report" onclick="event.stopPropagation(); openReportPaper('${p.id}')">
          <i class="far fa-flag"></i>
        </button>
      </div>
      <div class="thumb-actions">
        <button class="btn-outline" onclick="viewPaper('${p.id}')"><i class="fas fa-expand"></i> View</button>
        <button class="btn-primary" onclick="downloadPaper('${p.id}')"><i class="fas fa-download"></i></button>
      </div>
    </div>
  </div>`;
}

function toggleLike(id) {
  if (!state.user) { toast('Login to like', 'error'); showSection('auth'); return; }
  const p = state.papers.find(x => x.id === id);
  if (!p) return;
  if (!p.likedBy) p.likedBy = [];
  const i = p.likedBy.indexOf(state.user.id);
  if (i >= 0) { p.likedBy.splice(i, 1); }
  else { p.likedBy.push(state.user.id); }
  p.likes = p.likedBy.length;
  save();
  renderHomePapers();
  renderPapers();
  renderNewHighlight();
}

function renderNewHighlight() {
  const box = document.getElementById('newHighlight');
  const track = document.getElementById('newTrack');
  if (!box || !track) return;
  const threeDays = 24 * 60 * 60 * 1000; /* 24 hours */
  const now = Date.now();
  let fresh = filteredPapers().filter(p => p.createdAt && (now - p.createdAt) <= threeDays);
  updateNewUploadsBadge();
  if (!fresh.length) {
    track.innerHTML = '<p class="muted" style="padding:0.6rem 0.4rem;">No new uploads in the last 24 hours.</p>';
    return;
  }
  fresh.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  track.innerHTML = fresh.map(p => {
    const uploader = state.users.find(u => u.id === p.uploaderId);
    const upName = uploader ? (uploader.username || uploader.displayName || 'User') : 'Unknown';
    const catLabel = p.category === 'CAT1' ? 'CAT 1' : p.category === 'CAT2' ? 'CAT 2' : 'FAT';
    return `<div class="new-bar-row" onclick="viewPaper('${p.id}')" role="button" tabindex="0">
      <div class="new-bar-main">
        <strong class="new-bar-title">${escapeHtml(p.subject || 'Paper')}</strong>
        <span class="new-bar-meta">${escapeHtml(p.code || '')}${p.attribute ? ' · ' + escapeHtml(p.attribute) : ''} · ${catLabel} · ${p.year || ''}</span>
      </div>
      <div class="new-bar-user" onclick="event.stopPropagation(); openUserProfile('${p.uploaderId || ''}')">
        <i class="fas fa-user-circle"></i> @${escapeHtml(upName)}
      </div>
      <i class="fas fa-chevron-right new-bar-chevron"></i>
    </div>`;
  }).join('');
}

function homePapersPerPage() {
  const w = window.innerWidth || 1200;
  if (w <= 700) return 2;   // phone
  if (w <= 1100) return 3;  // tablet
  return 4;                 // PC / laptop
}

function renderHomePapers() {
  let list = filteredPapers();
  // most liked first, then newest
  list = [...list].sort((a, b) => (b.likes || 0) - (a.likes || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  state._homePapersList = list;
  const track = document.getElementById('carouselTrack');
  const empty = document.getElementById('homePapersEmpty');
  if (!track) return;

  if (!list.length) {
    track.innerHTML = '';
    if (empty) empty.style.display = 'block';
    const dots = document.getElementById('carouselDots');
    if (dots) dots.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const per = homePapersPerPage();
  const pages = Math.max(1, Math.ceil(list.length / per));
  state._homePaperPages = pages;
  if (state.carouselIndex == null || state.carouselIndex >= pages) state.carouselIndex = 0;
  if (state.carouselIndex < 0) state.carouselIndex = 0;

  renderHomePapersPage();
  buildDots(pages);
  renderNewHighlight();
}

function renderHomePapersPage() {
  const track = document.getElementById('carouselTrack');
  if (!track) return;
  const list = state._homePapersList || [];
  const per = homePapersPerPage();
  const pages = Math.max(1, Math.ceil(list.length / per) || 1);
  let page = state.carouselIndex || 0;
  if (page >= pages) page = pages - 1;
  if (page < 0) page = 0;
  state.carouselIndex = page;
  const start = page * per;
  const slice = list.slice(start, start + per);
  // Fixed grid of N cards — NO horizontal scroll
  track.innerHTML = slice.map(p => paperCardHtml(p)).join('');
  track.scrollLeft = 0;
  document.querySelectorAll('#carouselDots span').forEach((d, j) => d.classList.toggle('active', j === page));
}

function buildDots(pages) {
  const dots = document.getElementById('carouselDots');
  if (!dots) return;
  const n = Math.max(1, pages || 1);
  if (n <= 1) { dots.innerHTML = ''; return; }
  dots.innerHTML = Array.from({ length: Math.min(n, 20) }, (_, i) =>
    `<span class="${i === (state.carouselIndex || 0) ? 'active' : ''}" onclick="goDot(${i})"></span>`
  ).join('');
}

function scrollCarouselTo(idx) {
  const pages = state._homePaperPages || 1;
  const i = Math.min(Math.max(0, idx), Math.max(0, pages - 1));
  state.carouselIndex = i;
  renderHomePapersPage();
}

function carouselNext() {
  const pages = state._homePaperPages || 1;
  const next = ((state.carouselIndex || 0) + 1) % pages;
  scrollCarouselTo(next);
}
function carouselPrev() {
  const pages = state._homePaperPages || 1;
  const prev = ((state.carouselIndex || 0) - 1 + pages) % pages;
  scrollCarouselTo(prev);
}
function goDot(i) { scrollCarouselTo(i); }

// Re-layout home papers on resize (per-page count changes)
window.addEventListener('resize', function() {
  if (document.getElementById('home')?.classList.contains('active') && state._homePapersList) {
    const per = homePapersPerPage();
    state._homePaperPages = Math.max(1, Math.ceil((state._homePapersList.length || 0) / per));
    if (state.carouselIndex >= state._homePaperPages) state.carouselIndex = 0;
    renderHomePapersPage();
    buildDots(state._homePaperPages);
  }
});

function startCarousel() {
  stopCarousel();
  state.carouselTimer = setInterval(() => {
    if (!document.getElementById('home')?.classList.contains('active')) return;
    if (state._carouselPaused) return;
    const pages = state._homePaperPages || 1;
    if (pages <= 1) return;
    carouselNext();
  }, 5000);
}
function stopCarousel() {
  if (state.carouselTimer) clearInterval(state.carouselTimer);
  state.carouselTimer = null;
}

/* Pause auto-slide on interaction */
document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('carouselTrack');
  if (track) {
    track.addEventListener('mouseenter', stopCarousel);
    track.addEventListener('mouseleave', () => { if (document.getElementById('home')?.classList.contains('active')) startCarousel(); });
    track.addEventListener('touchstart', stopCarousel, { passive: true });
  }
});

/* All papers page */
function renderPapers() {
  const q = (document.getElementById('paperSearch')?.value || '').toLowerCase();
  let list = state.papers.filter(p => {
    if (!q) return true;
    return (p.subject + ' ' + p.code).toLowerCase().includes(q);
  });
  const grid = document.getElementById('papersGrid');
  const empty = document.getElementById('papersEmpty');
  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = list.map(p => paperCardHtml(p)).join('');
}

function downloadPaper(id) {
  const p = state.papers.find(x => x.id === id);
  if (!p) return;
  p.downloads = (p.downloads || 0) + 1;
  p.views = (p.views || 0) + 1;
  if (state.user) {
    state.user.downloads = (state.user.downloads || 0) + 1;
    if (!state.user.downloadHistory) state.user.downloadHistory = [];
    state.user.downloadHistory.unshift({
      paperId: p.id, name: p.subject, fileName: p.fileName || p.code, ts: Date.now()
    });
    const u = state.users.find(x => x.id === state.user.id);
    if (u) {
      u.downloads = state.user.downloads;
      u.downloadHistory = state.user.downloadHistory;
    }
  }
  save();
  renderHomePapers();
  renderPapers();
  updateUI();
  if (p.fileData) {
    const a = document.createElement('a');
    a.href = p.fileData;
    a.download = (p.code || 'paper') + '_' + p.category + (p.fileName ? p.fileName.slice(p.fileName.lastIndexOf('.')) : '.pdf');
    a.click();
  }
  toast('Download started', 'success');
}

function viewPaper(id) {
  const p = state.papers.find(x => x.id === id);
  if (!p) return;
  state._viewingPaperId = id;
  p.views = (p.views || 0) + 1;
  save();

  const titleEl = document.getElementById('viewTitle');
  const metaEl = document.getElementById('viewMeta');
  if (titleEl) titleEl.textContent = p.subject || 'Paper';
  if (metaEl) metaEl.textContent =
    `${p.code || ''} · ${p.year || ''} · ${semLabel(p.semester)} · ${p.category || ''} · ${p.campus || 'Vellore'} · ${p.views || 0} views · ${p.downloads || 0} downloads`;

  const frame = document.getElementById('viewFrame');
  const obj = document.getElementById('viewObject');
  const img = document.getElementById('viewImg');
  const wrap = document.getElementById('viewViewerWrap');

  const raw = (p.fileData || '').split('#')[0];
  const isPdf = (p.fileName || '').toLowerCase().endsWith('.pdf')
    || raw.startsWith('data:application/pdf')
    || /\.pdf($|\?)/i.test(raw);

  if (state._viewBlobUrl) {
    try { URL.revokeObjectURL(state._viewBlobUrl); } catch (e) {}
    state._viewBlobUrl = null;
  }

  if (frame) {
    frame.removeAttribute('sandbox');
    frame.style.display = 'none';
    frame.src = 'about:blank';
  }
  if (obj) {
    obj.style.display = 'none';
    obj.removeAttribute('data');
  }
  if (img) {
    img.style.display = 'none';
    img.removeAttribute('src');
  }

  const applyPdfUrl = function(url) {
    // Prefer iframe for Chrome PDF viewer controls; object as backup
    if (frame) {
      frame.style.display = 'block';
      frame.style.width = '100%';
      frame.style.height = '100%';
      frame.src = url;
    }
    if (obj) {
      obj.style.display = 'none';
      obj.data = url;
    }
    if (img) img.style.display = 'none';
  };

  if (raw && isPdf) {
    if (raw.startsWith('data:')) {
      applyPdfUrl(raw);
    } else if (/^https?:\/\//i.test(raw)) {
      // Show loading blank then blob (avoids Chrome block + enables scroll)
      if (frame) {
        frame.style.display = 'block';
        frame.src = 'about:blank';
      }
      fetch(raw, { mode: 'cors', credentials: 'omit' })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.blob();
        })
        .then(function(blob) {
          const pdfBlob = (blob.type && blob.type.indexOf('pdf') >= 0)
            ? blob
            : new Blob([blob], { type: 'application/pdf' });
          const objUrl = URL.createObjectURL(pdfBlob);
          state._viewBlobUrl = objUrl;
          if (state._viewingPaperId === id) applyPdfUrl(objUrl);
        })
        .catch(function(err) {
          console.warn('[VIT PYQ] PDF fetch failed', err);
          if (state._viewingPaperId === id) applyPdfUrl(raw);
        });
    } else {
      applyPdfUrl(raw);
    }
  } else if (raw) {
    if (frame) frame.style.display = 'none';
    if (obj) obj.style.display = 'none';
    if (img) { img.style.display = 'block'; img.src = raw; }
  }

  const dl = document.getElementById('viewDownloadBtn');
  if (dl) dl.onclick = function(e) { e.preventDefault(); downloadPaper(id); };

  const modal = document.getElementById('viewModal');
  if (modal) modal.classList.add('show');
  document.body.classList.add('modal-open');
  // Scroll wrap to top
  if (wrap) wrap.scrollTop = 0;
}

function closeViewModal() {
  const modal = document.getElementById('viewModal');
  if (modal) modal.classList.remove('show');
  document.body.classList.remove('modal-open');
  const frame = document.getElementById('viewFrame');
  const obj = document.getElementById('viewObject');
  if (frame) {
    frame.src = 'about:blank';
    frame.style.display = 'none';
    frame.removeAttribute('sandbox');
  }
  if (obj) {
    obj.removeAttribute('data');
    obj.style.display = 'none';
  }
  if (state._viewBlobUrl) {
    try { URL.revokeObjectURL(state._viewBlobUrl); } catch (e) {}
    state._viewBlobUrl = null;
  }
  state._viewingPaperId = null;
}

/* Upload */
function setupFileInput() {
  const input = document.getElementById('upFile');
  if (!input) return;
  input.addEventListener('change', function() {
    const f = this.files[0];
    if (!f) return;
    state.pendingFile = f;
    document.getElementById('dropText').textContent = f.name;
    showPreview(f);
  });
  const yearSel = document.getElementById('upYear');
  if (yearSel && !yearSel.options.length) {
    YEARS.forEach(y => {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      yearSel.appendChild(o);
    });
  }
}

function showPreview(file) {
  const box = document.getElementById('previewBox');
  const iframe = document.getElementById('pdfPreview');
  const img = document.getElementById('imgPreview');
  box.style.display = 'block';
  const reader = new FileReader();
  reader.onload = (e) => {
    state.pendingFileData = e.target.result;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      iframe.style.display = 'block'; img.style.display = 'none';
      iframe.src = e.target.result;
    } else if (file.type.startsWith('image/')) {
      iframe.style.display = 'none'; img.style.display = 'block';
      img.src = e.target.result;
    }
  };
  reader.readAsDataURL(file);
}

function clearPreview() {
  state.pendingFile = null;
  state.pendingFileData = null;
  document.getElementById('upFile').value = '';
  document.getElementById('dropText').textContent = 'Click or drop PDF / image here';
  document.getElementById('previewBox').style.display = 'none';
  document.getElementById('pdfPreview').src = '';
  document.getElementById('imgPreview').src = '';
}

function handleUpload(e) {
  e.preventDefault();
  if (!state.user) { toast('Login required', 'error'); showSection('auth'); return; }
  if (!state.pendingFile && !document.getElementById('upFile').files[0]) {
    toast('Select a file first', 'error'); return;
  }
  const file = state.pendingFile || document.getElementById('upFile').files[0];
  const doUpload = (dataUrl) => {
    const paper = {
      id: 'p' + Date.now(),
      subject: document.getElementById('upSubject').value.trim(),
      code: document.getElementById('upCode').value.trim().toUpperCase(),
      year: document.getElementById('upYear').value,
      semester: document.getElementById('upSem').value,
      category: document.getElementById('upCat').value,
      campus: document.getElementById('upCampus').value,
      attribute: (document.getElementById('upSlot') && document.getElementById('upSlot').value.trim()) || '',
      uploaderId: state.user.id,
      downloads: 0, views: 0, createdAt: Date.now(),
      fileName: file.name, fileData: dataUrl
    };
    state.papers.unshift(paper);
    state.user.uploads = (state.user.uploads || 0) + 1;
    state.user.vcash = (state.user.vcash || 0) + 1000;
    if (!state.user.uploadHistory) state.user.uploadHistory = [];
    state.user.uploadHistory.unshift({
      paperId: paper.id, name: paper.subject, fileName: paper.fileName, ts: Date.now()
    });
    const u = state.users.find(x => x.id === state.user.id);
    if (u) {
      u.uploads = state.user.uploads;
      u.vcash = state.user.vcash;
      u.uploadHistory = state.user.uploadHistory;
    }
    const uRef = state.users.find(x => x.id === state.user.id);
    if (uRef) ensureSubscription(uRef);
    ensureSubscription(state.user);
    save(); updateUI();
    e.target.reset();
    clearPreview();
    pushSystemNotif(state.user.id, 'Your paper was uploaded successfully. +1,000 ZX credited.', { type: 'upload', pinned: false });
    toast('+1,000 ZX! Paper uploaded', 'success');
    showSection('home');
  };
  if (state.pendingFileData) doUpload(state.pendingFileData);
  else {
    const reader = new FileReader();
    reader.onload = (ev) => doUpload(ev.target.result);
    reader.readAsDataURL(file);
  }
}

/* Store */
function updateStoreVcash() {
  const balance = formatWalletBalance(state.user);
  document.getElementById('storeVcash').innerHTML = `Your balance: <strong>${balance}</strong> ZX`;
}
function buyBadge(badge, cost) {
  if (!state.user) { toast('Login required', 'error'); showSection('auth'); return; }
  if ((state.user.vcash || 0) < cost) { toast('Not enough ZX', 'error'); return; }
  if (!state.user.items) state.user.items = [];
  const badgeItemId = 'badge_' + badge;
  if (state.user.items.includes(badgeItemId) || (state.user.badge === badge && badge !== 'bronze')) {
    toast('Already owned — equip it from Vault', 'error'); return;
  }
  // Allow purchasing higher or different badges into vault (not auto-equip)
  state.user.vcash -= cost;
  if (!state.user.items.includes(badgeItemId)) state.user.items.push(badgeItemId);
  // Ensure bronze is always in vault as default owned
  if (!state.user.items.includes('badge_bronze')) state.user.items.unshift('badge_bronze');
  const u = state.users.find(x => x.id === state.user.id);
  if (u) {
    u.vcash = state.user.vcash;
    u.items = state.user.items;
  }
  save(); updateUI(); updateStoreVcash(); refreshStoreButtons();
  toast('Badge added to Vault! Open Vault to equip.', 'success');
}

function equipBadge(badge) {
  if (!state.user) return;
  const badgeItemId = 'badge_' + badge;
  if (badge !== 'bronze' && !(state.user.items || []).includes(badgeItemId)) {
    toast('You do not own this badge', 'error'); return;
  }
  state.user.badge = badge;
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.badge = badge;
  save(); updateUI();
  if (typeof openVault === 'function') openVault();
  toast('Badge equipped: ' + badge, 'success');
}
function buyItem(itemId, cost) {
  if (!state.user) { toast('Login required', 'error'); showSection('auth'); return; }
  if ((state.user.vcash || 0) < cost) { toast('Not enough ZX', 'error'); return; }
  if (!state.user.items) state.user.items = [];
  if (state.user.items.includes(itemId)) { toast('Already owned — apply it on Profile', 'error'); return; }
  state.user.vcash -= cost;
  state.user.items.push(itemId);
  // Do NOT auto-apply — user equips from Vault
  if (!state.user.activeItems) state.user.activeItems = [];
  const u = state.users.find(x => x.id === state.user.id);
  if (u) {
    u.vcash = state.user.vcash;
    u.items = state.user.items;
    u.activeItems = state.user.activeItems;
  }
  save(); updateUI(); updateStoreVcash();
  refreshStoreButtons();
  toast('Item added to Vault! Open Vault to equip.', 'success');
}

const ITEM_LABELS = {
  frame_rainbow: 'Rainbow Frame', glow: 'Glow Effect', dark_pack: 'Dark Theme Pack',
  title: 'Custom Title', neon_ring: 'Neon Ring', star_pad: 'Star Pad',
  fire_frame: 'Fire Frame', frost: 'Frost Effect', heart_pad: 'Heart Pad', pulse: 'Pulse Glow',
  aurora_frame: 'Aurora Frame', glass_pad: 'Glass Pad', crown: 'Crown Icon',
  wave_glow: 'Wave Glow', pixel_border: 'Pixel Border', sparkle: 'Sparkle Trail', midnight: 'Midnight Mode', lightning: 'Lightning Edge'
};

function toggleActiveItem(itemId) {
  if (!state.user) return;
  if (!state.user.activeItems) state.user.activeItems = [];
  const i = state.user.activeItems.indexOf(itemId);
  if (i >= 0) state.user.activeItems.splice(i, 1);
  else state.user.activeItems.push(itemId);
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.activeItems = state.user.activeItems;
  save();
  renderProfile();
  toast(i >= 0 ? 'Effect removed' : 'Effect applied', 'success');
}

function applyProfileEffects() {
  const card = document.querySelector('#profile .profile-card');
  if (!card || !state.user) return;
  card.className = 'card profile-card';
  (state.user.activeItems || []).forEach(id => {
    card.classList.add('fx-' + id);
  });
}

/* Leaderboard */
function switchLbTab(tab) {
  state.lbTab = tab;
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  renderLeaderboard();
}
function renderLeaderboard() {
  renderLbHighlights();
  let sorted = state.users.filter(u => !u.isAdmin);
  if (state.lbTab === 'uploads') sorted.sort((a,b) => (b.uploads||0) - (a.uploads||0));
  else if (state.lbTab === 'vcash') sorted.sort((a,b) => (b.vcash||0) - (a.vcash||0));
  else sorted.sort((a,b) => (b.downloads||0) - (a.downloads||0));
  const list = document.getElementById('leaderboardList');
  const empty = document.getElementById('lbEmpty');
  if (!sorted.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.innerHTML = sorted.slice(0, 50).map((u, i) => {
    const rankClass = i===0 ? 'gold' : i===1 ? 'silver' : i===2 ? 'bronze' : '';
    const score = state.lbTab === 'uploads' ? (u.uploads||0) + ' uploads'
      : state.lbTab === 'vcash' ? (u.vcash||0).toLocaleString() + ' ZX' : (u.downloads||0) + ' downloads';
    const av = u.avatar || defaultAvatar(u.displayName);
    return `<div class="leader-row" onclick="openUserModal('${u.id}')">
      <div class="leader-rank ${rankClass}">#${i+1}</div>
      <div class="avatar-wrap"><img src="${av}" /><span class="badge-pin">${badgeHtml(u.badge)}</span></div>
      <div class="leader-info"><strong>${escapeHtml(u.displayName)}</strong><span>@${escapeHtml(u.username)} · ${escapeHtml(u.branch||'')}</span></div>
      <div class="leader-score">${score}</div>
    </div>`;
  }).join('');
}

function renderLbHighlights() {
  const box = document.getElementById('lbHighlights');
  if (!box) return;
  const highlights = JSON.parse(localStorage.getItem('vitpyq_highlights') || '[]');
  if (!highlights.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'flex';
  box.innerHTML = highlights.slice(0, 12).map(h => {
    const u = state.users.find(x => x.id === h.userId);
    const name = u ? u.displayName : (h.name || 'User');
    const av = u ? (u.avatar || defaultAvatar(name)) : defaultAvatar(name);
    return `<div class="lb-h-card" onclick="openUserModal('${h.userId}')">
      <img src="${av}" alt="" />
      <div class="h-name">${escapeHtml(name)}</div>
      <div class="h-msg">${escapeHtml(h.message || 'Congrats!')}</div>
    </div>`;
  }).join('');
}

function addHighlight(userId, message) {
  const highlights = JSON.parse(localStorage.getItem('vitpyq_highlights') || '[]');
  const u = state.users.find(x => x.id === userId);
  highlights.unshift({
    id: 'h' + Date.now(),
    userId,
    name: u ? u.displayName : '',
    message: message || 'Congratulated by Admin',
    ts: Date.now()
  });
  localStorage.setItem('vitpyq_highlights', JSON.stringify(highlights.slice(0, 30)));
}

/* Chat */
function renderChat() {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  if (!state.messages.length) {
    box.innerHTML = '<p class="center muted" style="margin:auto;">No messages yet.</p>';
    return;
  }
  // Pinned admin first, then chronological
  const pinned = state.messages.filter(m => m.pinned || m.isAdmin);
  const normal = state.messages.filter(m => !m.pinned && !m.isAdmin);
  const ordered = [...pinned, ...normal].slice(-120);
  const isAdminViewer = state.user && state.user.isAdmin;
  let html = '';
  let lastTs = null;
  ordered.forEach(m => {
    if (lastTs === null || !sameChatDay(lastTs, m.ts)) {
      html += `<div class="chat-date-sep">${formatChatDate(m.ts)}</div>`;
    }
    lastTs = m.ts;
    const own = state.user && m.userId === state.user.id;
    const adminCls = (m.isAdmin || m.pinned) ? 'admin-msg' : '';
    const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const pin = (m.isAdmin || m.pinned) ? '<span class="pinned-label"><i class="fas fa-thumbtack"></i> Admin</span> ' : '';
    const del = isAdminViewer
      ? `<div class="admin-actions"><button type="button" class="btn-ghost sm" onclick="deleteChatMsg('${m.id}')"><i class="fas fa-trash"></i> Remove</button></div>`
      : '';
    html += `<div class="chat-msg ${own ? 'own' : ''} ${adminCls}">
      <div class="chat-user">${pin}@${escapeHtml(m.username)}</div>
      <div>${escapeHtml(m.text)}</div>
      <div class="chat-time">${time}</div>
      ${del}
    </div>`;
  });
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}
function sendChat(e) {
  e.preventDefault();
  if (!state.user) { toast('Login to chat', 'error'); showSection('auth'); return; }
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  const isAdmin = !!state.user.isAdmin;
  state.messages.push({
    id: 'm' + Date.now(),
    userId: state.user.id,
    username: state.user.username,
    text,
    ts: Date.now(),
    isAdmin: isAdmin,
    pinned: isAdmin
  });
  const pinned = state.messages.filter(m => m.pinned || m.isAdmin);
  const rest = state.messages.filter(m => !(m.pinned || m.isAdmin)).slice(-180);
  state.messages = [...pinned, ...rest].sort((a, b) => a.ts - b.ts);
  save();
  input.value = '';
  renderChat();
}

function clearUserChat() {
  if (!state.user) { toast('Login required', 'error'); return; }
  state.messages = state.messages.filter(m => m.pinned || m.isAdmin);
  save();
  renderChat();
  toast('Chat cleared (admin messages stay pinned)', 'success');
}

function deleteChatMsg(id) {
  if (!state.user || !state.user.isAdmin) { toast('Admin only', 'error'); return; }
  state.messages = state.messages.filter(m => m.id !== id);
  save();
  renderChat();
  toast('Message removed for everyone', 'success');
}

/* Admin */
function renderAdmin() {
  if (!state.user || !state.user.isAdmin) return;
  const list = document.getElementById('adminPapers');
  const q = (document.getElementById('adminPaperSearch')?.value || '').toLowerCase().trim();
  let papers = state.papers;
  if (q) {
    papers = papers.filter(p =>
      (p.subject + ' ' + p.code + ' ' + (p.campus||'') + ' ' + p.category).toLowerCase().includes(q)
    );
  }
  if (!papers.length) {
    list.innerHTML = '<p class="center muted">No papers found.</p>';
    return;
  }
  list.innerHTML = papers.map(p => {
    const up = state.users.find(u => u.id === p.uploaderId);
    const isPdf = (p.fileName||'').toLowerCase().endsWith('.pdf') || (p.fileData||'').startsWith('data:application/pdf');
    const thumb = p.fileData
      ? (isPdf ? `<iframe src="${p.fileData.split('#')[0]}#toolbar=0&navpanes=0&scrollbar=0&view=FitH" scrolling="no"></iframe>` : `<img src="${p.fileData}" alt="" />`)
      : '';
    return `<div class="admin-row">
      <div class="admin-thumb">${thumb}</div>
      <div class="info">
        <strong>${escapeHtml(p.subject)} (${escapeHtml(p.code)})</strong>
        <span>${p.year} · ${semLabel(p.semester)} · ${p.category} · ${p.campus||'Vellore'} · by @${up ? escapeHtml(up.username) : '?'}</span>
      </div>
      <button class="btn-ghost" style="color:var(--red);border-color:var(--red);" onclick="deletePaper('${p.id}')">
        <i class="fas fa-trash"></i> Remove
      </button>
    </div>`;
  }).join('');
}
function deletePaper(id) {
  if (!state.user || !state.user.isAdmin) return;
  if (!confirm('Remove this paper permanently?')) return;
  state.papers = state.papers.filter(p => p.id !== id);
  save(); updateUI(); renderAdmin(); renderHomePapers(); renderPapers();
  toast('Paper removed', 'success');
}

/* Profile / modal */
function openUserModal(id) {
  const u = state.users.find(x => x.id === id);
  if (!u) return;
  state._modalUserId = id;
  const av = u.avatar || defaultAvatar(u.displayName);
  document.getElementById('modalAvatar').src = av;
  document.getElementById('modalBadge').innerHTML = badgeHtml(u.badge);
  document.getElementById('modalName').textContent = u.displayName;
  // Blue tick ONLY if user purchased verified (strict true)
  const mv = document.getElementById('modalVerified');
  if (mv) mv.style.display = (u.verified === true) ? 'inline-flex' : 'none';
  document.getElementById('modalUser').textContent = '@' + u.username;
  document.getElementById('modalBranch').textContent = u.branch || '';
  const privacyTag = document.getElementById('modalPrivacy');
  if (privacyTag) {
    privacyTag.textContent = u.isPublic === false ? 'Private profile' : 'Public profile';
    privacyTag.classList.toggle('private', u.isPublic === false);
  }
  document.getElementById('modalUploads').textContent = u.uploads || 0;
  document.getElementById('modalDownloads').textContent = u.downloads || 0;
  document.getElementById('modalVisits').textContent = u.visits || 0;
  document.getElementById('modalVcash').textContent = formatWalletBalance(u);
  // Message button — only if this user is my friend (and not myself)
  let msgBtn = document.getElementById('modalMessageBtn');
  if (!msgBtn) {
    const modalContent = document.querySelector('#userModal .modal-content') || document.getElementById('userModal');
    msgBtn = document.createElement('button');
    msgBtn.id = 'modalMessageBtn';
    msgBtn.type = 'button';
    msgBtn.className = 'btn-primary full';
    msgBtn.style.cssText = 'margin:0.75rem 1rem 1rem;width:calc(100% - 2rem);';
    msgBtn.innerHTML = '<i class="fas fa-comment"></i> Message';
    modalContent.appendChild(msgBtn);
  }
  const isFriend = state.user && id !== state.user.id && (state.user.friends || []).includes(id);
  msgBtn.style.display = isFriend ? 'flex' : 'none';
  msgBtn.onclick = function() {
    closeUserModal();
    showSection('chat');
    setTimeout(function() {
      const panel = document.getElementById('personalChatPanel');
      if (panel) panel.style.display = 'block';
      if (typeof openPersonalThread === 'function') openPersonalThread(id);
      if (typeof togglePersonalChat === 'function') {
        const p = document.getElementById('personalChatPanel');
        if (p && p.style.display === 'none') togglePersonalChat();
      }
    }, 150);
  };
  document.getElementById('userModal').classList.add('show');
}
function closeUserModal() {
  document.getElementById('userModal').classList.remove('show');
  document.body.classList.remove('modal-open');
}
const _oumShow = openUserModal;
openUserModal = function(id) {
  document.body.classList.add('modal-open');
  _oumShow(id);
};

function renderProfile() {
  if (!state.user) return;
  const u = state.user;
  const av = u.avatar || defaultAvatar(u.displayName);
  document.getElementById('profAvatar').src = av;
  document.getElementById('profBadge').innerHTML = badgeHtml(u.badge);
  document.getElementById('profName').textContent = u.displayName;
  const pv = document.getElementById('profVerified');
  if (pv) pv.style.display = (u.verified === true) ? 'inline-flex' : 'none';
  document.getElementById('profUser').textContent = '@' + u.username;
  document.getElementById('profBranch').textContent = u.branch || '';
  document.getElementById('profUploads').textContent = u.uploads || 0;
  document.getElementById('profDownloads').textContent = u.downloads || 0;
  const pv2 = document.getElementById('profVisits');
  if (pv2) pv2.textContent = u.visits || 0;
  document.getElementById('profVcash').textContent = formatWalletBalance(u);
  const en = document.getElementById('editName');
  if (en) en.value = u.displayName;
}
function updateProfilePic(e) {
  const f = e.target.files[0];
  if (!f || !state.user) return;
  const reader = new FileReader();
  reader.onload = async () => {
    state.user.avatar = reader.result;
    const u = state.users.find(x => x.id === state.user.id);
    if (u) u.avatar = reader.result;
    save(); updateUI(); renderProfile();
    const saved = !window.SupabaseSync || !state.user || await window.SupabaseSync.pending;
    if (saved) toast('Photo updated', 'success');
  };
  reader.readAsDataURL(f);
}
async function saveProfile() {
  if (!state.user) return;
  const name = document.getElementById('editName').value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  state.user.displayName = name;
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.displayName = name;
  save(); updateUI(); renderProfile();
  toast('Profile saved', 'success');
}

/* Init */
load();
updateUI();
buildYearChecks();
setupFileInput();
initNeural();
renderHomePapers();
renderNewHighlight();
startCarousel();

const dz = document.getElementById('dropzone');
if (dz) {
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      document.getElementById('upFile').files = dt.files;
      state.pendingFile = f;
      document.getElementById('dropText').textContent = f.name;
      showPreview(f);
    }
  });
}

setInterval(() => {
  const papers = JSON.parse(localStorage.getItem('vitpyq_papers') || '[]');
  const users = JSON.parse(localStorage.getItem('vitpyq_users') || '[]');
  const msgs = JSON.parse(localStorage.getItem('vitpyq_chat') || '[]');
  if (papers.length !== state.papers.length || users.length !== state.users.length) {
    state.papers = papers; state.users = users; updateUI();
    if (document.getElementById('home')?.classList.contains('active')) renderHomePapers();
    if (document.getElementById('papers')?.classList.contains('active')) renderPapers();
    if (document.getElementById('leaderboard')?.classList.contains('active')) renderLeaderboard();
  }
  if (msgs.length !== state.messages.length) {
    state.messages = msgs;
    if (document.getElementById('chat')?.classList.contains('active')) renderChat();
  }
}, 8000);


/* ===== Friends / Notifications / Personal Chat / Profile edit / Quotes ===== */
const QUOTES = ['Education is the most powerful weapon which you can use to change the world. — Nelson Mandela', 'Share your knowledge. It is a way to achieve immortality. — Dalai Lama', 'The beautiful thing about learning is that no one can take it away from you. — B.B. King', 'An investment in knowledge pays the best interest. — Benjamin Franklin', 'Alone we can do so little; together we can do so much. — Helen Keller', 'Knowledge increases by sharing but not by saving.', 'Helping one person might not change the world, but it could change the world for one person.', 'Study hard, share freely, grow together.', "Your notes today could be someone's lifeline tomorrow.", 'Collaboration turns good students into great ones.', 'The more we share, the more we have.', 'A candle loses nothing by lighting another candle.', 'Teach what you learn. Learn what you teach.', 'Curiosity is the engine of achievement.', 'The expert in anything was once a beginner.', 'Push yourself, because no one else is going to do it for you.', 'Great things never come from comfort zones.', 'Learning never exhausts the mind. — Leonardo da Vinci', 'Live as if you were to die tomorrow. Learn as if you were to live forever. — Gandhi', 'Intelligence is the ability to adapt to change. — Stephen Hawking', "It always seems impossible until it's done. — Nelson Mandela", 'Strive for progress, not perfection.', 'Small steps every day lead to big results.', "Hard work beats talent when talent doesn't work hard.", 'The secret of getting ahead is getting started. — Mark Twain', "Don't watch the clock; do what it does. Keep going.", 'Education is not preparation for life; education is life itself.', 'Tell me and I forget. Teach me and I remember. Involve me and I learn.', 'The mind is not a vessel to be filled but a fire to be kindled.', 'Knowledge is power. — Francis Bacon', 'To teach is to learn twice.', 'Education is the passport to the future.', 'The more that you read, the more things you will know.', 'Learning is a treasure that will follow its owner everywhere.', 'Develop a passion for learning and you will never cease to grow.', 'When one teaches, two learn.', 'Sharing knowledge is the most beautiful act of kindness.', 'A rising tide lifts all boats — share your notes, lift your batch.', 'Past papers are bridges. Cross them together.', 'One upload can save dozens of all-nighters.', 'Community beats competition. Help a junior today.', "Your CAT notes are someone's first step to clarity.", 'Upload once. Help forever.', 'Knowledge compounds when shared.', 'Be the senior you needed as a freshman.', 'Syllabus is common. Support is rare. Be rare.', 'Exam stress shrinks when friends share resources.', 'Library of one mind is small. Library of many is infinite.', 'ZX is earned by giving, not by hoarding.', 'The best rank is the one where your friends also win.', 'Doubt clears faster in a group chat than alone.', "Yesterday's paper is tomorrow's confidence.", 'Study circles beat solo grinders.', 'Leave the path clearer than you found it.', 'Campus is temporary. Kindness is permanent.', 'Ask. Answer. Advance. Together.', 'Every download is a silent thank you.', 'Lead by uploading. Follow by learning.', 'The batch that shares together, ranks together.', "Don't gatekeep growth.", 'Your 10 minutes of upload can give someone 10 hours of clarity.', 'Stay hungry. Stay helpful.', 'Legends leave resources, not just ranks.', 'The real topper lifts the class average.', 'Silence helps no one. Share the formula.', 'Peer teaching is the highest form of learning.', 'Courage is uploading your first messy scan.', 'Progress is public when knowledge is free.', 'Build the archive you wished existed.', 'Different campuses, same struggle, same support.', 'From CAT1 to FAT — we rise by lifting others.', 'Motivation is temporary. Systems and friends are not.', "Start before you're ready. Share before it's perfect.", 'Consistency beats intensity. Community beats isolation.', "You don't have to be the best to be useful.", 'Useful is better than perfect.', 'Doubt is a request for help. Answer it.', 'Be the notification that saves a deadline.', 'Kindness is the highest GPA.', 'Give what you needed when you started.', 'Pay forward the notes that saved you.', 'Gratitude is uploading the paper you once searched for.', "Make the next batch's life easier than yours.", 'Legacy is the archive you leave.', 'Be a bridge, not a gate.', 'Study smarter by studying together.', 'Teamwork makes the dream work — and the rank work.', 'One mind is limited. Many minds are limitless.', 'Friend requests are the start of study groups.', 'A friend with notes is a friend indeed.', 'Add friends. Subtract stress.', 'Help received should become help given.', 'The algorithm of success: learn, share, repeat.', 'Find your people. Share your papers.', 'Chat less about complaints. Chat more about solutions.', 'Global chat for discovery. Personal chat for depth.', 'Ask clearly. Answer kindly.', 'No question is stupid before an exam.', 'The fastest way to learn is to teach.', 'Explain it out loud. Then upload the summary.', 'Quality uploads build trust.', 'Trust builds community. Community builds ranks.', 'Show up for your batch the way you want them to show up for you.', 'Campus distance is zero when files are shared.', 'The cloud is our common library.', 'Folders with clear names are acts of kindness.', 'A good filename saves a search.', "Structure is respect for other students' time.", 'Early uploads reduce panic.', 'Late is better than never — still upload.', 'Imperfect notes still beat no notes.', 'Courage over polish.', 'Start the culture of sharing on day one.', 'Culture scales. Be the first node.', 'Make helping the default.', 'Default to open.', 'The opposite of scarcity is community.', 'Abundance mindset starts with one shared PDF.', 'We design the culture with every upload.', 'One click can calm a hundred hearts.', 'Study. Share. Succeed. Together.', 'You are not alone in this syllabus.', 'We rise by lifting each other.', 'Keep going. Keep giving.', 'Be both the seeker and the source.', 'Balance take and give.', 'Invest in each other.', 'That is how a community compounds.', "Welcome to VIT PYQ's — where knowledge moves freely.", 'Earn ZX by giving value.', 'The real currency is trust.', 'Build it. Guard it. Share it.', 'Now go help someone.', 'Then help yourself.', 'Then help someone again.', 'That is the loop of progress.', 'Education is a team sport.', 'Play fair. Play generous.', 'Win together.', 'Open hands, open folders, open futures.', 'Barrier to knowledge should be zero.', 'Access is the new advantage — grant it.', 'Leave no junior behind.', 'The best revision is explaining it to someone.', 'Write it. Scan it. Share it. Sleep better.', 'Deadlines are softer with a shared folder.', 'Anxiety drops when the batch has the paper.', 'Be the reason someone smiles after a tough CAT.', 'Support is a skill. Practice it.', "Empathy is remembering last semester's panic.", 'The cycle of help must not break with you.', 'Information wants to be free — especially before FAT.', 'Open source your success.', "Don't just collect papers. Circulate them.", 'Syllabus is the map. Friends are the compass.', 'Your branch is a family. Feed it with resources.', 'Ordinary students become extraordinary by sharing.', "Celebrate others' uploads as your own wins.", 'The finish line is wider when we run as a team.', 'Work hard in silence; share loud when it helps.', 'Be reliable with resources.', 'Consistency in helping is rare — be rare.', 'Presence is a form of support.', 'Online or offline — knowledge should travel.', "Time zones don't matter to a shared drive.", 'Organize for others, not just yourself.', 'Label years and CAT types carefully.', 'Metadata is mercy.', 'Search less. Share more structured.', 'Respect time. Share early.', 'Perfect scan is optional. Presence is not.', 'Let generosity trend.', 'Fear of missing out ends when everyone has access.', 'Equity in resources is possible here.', 'Click share like it matters — because it does.', 'Use this platform well. Use it kindly.', 'The next paper you need might already be here — or waiting for you to upload it.', 'See you on the leaderboard — and in the chat.', 'Loop on. Level up. Lift others.', 'Connection is a competitive advantage.', 'Network of learners beats network of grades alone.', 'Discipline is easier with accountability partners.', 'Energy multiplies in a motivated group.', 'Momentum is shared.', 'Rubber duck debugging works. So does a friend.', 'Screenshots of doubt become posts of clarity.', 'Turn confusion into a community post.', 'Clarify once. Help many.', 'Short notes beat long silence.', 'Precision in sharing beats volume of noise.', 'Curate what you circulate.', 'Voice notes of concepts save hours.', 'Different campuses, same exams — unite the PDFs.', 'Diversity of notes beats one perfect set.', 'Global chat is for requests. Friendship is for follow-through.', 'Personal chat turns strangers into study partners.', 'The right friend request can change a semester.', 'Notification of help is the best ping.', 'Accept the request. Accept the responsibility to lift.', 'Replace FOMO with the joy of FOBO — fear of being ordinary by not helping.', 'Generosity is a GPA booster for the soul.', 'Notes without sharing are just private diaries.', 'Wisdom is knowing what to do next; skill is knowing how; sharing multiplies both.', 'Open source your notes. Close the gap for juniors.', 'The whiteboard remembers what the exam forgets — write it down and share.', 'Past mistakes are future lessons — if shared.', 'Be the first to share in a silent group.', 'Rank is personal. Resources can be universal.', 'He who opens a school door closes a prison. — Victor Hugo', 'Children must be taught how to think, not what to think.', 'Change is the end result of all true learning.', 'Anyone who stops learning is old. — Henry Ford', "The best teachers show you where to look but don't tell you what to see.", 'Education breeds confidence. Confidence breeds hope. Hope breeds peace.', 'Quality is not an act, it is a habit. — Aristotle', 'The roots of education are bitter, but the fruit is sweet.', 'If you can dream it, you can do it. — Walt Disney', "Opportunities don't happen. You create them.", 'Dream it. Wish it. Do it. Share it.', 'Your limitation is only your imagination.', 'Sometimes later becomes never. Do it now.', 'The future belongs to those who prepare for it today.', "Don't be afraid to give up the good to go for the great.", 'An investment in knowledge pays the best interest — and so does an investment in friendship.'];
let quoteTimer = null;

function openProfileEdit() {
  document.getElementById('profileViewMode').style.display = 'none';
  document.getElementById('profileEditMode').style.display = 'block';
  if (state.user) document.getElementById('editName').value = state.user.displayName;
}
function closeProfileEdit() {
  document.getElementById('profileViewMode').style.display = 'block';
  document.getElementById('profileEditMode').style.display = 'none';
  const pic = document.getElementById('editPic');
  if (pic) pic.value = '';
  const name = document.getElementById('editPicName');
  if (name) name.textContent = '';
}

function onProfilePicPick(e) {
  const f = e.target.files[0];
  const nameEl = document.getElementById('editPicName');
  if (nameEl) nameEl.textContent = f ? f.name : '';
  if (f) updateProfilePic(e);
}

// override saveProfile
async function saveProfile() {
  if (!state.user) return;
  const name = document.getElementById('editName').value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  state.user.displayName = name;
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.displayName = name;
  save(); updateUI(); renderProfile();
  const saved = !window.SupabaseSync || await window.SupabaseSync.pending;
  if (!saved) return;
  closeProfileEdit();
  toast('Profile saved', 'success');
}

function parseQuote(q) {
  const idx = q.lastIndexOf(' — ');
  if (idx > 0) return { text: q.slice(0, idx).trim(), author: q.slice(idx + 3).trim() };
  const idx2 = q.lastIndexOf(' - ');
  if (idx2 > 0 && idx2 > q.length * 0.4) return { text: q.slice(0, idx2).trim(), author: q.slice(idx2 + 3).trim() };
  return { text: q, author: '' };
}

function startQuotes() {
  if (quoteTimer) clearInterval(quoteTimer);
  const el = document.getElementById('quoteText');
  if (!el) return;
  let i = Math.floor(Math.random() * QUOTES.length);
  const show = () => {
    el.style.animation = 'none';
    el.offsetHeight;
    const p = parseQuote(QUOTES[i % QUOTES.length]);
    el.textContent = p.author ? p.text + ' — ' + p.author : p.text;
    el.style.animation = 'quoteFade 0.6s ease';
    i++;
  };
  show();
  quoteTimer = setInterval(show, 5000);
}

let homeQuoteTimer = null;
function startHomeQuotes() {
  if (homeQuoteTimer) clearInterval(homeQuoteTimer);
  const el = document.getElementById('homeQuoteText');
  const au = document.getElementById('homeQuoteAuthor');
  if (!el) return;
  let i = Math.floor(Math.random() * QUOTES.length);
  const show = () => {
    el.style.animation = 'none';
    if (au) au.style.animation = 'none';
    el.offsetHeight;
    const p = parseQuote(QUOTES[i % QUOTES.length]);
    el.textContent = p.text;
    if (au) au.textContent = p.author ? '— ' + p.author : '';
    el.style.animation = 'quoteFade 0.65s ease';
    if (au) au.style.animation = 'quoteFade 0.65s ease';
    i++;
  };
  show();
  homeQuoteTimer = setInterval(show, 5000);
}

const _origRenderProfile = typeof renderProfile === 'function' ? renderProfile : null;
function renderProfile() {
  if (!state.user) return;
  const u = state.user;
  const av = u.avatar || defaultAvatar(u.displayName);
  document.getElementById('profAvatar').src = av;
  document.getElementById('profBadge').innerHTML = badgeHtml(u.badge);
  document.getElementById('profName').textContent = u.displayName;
  const pv = document.getElementById('profVerified');
  if (pv) pv.style.display = (u.verified === true) ? 'inline-flex' : 'none';
  document.getElementById('profUser').textContent = '@' + u.username;
  document.getElementById('profBranch').textContent = u.branch || '';
  document.getElementById('profUploads').textContent = u.uploads || 0;
  document.getElementById('profDownloads').textContent = u.downloads || 0;
  const friendsCount = (u.friends || []).length;
  const pf = document.getElementById('profFriends');
  if (pf) pf.textContent = friendsCount;
  document.getElementById('profVcash').textContent = formatWalletBalance(u);
  closeProfileEdit();
  startQuotes();
  // owned design items
  const ob = document.getElementById('ownedItemsBox');
  if (ob) {
    const items = state.user.items || [];
    if (!items.length) { ob.style.display = 'none'; }
    else {
      ob.style.display = 'block';
      const active = state.user.activeItems || [];
      ob.innerHTML = '<strong style="font-size:0.85rem;">My Wallet — owned items</strong>' +
        items.map(id => {
          const on = active.includes(id);
          return `<div class="owned-item-row">
            <span>${ITEM_LABELS[id] || id}</span>
            <span class="store-actions">
              <button type="button" class="btn-outline sm" onclick="setItemActive('${id}', true)" ${on ? 'disabled' : ''}>Apply</button>
              <button type="button" class="btn-primary sm" onclick="setItemActive('${id}', false)" ${!on ? 'disabled' : ''}>Remove</button>
            </span>
          </div>`;
        }).join('');
    }
  }
  applyProfileEffects();
  // Privacy toggle
  const pt = document.getElementById('privacyToggle');
  const pl = document.getElementById('privacyLabel');
  if (pt) {
    pt.checked = u.isPublic !== false;
    if (pl) pl.textContent = (u.isPublic !== false) ? 'Public' : 'Private';
  }
}

async function togglePrivacy() {
  if (!state.user) return;
  const pt = document.getElementById('privacyToggle');
  const isPublic = pt ? pt.checked : true;
  state.user.isPublic = isPublic;
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.isPublic = isPublic;
  save();
  const saved = !window.SupabaseSync || await window.SupabaseSync.pending;
  if (!saved) {
    state.user.isPublic = !isPublic;
    if (u) u.isPublic = !isPublic;
    if (pt) pt.checked = !isPublic;
    const oldLabel = document.getElementById('privacyLabel');
    if (oldLabel) oldLabel.textContent = !isPublic ? 'Public' : 'Private';
    return;
  }
  const pl = document.getElementById('privacyLabel');
  if (pl) pl.textContent = isPublic ? 'Public' : 'Private';
  toast(isPublic ? 'Profile is now Public' : 'Profile is now Private', 'success');
  updateUI();
}

function toggleFriendsSearch() {
  const p = document.getElementById('friendsSearchPanel');
  document.getElementById('notifPanel').classList.remove('open');
  p.classList.toggle('open');
  if (p.classList.contains('open')) {
    document.getElementById('friendSearchInput').value = '';
    document.getElementById('friendSearchResults').innerHTML = '';
    document.getElementById('friendSearchInput').focus();
  }
}

function closeFriendsSearch() {
  const panel = document.getElementById('friendsSearchPanel');
  if (panel) panel.classList.remove('open');
}

function toggleNotifPanel() {
  const p = document.getElementById('notifPanel');
  document.getElementById('friendsSearchPanel').classList.remove('open');
  p.classList.toggle('open');
  if (p.classList.contains('open')) renderNotifs();
}

function searchFriends(q) {
  q = (q || '').toLowerCase().trim();
  const box = document.getElementById('friendSearchResults');
  if (!q || !state.user) { box.innerHTML = ''; return; }
  const myId = state.user.id;
  const myFriends = state.user.friends || [];
  const myReqs = state.user.requests || [];
  const list = state.users.filter(u =>
    !u.isAdmin && u.id !== myId &&
    (u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q))
  ).slice(0, 12);
  if (!list.length) { box.innerHTML = '<p class="muted" style="padding:0.4rem;">No users found</p>'; return; }
  box.innerHTML = list.map(u => {
    const isFriend = myFriends.includes(u.id);
    const sent = (u.requests || []).includes(myId);
    const incoming = myReqs.includes(u.id);
    let action = '';
    if (isFriend) action = '<span class="muted">Friends</span>';
    else if (incoming) action = `<button class="btn-primary" onclick="acceptFriend('${u.id}')">Accept</button>`;
    else if (sent) action = '<span class="muted">Requested</span>';
    else action = `<button class="btn-outline" onclick="sendFriendRequest('${u.id}')">Add</button>`;
    return `<div class="dropdown-item"><span>@${escapeHtml(u.username)} · ${escapeHtml(u.displayName)}</span>${action}</div>`;
  }).join('');
}

function sendFriendRequest(toId) {
  if (!state.user) return;
  const target = state.users.find(u => u.id === toId);
  if (!target) return;
  if (!target.requests) target.requests = [];
  if (target.requests.includes(state.user.id)) { toast('Already requested', 'error'); return; }
  if ((state.user.friends || []).includes(toId)) { toast('Already friends', 'error'); return; }
  target.requests.push(state.user.id);
  // sync state.user if needed
  save();
  toast('Friend request sent', 'success');
  searchFriends(document.getElementById('friendSearchInput').value);
  updateNotifDot();
}

function acceptFriend(fromId) {
  if (!state.user) return;
  const me = state.users.find(u => u.id === state.user.id);
  const other = state.users.find(u => u.id === fromId);
  if (!me || !other) return;
  me.requests = (me.requests || []).filter(id => id !== fromId);
  if (!me.friends) me.friends = [];
  if (!other.friends) other.friends = [];
  if (!me.friends.includes(fromId)) me.friends.push(fromId);
  if (!other.friends.includes(me.id)) other.friends.push(me.id);
  state.user = me;
  save();
  toast('You are now friends!', 'success');
  renderNotifs();
  updateNotifDot();
  updateUI();
  if (document.getElementById('profile')?.classList.contains('active')) renderProfile();
}

function rejectFriend(fromId) {
  if (!state.user) return;
  const me = state.users.find(u => u.id === state.user.id);
  if (!me) return;
  me.requests = (me.requests || []).filter(id => id !== fromId);
  state.user = me;
  save();
  renderNotifs();
  updateNotifDot();
}

function renderNotifs() {
  const box = document.getElementById('notifList');
  if (!state.user) { box.innerHTML = ''; return; }
  const reqs = state.user.requests || [];
  if (!reqs.length) {
    box.innerHTML = '<p class="muted" style="padding:0.4rem;">No friend requests</p>';
    return;
  }
  box.innerHTML = reqs.map(id => {
    const u = state.users.find(x => x.id === id);
    if (!u) return '';
    return `<div class="dropdown-item">
      <span>@${escapeHtml(u.username)}</span>
      <span>
        <button class="btn-primary" onclick="acceptFriend('${id}')">Accept</button>
        <button class="btn-ghost" onclick="rejectFriend('${id}')">Ignore</button>
      </span>
    </div>`;
  }).join('');
}

function updateNotifDot() {
  const dot = document.getElementById('notifDot');
  if (!dot || !state.user) return;
  const n = (state.user.requests || []).length;
  dot.style.display = n > 0 ? 'block' : 'none';
}

function togglePersonalChat() {
  const panel = document.getElementById('personalChatPanel');
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (open) renderPcFriends();
}

function renderPcFriends() {
  const box = document.getElementById('pcFriendsList');
  if (!state.user) { box.innerHTML = '<p class="muted" style="padding:0.5rem;">Login required</p>'; return; }
  const ids = state.user.friends || [];
  if (!ids.length) {
    box.innerHTML = '<p class="muted" style="padding:0.5rem;font-size:0.8rem;">No friends yet. Use Search Friends.</p>';
    return;
  }
  box.innerHTML = '<div class="pc-friends-head">Friends</div>' + ids.map(id => {
    const u = state.users.find(x => x.id === id);
    if (!u) return '';
    const active = state.activeFriendId === id ? 'active' : '';
    return `<div class="pc-friend ${active}" onclick="openPersonalThread('${id}')">@${escapeHtml(u.username)}</div>`;
  }).join('');
}

function chatKey(a, b) {
  return [a, b].sort().join('_');
}

function openPersonalThread(friendId) {
  state.activeFriendId = friendId;
  const u = state.users.find(x => x.id === friendId);
  document.getElementById('pcThreadHead').textContent = u ? '@' + u.username : 'Chat';
  renderPcFriends();
  renderPcMessages();
}

function renderPcMessages() {
  const box = document.getElementById('pcMessages');
  if (!state.user || !state.activeFriendId) {
    box.innerHTML = '<p class="center muted" style="margin:auto;">Select a friend</p>';
    return;
  }
  const key = chatKey(state.user.id, state.activeFriendId);
  const msgs = state.privateChats[key] || [];
  if (!msgs.length) {
    box.innerHTML = '<p class="center muted" style="margin:auto;">No messages yet</p>';
    return;
  }
  let html = '';
  let lastTs = null;
  msgs.forEach(m => {
    if (lastTs === null || !sameChatDay(lastTs, m.ts)) {
      html += `<div class="chat-date-sep">${formatChatDate(m.ts)}</div>`;
    }
    lastTs = m.ts;
    const own = m.from === state.user.id;
    const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    html += `<div class="chat-msg ${own ? 'own' : ''}">
      <div>${escapeHtml(m.text)}</div>
      <div class="chat-time">${time}</div>
    </div>`;
  });
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

function sendPersonalChat(e) {
  e.preventDefault();
  if (!state.user || !state.activeFriendId) { toast('Select a friend first', 'error'); return; }
  const input = document.getElementById('pcInput');
  const text = input.value.trim();
  if (!text) return;
  const key = chatKey(state.user.id, state.activeFriendId);
  if (!state.privateChats[key]) state.privateChats[key] = [];
  state.privateChats[key].push({ from: state.user.id, text, ts: Date.now() });
  save();
  input.value = '';
  renderPcMessages();
}

// close dropdowns on outside click
document.addEventListener('click', (e) => {
  const fs = document.getElementById('friendsSearchPanel');
  const np = document.getElementById('notifPanel');
  const fsb = document.getElementById('friendsSearchBtn');
  const nb = document.getElementById('notifBtn');
  if (fs && !fs.contains(e.target) && fsb && !fsb.contains(e.target)) fs.classList.remove('open');
  if (np && !np.contains(e.target) && nb && !nb.contains(e.target)) np.classList.remove('open');
});

// Hook showSection profile quotes
const _showSection = showSection;
showSection = function(id) {
  _showSection(id);
  if (id === 'profile') startQuotes();
  else if (quoteTimer) { clearInterval(quoteTimer); quoteTimer = null; }
};


/* Forgot password OTP (demo) */
let pendingOtp = null;
let pendingForgotEmail = null;

function showForgot() {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  const ff = document.getElementById('forgotForm');
  if (ff) {
    ff.classList.remove('hidden');
    document.getElementById('otpStep').classList.add('hidden');
    document.getElementById('forgotBtn').textContent = 'Send OTP';
    pendingOtp = null;
  }
  document.getElementById('loginTab')?.classList.remove('active');
  document.getElementById('regTab')?.classList.remove('active');
}

function handleForgot(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
  if (!email) { toast('Enter your email', 'error'); return; }
  // VIT students (non-admin) use Google — no password reset via OTP
  if (isVitStudentEmail(email) && !isAdminEmail(email)) {
    toast('@vitstudent.ac.in accounts sign in with Google only. Password reset is for Gmail, Yahoo, Outlook, etc.', 'error');
    return;
  }
  const user = state.users.find(u => u.email === email);
  if (!user) { toast('No account with this email', 'error'); return; }

  if (!pendingOtp || pendingForgotEmail !== email) {
    pendingOtp = String(Math.floor(100000 + Math.random() * 900000));
    pendingForgotEmail = email;
    document.getElementById('otpStep').classList.remove('hidden');
    document.getElementById('forgotBtn').textContent = 'Reset Password';
    toast('OTP generated (demo)', 'success');
    alert('Your OTP is: ' + pendingOtp + '\n(Demo mode — when Firebase/email is connected this is sent to your inbox)');
    return;
  }
  const otp = document.getElementById('forgotOtp').value.trim();
  const pass = document.getElementById('forgotNewPass').value;
  if (otp !== pendingOtp) { toast('Invalid OTP', 'error'); return; }
  if (!pass || pass.length < 6) { toast('Password min 6 chars', 'error'); return; }
  user.password = pass;
  save();
  pendingOtp = null;
  pendingForgotEmail = null;
  toast('Password updated. Please login.', 'success');
  switchAuth('login');
  document.getElementById('forgotForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
}

// Enhance switchAuth to hide forgot
const _switchAuth = switchAuth;
switchAuth = function(mode) {
  _switchAuth(mode);
  const ff = document.getElementById('forgotForm');
  if (ff) ff.classList.add('hidden');
  if (mode === 'login') document.getElementById('loginForm')?.classList.remove('hidden');
};

/* Profile friends list + history */
function toggleFriendsList() {
  const box = document.getElementById('friendsListBox');
  const hist = document.getElementById('historyBox');
  if (hist) hist.style.display = 'none';
  if (!box || !state.user) return;
  if (box.style.display === 'block') { box.style.display = 'none'; return; }
  const ids = state.user.friends || [];
  if (!ids.length) {
    box.innerHTML = `<div class="friends-empty">
      <p class="muted">No friends yet.</p>
      <button type="button" class="btn-primary sm" onclick="openAddFriendsFromProfile()"><i class="fas fa-user-plus"></i> Add Friends</button>
    </div>`;
  } else {
    box.innerHTML = `<div class="friends-list-inner">` + ids.map(id => {
      const u = state.users.find(x => x.id === id);
      if (!u) return '';
      return `<div class="friend-row" onclick="openUserModal('${id}')">
        <span>@${escapeHtml(u.username)} · ${escapeHtml(u.displayName)}</span>
        <i class="fas fa-chevron-right muted"></i>
      </div>`;
    }).join('') + `</div>
    <button type="button" class="btn-outline sm full" style="margin-top:0.65rem;" onclick="openAddFriendsFromProfile()"><i class="fas fa-user-plus"></i> Add Friends</button>`;
  }
  box.style.display = 'block';
}

function openAddFriendsFromProfile() {
  toggleFriendsSearch();
  const input = document.getElementById('friendSearchInput');
  if (input) setTimeout(() => input.focus(), 50);
}

function showHistory(type) {
  const box = document.getElementById('historyBox');
  const fl = document.getElementById('friendsListBox');
  if (fl) fl.style.display = 'none';
  if (!box || !state.user) return;
  state._historyType = type;
  state._historyPage = 0;
  renderHistoryPage();
  box.style.display = 'block';
}

function renderHistoryPage() {
  const box = document.getElementById('historyBox');
  if (!box || !state.user) return;
  const type = state._historyType || 'uploads';
  const list = type === 'uploads'
    ? (state.user.uploadHistory || [])
    : (state.user.downloadHistory || []);
  const pageSize = 5;
  if (!list.length) {
    box.innerHTML = `<p class="muted" style="padding:0.4rem;">No ${type} history yet.</p>`;
    return;
  }
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  if (state._historyPage >= pages) state._historyPage = pages - 1;
  if (state._historyPage < 0) state._historyPage = 0;
  const start = state._historyPage * pageSize;
  const slice = list.slice(start, start + pageSize);
  const rows = slice.map(h => {
    const d = new Date(h.ts);
    return `<div class="history-row">
      <span>${escapeHtml(h.name || '')} <span class="muted">(${escapeHtml(h.fileName || '')})</span></span>
      <span class="ts">${d.toLocaleString()}</span>
    </div>`;
  }).join('');
  box.innerHTML = `<strong style="font-size:0.85rem;display:block;margin-bottom:0.4rem;">${type === 'uploads' ? 'Upload' : 'Download'} history</strong>` +
    rows +
    `<div class="history-carousel-nav">
      <button type="button" ${state._historyPage<=0?'disabled':''} onclick="state._historyPage--;renderHistoryPage()" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
      <span class="history-page-info">${state._historyPage+1} / ${pages}</span>
      <button type="button" ${state._historyPage>=pages-1?'disabled':''} onclick="state._historyPage++;renderHistoryPage()" aria-label="Next"><i class="fas fa-chevron-right"></i></button>
    </div>`;
}

let modalUserId = null;
const _openUserModal = openUserModal;
openUserModal = function(id) {
  modalUserId = id;
  _openUserModal(id);
  const mh = document.getElementById('modalHistoryBox');
  if (mh) mh.style.display = 'none';
};

function showModalHistory(type) {
  const box = document.getElementById('modalHistoryBox');
  if (!box || !modalUserId) return;
  const u = state.users.find(x => x.id === modalUserId);
  if (!u) return;
  const isSelf = state.user && state.user.id === modalUserId;
  const isAdmin = state.user && state.user.isAdmin;
  const isFriend = state.user && (u.friends || []).includes(state.user.id);
  if (u.isPublic === false && !isSelf && !isAdmin && !isFriend) {
    box.innerHTML = '<p class="muted private-history-note"><i class="fas fa-lock"></i> History is visible only to friends, the account owner, and admins.</p>';
    box.style.display = 'block';
    return;
  }
  if (type === 'downloads' && !isSelf && !isAdmin) {
    alert('Downloads are private. Only the user and admins can view download history.');
    box.style.display = 'none';
    return;
  }
  const list = type === 'uploads' ? (u.uploadHistory || []) : (u.downloadHistory || []);
  let rows = list;
  if (type === 'uploads' && !rows.length) {
    rows = state.papers.filter(p => p.uploaderId === modalUserId).map(p => ({
      name: p.subject, fileName: p.fileName || p.code, ts: p.createdAt || Date.now()
    }));
  }
  if (!rows.length) {
    box.innerHTML = `<p class="muted" style="padding:0.4rem;">No ${type} history.</p>`;
  } else {
    box.innerHTML = `<strong style="font-size:0.85rem;display:block;margin-bottom:0.4rem;">${type === 'uploads' ? 'Upload' : 'Download'} history</strong>` +
      rows.slice(0, 40).map(h => {
        const d = new Date(h.ts);
        return `<div class="history-row">
          <span>${escapeHtml(h.name || '')} <span class="muted">(${escapeHtml(h.fileName || '')})</span></span>
          <span class="ts">${d.toLocaleString()}</span>
        </div>`;
      }).join('');
  }
  box.style.display = 'block';
}

/* Personal chat empty flat message */
const _renderPcFriends = renderPcFriends;
renderPcFriends = function() {
  const box = document.getElementById('pcFriendsList');
  if (!state.user) {
    box.innerHTML = '<p class="muted" style="padding:0.75rem;text-align:center;">Login required</p>';
    return;
  }
  const ids = state.user.friends || [];
  if (!ids.length) {
    box.innerHTML = '<p class="muted" style="padding:0.75rem;text-align:center;font-size:0.85rem;">No friends yet.<br/>Search Friends from the header.</p>';
    document.getElementById('pcThreadHead').textContent = 'Select a friend';
    document.getElementById('pcMessages').innerHTML = '<p class="center muted" style="margin:auto;">No conversation</p>';
    return;
  }
  _renderPcFriends();
};

// Ensure renderPapers sorts by likes too
const _renderPapers = renderPapers;
renderPapers = function() {
  const q = (document.getElementById('paperSearch')?.value || '').toLowerCase();
  let list = state.papers.filter(p => {
    if (!q) return true;
    return (p.subject + ' ' + p.code).toLowerCase().includes(q);
  });
  list = [...list].sort((a, b) => (b.likes || 0) - (a.likes || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  const grid = document.getElementById('papersGrid');
  const empty = document.getElementById('papersEmpty');
  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = list.map(p => paperCardHtml(p)).join('');
};


/* Admin users tab + terminate */
let termTargetId = null;

function switchAdminTab(tab) {
  document.getElementById('adminTabPapers').classList.toggle('active', tab === 'papers');
  document.getElementById('adminTabUsers').classList.toggle('active', tab === 'users');
  const tf = document.getElementById('adminTabFeedback');
  if (tf) tf.classList.toggle('active', tab === 'feedback');
  document.getElementById('adminPapersPanel').style.display = tab === 'papers' ? 'block' : 'none';
  document.getElementById('adminUsersPanel').style.display = tab === 'users' ? 'block' : 'none';
  const fp = document.getElementById('adminFeedbackPanel');
  if (fp) fp.style.display = tab === 'feedback' ? 'block' : 'none';
  if (tab === 'papers') renderAdmin();
  else if (tab === 'users') renderAdminUsers();
  else if (tab === 'feedback') renderAdminFeedback();
}

function renderAdminUsers() {
  if (!state.user || !state.user.isAdmin) return;
  const box = document.getElementById('adminUsers');
  const q = (document.getElementById('adminUserSearch')?.value || '').toLowerCase().trim();
  let users = state.users.filter(u => !u.isAdmin);
  if (q) {
    users = users.filter(u =>
      ((u.displayName||'') + ' ' + u.username + ' ' + u.email + ' ' + (u.branch||'')).toLowerCase().includes(q)
    );
  }
  if (!users.length) {
    box.innerHTML = '<p class="center muted">No users found.</p>';
    return;
  }
  box.innerHTML = users.map(u => {
    return `<div class="admin-row">
      <div class="info">
        <strong>${escapeHtml(u.displayName)} (@${escapeHtml(u.username)})</strong>
        <span>${escapeHtml(u.email)} · ${escapeHtml(u.branch||'')} · ${u.uploads||0} uploads · ${(u.friends||[]).length} friends</span>
      </div>
      <button class="btn-outline sm" onclick="openUserModal('${u.id}')">View</button>
      <button class="btn-ghost" style="color:var(--red);border-color:var(--red);" onclick="openTermModal('${u.id}')">
        <i class="fas fa-user-slash"></i> Terminate
      </button>
    </div>`;
  }).join('');
}

function openTermModal(userId) {
  termTargetId = userId;
  const u = state.users.find(x => x.id === userId);
  if (!u) return;
  document.getElementById('termUserLabel').textContent = u.displayName + ' (@' + u.username + ')';
  document.getElementById('termMessage').value = '';
  document.getElementById('termModal').classList.add('show');
}

function closeTermModal() {
  document.getElementById('termModal').classList.remove('show');
  termTargetId = null;
}

function pushSystemNotif(userId, text, opts) {
  opts = opts || {};
  const u = state.users.find(x => x.id === userId);
  if (!u) return;
  if (!u.systemNotifs) u.systemNotifs = [];
  const pinned = opts.pinned === true || opts.fromAdmin === true || opts.type === 'admin' || opts.type === 'support' || opts.type === 'congrats';
  u.systemNotifs.unshift({
    id: 'sn' + Date.now() + Math.random().toString(36).slice(2, 6),
    text: text,
    ts: Date.now(),
    fromAdmin: !!opts.fromAdmin || pinned,
    pinned: pinned,
    type: opts.type || (pinned ? 'admin' : 'info')
  });
  // cap
  if (u.systemNotifs.length > 80) u.systemNotifs = u.systemNotifs.slice(0, 80);
  if (state.user && state.user.id === userId) {
    state.user.systemNotifs = u.systemNotifs;
  }
  save();
  if (typeof updateNotifDot === 'function') updateNotifDot();
}

function sendTermMessageOnly() {
  if (!termTargetId || !state.user?.isAdmin) return;
  const msg = document.getElementById('termMessage').value.trim();
  if (!msg) { toast('Write a message first', 'error'); return; }
  // personal chat message from admin
  const key = chatKey(state.user.id, termTargetId);
  if (!state.privateChats[key]) state.privateChats[key] = [];
  state.privateChats[key].push({ from: state.user.id, text: msg, ts: Date.now(), isAdmin: true });
  pushSystemNotif(termTargetId, 'Admin message: ' + msg);
  save();
  toast('Message sent to user', 'success');
}

function confirmTerminate() {
  if (!termTargetId || !state.user?.isAdmin) return;
  const msg = document.getElementById('termMessage').value.trim();
  if (!msg) { toast('Enter a termination reason/message first', 'error'); return; }
  if (!confirm('Terminate this account? User will remain terminated after refresh/relogin.')) return;

  const u = state.users.find(x => x.id === termTargetId);
  if (!u) return;
  u.terminated = true;
  u.terminateMsg = msg;
  // personal message
  const key = chatKey(state.user.id, termTargetId);
  if (!state.privateChats[key]) state.privateChats[key] = [];
  state.privateChats[key].push({ from: state.user.id, text: 'Account terminated. Reason: ' + msg, ts: Date.now(), isAdmin: true });
  pushSystemNotif(termTargetId, 'Your account has been terminated. Reason: ' + msg);
  // Also store by email for login gate
  let banned = JSON.parse(localStorage.getItem('vitpyq_terminated') || '{}');
  banned[u.email] = { message: 'Account terminated. Admin message: ' + msg, ts: Date.now() };
  localStorage.setItem('vitpyq_terminated', JSON.stringify(banned));
  // Force logout if currently that user
  if (state.user && state.user.id === termTargetId) {
    state.user = null;
    localStorage.removeItem('vitpyq_uid');
  }
  save();
  closeTermModal();
  renderAdminUsers();
  updateUI();
  toast('User terminated', 'success');
}

function adminGiveBonus(userId) {
  if (!state.user?.isAdmin) return;
  const amount = parseInt(prompt('Bonus ZX amount:', '5000'), 10);
  if (!amount || amount < 1) return;
  const u = state.users.find(x => x.id === userId);
  if (!u) return;
  u.vcash = (u.vcash || 0) + amount;
  pushSystemNotif(userId, 'Admin gave you a bonus of ' + amount + ' ZX!');
  save();
  renderAdminUsers();
  toast('Bonus ' + amount + ' ZX given (Admin balance unchanged)', 'success');
}

function adminGiveCashPrize(userId) {
  if (!state.user?.isAdmin) return;
  const amount = parseInt(prompt('Cash prize / reward amount (ZX):', '10000'), 10);
  if (!amount || amount < 1) return;
  const u = state.users.find(x => x.id === userId);
  if (!u) return;
  u.vcash = (u.vcash || 0) + amount;
  if (!u.rewardHistory) u.rewardHistory = [];
  u.rewardHistory.unshift({ amount, type: 'cash_prize', ts: Date.now(), by: 'Admin' });
  pushSystemNotif(userId, 'Admin awarded you a cash prize of ' + amount + ' ZX!');
  save();
  renderAdminUsers();
  toast('Cash prize ' + amount + ' ZX awarded (Admin unlimited — no deduction)', 'success');
}

function adminRemovePaper(paperId) {
  if (!state.user?.isAdmin) return;
  const p = state.papers.find(x => x.id === paperId);
  if (!p) return;
  const reason = prompt('Reason / message for uploader:', 'Paper removed for policy violation');
  if (!reason) return;
  if (!confirm('Remove this paper?')) return;
  if (p.uploaderId) {
    pushSystemNotif(p.uploaderId, 'Your paper "' + (p.subject || '') + '" was removed. Admin message: ' + reason);
  }
  state.papers = state.papers.filter(x => x.id !== paperId);
  save();
  renderHomePapers();
  renderPapers();
  renderNewHighlight();
  if (typeof renderAdminPapers === 'function') renderAdminPapers();
  toast('Paper removed and uploader notified', 'success');
}

// On login — show termination notice if email was banned
const _handleLogin = handleLogin;
handleLogin = function(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const banned = JSON.parse(localStorage.getItem('vitpyq_terminated') || '{}');
  if (banned[email]) {
    alert(banned[email].message);
    return;
  }
  _handleLogin(e);
};

/* googleLogin override removed — core function has VIT-only + terminated checks */


// Show system notifs on profile / notif panel
const _renderNotifs = renderNotifs;
renderNotifs = function() {
  _renderNotifs();
  const box = document.getElementById('notifList');
  if (!box || !state.user) return;
  const sys = state.user.systemNotifs || [];
  if (sys.length) {
    const sysHtml = sys.slice(0, 10).map(n =>
      `<div class="sys-notif"><strong>Admin message</strong>${escapeHtml(n.text)}<div class="ts muted">${new Date(n.ts).toLocaleString()}</div></div>`
    ).join('');
    box.innerHTML = sysHtml + box.innerHTML;
  }
};

const _updateNotifDot = updateNotifDot;
updateNotifDot = function() {
  _updateNotifDot();
  const dot = document.getElementById('notifDot');
  if (!dot || !state.user) return;
  const n = (state.user.requests || []).length + (state.user.systemNotifs || []).length;
  dot.style.display = n > 0 ? 'block' : 'none';
};


/* Admin donate ZX + congratulate */
function adminDonate(userId) {
  if (!state.user?.isAdmin) return;
  const amount = parseInt(prompt('Donate ZX amount (permanent):', '1000'), 10);
  if (!amount || amount < 1) return;
  const u = state.users.find(x => x.id === userId);
  if (!u) return;
  u.vcash = (u.vcash || 0) + amount;
  pushSystemNotif(userId, 'Admin donated ' + amount + ' ZX to your account.');
  save();
  renderAdminUsers();
  toast('Donated ' + amount + ' ZX', 'success');
}

function adminCongratulate(userId) {
  if (!state.user?.isAdmin) return;
  const msg = prompt('Congratulation message:', 'Great work on the leaderboard!');
  if (!msg) return;
  addHighlight(userId, msg);
  pushSystemNotif(userId, 'Admin congratulated you: ' + msg);
  // also personal chat
  const key = chatKey(state.user.id, userId);
  if (!state.privateChats[key]) state.privateChats[key] = [];
  state.privateChats[key].push({ from: state.user.id, text: msg, ts: Date.now(), isAdmin: true });
  save();
  toast('Highlight added on Leaderboard', 'success');
  if (document.getElementById('leaderboard')?.classList.contains('active')) renderLeaderboard();
}

// Patch renderAdminUsers actions
const _renderAdminUsers = renderAdminUsers;
renderAdminUsers = function() {
  if (!state.user || !state.user.isAdmin) return;
  const box = document.getElementById('adminUsers');
  const q = (document.getElementById('adminUserSearch')?.value || '').toLowerCase().trim();
  let users = state.users.filter(u => !u.isAdmin);
  if (q) {
    users = users.filter(u =>
      ((u.displayName||'') + ' ' + u.username + ' ' + u.email + ' ' + (u.branch||'')).toLowerCase().includes(q)
    );
  }
  if (!users.length) {
    box.innerHTML = '<p class="center muted">No users found.</p>';
    return;
  }
  box.innerHTML = users.map(u => {
    return `<div class="admin-row">
      <div class="info">
        <strong>${escapeHtml(u.displayName)} (@${escapeHtml(u.username)})</strong>
        <span>${escapeHtml(u.email)} · ${escapeHtml(u.branch||'')} · ${(u.vcash||0).toLocaleString()} ZX · ${u.uploads||0} uploads</span>
      </div>
      <button class="btn-outline sm" onclick="openUserModal('${u.id}')">View</button>
      <button class="btn-outline sm" onclick="adminCongratulate('${u.id}')"><i class="fas fa-award"></i> Congrats</button>
      <button class="btn-outline sm" onclick="adminGiveBonus('${u.id}')"><i class="fas fa-gift"></i> Bonus</button>
      <button class="btn-outline sm" onclick="adminGiveCashPrize('${u.id}')"><i class="fas fa-trophy"></i> Cash Prize</button>
      <button class="btn-outline sm" onclick="adminDonate('${u.id}')"><i class="fas fa-coins"></i> Donate</button>
      <button class="btn-ghost" style="color:var(--red);border-color:var(--red);" onclick="openTermModal('${u.id}')">
        <i class="fas fa-user-slash"></i> Terminate
      </button>
    </div>`;
  }).join('');
};

// searchFriends: block admin
const _searchFriends = searchFriends;
searchFriends = function(q) {
  if (state.user && state.user.isAdmin) {
    document.getElementById('friendSearchResults').innerHTML =
      '<p class="muted" style="padding:0.5rem;">Admin uses Admin Panel → Users. Friend requests are disabled for admin.</p>';
    return;
  }
  _searchFriends(q);
};


/* setItemActive — apply/remove without rebuy */
function setItemActive(itemId, on) {
  if (!state.user) return;
  if (!state.user.items || !state.user.items.includes(itemId)) {
    toast('You do not own this item', 'error'); return;
  }
  if (!state.user.activeItems) state.user.activeItems = [];
  const i = state.user.activeItems.indexOf(itemId);
  if (on && i < 0) state.user.activeItems.push(itemId);
  if (!on && i >= 0) state.user.activeItems.splice(i, 1);
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.activeItems = [...state.user.activeItems];
  save();
  renderProfile();
  refreshStoreButtons();
  toast(on ? 'Applied' : 'Removed', 'success');
}

function buyVerified() {
  if (!state.user) { toast('Login required', 'error'); showSection('auth'); return; }
  if (state.user.verified) { toast('Already verified', 'error'); return; }
  if ((state.user.vcash || 0) < 50000) { toast('Need 50,000 ZX', 'error'); return; }
  state.user.vcash -= 50000;
  state.user.verified = true;
  if (!state.user.items) state.user.items = [];
  if (!state.user.items.includes('verified')) state.user.items.push('verified');
  const u = state.users.find(x => x.id === state.user.id);
  if (u) {
    u.vcash = state.user.vcash;
    u.verified = true;
    u.items = state.user.items;
  }
  save(); updateUI(); updateStoreVcash(); refreshStoreButtons();
  toast('Verified badge added to Vault!', 'success');
  if (document.getElementById('profile')?.classList.contains('active')) renderProfile();
}

function refreshStoreButtons() {
  if (!state.user) return;
  document.querySelectorAll('#storeDesignGrid .store-card, #storeBadgesGrid .store-card').forEach(card => {
    const btn = card.querySelector('button[onclick]');
    if (!btn) return;
    const oc = btn.getAttribute('onclick') || '';
    let itemId = null;
    const m = oc.match(/buyItem\('([^']+)'/);
    if (m) itemId = m[1];
    if (oc.includes('buyVerified')) {
      if (state.user.verified) {
        btn.textContent = 'Owned';
        btn.disabled = true;
      }
      return;
    }
    if (oc.includes('buyBadge')) {
      const bm = oc.match(/buyBadge\('([^']+)'/);
      if (bm && state.user.badge === bm[1]) {
        btn.textContent = 'Equipped';
        btn.disabled = true;
      }
      return;
    }
    if (!itemId) return;
    const owned = (state.user.items || []).includes(itemId);
    if (!owned) return;
    const active = (state.user.activeItems || []).includes(itemId);
    const wrap = document.createElement('div');
    wrap.className = 'store-actions';
    wrap.innerHTML = `
      <button type="button" class="btn-outline sm" onclick="setItemActive('${itemId}', true)" ${active ? 'disabled' : ''}>Apply</button>
      <button type="button" class="btn-primary sm" onclick="setItemActive('${itemId}', false)" ${!active ? 'disabled' : ''}>Remove</button>`;
    btn.replaceWith(wrap);
  });
}

const _updateStoreVcash = updateStoreVcash;
updateStoreVcash = function() {
  _updateStoreVcash();
  refreshStoreButtons();
};

/* Friend search → open profile on name click */
const _searchFriends2 = searchFriends;
searchFriends = function(q) {
  if (state.user && state.user.isAdmin) {
    document.getElementById('friendSearchResults').innerHTML =
      '<p class="muted" style="padding:0.5rem;">Admin uses Admin Panel → Users.</p>';
    return;
  }
  q = (q || '').toLowerCase().trim();
  const box = document.getElementById('friendSearchResults');
  if (!q || !state.user) { box.innerHTML = ''; return; }
  const myId = state.user.id;
  const myFriends = state.user.friends || [];
  const list = state.users.filter(u =>
    !u.isAdmin && u.id !== myId &&
    (u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q))
  ).slice(0, 12);
  if (!list.length) { box.innerHTML = '<p class="muted" style="padding:0.4rem;">No users found</p>'; return; }
  box.innerHTML = list.map(u => {
    const isFriend = myFriends.includes(u.id);
    const sent = (u.requests || []).includes(myId);
    const incoming = (state.user.requests || []).includes(u.id);
    let action = '';
    if (isFriend) action = `<button class="btn-outline sm" onclick="event.stopPropagation(); openPersonalFromNotif('${u.id}')">Message</button>`;
    else if (incoming) action = `<button class="btn-primary sm" onclick="event.stopPropagation(); acceptFriend('${u.id}')">Accept</button>`;
    else if (sent) action = '<span class="muted">Requested</span>';
    else action = `<button class="btn-outline sm" onclick="event.stopPropagation(); sendFriendRequest('${u.id}')">Add</button>`;
    const tick = (u.verified === true) ? ' <i class="fas fa-check-circle" style="color:#1d9bf0"></i>' : '';
    const privacyTag = u.isPublic === false ? '<span class="privacy-status-tag">Private</span>' : '';
    return `<div class="dropdown-item" style="cursor:pointer;" onclick="openUserModal('${u.id}')">
      <span><strong>@${escapeHtml(u.username)}</strong>${tick} ${privacyTag}<br/><span class="muted">${escapeHtml(u.displayName)}</span></span>
      ${action}
    </div>`;
  }).join('');
};

function openPersonalFromNotif(friendId) {
  document.getElementById('friendsSearchPanel')?.classList.remove('open');
  document.getElementById('notifPanel')?.classList.remove('open');
  showSection('chat');
  const panel = document.getElementById('personalChatPanel');
  if (panel) panel.style.display = 'block';
  renderPcFriends();
  openPersonalThread(friendId);
}

/* Heart = friend requests + messages + admin system notifs; click opens chat */
renderNotifs = function() {
  const box = document.getElementById('notifList');
  if (!box || !state.user) return;
  let html = '';
  const sys = state.user.systemNotifs || [];
  sys.slice(0, 8).forEach(n => {
    html += `<div class="sys-notif" onclick="showSection('chat')"><strong>Admin / System</strong>${escapeHtml(n.text)}
      <div class="ts muted">${new Date(n.ts).toLocaleString()}</div></div>`;
  });
  const reqs = state.user.requests || [];
  reqs.forEach(id => {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    html += `<div class="dropdown-item">
      <span>Friend request · @${escapeHtml(u.username)}</span>
      <span>
        <button class="btn-primary sm" onclick="acceptFriend('${id}')">Accept</button>
        <button class="btn-ghost sm" onclick="rejectFriend('${id}')">Ignore</button>
      </span>
    </div>`;
  });
  // unread-ish private messages (last from others)
  Object.keys(state.privateChats || {}).forEach(key => {
    const parts = key.split('_');
    if (!parts.includes(state.user.id)) return;
    const otherId = parts[0] === state.user.id ? parts[1] : parts[0];
    const msgs = state.privateChats[key] || [];
    const last = msgs[msgs.length - 1];
    if (!last || last.from === state.user.id) return;
    const u = state.users.find(x => x.id === otherId);
    html += `<div class="notif-msg-item" onclick="openPersonalFromNotif('${otherId}')">
      <strong>Message · @${u ? escapeHtml(u.username) : 'user'}</strong>
      <div class="muted">${escapeHtml(last.text).slice(0, 60)}</div>
    </div>`;
  });
  if (!html) html = '<p class="muted" style="padding:0.4rem;">No notifications</p>';
  box.innerHTML = html;
};

updateNotifDot = function() {
  const dot = document.getElementById('notifDot');
  if (!dot || !state.user) return;
  let n = (state.user.requests || []).length + (state.user.systemNotifs || []).length;
  Object.keys(state.privateChats || {}).forEach(key => {
    if (!key.includes(state.user.id)) return;
    const msgs = state.privateChats[key] || [];
    const last = msgs[msgs.length - 1];
    if (last && last.from !== state.user.id) n++;
  });
  dot.style.display = n > 0 ? 'block' : 'none';
};

/* GSAP animations */
function initGsap() {
  if (typeof gsap === 'undefined') return;
  try {
    gsap.registerPlugin(ScrollTrigger);
    gsap.from('.hero-content > *', { y: 24, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out' });
    gsap.utils.toArray('.stat-card, .store-card, .paper-thumb-card, .faq-item, .leader-row').forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' },
        y: 20, opacity: 0, duration: 0.45, delay: (i % 6) * 0.04, ease: 'power2.out'
      });
    });
    document.querySelectorAll('.store-card, .btn-primary, .campus-pill, .paper-thumb-card').forEach(el => {
      el.addEventListener('mouseenter', () => gsap.to(el, { scale: 1.03, duration: 0.2, ease: 'power1.out' }));
      el.addEventListener('mouseleave', () => gsap.to(el, { scale: 1, duration: 0.2 }));
    });
  } catch (e) { console.warn('GSAP', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initGsap, 200);
});

// pause carousel on user interaction
document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('carouselTrack');
  if (!track) return;
  const pause = () => { state._carouselPaused = true; clearTimeout(state._carouselResume); state._carouselResume = setTimeout(() => { state._carouselPaused = false; }, 8000); };
  track.addEventListener('wheel', pause, { passive: true });
  track.addEventListener('touchstart', pause, { passive: true });
  track.addEventListener('mousedown', pause);
});


/* ===== Vault + Custom Title + Blue Tick + Star ===== */
function openVault() {
  if (!state.user) return;
  const box = document.getElementById('vaultItems');
  const items = state.user.items || [];
  const active = state.user.activeItems || [];
  // Ensure default bronze badge is always in vault
  if (!items.includes('badge_bronze')) {
    items.unshift('badge_bronze');
    state.user.items = items;
  }
  const badgeItems = items.filter(id => id.startsWith('badge_'));
  const designItems = items.filter(id => !id.startsWith('badge_'));
  let html = '';
  if (badgeItems.length || true) {
    html += '<div style="margin-bottom:0.75rem;"><strong style="font-size:0.85rem;">Badges</strong></div>';
    const badgesToShow = badgeItems.length ? badgeItems : ['badge_bronze'];
    html += badgesToShow.map(id => {
      const b = id.replace('badge_', '');
      const on = (state.user.badge || 'bronze') === b;
      return `<div class="owned-item-row">
        <span>${badgeHtml(b)} ${b.charAt(0).toUpperCase()+b.slice(1)}</span>
        <span class="store-actions">
          <button type="button" class="btn-outline sm" onclick="equipBadge('${b}')" ${on?'disabled':''}>Equip</button>
          <button type="button" class="btn-primary sm" onclick="equipBadge('bronze')" ${!on||b==='bronze'?'disabled':''}>Remove</button>
        </span>
      </div>`;
    }).join('');
  }
  if (designItems.length) {
    html += '<div style="margin:0.75rem 0 0.35rem;"><strong style="font-size:0.85rem;">Design items</strong></div>';
    html += designItems.map(id => {
      const on = active.includes(id);
      return `<div class="owned-item-row">
        <span>${ITEM_LABELS[id] || id}</span>
        <span class="store-actions">
          <button type="button" class="btn-outline sm" onclick="setItemActive('${id}', true); openVault();" ${on?'disabled':''}>Equip</button>
          <button type="button" class="btn-primary sm" onclick="setItemActive('${id}', false); openVault();" ${!on?'disabled':''}>Remove</button>
        </span>
      </div>`;
    }).join('');
  }
  if (!badgeItems.length && !designItems.length) {
    html = '<p class="muted">Vault has default Bronze badge. Buy more in Store.</p>' + html;
  }
  box.innerHTML = html;
  const te = document.getElementById('vaultTitleEditor');
  if (items.includes('title')) {
    te.style.display = 'block';
    document.getElementById('vaultTitleInput').value = state.user.customTitle || '';
  } else {
    te.style.display = 'none';
  }
  document.getElementById('vaultModal').classList.add('show');
}
function closeVault() {
  document.getElementById('vaultModal').classList.remove('show');
}
function saveCustomTitle() {
  if (!state.user) return;
  const t = document.getElementById('vaultTitleInput').value.trim().slice(0, 40);
  state.user.customTitle = t;
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.customTitle = t;
  save();
  renderProfile();
  toast('Custom title saved', 'success');
}

function updateNameDecor(prefix, u) {
  // star from star_pad active; title no longer uses star
  const star = document.getElementById(prefix + 'Star');
  const tick = document.getElementById(prefix + 'Verified');
  const active = u.activeItems || [];
  if (star) star.style.display = active.includes('star_pad') ? 'inline' : 'none';
  if (tick) tick.style.display = (u.verified === true) ? 'inline-flex' : 'none';
}

function updateCustomTitleNote(elId, u) {
  const el = document.getElementById(elId);
  if (!el) return;
  const active = u.activeItems || [];
  if (active.includes('title') && u.customTitle) {
    el.style.display = 'block';
    el.textContent = u.customTitle;
  } else {
    el.style.display = 'none';
    el.textContent = '';
  }
}

// Override end of profile render via wrapper
const __rp = renderProfile;
renderProfile = function() {
  __rp();
  if (!state.user) return;
  const u = state.user;
  updateNameDecor('prof', u);
  updateCustomTitleNote('customTitleNote', u);
  const vb = document.getElementById('vaultOpenBtn');
  if (vb) vb.style.display = 'block';
  // hide old owned box if present
  const ob = document.getElementById('ownedItemsBox');
  if (ob) ob.style.display = 'none';
  // remove fx-title star side-effect — title is note only
  const card = document.querySelector('#profile .profile-card');
  if (card) card.classList.remove('fx-title');
  applyProfileEffects();
  if (card && (u.activeItems||[]).includes('title')) {
    /* title is note, not card class star */
  }
};

const __oum = openUserModal;
openUserModal = function(id) {
  __oum(id);
  const u = state.users.find(x => x.id === id);
  if (!u) return;
  updateNameDecor('modal', u);
  updateCustomTitleNote('modalCustomTitle', u);
  // admin can remove highlight from modal if present
};

/* Remove title from applying star via CSS class */
const __ape = applyProfileEffects;
applyProfileEffects = function() {
  __ape();
  const card = document.querySelector('#profile .profile-card');
  if (card) card.classList.remove('fx-title');
  // extra effects
  if (!card || !state.user) return;
  (state.user.activeItems || []).forEach(id => {
    if (id === 'title') return;
    card.classList.add('fx-' + id);
  });
};

/* Leaderboard highlights — admin remove */
renderLbHighlights = function() {
  const box = document.getElementById('lbHighlights');
  if (!box) return;
  const section = document.getElementById('leaderHighlightsSection');
  const highlights = JSON.parse(localStorage.getItem('vitpyq_highlights') || '[]');
  if (!highlights.length) {
    box.style.display = 'none'; box.innerHTML = '';
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = 'block';
  box.style.display = 'flex';
  const isAdmin = state.user && state.user.isAdmin;
  box.innerHTML = highlights.slice(0, 12).map(h => {
    const u = state.users.find(x => x.id === h.userId);
    const name = u ? u.displayName : (h.name || 'User');
    const av = u ? (u.avatar || defaultAvatar(name)) : defaultAvatar(name);
    const rm = isAdmin
      ? `<button type="button" class="lb-h-remove" title="Remove highlight" onclick="event.stopPropagation(); removeHighlight('${h.id}')"><i class="fas fa-times"></i></button>`
      : '';
    return `<div class="lb-h-card ${isAdmin ? 'admin-can-remove' : ''}" onclick="openUserModal('${h.userId}')">
      ${rm}
      <img src="${av}" alt="" />
      <div class="h-name">${escapeHtml(name)}</div>
      <div class="h-msg">${escapeHtml(h.message || 'Congrats!')}</div>
    </div>`;
  }).join('');
};

function removeHighlight(hid) {
  if (!state.user?.isAdmin) return;
  let highlights = JSON.parse(localStorage.getItem('vitpyq_highlights') || '[]');
  highlights = highlights.filter(h => h.id !== hid);
  localStorage.setItem('vitpyq_highlights', JSON.stringify(highlights));
  renderLbHighlights();
  toast('Highlight removed', 'success');
}

/* Admin Message button */
function adminMessageUser(userId) {
  if (!state.user?.isAdmin) return;
  const msg = prompt('Send notice / message to user:');
  if (!msg || !msg.trim()) return;
  const key = chatKey(state.user.id, userId);
  if (!state.privateChats[key]) state.privateChats[key] = [];
  state.privateChats[key].push({ from: state.user.id, text: msg.trim(), ts: Date.now(), isAdmin: true });
  pushSystemNotif(userId, 'Admin message: ' + msg.trim());
  save();
  toast('Message sent — user will see it in heart notifications', 'success');
}

const __rau = renderAdminUsers;
renderAdminUsers = function() {
  const box = document.getElementById('adminUsers');
  if (!box || !state.user?.isAdmin) return;
  const q = (document.getElementById('adminUserSearch')?.value || '').toLowerCase().trim();
  let users = state.users.filter(u => !u.isAdmin);
  if (q) {
    users = users.filter(u =>
      ((u.displayName||'') + ' ' + u.username + ' ' + u.email + ' ' + (u.branch||'')).toLowerCase().includes(q)
    );
  }
  if (!users.length) {
    box.innerHTML = '<p class="center muted">No users found.</p>';
    return;
  }
  box.innerHTML = users.map(u => {
    const id = u.id;
    return `<div class="admin-row">
      <div class="info">
        <strong>${escapeHtml(u.displayName)} (@${escapeHtml(u.username)})</strong>
        <span>${escapeHtml(u.email)} · ${escapeHtml(u.branch||'')} · ${(u.vcash||0).toLocaleString()} ZX · ${u.uploads||0} uploads</span>
      </div>
      <div class="admin-actions">
        <button class="btn-outline sm admin-act" onclick="openUserModal('${id}')"><i class="fas fa-eye"></i> View</button>
        <button class="btn-outline sm admin-act" onclick="adminMessageUser('${id}')"><i class="fas fa-comment"></i> Message</button>
        <button class="btn-outline sm admin-act admin-act-more" onclick="adminCongratulate('${id}')"><i class="fas fa-award"></i> Congrats</button>
        <button class="btn-outline sm admin-act admin-act-more" onclick="adminGiveCashPrize('${id}')"><i class="fas fa-trophy"></i> Cash Prize</button>
        <button class="btn-outline sm admin-act admin-act-more" onclick="adminDonate('${id}')"><i class="fas fa-coins"></i> Donate</button>
        <button class="btn-ghost sm admin-act admin-act-more admin-act-term" onclick="openTermModal('${id}')"><i class="fas fa-user-slash"></i> Terminate</button>
        <div class="admin-more-wrap">
          <button type="button" class="btn-outline sm admin-more-btn" onclick="toggleAdminMore(this)" aria-label="More actions"><i class="fas fa-ellipsis-v"></i></button>
          <div class="admin-more-menu">
            <button type="button" onclick="adminCongratulate('${id}'); closeAdminMore(this)"><i class="fas fa-award"></i> Congrats</button>
            <button type="button" onclick="adminGiveCashPrize('${id}'); closeAdminMore(this)"><i class="fas fa-trophy"></i> Cash Prize</button>
            <button type="button" onclick="adminDonate('${id}'); closeAdminMore(this)"><i class="fas fa-coins"></i> Donate</button>
            <button type="button" class="danger" onclick="openTermModal('${id}'); closeAdminMore(this)"><i class="fas fa-user-slash"></i> Terminate</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
};

function toggleAdminMore(btn) {
  const wrap = btn.closest('.admin-more-wrap');
  document.querySelectorAll('.admin-more-wrap.open').forEach(w => {
    if (w !== wrap) w.classList.remove('open');
  });
  if (wrap) wrap.classList.toggle('open');
}
function closeAdminMore(el) {
  const wrap = el.closest ? el.closest('.admin-more-wrap') : null;
  if (wrap) wrap.classList.remove('open');
  document.querySelectorAll('.admin-more-wrap.open').forEach(w => w.classList.remove('open'));
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.admin-more-wrap')) {
    document.querySelectorAll('.admin-more-wrap.open').forEach(w => w.classList.remove('open'));
  }
});

/* CSS classes for new items */


function toggleNewUploadsPanel() {
  const box = document.getElementById('newHighlight');
  const arrow = document.getElementById('newUploadsArrow');
  if (!box) return;
  const open = box.classList.toggle('panel-open');
  if (open) {
    box.style.display = 'block';
    renderNewHighlight();
  } else {
    box.style.display = 'none';
  }
  if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : '';
}



/* FAQ pager — 3 items per page */
let faqPageIndex = 0;
const FAQ_PER_PAGE = 3;
function initFaqPager() {
  const items = document.querySelectorAll('#faqList .faq-item');
  if (!items.length) return;
  const pages = Math.ceil(items.length / FAQ_PER_PAGE) || 1;
  // re-tag pages by index groups of 3
  items.forEach((el, i) => {
    el.dataset.page = String(Math.floor(i / FAQ_PER_PAGE));
  });
  const dots = document.getElementById('faqDots');
  if (dots) {
    dots.innerHTML = Array.from({ length: pages }, (_, i) =>
      `<button type="button" class="faq-dot${i === 0 ? ' active' : ''}" onclick="goFaqPage(${i})" aria-label="FAQ page ${i+1}"></button>`
    ).join('');
  }
  faqPageIndex = 0;
  renderFaqPage();
}
function renderFaqPage() {
  const items = document.querySelectorAll('#faqList .faq-item');
  const pages = Math.ceil(items.length / FAQ_PER_PAGE) || 1;
  faqPageIndex = Math.max(0, Math.min(faqPageIndex, pages - 1));
  items.forEach((el, i) => {
    const page = Math.floor(i / FAQ_PER_PAGE);
    el.style.display = page === faqPageIndex ? '' : 'none';
    if (page !== faqPageIndex) el.open = false;
  });
  document.querySelectorAll('#faqDots .faq-dot').forEach((d, i) => {
    d.classList.toggle('active', i === faqPageIndex);
  });
  const prev = document.getElementById('faqPrev');
  const next = document.getElementById('faqNext');
  if (prev) prev.disabled = faqPageIndex <= 0;
  if (next) next.disabled = faqPageIndex >= pages - 1;
}
function faqPage(delta) {
  faqPageIndex += delta;
  renderFaqPage();
}
function goFaqPage(i) {
  faqPageIndex = i;
  renderFaqPage();
}

let feedbackAnim = null;

/* Late init — after all function defs */
(function lateBoot() {
  try {
    if (typeof startHomeQuotes === 'function') startHomeQuotes();
    if (typeof updateSubscriptionUI === 'function') updateSubscriptionUI();
    if (typeof updateNewUploadsBadge === 'function') updateNewUploadsBadge();
    if (typeof initFaqPager === 'function') initFaqPager();
    if (typeof startFeedbackCredits === 'function') startFeedbackCredits();
  } catch (e) { console.warn(e); }
})();


/* ===== v17 Notifications + Support Chat ===== */
const SUPPORT_ID = 'admin';

function notifTypeLabel(type) {
  const map = {
    admin: 'Admin',
    support: 'Support',
    congrats: 'Congratulations',
    bonus: 'Bonus',
    reward: 'Reward',
    upload: 'Upload',
    chat: 'Chat',
    friend: 'Friend request',
    info: 'Notice'
  };
  return map[type] || 'Notice';
}

renderNotifs = function() {
  const box = document.getElementById('notifList');
  if (!box) return;
  if (!state.user) { box.innerHTML = '<p class="muted" style="padding:0.5rem;">Login to see notifications</p>'; return; }
  let html = '';

  // Friend requests
  const reqs = state.user.requests || [];
  reqs.forEach(id => {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    html += `<div class="notif-item">
      <div class="notif-type">Friend request</div>
      <div>@${escapeHtml(u.username)} wants to connect</div>
      <span style="display:flex;gap:0.35rem;margin-top:0.4rem;">
        <button class="btn-primary sm" onclick="acceptFriend('${id}')">Accept</button>
        <button class="btn-ghost sm" onclick="rejectFriend('${id}')">Ignore</button>
      </span>
    </div>`;
  });

  // System / app notifications (pinned first)
  const sys = (state.user.systemNotifs || []).slice();
  sys.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.ts || 0) - (a.ts || 0));
  sys.forEach(n => {
    const pin = n.pinned ? ' pinned' : '';
    const pinIcon = n.pinned ? ' <i class="fas fa-thumbtack" style="font-size:0.7rem;opacity:0.8;"></i>' : '';
    html += `<div class="notif-item${pin}">
      <div class="notif-type">${escapeHtml(notifTypeLabel(n.type))}${pinIcon}</div>
      <div>${escapeHtml(n.text)}</div>
      <div class="ts">${n.ts ? new Date(n.ts).toLocaleString() : ''}</div>
    </div>`;
  });

  // Recent private chat previews (not from self)
  Object.keys(state.privateChats || {}).forEach(key => {
    if (!key.includes(state.user.id)) return;
    const parts = key.split('_');
    const otherId = parts[0] === state.user.id ? parts[1] : parts[0];
    const msgs = state.privateChats[key] || [];
    const last = msgs[msgs.length - 1];
    if (!last || last.from === state.user.id) return;
    const isSupport = otherId === SUPPORT_ID || last.isAdmin;
    const u = state.users.find(x => x.id === otherId);
    const name = isSupport ? 'Support' : (u ? '@' + u.username : 'User');
    html += `<div class="notif-item" style="cursor:pointer;" onclick="openChatFromNotif('${otherId}')">
      <div class="notif-type">${isSupport ? 'Support' : 'Chat'}</div>
      <div><strong>${escapeHtml(name)}</strong>: ${escapeHtml((last.text || '').slice(0, 80))}</div>
      <div class="ts">${last.ts ? new Date(last.ts).toLocaleString() : ''}</div>
    </div>`;
  });

  if (!html) html = '<p class="muted" style="padding:0.5rem;">No notifications yet</p>';
  box.innerHTML = html;
};

updateNotifDot = function() {
  const dot = document.getElementById('notifDot');
  if (!dot) return;
  if (!state.user) { dot.style.display = 'none'; return; }
  let n = (state.user.requests || []).length;
  n += (state.user.systemNotifs || []).filter(x => !x.read).length;
  // unread-ish private msgs
  Object.keys(state.privateChats || {}).forEach(key => {
    if (!key.includes(state.user.id)) return;
    const msgs = state.privateChats[key] || [];
    const last = msgs[msgs.length - 1];
    if (last && last.from !== state.user.id) n++;
  });
  if (n > 0) {
    dot.style.display = 'flex';
    dot.textContent = n > 99 ? '99+' : String(n);
  } else {
    dot.style.display = 'none';
    dot.textContent = '0';
  }
};

function clearClearableNotifs() {
  if (!state.user) return;
  const u = state.users.find(x => x.id === state.user.id);
  if (!u) return;
  // Clear ALL system notifications
  u.systemNotifs = [];
  state.user.systemNotifs = [];
  // Mark private chat previews as seen so badge clears
  Object.keys(state.privateChats || {}).forEach(key => {
    if (!key.includes(state.user.id)) return;
    const msgs = state.privateChats[key] || [];
    msgs.forEach(m => { if (m.from !== state.user.id) m._seen = true; });
  });
  save();
  renderNotifs();
  updateNotifDot();
  toast('All notifications cleared', 'success');
}

function openChatFromNotif(otherId) {
  document.getElementById('notifPanel')?.classList.remove('open');
  showSection('chat');
  const panel = document.getElementById('personalChatPanel');
  if (panel) panel.style.display = 'block';
  openPersonalThread(otherId);
}

renderPcFriends = function() {
  const box = document.getElementById('pcFriendsList');
  if (!box) return;
  if (!state.user) {
    box.innerHTML = '<p class="muted" style="padding:0.5rem;">Login required</p>';
    return;
  }
  let html = '';
  // Support always first for non-admin users
  if (!state.user.isAdmin) {
    const active = state.activeFriendId === SUPPORT_ID ? ' active' : '';
    html += `<div class="pc-support-row${active}" onclick="openPersonalThread('${SUPPORT_ID}')">
      <i class="fas fa-headset"></i> Support
    </div>`;
  }
  const ids = state.user.friends || [];
  html += '<div class="pc-friends-head">Friends</div>';
  if (!ids.length) {
    html += '<p class="muted" style="padding:0.5rem;font-size:0.8rem;">No friends yet.</p>';
  } else {
    html += ids.map(id => {
      const u = state.users.find(x => x.id === id);
      if (!u) return '';
      const active = state.activeFriendId === id ? ' active' : '';
      return `<div class="pc-friend${active}" onclick="openPersonalThread('${id}')">@${escapeHtml(u.username)}</div>`;
    }).join('');
  }
  // Admin: list users who messaged support
  if (state.user.isAdmin) {
    html += '<div class="pc-friends-head">Support inbox</div>';
    const seen = new Set();
    Object.keys(state.privateChats || {}).forEach(key => {
      if (!key.includes(SUPPORT_ID)) return;
      const parts = key.split('_');
      const other = parts[0] === SUPPORT_ID ? parts[1] : parts[0];
      if (other === SUPPORT_ID || seen.has(other)) return;
      seen.add(other);
      const u = state.users.find(x => x.id === other);
      if (!u || u.isAdmin) return;
      const active = state.activeFriendId === other ? ' active' : '';
      html += `<div class="pc-friend${active}" onclick="openPersonalThread('${other}')">@${escapeHtml(u.username)}</div>`;
    });
    if (!seen.size) html += '<p class="muted" style="padding:0.5rem;font-size:0.8rem;">No support chats yet.</p>';
  }
  box.innerHTML = html;
};

const _openPersonalThread = openPersonalThread;
openPersonalThread = function(friendId) {
  state.activeFriendId = friendId;
  const isSupport = friendId === SUPPORT_ID;
  const u = state.users.find(x => x.id === friendId);
  let title;
  if (isSupport && state.user && !state.user.isAdmin) {
    title = 'Support';
  } else if (state.user && state.user.isAdmin && u && !u.isAdmin) {
    title = 'Support · @' + u.username;
  } else {
    title = u ? '@' + u.username : 'Chat';
  }
  const head = document.getElementById('pcThreadHead');
  if (head) head.textContent = title;
  renderPcFriends();
  renderPcMessages();
};

// When admin messages user via personal chat, also pin notif
const _sendPersonalChat = typeof sendPersonalChat === 'function' ? sendPersonalChat : null;
if (_sendPersonalChat) {
  sendPersonalChat = function(e) {
    e.preventDefault();
    if (!state.user || !state.activeFriendId) return;
    const input = document.getElementById('pcInput');
    const text = (input && input.value || '').trim();
    if (!text) return;
    const key = chatKey(state.user.id, state.activeFriendId);
    if (!state.privateChats[key]) state.privateChats[key] = [];
    const isAdminSender = !!state.user.isAdmin;
    state.privateChats[key].push({
      from: state.user.id,
      text,
      ts: Date.now(),
      isAdmin: isAdminSender
    });
    if (isAdminSender) {
      pushSystemNotif(state.activeFriendId, text, { type: 'support', fromAdmin: true, pinned: true });
    } else if (state.activeFriendId === SUPPORT_ID) {
      // user messaged support — notify admin via system notif on admin account
      pushSystemNotif(SUPPORT_ID, '@' + state.user.username + ': ' + text, { type: 'support', pinned: false });
    }
    if (input) input.value = '';
    save();
    renderPcMessages();
    updateNotifDot();
  };
}

// Hook congrats / bonus / donate to use typed notifs
const _adminCongratulate = adminCongratulate;
adminCongratulate = function(userId) {
  if (!state.user?.isAdmin) return;
  const msg = prompt('Congratulation message:', 'Great work on the leaderboard!');
  if (!msg) return;
  if (typeof addHighlight === 'function') addHighlight(userId, msg);
  pushSystemNotif(userId, msg, { type: 'congrats', fromAdmin: true, pinned: true });
  const key = chatKey(state.user.id, userId);
  if (!state.privateChats[key]) state.privateChats[key] = [];
  state.privateChats[key].push({ from: state.user.id, text: msg, ts: Date.now(), isAdmin: true });
  save();
  toast('Congratulations sent', 'success');
  if (document.getElementById('leaderboard')?.classList.contains('active') && typeof renderLeaderboard === 'function') renderLeaderboard();
};

const _adminGiveCashPrize = adminGiveCashPrize;
adminGiveCashPrize = function(userId) {
  if (!state.user?.isAdmin) return;
  const amount = parseInt(prompt('Cash prize / reward amount (ZX):', '10000'), 10);
  if (!amount || amount < 1) return;
  const u = state.users.find(x => x.id === userId);
  if (!u) return;
  u.vcash = (u.vcash || 0) + amount;
  if (!u.rewardHistory) u.rewardHistory = [];
  u.rewardHistory.unshift({ amount, type: 'cash_prize', ts: Date.now(), by: 'Admin' });
  pushSystemNotif(userId, 'You received a cash prize of ' + amount.toLocaleString() + ' ZX!', { type: 'reward', fromAdmin: true, pinned: true });
  save();
  if (typeof renderAdminUsers === 'function') renderAdminUsers();
  toast('Cash prize awarded', 'success');
};

const _adminDonate = adminDonate;
adminDonate = function(userId) {
  if (!state.user?.isAdmin) return;
  const amount = parseInt(prompt('Donate ZX amount (permanent):', '1000'), 10);
  if (!amount || amount < 1) return;
  const u = state.users.find(x => x.id === userId);
  if (!u) return;
  u.vcash = (u.vcash || 0) + amount;
  pushSystemNotif(userId, 'Admin donated ' + amount.toLocaleString() + ' ZX to your account.', { type: 'bonus', fromAdmin: true, pinned: true });
  save();
  if (typeof renderAdminUsers === 'function') renderAdminUsers();
  toast('Donated ' + amount + ' ZX', 'success');
};

// Upload success → notify uploader (already toast) + optional self notif


/* ===== v18 Report paper + new uploads single column ===== */
function openReportPaper(paperId) {
  if (!state.user) { toast('Login to report', 'error'); showSection('auth'); return; }
  const p = state.papers.find(x => x.id === paperId);
  if (!p) return;
  const reason = prompt('Report this paper — describe the issue (wrong paper, spam, offensive, etc.):');
  if (reason === null) return;
  const text = (reason || '').trim();
  if (!text) { toast('Please enter a reason', 'error'); return; }
  // Store complaint
  let reports = JSON.parse(localStorage.getItem('vitpyq_reports') || '[]');
  const report = {
    id: 'r' + Date.now(),
    paperId: p.id,
    subject: p.subject,
    code: p.code,
    uploaderId: p.uploaderId,
    fromId: state.user.id,
    fromName: state.user.username || state.user.displayName,
    reason: text,
    ts: Date.now(),
    status: 'open'
  };
  reports.unshift(report);
  localStorage.setItem('vitpyq_reports', JSON.stringify(reports));
  // Notify admin (pinned)
  pushSystemNotif('admin', 'Complaint on "' + (p.subject || 'paper') + '" by @' + (state.user.username || 'user') + ': ' + text, {
    type: 'admin', fromAdmin: false, pinned: true
  });
  // Also personal support-style message to admin
  const key = chatKey(state.user.id, 'admin');
  if (!state.privateChats[key]) state.privateChats[key] = [];
  state.privateChats[key].push({
    from: state.user.id,
    text: '[REPORT] Paper: ' + (p.subject || '') + ' (' + (p.code || '') + ') — ' + text,
    ts: Date.now(),
    isReport: true,
    paperId: p.id
  });
  save();
  toast('Report sent to Support / Admin', 'success');
}

// Force new uploads list to one item per row
const _rnh = renderNewHighlight;
renderNewHighlight = function() {
  _rnh();
  const track = document.getElementById('newTrack');
  if (track) {
    track.classList.add('new-track-list');
    track.style.display = 'flex';
    track.style.flexDirection = 'column';
    track.style.overflowX = 'hidden';
  }
};


/* ===== v19 Real-time Student Feedback ===== */
function loadFeedbacks() {
  return JSON.parse(localStorage.getItem('vitpyq_feedbacks') || '[]');
}
function saveFeedbacks(list) {
  localStorage.setItem('vitpyq_feedbacks', JSON.stringify(list));
}

function openFeedbackForm() {
  if (!state.user) { toast('Login to send feedback', 'error'); showSection('auth'); return; }
  const text = prompt('Share your feedback about VIT PYQ\'s (max 200 chars):');
  if (text === null) return;
  const msg = (text || '').trim().slice(0, 200);
  if (!msg) { toast('Please write something', 'error'); return; }
  const list = loadFeedbacks();
  list.unshift({
    id: 'fb' + Date.now(),
    userId: state.user.id,
    username: state.user.username || 'user',
    displayName: state.user.displayName || state.user.username,
    avatar: state.user.avatar || '',
    text: msg,
    ts: Date.now()
  });
  saveFeedbacks(list);
  toast('Thanks for your feedback!', 'success');
  startFeedbackCredits();
  if (document.getElementById('adminFeedbackPanel')?.style.display === 'block') renderAdminFeedback();
}

function startFeedbackCredits() {
  const stage = document.getElementById('feedbackCredits');
  if (!stage) return;
  const list = loadFeedbacks();
  if (feedbackAnim) {
    try { feedbackAnim.kill(); } catch (e) {}
    feedbackAnim = null;
  }
  stage.innerHTML = '';
  if (!list.length) {
    stage.innerHTML = '<div class="fb-credit-line muted">Be the first to share feedback.</div>';
    return;
  }
  // Build credit lines
  list.slice(0, 40).forEach(fb => {
    const line = document.createElement('div');
    line.className = 'fb-credit-line';
    const av = fb.avatar || (typeof defaultAvatar === 'function' ? defaultAvatar(fb.displayName) : '');
    line.innerHTML = `<img class="fb-av" src="${av}" alt="" /><div class="fb-body"><strong>@${escapeHtml(fb.username)}</strong><span>${escapeHtml(fb.text)}</span></div>`;
    stage.appendChild(line);
  });
  // Duplicate for seamless loop feel
  const clone = stage.innerHTML;
  stage.innerHTML = clone + clone;

  const run = () => {
    if (typeof gsap === 'undefined') {
      // CSS fallback: continuous scroll via CSS class
      stage.classList.add('fb-css-scroll');
      return;
    }
    const h = stage.scrollHeight / 2;
    gsap.set(stage, { y: 40, opacity: 1 });
    feedbackAnim = gsap.to(stage, {
      y: -h,
      duration: Math.max(18, list.length * 3.5),
      ease: 'none',
      repeat: -1
    });
  };
  // slight delay so layout is measured
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function renderAdminFeedback() {
  const box = document.getElementById('adminFeedbackList');
  if (!box || !state.user?.isAdmin) return;
  const list = loadFeedbacks();
  if (!list.length) {
    box.innerHTML = '<p class="center muted">No student feedback yet.</p>';
    return;
  }
  box.innerHTML = list.map(fb => {
    const av = fb.avatar || defaultAvatar(fb.displayName);
    const when = fb.ts ? new Date(fb.ts).toLocaleString() : '';
    return `<div class="admin-row feedback-admin-row">
      <img class="fb-admin-av" src="${av}" alt="" />
      <div class="info">
        <strong>${escapeHtml(fb.displayName || '')} (@${escapeHtml(fb.username || '')})</strong>
        <span>${escapeHtml(fb.text)}</span>
        <span class="muted" style="font-size:0.75rem;">${when}</span>
      </div>
      <button class="btn-ghost sm" style="color:var(--red);border-color:var(--red);" onclick="deleteFeedback('${fb.id}')">
        <i class="fas fa-trash"></i> Delete
      </button>
    </div>`;
  }).join('');
}

function deleteFeedback(id) {
  if (!state.user?.isAdmin) return;
  if (!confirm('Permanently delete this feedback from the website?')) return;
  let list = loadFeedbacks().filter(f => f.id !== id);
  saveFeedbacks(list);
  renderAdminFeedback();
  startFeedbackCredits();
  toast('Feedback deleted', 'success');
}

// Boot feedback animation
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(startFeedbackCredits, 400);
});


/* ===== Supabase Auth and persistence ===== */
(function bootSupabase() {
  if (!window.sb || !window.SupabaseSync) return;
  window.sb.auth.onAuthStateChange(function (event, session) {
    // Password recovery: show set-new-password UI instead of auto-logging into the app
    if (event === 'PASSWORD_RECOVERY' && session) {
      showSection('auth');
      switchAuth('login');
      const panel = document.getElementById('resetPasswordPanel');
      if (panel) {
        panel.classList.add('open');
        panel.style.display = 'block';
      } else {
        // Create panel if missing
        const authSec = document.getElementById('auth');
        if (authSec) {
          const div = document.createElement('div');
          div.id = 'resetPasswordPanel';
          div.className = 'open';
          div.style.cssText = 'max-width:400px;margin:1.5rem auto;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.25rem;';
          div.innerHTML = '<h3 style="margin-bottom:0.75rem;">Set new password</h3>' +
            '<p class="muted" style="font-size:0.85rem;margin-bottom:0.75rem;">Enter a new password for your account. You will then log in with it.</p>' +
            '<div class="form-group"><label>New password</label><input type="password" id="recoveryNewPass" minlength="6" placeholder="Min 6 characters" /></div>' +
            '<div class="form-group" style="margin-top:0.5rem;"><label>Confirm password</label><input type="password" id="recoveryNewPass2" minlength="6" placeholder="Confirm" /></div>' +
            '<button type="button" class="btn-primary full" style="margin-top:0.75rem;" onclick="completePasswordRecovery()">Update password</button>';
          authSec.appendChild(div);
        }
      }
      toast('Enter your new password to finish reset', 'success');
      return;
    }
    if (!session) {
      if (event === 'SIGNED_OUT') {
        state.user = null;
        updateUI();
      }
      return;
    }
    setTimeout(async function () {
      try {
        await window.SupabaseSync.pull();
        const user = state.users.find(function (item) { return item.id === session.user.id; });
        if (user && user.terminated) {
          await window.SupabaseAPI.logout();
          toast(user.terminateMsg || 'Account terminated', 'error');
          return;
        }
        if (user) {
          state.user = user;
          user.visits = (user.visits || 0) + 1;
          save();
        }
        updateUI();
        renderHomePapers();
        renderChat();
      } catch (error) {
        console.error('[VIT PYQ] Supabase session restore failed', error);
        toast('Cloud data could not be loaded: ' + error.message, 'error');
      }
    }, 0);
  });

  window.completePasswordRecovery = async function() {
    const p1 = document.getElementById('recoveryNewPass')?.value || '';
    const p2 = document.getElementById('recoveryNewPass2')?.value || '';
    if (p1.length < 6) { toast('Password min 6 characters', 'error'); return; }
    if (p1 !== p2) { toast('Passwords do not match', 'error'); return; }
    try {
      const { error } = await window.sb.auth.updateUser({ password: p1 });
      if (error) throw error;
      toast('Password updated! Please log in with your new password.', 'success');
      await window.sb.auth.signOut();
      state.user = null;
      updateUI();
      const panel = document.getElementById('resetPasswordPanel');
      if (panel) { panel.classList.remove('open'); panel.style.display = 'none'; }
      switchAuth('login');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not update password', 'error');
    }
  };
  window.SupabaseSync.initialize().then(function () {
    updateUI();
    renderHomePapers();
    startFeedbackCredits();
  }).catch(function (error) {
    console.error('[VIT PYQ] Supabase initialization failed', error);
  });
})();

googleLogin = async function () {
  try {
    await window.SupabaseAPI.loginWithGoogle();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Google sign-in failed', 'error');
  }
};

handleRegister = async function (e) {
  e.preventDefault();
  const first = document.getElementById('regFirst').value.trim();
  const last = document.getElementById('regLast').value.trim();
  const username = document.getElementById('regUser').value.trim().toLowerCase();
  const branch = document.getElementById('regBranch').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPass').value;
  if (!email.includes('@')) { toast('Enter a valid email', 'error'); return; }
  if (isVitStudentEmail(email) && !isAdminEmail(email)) { toast('VIT student accounts must use Continue with Google.', 'error'); return; }
  if (!username || state.users.some(function (user) { return user.username === username; })) { toast('Username is required and must be available', 'error'); return; }
  if (password.length < 6) { toast('Password min 6 characters', 'error'); return; }
  try {
    const result = await window.SupabaseAPI.register(email, password, {
      firstName: first, lastName: last, username: username, branch: branch,
      displayName: (first + ' ' + last).trim() || username
    });
    document.getElementById('registerForm').reset();
    if (!result.session) {
      toast('Check your email to confirm your account, then log in.', 'success');
      switchAuth('login');
      return;
    }
    toast('Account created! +30,000 ZX welcome bonus credited', 'success');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Sign-up failed', 'error');
  }
};

handleLogin = async function (e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPass').value;
  if (isVitStudentEmail(email) && !isAdminEmail(email)) {
    toast('VIT student accounts must use Continue with Google.', 'error');
    return;
  }
  try {
    await window.SupabaseAPI.login(email, password);
    const { data } = await window.sb.auth.getSession();
    await window.SupabaseSync.pull();
    const user = state.users.find(function (item) { return item.id === data.session.user.id; });
    if (!user) throw new Error('Profile is not ready yet. Confirm your email or contact the administrator.');
    if (user.terminated) {
      await window.SupabaseAPI.logout();
      throw new Error(user.terminateMsg || 'Your account has been terminated.');
    }
    state.user = user;
    user.visits = (user.visits || 0) + 1;
    save();
    updateUI();
    showSection('home');
    toast('Welcome back, ' + user.displayName + '!', 'success');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Login failed', 'error');
  }
};

logout = async function () {
  try {
    await window.SupabaseAPI.logout();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Logout failed', 'error');
  }
  state.user = null;
  localStorage.removeItem('vitpyq_uid');
  updateUI();
  showSection('home');
  closeMenu();
};

(function wrapSupabaseSave() {
  const localSave = save;
  save = function () {
    localSave.apply(this, arguments);
    if (window.SupabaseSync && state.user && !window.SupabaseSync.suspendPush) window.SupabaseSync.schedulePush();
  };
})();

const localHandleForgot = handleForgot;
handleForgot = async function (e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
  if (!email) { toast('Enter your email', 'error'); return; }
  try {
    const { error } = await window.sb.auth.resetPasswordForEmail(email, { redirectTo: window.SUPABASE_CONFIG.redirectUrl });
    if (error) throw error;
    toast('Password reset link sent. Check your inbox.', 'success');
    switchAuth('login');
    document.getElementById('forgotForm').classList.add('hidden');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not send reset email', 'error');
  }
};

const localBuyBadge = buyBadge;
buyBadge = async function (badge, cost) {
  try {
    const { error } = await window.sb.rpc('purchase_store_item', { p_item_id: badge, p_kind: 'badge' });
    if (error) throw error;
    if (!state.user.isAdmin) localBuyBadge(badge, cost);
    await window.SupabaseSync.pull();
    updateUI(); updateStoreVcash();
  } catch (error) { toast(error.message || 'Purchase failed', 'error'); }
};

const localBuyItem = buyItem;
buyItem = async function (itemId, cost) {
  try {
    const { error } = await window.sb.rpc('purchase_store_item', { p_item_id: itemId, p_kind: 'item' });
    if (error) throw error;
    if (!state.user.isAdmin) localBuyItem(itemId, cost);
    await window.SupabaseSync.pull();
    updateUI(); updateStoreVcash();
  } catch (error) { toast(error.message || 'Purchase failed', 'error'); }
};

const localBuyVerified = buyVerified;
buyVerified = async function () {
  try {
    const { error } = await window.sb.rpc('purchase_store_item', { p_item_id: 'verified', p_kind: 'verified' });
    if (error) throw error;
    if (!state.user.isAdmin) localBuyVerified();
    await window.SupabaseSync.pull();
    updateUI(); updateStoreVcash();
  } catch (error) { toast(error.message || 'Purchase failed', 'error'); }
};

const localToggleLike = toggleLike;
toggleLike = async function (paperId) {
  if (!state.user || !window.sb) return localToggleLike(paperId);
  try {
    const { data: liked, error } = await window.sb.rpc('toggle_paper_like', { p_paper_id: paperId });
    if (error) throw error;
    const paper = state.papers.find(item => item.id === paperId);
    if (!paper) return;
    paper.likedBy = paper.likedBy || [];
    paper.likedBy = paper.likedBy.filter(id => id !== state.user.id);
    if (liked) paper.likedBy.push(state.user.id);
    paper.likes = paper.likedBy.length;
    save(); renderHomePapers(); renderPapers(); renderNewHighlight();
  } catch (error) { toast(error.message || 'Could not update like', 'error'); }
};

const localViewPaper = viewPaper;
viewPaper = function (paperId) {
  const result = localViewPaper(paperId);
  if (state.user && window.sb) {
    window.sb.rpc('record_paper_event', { p_paper_id: paperId, p_event_type: 'view' })
      .then(({ error }) => { if (error) console.warn('[VIT PYQ] View event was not stored', error); });
  }
  return result;
};

const localDownloadPaper = downloadPaper;
downloadPaper = function (paperId) {
  const result = localDownloadPaper(paperId);
  if (state.user && window.sb) {
    window.sb.rpc('record_paper_event', { p_paper_id: paperId, p_event_type: 'download' })
      .then(({ error }) => { if (error) console.warn('[VIT PYQ] Download event was not stored', error); });
  }
  return result;
};

['adminGiveBonus', 'adminGiveCashPrize', 'adminDonate'].forEach(function (name) {
  const original = window[name];
  window[name] = async function (userId) {
    const target = state.users.find(user => user.id === userId);
    const previousBalance = target ? target.vcash || 0 : 0;
    const sync = window.SupabaseSync;
    if (sync) sync.suspendPush = true;
    try {
      original.apply(this, arguments);
    } finally {
      if (sync) sync.suspendPush = false;
    }
    const updatedTarget = state.users.find(user => user.id === userId);
    const difference = updatedTarget ? (updatedTarget.vcash || 0) - previousBalance : 0;
    if (!difference || !state.user || !state.user.isAdmin) return;
    try {
      const { error } = await window.sb.rpc('admin_adjust_wallet', { p_user_id: userId, p_amount: difference, p_reason: name });
      if (error) throw error;
      await sync.pull();
      updateUI();
      if (document.getElementById('adminTabUsers')?.classList.contains('active')) renderAdminUsers();
    } catch (error) { toast(error.message || 'Cloud reward failed', 'error'); }
  };
});

const localSendFriendRequest = sendFriendRequest;
sendFriendRequest = async function (toId) {
  if (!state.user || !window.sb) return localSendFriendRequest(toId);
  try {
    const { error } = await window.sb.rpc('request_friend', { p_to_id: toId });
    if (error) throw error;
    await window.SupabaseSync.pull();
    searchFriends(document.getElementById('friendSearchInput').value);
    updateNotifDot();
  } catch (error) { toast(error.message || 'Friend request failed', 'error'); }
};

const localAcceptFriend = acceptFriend;
acceptFriend = async function (fromId) {
  if (!state.user || !window.sb) return localAcceptFriend(fromId);
  try {
    const { error } = await window.sb.rpc('respond_friend_request', { p_from_id: fromId, p_accept: true });
    if (error) throw error;
    await window.SupabaseSync.pull();
    renderNotifs(); updateNotifDot(); updateUI();
    if (document.getElementById('profile').classList.contains('active')) renderProfile();
  } catch (error) { toast(error.message || 'Could not accept request', 'error'); }
};

const localRejectFriend = rejectFriend;
rejectFriend = async function (fromId) {
  if (!state.user || !window.sb) return localRejectFriend(fromId);
  try {
    const { error } = await window.sb.rpc('respond_friend_request', { p_from_id: fromId, p_accept: false });
    if (error) throw error;
    await window.SupabaseSync.pull();
    renderNotifs(); updateNotifDot();
  } catch (error) { toast(error.message || 'Could not reject request', 'error'); }
};

chatKey = function (firstId, secondId) {
  const adminProfile = state.users.find(user => user.isAdmin);
  const normalizeId = function (id) { return adminProfile && id === adminProfile.id ? 'admin' : id; };
  return [normalizeId(firstId), normalizeId(secondId)].sort().join('_');
};



/* ========== V22 FEATURE OVERRIDES ========== */

// Mark system notifs as read when panel opens; badge only counts unread
toggleNotifPanel = function() {
  const p = document.getElementById('notifPanel');
  document.getElementById('friendsSearchPanel')?.classList.remove('open');
  p.classList.toggle('open');
  if (p.classList.contains('open')) {
    renderNotifs();
    // Mark system notifications as read so badge clears
    if (state.user && state.user.systemNotifs) {
      state.user.systemNotifs.forEach(n => { n.read = true; });
      const u = state.users.find(x => x.id === state.user.id);
      if (u) u.systemNotifs = state.user.systemNotifs;
      save();
    }
    updateNotifDot();
  }
};

updateNotifDot = function() {
  const dot = document.getElementById('notifDot');
  if (!dot) return;
  if (!state.user) { dot.style.display = 'none'; dot.textContent = '0'; return; }
  let n = (state.user.requests || []).length;
  n += (state.user.systemNotifs || []).filter(x => !x.read).length;
  Object.keys(state.privateChats || {}).forEach(key => {
    if (!key.includes(state.user.id)) return;
    const msgs = state.privateChats[key] || [];
    const last = msgs[msgs.length - 1];
    if (last && last.from !== state.user.id && !last._seen) n++;
  });
  if (n > 0) {
    dot.style.display = 'block';
    dot.textContent = n > 9 ? '9+' : String(n);
    dot.setAttribute('data-count', String(n));
  } else {
    dot.style.display = 'none';
    dot.textContent = '0';
    dot.setAttribute('data-count', '0');
  }
};

// Case-insensitive paper search (also match attribute)
const _filteredPapersV22 = typeof filteredPapers === 'function' ? filteredPapers : null;
if (_filteredPapersV22) {
  filteredPapers = function() {
    const f = state.filters || {};
    const cats = f.cat || [];
    const sems = f.sem || [];
    const campuses = f.campus || [];
    const years = (f.year || []).map(String);
    const q = (f.q || '').toLowerCase().trim();
    return state.papers.filter(p => {
      if (cats.length && !cats.includes(p.category)) return false;
      if (sems.length && !sems.includes(p.semester)) return false;
      if (campuses.length) {
        const pc = p.campus || 'Vellore';
        if (!campuses.includes(pc)) return false;
      }
      if (years.length && !years.includes(String(p.year))) return false;
      if (q) {
        const hay = ((p.subject || '') + ' ' + (p.code || '') + ' ' + (p.attribute || '') + ' ' + (p.campus || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };
}

// Friends search with profile photos + full-page feel
searchFriends = function(q) {
  q = (q || '').toLowerCase().trim();
  const box = document.getElementById('friendSearchResults');
  if (!box) return;
  if (!q || !state.user) { box.innerHTML = ''; return; }
  const myId = state.user.id;
  const myFriends = state.user.friends || [];
  const myReqs = state.user.requests || [];
  const list = state.users.filter(u =>
    !u.isAdmin && u.id !== myId &&
    ((u.username || '').toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q))
  ).slice(0, 20);
  if (!list.length) { box.innerHTML = '<p class="muted" style="padding:0.4rem;">No users found</p>'; return; }
  box.innerHTML = list.map(u => {
    const isFriend = myFriends.includes(u.id);
    const sent = (u.requests || []).includes(myId);
    const incoming = myReqs.includes(u.id);
    let action = '';
    if (isFriend) action = '<span class="muted">Friends</span>';
    else if (incoming) action = `<button class="btn-primary sm" onclick="acceptFriend('${u.id}')">Accept</button>`;
    else if (sent) action = '<span class="muted">Requested</span>';
    else action = `<button class="btn-outline sm" onclick="sendFriendRequest('${u.id}')">Add</button>`;
    const av = u.avatar || defaultAvatar(u.displayName || u.username || 'U');
    return `<div class="dropdown-item fsp-user" style="display:flex;align-items:center;gap:0.65rem;">
      <img class="fsp-avatar" src="${av}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='${defaultAvatar(u.username||'U')}'" />
      <div class="fsp-meta" style="flex:1;min-width:0;" onclick="openUserProfile('${u.id}')">
        <strong>@${escapeHtml(u.username)}</strong>
        <span style="display:block;font-size:0.78rem;color:var(--muted);">${escapeHtml(u.displayName || '')}</span>
      </div>
      ${action}
    </div>`;
  }).join('');
};

// Full-page friends search panel styling class
const _openFriendsSearchV22 = typeof openFriendsSearch === 'function' ? openFriendsSearch : function() {
  document.getElementById('friendsSearchPanel')?.classList.add('open');
  document.getElementById('friendSearchInput')?.focus();
};
openFriendsSearch = function() {
  const panel = document.getElementById('friendsSearchPanel');
  if (!panel) return;
  panel.classList.add('open');
  // Make it full-viewport style
  panel.style.position = 'fixed';
  panel.style.inset = '0';
  panel.style.zIndex = '1100';
  panel.style.width = '100%';
  panel.style.maxWidth = '100%';
  panel.style.height = '100%';
  panel.style.maxHeight = '100%';
  panel.style.borderRadius = '0';
  panel.style.top = '0';
  panel.style.right = '0';
  panel.style.left = '0';
  panel.style.background = 'rgba(12,14,20,0.98)';
  panel.style.padding = '1rem';
  document.getElementById('friendSearchInput')?.focus();
};
closeFriendsSearch = function() {
  const panel = document.getElementById('friendsSearchPanel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.style.cssText = '';
};

// Ensure bronze in items on load for every user
(function ensureBronzeVault() {
  const origLoad = load;
  // after users exist
  setTimeout(function() {
    (state.users || []).forEach(u => {
      if (!u.items) u.items = [];
      if (!u.items.includes('badge_bronze')) u.items.unshift('badge_bronze');
      if (!u.badge) u.badge = 'bronze';
    });
    if (state.user) {
      if (!state.user.items) state.user.items = [];
      if (!state.user.items.includes('badge_bronze')) state.user.items.unshift('badge_bronze');
    }
  }, 800);
})();

// Star rating: rate paper from view modal (simple prompt for now)
function ratePaper(paperId, stars) {
  if (!state.user) { toast('Login to rate', 'error'); return; }
  const p = state.papers.find(x => x.id === paperId);
  if (!p) return;
  if (!p.ratings) p.ratings = {};
  p.ratings[state.user.id] = Math.max(1, Math.min(5, Number(stars) || 5));
  save();
  renderHomePapers();
  renderPapers();
  toast('Thanks for rating!', 'success');
}

// Message button on friend profile modal
var _openUserProfileV22 = openUserProfile;
openUserProfile = function(userId) {
  _openUserProfileV22(userId);
  setTimeout(function() {
    const modal = document.getElementById('userModal');
    if (!modal || !state.user) return;
    let btn = document.getElementById('modalMessageBtn');
    const isFriend = (state.user.friends || []).includes(userId) && userId !== state.user.id;
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'modalMessageBtn';
      btn.className = 'btn-primary full btn-message-friend';
      btn.innerHTML = '<i class="fas fa-comment"></i> Message';
      const actions = modal.querySelector('.view-actions, .modal-actions, .profile-header') || modal.querySelector('.modal-content');
      if (actions) actions.appendChild(btn);
    }
    btn.style.display = isFriend ? 'block' : 'none';
    btn.onclick = function() {
      closeUserModal && closeUserModal();
      document.getElementById('userModal')?.classList.remove('show');
      showSection('chat');
      setTimeout(function() {
        if (typeof openPersonalThread === 'function') openPersonalThread(userId);
        const panel = document.getElementById('personalChatPanel');
        if (panel) panel.style.display = 'block';
      }, 200);
    };
  }, 50);
};

// Hero tagline
document.addEventListener('DOMContentLoaded', function() {
  const hero = document.querySelector('.hero-content');
  if (hero && !document.getElementById('heroTagline')) {
    const el = document.createElement('p');
    el.id = 'heroTagline';
    el.className = 'hero-tagline';
    el.innerHTML = '<strong>For the Students, By the Students Vitians</strong><span class="sep">·</span>Open source Organization';
    const sub = hero.querySelector('.hero-sub');
    if (sub) sub.after(el);
    else hero.appendChild(el);
  }
});

// 3-dots menu on personal chat friends
const _renderPcFriendsV22 = typeof renderPcFriends === 'function' ? renderPcFriends : null;
if (_renderPcFriendsV22) {
  renderPcFriends = function() {
    const box = document.getElementById('pcFriendsList');
    if (!box) return;
    if (!state.user) { box.innerHTML = '<p class="muted" style="padding:0.5rem;">Login required</p>'; return; }
    const ids = state.user.friends || [];
    if (!ids.length) {
      box.innerHTML = '<p class="muted" style="padding:0.5rem;font-size:0.8rem;">No friends yet. Use Search Friends.</p>';
      return;
    }
    box.innerHTML = '<div class="pc-friends-head">Friends</div>' + ids.map(id => {
      const u = state.users.find(x => x.id === id);
      if (!u) return '';
      const active = state.activeFriendId === id ? 'active' : '';
      const blocked = (state.user.blocked || []).includes(id);
      return `<div class="pc-friend ${active}" style="position:relative;">
        <div class="chat-friend-row">
          <span onclick="openPersonalThread('${id}')" style="flex:1;cursor:pointer;">@${escapeHtml(u.username)}${blocked?' <span class="muted">(blocked)</span>':''}</span>
          <button type="button" class="chat-more-btn" onclick="event.stopPropagation(); toggleChatMoreMenu('${id}')" title="More"><i class="fas fa-ellipsis-v"></i></button>
        </div>
        <div class="chat-more-menu" id="chatMore_${id}">
          <button type="button" onclick="clearPersonalChat('${id}')"><i class="fas fa-broom"></i> Clear chat</button>
          <button type="button" onclick="toggleDisappearMode('${id}')"><i class="fas fa-ghost"></i> Disappear mode</button>
          <button type="button" class="danger" onclick="toggleBlockFriend('${id}')"><i class="fas fa-ban"></i> ${blocked?'Unblock':'Block'} friend</button>
        </div>
      </div>`;
    }).join('');
  };
}

function toggleChatMoreMenu(friendId) {
  // Close other menus
  document.querySelectorAll('.chat-more-menu.open').forEach(function(el) {
    if (el.id !== 'chatMore_' + friendId) {
      el.classList.remove('open');
      el.style.cssText = '';
    }
  });
  var menu = document.getElementById('chatMore_' + friendId);
  if (!menu) return;

  if (menu.classList.contains('open')) {
    menu.classList.remove('open');
    menu.style.cssText = '';
    return;
  }

  var btn = menu.parentElement && menu.parentElement.querySelector('.chat-more-btn');
  if (!btn) btn = document.querySelector('.chat-more-btn');
  var rect = (btn || menu.parentElement).getBoundingClientRect();
  var isMobile = window.innerWidth <= 700;
  var menuW = 200;
  var menuH = 140;
  var gap = 6;
  var left, top;

  if (isMobile) {
    // Mobile: open to the LEFT of the ⋮, right next to it
    left = rect.left - menuW - gap;
    if (left < 8) left = 8;
    top = rect.top;
    if (top + menuH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - menuH - 8);
  } else {
    // Desktop / iPad: open to the RIGHT of the ⋮
    left = rect.right + gap;
    if (left + menuW > window.innerWidth - 8) {
      left = Math.max(8, rect.left - menuW - gap);
    }
    top = rect.top;
    if (top + menuH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - menuH - 8);
  }

  menu.classList.add('open');
  menu.style.cssText = [
    'display:block',
    'visibility:visible',
    'opacity:1',
    'position:fixed',
    'left:' + left + 'px',
    'top:' + top + 'px',
    'right:auto',
    'bottom:auto',
    'transform:none',
    'margin:0',
    'z-index:99999',
    'min-width:200px',
    'width:max-content',
    'max-width:min(240px,90vw)',
    'white-space:nowrap',
    'overflow:visible',
    'box-shadow:0 12px 36px rgba(0,0,0,0.55)',
    'background:var(--bg3,#1a1d26)',
    'border:1px solid var(--border,#2a2f3a)',
    'border-radius:12px',
    'padding:0.35rem'
  ].join(';');
}
window.toggleChatMoreMenu = toggleChatMoreMenu;


function clearPersonalChat(friendId) {
  if (!state.user || !confirm('Clear this chat?')) return;
  const key = chatKey(state.user.id, friendId);
  state.privateChats[key] = [];
  save();
  if (state.activeFriendId === friendId) renderPcMessages();
  toast('Chat cleared', 'success');
  document.getElementById('chatMore_' + friendId)?.classList.remove('open');
}

function toggleDisappearMode(friendId) {
  if (!state.user) return;
  if (!state.user.disappearChats) state.user.disappearChats = {};
  state.user.disappearChats[friendId] = !state.user.disappearChats[friendId];
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.disappearChats = state.user.disappearChats;
  save();
  toast(state.user.disappearChats[friendId] ? 'Disappear mode ON' : 'Disappear mode OFF', 'success');
  document.getElementById('chatMore_' + friendId)?.classList.remove('open');
}

function toggleBlockFriend(friendId) {
  if (!state.user) return;
  if (!state.user.blocked) state.user.blocked = [];
  const i = state.user.blocked.indexOf(friendId);
  if (i >= 0) state.user.blocked.splice(i, 1);
  else state.user.blocked.push(friendId);
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.blocked = state.user.blocked;
  save();
  renderPcFriends();
  toast(i >= 0 ? 'Unblocked' : 'Blocked — you will not receive messages', 'success');
}

// Block receive in message path
const _sendPersonalMsg = typeof sendPersonalMessage === 'function' ? sendPersonalMessage : null;
// Leaderboard pagination 10 per page
state.lbPage = 0;
const _renderLeaderboardV22 = typeof renderLeaderboard === 'function' ? renderLeaderboard : null;
if (_renderLeaderboardV22) {
  renderLeaderboard = function() {
    _renderLeaderboardV22();
    const list = document.getElementById('leaderList') || document.querySelector('#leaderboard .leader-list, #leaderboard');
    // Add page nav if not present
    let nav = document.getElementById('lbPageNav');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'lbPageNav';
      nav.className = 'lb-page-nav';
      const section = document.getElementById('leaderboard');
      if (section) section.appendChild(nav);
    }
    const pageSize = 10;
    const rows = document.querySelectorAll('#leaderboard .leader-row');
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (state.lbPage >= pages) state.lbPage = pages - 1;
    if (state.lbPage < 0) state.lbPage = 0;
    rows.forEach((row, i) => {
      row.style.display = (i >= state.lbPage * pageSize && i < (state.lbPage + 1) * pageSize) ? '' : 'none';
    });
    nav.innerHTML = `
      <button type="button" ${state.lbPage<=0?'disabled':''} onclick="state.lbPage--;renderLeaderboard()"><i class="fas fa-chevron-left"></i></button>
      <span class="history-page-info">Page ${state.lbPage+1} / ${pages}</span>
      <button type="button" ${state.lbPage>=pages-1?'disabled':''} onclick="state.lbPage++;renderLeaderboard()"><i class="fas fa-chevron-right"></i></button>`;
  };
}

// Store purchased button state enhancement
const _refreshStoreButtonsV22 = typeof refreshStoreButtons === 'function' ? refreshStoreButtons : null;
if (_refreshStoreButtonsV22) {
  refreshStoreButtons = function() {
    _refreshStoreButtonsV22();
    if (!state.user) return;
    document.querySelectorAll('#storeBadgesGrid .store-card, #storeDesignGrid .store-card').forEach(card => {
      const btn = card.querySelector('button[onclick*="buyItem"], button[onclick*="buyBadge"]');
      if (!btn) return;
      const oc = btn.getAttribute('onclick') || '';
      let owned = false;
      const mItem = oc.match(/buyItem\('([^']+)'/);
      const mBadge = oc.match(/buyBadge\('([^']+)'/);
      if (mItem) owned = (state.user.items || []).includes(mItem[1]);
      if (mBadge) owned = (state.user.items || []).includes('badge_' + mBadge[1]) || state.user.badge === mBadge[1];
      if (owned) {
        btn.textContent = 'Purchased';
        btn.classList.add('btn-purchased');
        btn.disabled = true;
        btn.removeAttribute('onclick');
      }
    });
  };
}

// Username edit with 15-day cooldown
function editUsernameOnce() {
  if (!state.user) return;
  const last = state.user.usernameChangedAt || 0;
  const days15 = 15 * 24 * 60 * 60 * 1000;
  if (last && (Date.now() - last) < days15) {
    const left = Math.ceil((days15 - (Date.now() - last)) / (24*60*60*1000));
    toast('You can change username again in ' + left + ' day(s)', 'error');
    return;
  }
  const next = prompt('New username (3-20 chars, letters/numbers/_):', state.user.username || '');
  if (!next) return;
  const cleaned = next.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  if (cleaned.length < 3) { toast('Username too short', 'error'); return; }
  if (state.users.some(u => u.id !== state.user.id && u.username === cleaned)) {
    toast('Username taken', 'error'); return;
  }
  state.user.username = cleaned;
  state.user.usernameChangedAt = Date.now();
  const u = state.users.find(x => x.id === state.user.id);
  if (u) { u.username = cleaned; u.usernameChangedAt = state.user.usernameChangedAt; }
  save(); updateUI();
  if (typeof renderProfile === 'function') renderProfile();
  toast('Username updated', 'success');
}

console.log('[VIT PYQ] v22 feature overrides loaded');


function ratePaperFromView(stars) {
  if (!state._viewingPaperId) return;
  ratePaper(state._viewingPaperId, stars);
  const box = document.getElementById('viewRateStars');
  if (box) {
    box.innerHTML = Array.from({length:5}, (_,i) =>
      `<span onclick="ratePaperFromView(${i+1})" style="cursor:pointer">${i < stars ? '★' : '☆'}</span>`
    ).join('');
  }
  const lab = document.getElementById('viewRateLabel');
  if (lab) lab.textContent = 'You rated ' + stars + '/5';
}



/* ========== V22.1 FINAL OVERRIDES ========== */

// Clear ALL notifications (override any older version)
clearClearableNotifs = function() {
  if (!state.user) return;
  const u = state.users.find(x => x.id === state.user.id);
  if (!u) return;
  u.systemNotifs = [];
  state.user.systemNotifs = [];
  Object.keys(state.privateChats || {}).forEach(key => {
    if (!key.includes(state.user.id)) return;
    (state.privateChats[key] || []).forEach(m => {
      if (m.from !== state.user.id) m._seen = true;
    });
  });
  save();
  if (typeof renderNotifs === 'function') renderNotifs();
  if (typeof updateNotifDot === 'function') updateNotifDot();
  toast('All notifications cleared', 'success');
};

// Ensure verified appears in vault with equip/remove (equip = show tick, remove = hide)
const _openVaultPrev = typeof openVault === 'function' ? openVault : null;
openVault = function() {
  if (!state.user) return;
  if (!state.user.items) state.user.items = [];
  if (!state.user.items.includes('badge_bronze')) state.user.items.unshift('badge_bronze');
  if (state.user.verified && !state.user.items.includes('verified')) {
    state.user.items.push('verified');
  }
  if (_openVaultPrev) _openVaultPrev();
  // Append verified row if owned
  const box = document.getElementById('vaultItems');
  if (!box) return;
  if ((state.user.items || []).includes('verified') || state.user.verified) {
    const on = !!state.user.verified;
    const row = document.createElement('div');
    row.className = 'owned-item-row';
    row.innerHTML = `<span><i class="fas fa-check-circle" style="color:#1d9bf0"></i> Blue Verified Tick</span>
      <span class="store-actions">
        <button type="button" class="btn-outline sm" onclick="setVerifiedEquip(true)" ${on?'disabled':''}>Equip</button>
        <button type="button" class="btn-primary sm" onclick="setVerifiedEquip(false)" ${!on?'disabled':''}>Remove</button>
      </span>`;
    box.appendChild(row);
  }
};

window.setVerifiedEquip = function(on) {
  if (!state.user) return;
  if (on && !(state.user.items || []).includes('verified') && !state.user.verified) {
    toast('Purchase Verified in Store first', 'error'); return;
  }
  state.user.verified = !!on;
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.verified = state.user.verified;
  save(); updateUI();
  if (typeof renderProfile === 'function') renderProfile();
  openVault();
  toast(on ? 'Verified tick equipped' : 'Verified tick removed', 'success');
};

// Blue tick only for users with verified === true (purchased)
// (existing render paths already gate on u.verified)

console.log('[VIT PYQ] v22.1 hotfixes loaded');



/* ========== V22.2 BEHAVIOR ========== */

// Full-page notifications panel
const _toggleNotifPanelBase = typeof toggleNotifPanel === 'function' ? toggleNotifPanel : null;
toggleNotifPanel = function() {
  const p = document.getElementById('notifPanel');
  document.getElementById('friendsSearchPanel')?.classList.remove('open');
  if (!p) return;
  p.classList.toggle('open');
  if (p.classList.contains('open')) {
    // Ensure full-page styles applied
    p.style.cssText = 'position:fixed;inset:0;z-index:1200;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:0;background:#0c0e14;padding:1rem;overflow-y:auto;display:block;';
    if (typeof renderNotifs === 'function') renderNotifs();
    if (state.user && state.user.systemNotifs) {
      state.user.systemNotifs.forEach(n => { n.read = true; });
      const u = state.users.find(x => x.id === state.user.id);
      if (u) u.systemNotifs = state.user.systemNotifs;
      save();
    }
    if (typeof updateNotifDot === 'function') updateNotifDot();
  } else {
    p.style.cssText = '';
  }
};

// Close notif when clicking a dedicated close if present
document.addEventListener('click', function(e) {
  const p = document.getElementById('notifPanel');
  if (!p || !p.classList.contains('open')) return;
  if (e.target.closest && e.target.closest('.notif-head .btn-ghost, .notif-head [onclick*="toggleNotif"], .dropdown-head button')) {
    // allow clear / close buttons inside
  }
});

// Friends search full page
openFriendsSearch = function() {
  const panel = document.getElementById('friendsSearchPanel');
  if (!panel) return;
  document.getElementById('notifPanel')?.classList.remove('open');
  panel.classList.add('open');
  panel.style.cssText = 'position:fixed;inset:0;z-index:1200;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:0;background:#0c0e14;padding:1rem;overflow-y:auto;display:block;';
  document.getElementById('friendSearchInput')?.focus();
};
closeFriendsSearch = function() {
  const panel = document.getElementById('friendsSearchPanel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.style.cssText = '';
};

// 3-dots: close when clicking outside; mobile-friendly
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('.chat-more-btn, .chat-more-menu')) return;
  document.querySelectorAll('.chat-more-menu.open').forEach(el => el.classList.remove('open'));
});

// Ensure toggleChatMoreMenu works on mobile (touch)
/* toggleChatMoreMenu fixed-position version is defined above */

// Sign-in history notification on login
(function wrapLoginForHistory() {
  const orig = typeof handleLogin === 'function' ? handleLogin : null;
  if (!orig) return;
  // already async in supabase wrap — push notif after successful session
  const prevOnAuth = null;
})();

function pushSignInNotif() {
  if (!state.user) return;
  const when = new Date().toLocaleString();
  if (typeof pushSystemNotif === 'function') {
    pushSystemNotif(state.user.id, 'Signed in on ' + when, { type: 'info' });
  }
}

// Hook after successful UI update when user becomes available
let _lastUidForSignIn = null;
setInterval(function() {
  if (state.user && state.user.id && state.user.id !== _lastUidForSignIn) {
    const prev = _lastUidForSignIn;
    _lastUidForSignIn = state.user.id;
    if (prev !== null) {
      // switched accounts
      pushSignInNotif();
    }
  }
  if (!state.user) _lastUidForSignIn = null;
}, 2000);

// FAQ pager ensure
document.addEventListener('DOMContentLoaded', function() {
  if (typeof initFaqPager === 'function') {
    try { initFaqPager(); } catch (e) { console.warn(e); }
  }
});

console.log('[VIT PYQ] v22.2 behavior loaded');



/* ========== V23.1 NOTIFS / PUSH / DATES ========== */

function formatNotifDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const now = new Date();
  const ageMs = now - d;
  const oneYear = 365.25 * 24 * 60 * 60 * 1000;
  // time part
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12; if (h === 0) h = 12;
  const timeStr = h + ':' + m + ' ' + ampm;
  // date: no year if within past year
  let dateStr;
  if (ageMs < oneYear && ageMs >= 0) {
    dateStr = day + ' ' + month;
  } else {
    dateStr = day + ' ' + month + ' ' + year;
  }
  return { dateStr: dateStr, timeStr: timeStr, full: dateStr + ' · ' + timeStr };
}

function closeNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.style.cssText = '';
}

// Override toggle to always include close path
const _toggleNotifV231 = typeof toggleNotifPanel === 'function' ? toggleNotifPanel : null;
toggleNotifPanel = function() {
  const p = document.getElementById('notifPanel');
  document.getElementById('friendsSearchPanel')?.classList.remove('open');
  if (!p) return;
  const opening = !p.classList.contains('open');
  if (opening) {
    p.classList.add('open');
    p.style.cssText = 'position:fixed;inset:0;z-index:1200;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:0;background:#0c0e14;padding:1rem;overflow-y:auto;display:block;';
    if (typeof renderNotifs === 'function') renderNotifs();
    if (state.user && state.user.systemNotifs) {
      state.user.systemNotifs.forEach(n => { n.read = true; });
      const u = state.users.find(x => x.id === state.user.id);
      if (u) u.systemNotifs = state.user.systemNotifs;
      save();
    }
    if (typeof updateNotifDot === 'function') updateNotifDot();
  } else {
    closeNotifPanel();
  }
};

// Rich notification list with dates (keep history; Clear still empties by user choice)
renderNotifs = function() {
  const box = document.getElementById('notifList');
  if (!box) return;
  if (!state.user) {
    box.innerHTML = '<p class="muted" style="padding:0.5rem;">Login to see notifications</p>';
    return;
  }
  let html = '';

  // Friend requests
  (state.user.requests || []).forEach(id => {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    html += `<div class="notif-item">
      <div class="notif-type"><i class="fas fa-user-plus"></i> Friend request</div>
      <div>@${escapeHtml(u.username)} wants to connect</div>
      <span style="display:flex;gap:0.35rem;margin-top:0.4rem;">
        <button class="btn-primary sm" onclick="acceptFriend('${id}')">Accept</button>
        <button class="btn-ghost sm" onclick="rejectFriend('${id}')">Ignore</button>
      </span>
    </div>`;
  });

  // System notifications (admin cash, sign-in, etc.) — keep all with dates
  const sys = (state.user.systemNotifs || []).slice();
  sys.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  sys.forEach(n => {
    const fmt = formatNotifDate(n.ts);
    const typeLabel = n.type === 'admin' || n.fromAdmin ? 'Admin'
      : n.type === 'cash' || (n.text || '').toLowerCase().includes('bonus') || (n.text || '').toLowerCase().includes('prize') ? 'Cash prize'
      : n.type === 'info' && (n.text || '').toLowerCase().includes('signed in') ? 'Sign-in'
      : n.type === 'congrats' ? 'Appreciation'
      : 'Notification';
    html += `<div class="notif-item">
      <div class="notif-type"><strong>${escapeHtml(typeLabel)}</strong></div>
      <div>${escapeHtml(n.text || '')}</div>
      <span class="notif-date">${escapeHtml(fmt.full || '')}</span>
    </div>`;
  });

  // Friend / support chat previews
  Object.keys(state.privateChats || {}).forEach(key => {
    if (!key.includes(state.user.id)) return;
    const parts = key.split('_');
    const otherId = parts[0] === state.user.id ? parts[1] : parts[0];
    const msgs = state.privateChats[key] || [];
    const last = msgs[msgs.length - 1];
    if (!last || last.from === state.user.id) return;
    const u = state.users.find(x => x.id === otherId);
    const name = u ? '@' + u.username : 'User';
    const fmt = formatNotifDate(last.ts);
    html += `<div class="notif-msg-item" onclick="openChatFromNotif && openChatFromNotif('${otherId}')">
      <div class="notif-type"><i class="fas fa-comment"></i> Message · ${escapeHtml(name)}</div>
      <div>${escapeHtml((last.text || '').slice(0, 100))}</div>
      <span class="notif-date">${escapeHtml(fmt.full || '')}</span>
    </div>`;
  });

  if (!html) html = '<p class="muted" style="padding:0.5rem;">No notifications yet</p>';
  box.innerHTML = html;
};

// Clear still works — user asked not to disable Clear; history shows dates while present
clearClearableNotifs = function() {
  if (!state.user) return;
  if (!confirm('Clear all notifications?')) return;
  const u = state.users.find(x => x.id === state.user.id);
  if (!u) return;
  u.systemNotifs = [];
  state.user.systemNotifs = [];
  Object.keys(state.privateChats || {}).forEach(key => {
    if (!key.includes(state.user.id)) return;
    (state.privateChats[key] || []).forEach(m => {
      if (m.from !== state.user.id) m._seen = true;
    });
  });
  save();
  renderNotifs();
  if (typeof updateNotifDot === 'function') updateNotifDot();
  toast('Notifications cleared', 'success');
};

// Device push toggle
function togglePushNotifications() {
  if (!state.user) return;
  const el = document.getElementById('pushNotifToggle');
  const on = !!(el && el.checked);
  state.user.pushNotifications = on;
  const u = state.users.find(x => x.id === state.user.id);
  if (u) u.pushNotifications = on;
  const lab = document.getElementById('pushNotifLabel');
  if (lab) lab.textContent = on ? 'On' : 'Off';
  save();
  if (on) {
    enableDevicePush().then(ok => {
      if (ok) toast('Device notifications enabled', 'success');
      else {
        toast('Permission denied or unsupported — in-app only', 'error');
        if (el) el.checked = false;
        state.user.pushNotifications = false;
        if (u) u.pushNotifications = false;
        if (lab) lab.textContent = 'Off';
        save();
      }
    });
  } else {
    toast('Device push off — in-app notifications only', 'success');
  }
}

async function enableDevicePush() {
  try {
    if (!('Notification' in window)) return false;
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
    // Browser notification when app is open / background tab
    // Full offline FCM needs Firebase Cloud Messaging + service worker keys in console
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./sw-notifications.js').catch(function(){});
      } catch (e) {}
    }
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}

function maybeDeviceNotify(title, body) {
  if (!state.user || !state.user.pushNotifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title || 'VIT PYQ\'s', {
      body: body || '',
      icon: 'favicon.png',
      badge: 'favicon.png'
    });
  } catch (e) {}
}

// Wrap pushSystemNotif to also device-notify when enabled
const _pushSystemNotifBase = typeof pushSystemNotif === 'function' ? pushSystemNotif : null;
if (_pushSystemNotifBase) {
  pushSystemNotif = function(userId, text, opts) {
    _pushSystemNotifBase(userId, text, opts);
    if (state.user && state.user.id === userId) {
      maybeDeviceNotify('VIT PYQ\'s', text);
    }
  };
}

// Sync push toggle UI on profile render
const _renderProfilePush = typeof renderProfile === 'function' ? renderProfile : null;
if (_renderProfilePush) {
  renderProfile = function() {
    _renderProfilePush();
    if (!state.user) return;
    const el = document.getElementById('pushNotifToggle');
    const lab = document.getElementById('pushNotifLabel');
    if (el) el.checked = !!state.user.pushNotifications;
    if (lab) lab.textContent = state.user.pushNotifications ? 'On' : 'Off';
  };
}

// Sign-in notification with location-ish text
function recordSignInNotif() {
  if (!state.user || typeof pushSystemNotif !== 'function') return;
  const when = new Date();
  const fmt = formatNotifDate(when.getTime());
  pushSystemNotif(state.user.id, 'Signed in on this device · ' + (fmt.full || when.toLocaleString()), { type: 'info' });
}

// FAQ force re-init when navigating
const _showSectionFaq = typeof showSection === 'function' ? showSection : null;
if (_showSectionFaq) {
  showSection = function(id) {
    _showSectionFaq(id);
    setTimeout(function() {
      if (typeof initFaqPager === 'function') {
        try { initFaqPager(); } catch (e) {}
      }
      const fl = document.getElementById('faqList');
      if (fl) {
        fl.style.visibility = 'visible';
        fl.style.display = '';
      }
    }, 50);
  };
}

console.log('[VIT PYQ] v23.1 notif/push/preview fixes loaded');



/* ========== FINAL chat more menu (append to body, never clipped, never instant-close) ========== */
(function() {
  function closeAllChatMenus() {
    document.querySelectorAll('.chat-more-menu').forEach(function(el) {
      el.classList.remove('open');
      el.style.display = 'none';
    });
  }

  window.toggleChatMoreMenu = function(friendId, evt) {
    if (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
    }
    var menu = document.getElementById('chatMore_' + friendId);
    if (!menu) {
      console.warn('[chat-more] menu not found for', friendId);
      return;
    }

    var wasOpen = menu.classList.contains('open') && menu.style.display !== 'none';

    // Close every menu first
    closeAllChatMenus();

    if (wasOpen) return; // was toggle-off

    // Find the ⋮ button that opened this
    var btn = document.querySelector('.chat-more-btn[data-fid="' + friendId + '"]')
      || (menu.parentElement && menu.parentElement.querySelector('.chat-more-btn'))
      || document.querySelector('.chat-more-btn');
    var rect = btn ? btn.getBoundingClientRect() : { left: 40, right: 60, top: 120, bottom: 140 };

    var isMobile = window.innerWidth <= 700;
    var menuW = 210;
    var menuH = 150;
    var gap = 8;
    var left, top;

    if (isMobile) {
      left = rect.left - menuW - gap;
      if (left < 8) left = Math.min(rect.right + gap, window.innerWidth - menuW - 8);
      if (left < 8) left = 8;
    } else {
      left = rect.right + gap;
      if (left + menuW > window.innerWidth - 8) left = rect.left - menuW - gap;
      if (left < 8) left = 8;
    }
    top = rect.top;
    if (top + menuH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - menuH - 8);

    // Move menu to <body> so no parent can clip or hide it
    if (menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }

    menu.classList.add('open');
    menu.style.cssText = '';
    menu.style.setProperty('display', 'block', 'important');
    menu.style.setProperty('visibility', 'visible', 'important');
    menu.style.setProperty('opacity', '1', 'important');
    menu.style.setProperty('position', 'fixed', 'important');
    menu.style.setProperty('left', left + 'px', 'important');
    menu.style.setProperty('top', top + 'px', 'important');
    menu.style.setProperty('right', 'auto', 'important');
    menu.style.setProperty('bottom', 'auto', 'important');
    menu.style.setProperty('transform', 'none', 'important');
    menu.style.setProperty('z-index', '2147483647', 'important');
    menu.style.setProperty('min-width', '200px', 'important');
    menu.style.setProperty('width', 'max-content', 'important');
    menu.style.setProperty('max-width', 'min(240px, 90vw)', 'important');
    menu.style.setProperty('white-space', 'nowrap', 'important');
    menu.style.setProperty('overflow', 'visible', 'important');
    menu.style.setProperty('background', '#1a1d26', 'important');
    menu.style.setProperty('border', '1px solid #2a2f3a', 'important');
    menu.style.setProperty('border-radius', '12px', 'important');
    menu.style.setProperty('padding', '0.35rem', 'important');
    menu.style.setProperty('box-shadow', '0 12px 40px rgba(0,0,0,0.6)', 'important');
    menu.style.setProperty('pointer-events', 'auto', 'important');
    menu.style.setProperty('margin', '0', 'important');

    // Ignore the same click that opened the menu for outside-close
    menu.dataset.justOpened = '1';
    setTimeout(function() { delete menu.dataset.justOpened; }, 100);
  };

  // Also support function form used in older HTML
  window.toggleChatMoreMenu = window.toggleChatMoreMenu;
  function toggleChatMoreMenu(friendId, evt) { return window.toggleChatMoreMenu(friendId, evt); }

  // Outside click closes — but not the opening click
  document.addEventListener('click', function(e) {
    if (e.target.closest && (e.target.closest('.chat-more-btn') || e.target.closest('.chat-more-menu'))) return;
    document.querySelectorAll('.chat-more-menu.open').forEach(function(el) {
      if (el.dataset.justOpened) return;
      el.classList.remove('open');
      el.style.display = 'none';
    });
  }, true);

  // When friends list is re-rendered, menus may be recreated under .pc-friend —
  // leave that; on open we re-parent to body.

  // Patch renderPcFriends HTML so button has data-fid and onclick passes event
  var _rp = window.renderPcFriends || (typeof renderPcFriends !== 'undefined' ? renderPcFriends : null);
  // Hook after existing render by wrapping once
  if (typeof renderPcFriends === 'function') {
    var _prevRender = renderPcFriends;
    renderPcFriends = function() {
      _prevRender.apply(this, arguments);
      // Fix buttons after render
      document.querySelectorAll('.pc-friend').forEach(function(row) {
        var btn = row.querySelector('.chat-more-btn');
        var menu = row.querySelector('.chat-more-menu');
        if (!btn || !menu) return;
        var id = menu.id && menu.id.replace('chatMore_', '');
        if (!id) return;
        btn.setAttribute('data-fid', id);
        btn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.toggleChatMoreMenu(id, e);
        };
      });
    };
    window.renderPcFriends = renderPcFriends;
  }

  console.log('[VIT PYQ] chat more menu FINAL handler ready');
})();


/* ========== Paper view zoom controls ========== */
state._viewZoom = 1;

function viewZoomIn() {
  state._viewZoom = Math.min(2.5, (state._viewZoom || 1) + 0.15);
  applyViewZoom();
}
function viewZoomOut() {
  state._viewZoom = Math.max(0.5, (state._viewZoom || 1) - 0.15);
  applyViewZoom();
}
function viewZoomReset() {
  state._viewZoom = 1;
  applyViewZoom();
  var wrap = document.getElementById('viewViewerWrap');
  if (wrap) { wrap.scrollTop = 0; wrap.scrollLeft = 0; }
}
function applyViewZoom() {
  var z = state._viewZoom || 1;
  var inner = document.getElementById('viewScaleInner');
  var label = document.getElementById('viewZoomLabel');
  if (label) label.textContent = Math.round(z * 100) + '%';
  if (!inner) return;
  inner.style.transform = 'scale(' + z + ')';
  // Expand layout size so scroll area matches zoomed content
  inner.style.width = (100 / z) + '%';
  var frame = document.getElementById('viewFrame');
  if (frame) {
    var base = window.innerWidth <= 700 ? 70 : 55;
    frame.style.height = (base * z) + 'vh';
    frame.style.minHeight = (base * z) + 'vh';
  }
}
function viewToggleFullscreen() {
  var wrap = document.getElementById('viewViewerWrap') || document.getElementById('viewModal');
  if (!wrap) return;
  if (!document.fullscreenElement) {
    (wrap.requestFullscreen || wrap.webkitRequestFullscreen || function(){})().catch(function(){});
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || function(){})();
  }
}
// Reset zoom when opening a paper
/* custom zoom disabled — browser PDF controls only */
window.viewZoomIn = viewZoomIn;
window.viewZoomOut = viewZoomOut;
window.viewZoomReset = viewZoomReset;
window.viewToggleFullscreen = viewToggleFullscreen;
console.log('[VIT PYQ] view zoom controls ready');


/* Ensure view modal X always works */
window.closeViewModal = function() {
  var modal = document.getElementById('viewModal');
  if (modal) modal.classList.remove('show');
  document.body.classList.remove('modal-open');
  var frame = document.getElementById('viewFrame');
  var obj = document.getElementById('viewObject');
  if (frame) { frame.src = 'about:blank'; frame.style.display = 'none'; }
  if (obj) { obj.removeAttribute('data'); obj.style.display = 'none'; }
  if (state._viewBlobUrl) {
    try { URL.revokeObjectURL(state._viewBlobUrl); } catch (e) {}
    state._viewBlobUrl = null;
  }
  state._viewingPaperId = null;
};


function viewPaper(id) {
  var p = state.papers.find(function(x) { return x.id === id; });
  if (!p) return;
  state._viewingPaperId = id;
  p.views = (p.views || 0) + 1;
  if (typeof save === 'function') save();

  var titleEl = document.getElementById('viewTitle');
  var metaEl = document.getElementById('viewMeta');
  if (titleEl) titleEl.textContent = p.subject || 'Paper';
  if (metaEl) {
    var sem = (typeof semLabel === 'function') ? semLabel(p.semester) : (p.semester || '');
    metaEl.textContent = [p.code, p.year, sem, p.category, p.campus || 'Vellore', (p.views || 0) + ' views', (p.downloads || 0) + ' downloads'].filter(Boolean).join(' · ');
  }

  var frame = document.getElementById('viewFrame');
  var obj = document.getElementById('viewObject');
  var img = document.getElementById('viewImg');
  if (state._viewBlobUrl) {
    try { URL.revokeObjectURL(state._viewBlobUrl); } catch (e) {}
    state._viewBlobUrl = null;
  }
  if (frame) { frame.removeAttribute('sandbox'); frame.style.display = 'none'; frame.src = 'about:blank'; }
  if (obj) { obj.style.display = 'none'; obj.removeAttribute('data'); }
  if (img) { img.style.display = 'none'; img.removeAttribute('src'); }

  var raw = (p.fileData || '').split('#')[0];
  var isPdf = ((p.fileName || '').toLowerCase().endsWith('.pdf')
    || raw.indexOf('data:application/pdf') === 0
    || /\.pdf($|\?)/i.test(raw));
  var isMobile = window.innerWidth <= 700;
  var isHttp = /^https?:\/\//i.test(raw);

  function showFrame(url) {
    if (!frame) return;
    frame.style.display = 'block';
    if (img) img.style.display = 'none';
    if (obj) obj.style.display = 'none';
    frame.src = url;
  }

  if (raw && isPdf) {
    if (raw.indexOf('data:') === 0) {
      showFrame(raw);
    } else if (isHttp) {
      // Desktop: blob URL for Chrome PDF UI. Mobile: Google viewer often shows scroll/zoom better on Android.
      if (isMobile) {
        showFrame('https://docs.google.com/gview?embedded=true&url=' + encodeURIComponent(raw));
        // Also try blob as backup if gview fails after load
        fetch(raw, { mode: 'cors', credentials: 'omit' }).then(function(r) {
          return r.ok ? r.blob() : Promise.reject();
        }).then(function(blob) {
          var b = (blob.type && blob.type.indexOf('pdf') >= 0) ? blob : new Blob([blob], { type: 'application/pdf' });
          state._viewBlobUrl = URL.createObjectURL(b);
        }).catch(function() {});
      } else {
        showFrame('about:blank');
        fetch(raw, { mode: 'cors', credentials: 'omit' })
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP');
            return res.blob();
          })
          .then(function(blob) {
            var pdfBlob = (blob.type && blob.type.indexOf('pdf') >= 0) ? blob : new Blob([blob], { type: 'application/pdf' });
            var objUrl = URL.createObjectURL(pdfBlob);
            state._viewBlobUrl = objUrl;
            if (state._viewingPaperId === id) showFrame(objUrl);
          })
          .catch(function() {
            if (state._viewingPaperId === id) showFrame(raw);
          });
      }
    } else {
      showFrame(raw);
    }
  } else if (raw) {
    if (frame) frame.style.display = 'none';
    if (img) { img.style.display = 'block'; img.src = raw; }
  }

  var dl = document.getElementById('viewDownloadBtn');
  if (dl) dl.onclick = function(e) { e.preventDefault(); downloadPaper(id); };

  var modal = document.getElementById('viewModal');
  if (modal) modal.classList.add('show');
  document.body.classList.add('modal-open');
}

window.viewPaper = viewPaper;

window.closeViewModal = function() {
  var modal = document.getElementById('viewModal');
  if (modal) modal.classList.remove('show');
  document.body.classList.remove('modal-open');
  var frame = document.getElementById('viewFrame');
  var obj = document.getElementById('viewObject');
  if (frame) { frame.src = 'about:blank'; frame.style.display = 'none'; }
  if (obj) { obj.removeAttribute('data'); obj.style.display = 'none'; }
  if (state._viewBlobUrl) {
    try { URL.revokeObjectURL(state._viewBlobUrl); } catch (e) {}
    state._viewBlobUrl = null;
  }
  state._viewingPaperId = null;
};
