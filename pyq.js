// API Wrapper for Backend Connection
const API_CONFIG = {
    // Reads the meta tag from HTML if present (for production)
    externalBaseUrl: document.querySelector('meta[name="api-base-url"]')?.content || ''
};

class API {
    constructor() {
        // 1. If served from the backend (port 5000), use relative path
        if (window.location.port === '5000') {
            this.baseUrl = '/api';
        }
        // 2. If served from localhost (Live Server) OR file protocol, point to local backend
        else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
            this.baseUrl = 'http://localhost:5000/api';
        }
        // 3. Production: use the configured external URL
        else if (API_CONFIG.externalBaseUrl) {
            this.baseUrl = `${API_CONFIG.externalBaseUrl.replace(/\/+$/, '')}/api`;
        }
        // 4. Fallback
        else {
            console.warn('No API URL configured. Defaulting to /api');
            this.baseUrl = '/api';
        }

        // Warning for deployment
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && this.baseUrl.includes('localhost')) {
            console.error('🚨 CRITICAL: You are running on a public domain but your API URL is pointing to localhost!');
            console.error('   Please update the <meta name="api-base-url"> tag in index.html to point to your deployed backend URL.');
            alert('Configuration Error: API URL is pointing to localhost. Please check console for details.');
        }

        this.token = localStorage.getItem('token');
    }

    async _handleResponse(res) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await res.json();
            if (!res.ok) throw new Error(data.msg || 'Request failed');
            return data;
        } else {
            // If response is not JSON (e.g. 404 HTML page or empty), throw error
            const text = await res.text();
            console.error("Non-JSON response:", text);
            throw new Error(`Server Error: ${res.status} ${res.statusText}`);
        }
    }

    async login(email, password) {
        const res = await fetch(`${this.baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await this._handleResponse(res);
        this.token = data.token;
        localStorage.setItem('token', this.token);
        return this.getUser();
    }

    async signup(userData) {
        const res = await fetch(`${this.baseUrl}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await this._handleResponse(res);
        this.token = data.token;
        localStorage.setItem('token', this.token);
        return this.getUser();
    }

    async getUser() {
        if (!this.token) return null;
        const res = await fetch(`${this.baseUrl}/auth/profile`, {
            headers: { 'x-auth-token': this.token }
        });

        if (!res.ok) {
            this.logout();
            return null;
        }
        return await this._handleResponse(res);
    }

    logout() {
        this.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
    }

    async addPaper(formData) {
        const res = await fetch(`${this.baseUrl}/papers/upload`, {
            method: 'POST',
            headers: { 'x-auth-token': this.token },
            body: formData
        });
        return await this._handleResponse(res);
    }

    async getAllPapers(query = '') {
        const res = await fetch(`${this.baseUrl}/papers/search?query=${query}`);
        return await this._handleResponse(res);
    }

    async uploadProfilePic(formData) {
        const res = await fetch(`${this.baseUrl}/auth/upload-pic`, {
            method: 'POST',
            headers: { 'x-auth-token': this.token },
            body: formData
        });
        return await this._handleResponse(res);
    }

    async forgotPassword(email) {
        const res = await fetch(`${this.baseUrl}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        return await this._handleResponse(res);
    }

    async verifyOTP(email, otp, newPassword) {
        const res = await fetch(`${this.baseUrl}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPassword })
        });
        return await this._handleResponse(res);
    }
    async registerDownload(paperId) {
        const res = await fetch(`${this.baseUrl}/papers/${paperId}/download`, {
            method: 'POST',
            headers: { 'x-auth-token': this.token }
        });
        return await this._handleResponse(res);
    }
}

// Initialize API
const api = new API();
let currentUser = null;
let papers = [];
let likedPapersSearchQuery = '';

// Filter state
let selectedYear = null;
let selectedSemester = null;
const years = ['2025', '2024', '2023', '2022'];
const semesters = ['Fall', 'Winter'];

// Sounds
const sounds = {
    error: new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'),
    champion: new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'), // Victory sound
    pop: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3') // Pop sound
};
function playSound(type) {
    if (sounds[type]) {
        sounds[type].currentTime = 0;
        sounds[type].play().catch(e => console.log("Audio play failed", e));
    }
}

// DOM Elements
const navLinks = document.getElementById('navLinks');
const authSection = document.getElementById('authSection');
const homeSection = document.getElementById('homeSection');
const uploadSection = document.getElementById('uploadSection');
const profileSection = document.getElementById('profileSection');
const papersGrid = document.getElementById('papersGrid');

// Custom Alert Logic
function showCustomAlert(message) {
    document.getElementById('customAlertMessage').innerText = message;
    document.getElementById('customAlert').classList.remove('hidden');
    document.querySelector('main').classList.add('blur-content');
    document.querySelector('.navbar').classList.add('blur-content');
    playSound('error');
}

function closeCustomAlert() {
    document.getElementById('customAlert').classList.add('hidden');
    document.querySelector('main').classList.remove('blur-content');
    document.querySelector('.navbar').classList.remove('blur-content');
}

// Override default alert
window.alert = showCustomAlert;

// Init
document.addEventListener('DOMContentLoaded', async () => {
    // Show Loading Splash
    const splash = document.getElementById('loadingSplash');

    // Try to restore session
    // First, try to restore any cached user immediately so the header reflects logged-in state
    try {
        const cached = localStorage.getItem('currentUser');
        if (cached) {
            currentUser = JSON.parse(cached);
        }
    } catch (e) {
        console.warn('Failed to parse cached currentUser', e);
    }

    // Then, if we have a token, refresh the profile in background to get authoritative data
    if (api.token) {
        (async () => {
            try {
                const fresh = await api.getUser();
                if (fresh) {
                    currentUser = fresh;
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    updateNav();
                    // If profile is currently visible, update UI
                    if (!profileSection.classList.contains('hidden')) updateProfileUI();
                }
            } catch (e) {
                console.error('Session restore failed', e);
                // If token invalid, clear cached user
                api.logout();
                currentUser = null;
                localStorage.removeItem('currentUser');
                updateNav();
            }
        })();
    }

    await loadPapers();
    updateNav();
    showPage('home');
    initBubbleAnimation();
    initCursorEffect();

    // Hide Splash after load
    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => splash.classList.add('hidden'), 500);
    }, 1500); // Minimum 1.5s splash
});

async function loadPapers() {
    try {
        papers = await api.getAllPapers();
        initializeFilters();
        updateUserAndPaperCounts();
        renderPapers(papers);
    } catch (e) {
        console.error("Failed to load papers:", e);
        papersGrid.innerHTML = '<p class="text-muted text-center">Failed to connect to server. Ensure backend is running.</p>';
    }
}

function updateUserAndPaperCounts() {
    // Update paper count
    const paperCount = papers.length;
    const paperCountDisplay = document.getElementById('paperCountDisplay');
    if (paperCountDisplay) {
        paperCountDisplay.innerText = paperCount + '+';
    }

    // For user count, we would need a backend endpoint, for now using a default
    // This can be updated when you have the endpoint
    const userCountDisplay = document.getElementById('userCountDisplay');
    if (userCountDisplay) {
        // Try to get from localStorage or use default
        const savedUserCount = localStorage.getItem('vitUserCount') || '1000';
        userCountDisplay.innerText = savedUserCount + '+';
    }
}

function initializeFilters() {
    const yearButtonsContainer = document.getElementById('yearButtons');
    const semesterButtonsContainer = document.getElementById('semesterButtons');

    if (!yearButtonsContainer || !semesterButtonsContainer) return;

    // Create year buttons
    yearButtonsContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">Years:</span>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${years.map(year => `
                    <button class="filter-btn" data-year="${year}" onclick="filterByYear('${year}')" style="padding: 0.5rem 1rem; background: #334155; border: 1px solid #475569; border-radius: 0.5rem; color: var(--text); cursor: pointer; transition: all 0.3s;">
                        ${year}
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    // Create semester buttons (always visible)
    semesterButtonsContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">Semesters:</span>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${semesters.map(semester => `
                    <button class="filter-btn" data-semester="${semester}" onclick="filterBySemester('${semester}')" style="padding: 0.5rem 1rem; background: #334155; border: 1px solid #475569; border-radius: 0.5rem; color: var(--text); cursor: pointer; transition: all 0.3s;">
                        ${semester === 'Fall' ? '🍂 Fall Semester' : '❄️ Winter Semester'}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

function filterByYear(year) {
    selectedYear = selectedYear === year ? null : year;
    console.log('Filter by Year:', selectedYear, 'Total papers:', papers.length);
    updateFilterButtons();
    applyFilters();
}

function filterBySemester(semester) {
    selectedSemester = selectedSemester === semester ? null : semester;
    console.log('Filter by Semester:', selectedSemester, 'Total papers:', papers.length);
    updateFilterButtons();
    applyFilters();
}

function clearFilters() {
    selectedYear = null;
    selectedSemester = null;
    updateFilterButtons();
    renderPapers(papers);
}

function updateFilterButtons() {
    // Update year buttons
    const yearButtons = document.querySelectorAll('[data-year]');
    yearButtons.forEach(btn => {
        if (btn.dataset.year === selectedYear) {
            btn.style.background = 'var(--primary)';
            btn.style.borderColor = 'var(--primary)';
            btn.style.color = '#fff';
            btn.style.fontWeight = 'bold';
            btn.innerHTML = `✓ ${btn.dataset.year}`;
        } else {
            btn.style.background = '#334155';
            btn.style.borderColor = '#475569';
            btn.style.color = 'var(--text)';
            btn.style.fontWeight = 'normal';
            btn.innerHTML = btn.dataset.year;
        }
    });

    // Update semester buttons state (always visible)
    const semesterButtons = document.querySelectorAll('[data-semester]');
    semesterButtons.forEach(btn => {
        if (btn.dataset.semester === selectedSemester) {
            btn.style.background = 'var(--primary)';
            btn.style.borderColor = 'var(--primary)';
            btn.style.color = '#fff';
            btn.style.fontWeight = 'bold';
            btn.innerHTML = `✓ ${btn.dataset.semester === 'Fall' ? '🍂 Fall Semester' : '❄️ Winter Semester'}`;
        } else {
            btn.style.background = '#334155';
            btn.style.borderColor = '#475569';
            btn.style.color = 'var(--text)';
            btn.style.fontWeight = 'normal';
            btn.innerHTML = btn.dataset.semester === 'Fall' ? '🍂 Fall Semester' : '❄️ Winter Semester';
        }
    });
}

function applyFilters() {
    if (!selectedYear && !selectedSemester) {
        renderPapers(papers);
        return;
    }

    let filtered = papers;
    console.log('Applying filters - Year:', selectedYear, 'Semester:', selectedSemester, 'Total papers:', papers.length);

    if (selectedYear) {
        filtered = filtered.filter(paper => {
            const paperYear = String(paper.examYear || '');
            const matches = paperYear === selectedYear;
            console.log('Paper:', paper.subject, 'Year:', paperYear, 'Match:', matches);
            return matches;
        });
        console.log('After year filter:', filtered.length, 'papers');
    }

    if (selectedSemester) {
        filtered = filtered.filter(paper => {
            const examName = paper.examName || '';
            const matches = examName.toLowerCase().includes(selectedSemester.toLowerCase());
            console.log('Paper:', paper.subject, 'ExamName:', examName, 'Match:', matches);
            return matches;
        });
        console.log('After semester filter:', filtered.length, 'papers');
    }

    console.log('Final filtered papers:', filtered.length);
    renderPapers(filtered);
}

// Navigation Logic
function updateNav() {
    // Simplified header: right-side actions and theme toggle only
    const themeBtn = `<button id="themeToggleBtn" class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">🌓</button>`;

    const actions = `
        <div class="nav-actions">
            ${themeBtn}
            <button class="btn btn-primary" onclick="checkLoginForUpload(); closeMobileMenu()">Upload Papers</button>
            ${currentUser ? `<button class="btn btn-outline" onclick="logout(); closeMobileMenu()">Logout</button>` : `<button class="btn btn-primary" onclick="showPage('auth'); closeMobileMenu()">Login</button>`}
        </div>
    `;

    const navList = `
        <div class="nav-list">
            <a class="nav-link" onclick="showPage('home'); closeMobileMenu()">Home</a>
            ${currentUser ? `<a class="nav-link" onclick="showPage('profile'); closeMobileMenu()">Profile</a>` : ''}
        </div>
    `;

    const desktopNav = `
        <div class="nav-desktop">
            <button class="nav-desktop-btn" onclick="showPage('home')">Home</button>
            ${currentUser ? `<button class="nav-desktop-btn" onclick="showPage('profile')">Profile</button>` : ''}
        </div>
    `;

    navLinks.innerHTML = `
        <div class="nav-inner">
            ${navList}
            ${desktopNav}
            ${actions}
        </div>
    `;

    // reflect persisted theme (uses setTheme)
    const saved = localStorage.getItem('siteTheme') || 'system';
    if (saved !== 'system') setTheme(saved);

    // ensure theme icon shows correct state
    setTimeout(() => reflectThemeIcon(), 0);
}

function toggleTheme() {
    const cur = localStorage.getItem('siteTheme') || 'system';
    const next = cur === 'dark' ? 'light' : 'dark';
    setTheme(next);
}

function reflectThemeIcon() {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const cur = localStorage.getItem('siteTheme') || 'system';
    if (cur === 'dark') btn.innerText = '🌙';
    else if (cur === 'light') btn.innerText = '☀️';
    else btn.innerText = '🌓';
}

function setTheme(value) {
    localStorage.setItem('siteTheme', value);
    if (value === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', value);
    }
    // Update the theme toggle icon to reflect current selection
    reflectThemeIcon();
}

function toggleMobileMenu() {
    document.getElementById('navLinks').classList.toggle('active');
}

function closeMobileMenu() {
    document.getElementById('navLinks').classList.remove('active');
}

async function showPage(pageId) {

    [authSection, homeSection, uploadSection, profileSection].forEach(el => el.classList.add('hidden'));

    if (pageId === 'auth') authSection.classList.remove('hidden');
    else if (pageId === 'home') homeSection.classList.remove('hidden');
    else if (pageId === 'upload') {
        if (!currentUser) {
            showCustomAlert('You must be logged in to upload papers and earn points!');
            return showPage('auth');
        }
        uploadSection.classList.remove('hidden');
    }
    else if (pageId === 'profile') {
        // Try to restore user from token if missing
        if (!currentUser && api.token) {
            try {
                currentUser = await api.getUser();
                if (currentUser) {
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    updateNav();
                }
            } catch (e) {
                console.error('Failed to fetch user for profile:', e);
            }
        }

        if (!currentUser) return showPage('auth');
        updateProfileUI();
        profileSection.classList.remove('hidden');
    }
}

function checkLoginForUpload() {
    if (!currentUser) {
        showCustomAlert('You must be logged in to upload papers and earn points!');
        showPage('auth');
    } else {
        showPage('upload');
    }
}

// Auth Logic
let isLoginMode = true;
function toggleAuthMode() {

    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? 'Welcome Back' : 'Create Account';
    document.getElementById('authBtnText').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('authSwitchText').innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    document.getElementById('authSwitchLink').innerText = isLoginMode ? 'Sign Up' : 'Login';
    document.getElementById('signupFields').classList.toggle('hidden');
}

function continueAsGuest() {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    currentUser = null;
    updateNav();
    showPage('home');
    playSound('pop');
}

// Auth form submit handler
document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
        showCustomAlert('Please enter both email and password');
        return;
    }

    try {
        if (isLoginMode) {
            console.log('🔐 Attempting login for:', email);
            currentUser = await api.login(email, password);
            console.log('✓ Login successful:', currentUser);
            showCustomAlert('Login Successful!');
        } else {
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const phone = document.getElementById('phone').value.trim();

            if (!firstName) {
                showCustomAlert('Please enter your first name');
                return;
            }

            const newUser = {
                firstName,
                lastName,
                email,
                password,
                phone
            };
            console.log('📝 Attempting signup for:', email);
            currentUser = await api.signup(newUser);
            console.log('✓ Signup successful:', currentUser);
            showCustomAlert('Account Created Successfully!');
        }

        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateNav();
        // Re-render papers so heart colors update based on logged-in state
        renderPapers(papers);
        showPage('home');
        playSound('pop');
    } catch (err) {
        console.error('❌ Auth error:', err);
        showCustomAlert(err.message || 'Authentication failed. Please try again.');
        playSound('error');
    }
});

function logout() {
    console.log('🚪 Logging out user');
    playSound('pop');
    api.logout();
    currentUser = null;
    updateNav();
    showPage('auth');
}



// Profile name edit functions
function enableNameEdit() {
    document.getElementById('nameEditForm').classList.remove('hidden');
    document.getElementById('profileName').classList.add('hidden');
}

function saveNameEdit() {
    const first = document.getElementById('editFirstName').value.trim();
    const last = document.getElementById('editLastName').value.trim();
    if (!first && !last) {
        showCustomAlert('Please provide a name to update.');
        return;
    }
    // Optimistically update UI
    if (first) currentUser.firstName = first;
    if (last) currentUser.lastName = last;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateProfileUI();
    // Send update to backend if token present
    if (api.token) {
        api.updateProfile({ firstName: first, lastName: last }).catch(err => {
            console.error('Profile update failed', err);
            showCustomAlert('Failed to save changes to server.');
        });
    }
    // Hide edit form
    cancelNameEdit();
}

function cancelNameEdit() {
    document.getElementById('nameEditForm').classList.add('hidden');
    document.getElementById('profileName').classList.remove('hidden');
    // Reset fields
    document.getElementById('editFirstName').value = '';
    document.getElementById('editLastName').value = '';
}

// Extend API with profile update
API.prototype.updateProfile = async function (data) {
    const res = await fetch(`${this.baseUrl}/auth/profile`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': this.token
        },
        body: JSON.stringify(data)
    });
    return await this._handleResponse(res);
};

// Forgot Password Helper Functions
function showForgotPasswordForm(event) {
    if (event) event.preventDefault();
    document.getElementById('authCard').classList.add('hidden');
    document.getElementById('forgotPasswordCard').classList.remove('hidden');
}

function backToLogin() {
    document.getElementById('forgotPasswordCard').classList.add('hidden');
    document.getElementById('authCard').classList.remove('hidden');
    // Reset forgot password form
    document.getElementById('forgotStep1').classList.remove('hidden');
    document.getElementById('forgotStep2').classList.add('hidden');
    document.getElementById('forgotEmail').value = '';
    document.getElementById('forgotOTP').value = '';
    document.getElementById('forgotNewPassword').value = '';
    document.getElementById('forgotConfirmPassword').value = '';
    clearForgotStatusMessage();
}

function showForgotStatusMessage(message, type) {
    const statusDiv = document.getElementById('forgotStatus');
    if (!statusDiv) {
        // Create status message div if it doesn't exist
        const step1 = document.getElementById('forgotStep1');
        const step2 = document.getElementById('forgotStep2');
        const newStatusDiv = document.createElement('div');
        newStatusDiv.id = 'forgotStatus';
        newStatusDiv.className = 'forgot-status';

        if (!step1.classList.contains('hidden')) {
            step1.insertBefore(newStatusDiv, step1.firstChild);
        } else {
            step2.insertBefore(newStatusDiv, step2.firstChild);
        }
        showForgotStatusMessage(message, type); // Retry
        return;
    }

    statusDiv.textContent = message;
    statusDiv.className = `forgot-status ${type}`;
    statusDiv.style.display = 'block';
}

function clearForgotStatusMessage() {
    const statusDiv = document.getElementById('forgotStatus');
    if (statusDiv) {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
        statusDiv.className = 'forgot-status';
    }
}

async function sendForgotPasswordOTP() {

    const email = document.getElementById('forgotEmail').value.trim();

    if (!email) {
        showForgotStatusMessage('Please enter your email address', 'error');
        return;
    }

    try {
        showForgotStatusMessage('Sending OTP...', 'loading');
        const response = await api.forgotPassword(email);
        console.log('Forgot Password Response:', response); // Debug: Check console for OTP if email not configured

        // Display user-friendly success message without showing OTP code
        showForgotStatusMessage('✅ OTP sent to your registered email', 'success');

        // Show step 2 after 2 seconds
        setTimeout(() => {
            clearForgotStatusMessage();
            document.getElementById('forgotStep1').classList.add('hidden');
            document.getElementById('forgotStep2').classList.remove('hidden');
        }, 2000);
    } catch (err) {
        showForgotStatusMessage(err.message || 'Failed to send OTP', 'error');
    }
}

async function verifyOTPAndResetPassword() {

    const email = document.getElementById('forgotEmail').value.trim();
    const otp = document.getElementById('forgotOTP').value.trim();
    const newPassword = document.getElementById('forgotNewPassword').value;
    const confirmPassword = document.getElementById('forgotConfirmPassword').value;

    if (!otp || !newPassword || !confirmPassword) {
        showForgotStatusMessage('Please fill in all fields', 'error');
        return;
    }

    if (otp.length !== 6) {
        showForgotStatusMessage('OTP must be 6 digits', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showForgotStatusMessage('Passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showForgotStatusMessage('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        showForgotStatusMessage('Resetting password...', 'loading');
        await api.verifyOTP(email, otp, newPassword);
        showForgotStatusMessage('Password reset successfully! Redirecting to login...', 'success');

        setTimeout(() => {
            backToLogin();
            document.getElementById('email').value = email;
            document.getElementById('password').value = newPassword;
            showCustomAlert('Password reset successful! You can now login.');
        }, 2000);
    } catch (err) {
        showForgotStatusMessage(err.message || 'Failed to reset password', 'error');
    }
}

// Papers Logic
function renderPapers(papersToRender, containerId = 'papersGrid') {
    const container = document.getElementById(containerId);

    // Responsive Limits: Show limited papers on home page if not searching
    const searchQuery = document.getElementById('searchInput') ? document.getElementById('searchInput').value.trim() : '';
    let isTruncated = false;
    let limit = papersToRender.length;

    if (!searchQuery) {
        const width = window.innerWidth;
        if (width <= 768) {
            limit = 7; // Mobile
        } else if (width <= 1024) {
            limit = 10; // Tablet
        } else {
            limit = 12; // Desktop
        }

        if (papersToRender.length > limit) {
            papersToRender = papersToRender.slice(0, limit);
            isTruncated = true;
        }
    }

    if (!papersToRender || papersToRender.length === 0) {
        let message = 'No papers found.';
        if (selectedYear || selectedSemester) {
            message = `No papers found for ${selectedYear || ''} ${selectedSemester || ''}. Try clearing filters.`;
        }
        container.innerHTML = `<p class="text-muted" style="grid-column: 1/-1; text-align: center;">${message}</p>`;
        return;
    }

    let html = papersToRender.map(paper => {
        const fileUrl = paper.filePath;
        const uploaderName = paper.uploader ? `${paper.uploader.firstName} ${paper.uploader.lastName}` : 'Unknown';
        const uploaderPic = paper.uploader && paper.uploader.profilePic ? paper.uploader.profilePic : null;
        const uploaderLevel = paper.uploader && paper.uploader.level ? paper.uploader.level : 'Silver';
        const levelIcons = { 'Silver': '🥈', 'Gold': '🥇', 'Diamond': '💎', 'Legendary': '🦅' };

        // Extract semester from examName (e.g., "Fall 2024" or "Winter 2025")
        const examName = paper.examName || '';
        const semesterDisplay = examName.includes('Fall') || examName.includes('fall') ? '🍂 Fall Semester' :
            examName.includes('Winter') || examName.includes('winter') ? '❄️ Winter Semester' : '';

        // Check if liked (Local storage simulation for now)
        const likedPapers = JSON.parse(localStorage.getItem('likedPapers') || '[]');
        const likeDisabled = !currentUser;
        // Only show liked state if user is logged in
        const isLiked = !likeDisabled && likedPapers.includes(paper._id);

        return `
        <div class="card paper-card">
            <button class="like-btn ${isLiked ? 'liked' : ''} ${likeDisabled ? 'disabled' : ''}" ${likeDisabled ? 'title="Login to like"' : `onclick="toggleLike('${paper._id}', event)"`}>
                ${isLiked ? '❤️' : '🤍'}
            </button>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; margin-top:2.5rem; gap:0.5rem;">
                <span class="badge">${paper.category}</span>
                <div style="text-align:right;">
                    <div style="font-size:0.85rem; color:var(--primary); font-weight:600;">${paper.examYear || 'N/A'}</div>
                    ${semesterDisplay ? `<div style="font-size:0.8rem; color:#10b981; font-weight:600; margin-top:0.3rem;">${semesterDisplay}</div>` : ''}
                </div>
            </div>
            <h3 style="margin-bottom:0.5rem; line-height:1.4;">${paper.subject}</h3>
            <p class="text-muted" style="margin-bottom:1rem; font-size:0.9rem;">${paper.courseCode} • Slot: ${paper.slot || 'N/A'}</p>
            <div style="margin-top:1rem; display:flex; align-items:center; gap:0.5rem;">
                <div style="width:28px; height:28px; background:#334155; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; overflow:hidden; flex-shrink:0;">
                    ${uploaderPic ? `<img src="${uploaderPic}" style="width:100%;height:100%;object-fit:cover;">` : uploaderName[0]}
                </div>
                <div style="flex:1; display:flex; flex-direction:column; gap:0.25rem;">
                    <span class="text-muted" style="font-size:0.9rem;">${uploaderName}</span>
                    <span style="font-size:0.75rem; color:var(--primary);">${levelIcons[uploaderLevel] || ''} ${uploaderLevel}</span>
                </div>
            </div>
            <div style="display:flex; gap:0.5rem; margin-top:1.5rem;">
                <button class="btn btn-outline" style="flex:1; padding:0.6rem 1rem;" onclick="viewPaper('${fileUrl}', '${paper.subject}')">View Paper</button>
                <button class="btn btn-primary" style="flex:1; padding:0.6rem 1rem;" onclick="downloadPaper('${fileUrl}', '${paper.subject}', '${paper._id}')">Download</button>
            </div>
        </div>
    `}).join('');

    if (isTruncated) {
        html += `
            <div style="grid-column: 1/-1; text-align: center; margin-top: 2rem; padding: 1rem; background: #1e293b; border-radius: 0.5rem; border: 1px solid #334155;">
                <p style="margin: 0; color: #94a3b8;">Showing top ${limit} results. <br> <span style="color: #fff; font-weight: 600;">Use search to find more papers.</span></p>
            </div>
        `;
    }

    container.innerHTML = html;
}

async function handleSearch() {
    const query = document.getElementById('searchInput').value;
    try {
        const filtered = await api.getAllPapers(query);
        renderPapers(filtered);
    } catch (e) {
        console.error("Search failed", e);
    }
}

// Like Logic
async function toggleLike(paperId, event) {
    if (event) event.stopPropagation();

    if (!currentUser) {
        showCustomAlert('Please login to like papers!');
        return;
    }



    // Toggle like in local storage (simulating backend persistence)
    let likedPapers = JSON.parse(localStorage.getItem('likedPapers') || '[]');
    const index = likedPapers.indexOf(paperId);

    if (index === -1) {
        likedPapers.push(paperId);
        // Visual update
        event.currentTarget.innerHTML = '❤️';
        event.currentTarget.classList.add('liked');
    } else {
        likedPapers.splice(index, 1);
        // Visual update
        event.currentTarget.innerHTML = '🤍';
        event.currentTarget.classList.remove('liked');
    }

    localStorage.setItem('likedPapers', JSON.stringify(likedPapers));

    // Refresh profile if open
    if (!profileSection.classList.contains('hidden')) {
        updateProfileUI();
    }
}

// View & Download Logic
function viewPaper(url, title) {

    window.open(url, '_blank');
}

function downloadPaper(url, title, paperId) {
    // Register download with backend if logged in
    if (currentUser && paperId) {
        // Optimistic update
        currentUser.downloadCount = (currentUser.downloadCount || 0) + 1;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        if (!profileSection.classList.contains('hidden')) {
            updateProfileUI();
        }

        // Sync with backend
        api.registerDownload(paperId).then(async () => {
            // Fetch authoritative data
            const freshUser = await api.getUser();
            if (freshUser) {
                currentUser = freshUser;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                if (!profileSection.classList.contains('hidden')) {
                    updateProfileUI();
                }
            }
        }).catch(err => console.error('Failed to register download', err));
    }

    fetch(url)
        .then(response => response.blob())
        .then(blob => {
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = title || 'paper';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        })
        .catch(error => {
            console.error('Download failed:', error);
            window.open(url, '_blank');
        });
}

// Upload Logic
let selectedFile = null;

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedFile = file;
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (e) {
                document.getElementById('imagePreview').src = e.target.result;
                document.getElementById('imagePreviewContainer').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        } else {
            document.getElementById('imagePreviewContainer').classList.add('hidden');
        }
    }
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentUser) {
        showCustomAlert('You must be logged in to upload!');
        showPage('auth');
        return;
    }

    if (!selectedFile) {
        showCustomAlert('Please select a file first!');
        return;
    }

    // Play success sound immediately for feedback, though actual success is later
    // User requested sound "while paper is uploaded" - usually means on success

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('subject', document.getElementById('upSubject').value);
    formData.append('courseCode', document.getElementById('upCourse').value);
    formData.append('examYear', document.getElementById('upYear').value);
    formData.append('slot', document.getElementById('upSlot').value);
    formData.append('category', document.getElementById('upCategory').value);
    formData.append('examName', document.getElementById('upSemester').value);

    try {
        await api.addPaper(formData);

        // Refresh data immediately
        await loadPapers();
        currentUser = await api.getUser(); // Refresh user points
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateProfileUI();

        playSound('champion');
        showCustomAlert('Paper Uploaded! You earned 50 points.');

        document.getElementById('uploadForm').reset();
        document.getElementById('imagePreviewContainer').classList.add('hidden');
        selectedFile = null;

        // Stay on page or show home? User asked for popup immediately.
        // We will switch to home but the popup will be visible over it.
        showPage('home');

    } catch (err) {
        console.error("Upload failed:", err);
        showCustomAlert("Failed to upload paper: " + err.message);
        playSound('error');
    }
});

async function handleProfilePicUpdate(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        showCustomAlert('Uploading profile picture...');
        const res = await api.uploadProfilePic(formData);

        // Update local user data
        currentUser.profilePic = res.profilePic;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        updateProfileUI();
        showCustomAlert('Profile picture updated!');
        playSound('pop');
    } catch (err) {
        console.error("Profile pic upload failed:", err);
        showCustomAlert("Failed to upload profile picture: " + err.message);
    }
}

// Profile Logic
let expandedLikedPaperId = null;

function updateProfileUI() {
    console.log('updateProfileUI called, currentUser:', currentUser);

    if (!currentUser) {
        console.error('No currentUser found in updateProfileUI');
        return;
    }

    document.getElementById('profileName').innerText = `${currentUser.firstName} ${currentUser.lastName}`;
    document.getElementById('profileEmail').innerText = currentUser.email;
    document.getElementById('profilePoints').innerText = currentUser.points;

    // Update profile bio
    const bioEl = document.getElementById('profileBioText');
    if (bioEl) {
        bioEl.innerText = currentUser.bio || 'Contributing to VIT PYQ\'s community';
    }

    const levelIcons = { 'Silver': '🥈', 'Gold': '🥇', 'Diamond': '💎', 'Legendary': '🦅' };
    document.getElementById('profileLevel').innerHTML = `${levelIcons[currentUser.level] || ''} ${currentUser.level}`;

    // Calculate uploads from points (1 upload = 50 points)
    const uploadsCount = Math.floor((currentUser.points || 0) / 50);
    document.getElementById('profileUploads').innerText = uploadsCount;

    // Use backend provided download count
    document.getElementById('profileDownloads').innerText = currentUser.downloadCount || 0;

    const avatarEl = document.getElementById('profileAvatar');
    if (currentUser.profilePic) {
        avatarEl.innerHTML = `<img src="${currentUser.profilePic}" alt="Profile">`;
    } else {
        avatarEl.innerText = currentUser.firstName ? currentUser.firstName[0] : 'U';
    }

    console.log('Profile UI updated successfully');

    // Render Liked Papers with collapsible bars
    renderLikedPapersCollapsible();
}

function renderLikedPapersCollapsible() {
    const likedPaperIds = JSON.parse(localStorage.getItem('likedPapers') || '[]');
    let likedPapersList = papers.filter(p => likedPaperIds.includes(p._id));

    // Apply search filter
    if (likedPapersSearchQuery.trim()) {
        const query = likedPapersSearchQuery.toLowerCase();
        likedPapersList = likedPapersList.filter(p =>
            p.subject.toLowerCase().includes(query) ||
            p.courseCode.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query) ||
            (p.slot && p.slot.toLowerCase().includes(query))
        );
    }

    const container = document.getElementById('likedPapersGrid');

    let html = '';

    if (!likedPapersList || likedPapersList.length === 0) {
        html += `
            <div style="text-align: center; padding: 2rem;">
                <p class="text-muted">No liked papers yet.</p>
            </div>
        `;
        container.innerHTML = html;
        return;
    }

    // Render collapsible bars; include a "Remove" button per liked paper
    html += likedPapersList.map(paper => {
        const isExpanded = expandedLikedPaperId === paper._id;
        const uploaderName = paper.uploader ? `${paper.uploader.firstName} ${paper.uploader.lastName}` : 'Unknown';
        const uploaderPic = paper.uploader && paper.uploader.profilePic ? paper.uploader.profilePic : null;
        const uploaderLevel = paper.uploader && paper.uploader.level ? paper.uploader.level : 'Silver';
        const levelIcons = { 'Silver': '🥈', 'Gold': '🥇', 'Diamond': '💎', 'Legendary': '🦅' };
        const fileUrl = paper.filePath;

        return `
            <div class="liked-paper-bar ${isExpanded ? 'expanded' : ''}" style="margin-bottom: 0.5rem; background: #1e293b; border-radius: 0.5rem; overflow: hidden; border: 1px solid #334155;">
                <div 
                    class="liked-paper-header" 
                    onclick="toggleLikedPaper('${paper._id}')"
                    style="padding: 1rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;"
                    onmouseover="this.style.background='#334155'"
                    onmouseout="this.style.background='transparent'"
                >
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span class="badge">${paper.category}</span>
                            <span class="text-muted" style="font-size: 0.85rem;">${paper.examYear || 'N/A'}</span>
                        </div>
                        <h4 style="margin: 0; font-size: 1rem;">${paper.subject}</h4>
                        <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">${paper.courseCode} • Slot: ${paper.slot || 'N/A'}</p>
                    </div>
                    <div style="font-size: 1.5rem; transition: transform 0.3s; transform: rotate(${isExpanded ? '180deg' : '0deg'});">
                        ▼
                    </div>
                </div>
                
                <div class="liked-paper-content" style="max-height: ${isExpanded ? '500px' : '0'}; overflow: hidden; transition: max-height 0.3s ease-in-out;">
                    <div style="padding: 1rem; border-top: 1px solid #334155;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                            <div style="width: 32px; height: 32px; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; overflow: hidden;">
                                ${uploaderPic ? `<img src="${uploaderPic}" style="width:100%;height:100%;object-fit:cover;">` : uploaderName[0]}
                            </div>
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="font-size: 0.9rem;">${uploaderName}</span>
                                    <span style="font-size: 0.75rem; color: var(--primary);">${levelIcons[uploaderLevel] || ''} ${uploaderLevel}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-outline" style="flex: 1;" onclick="viewPaper('${fileUrl}', '${paper.subject}')">View Paper</button>
                            <button class="btn btn-primary" style="flex: 1;" onclick="downloadPaper('${fileUrl}', '${paper.subject}', '${paper._id}')">Download</button>
                            <button class="btn btn-danger" style="flex: 0 0 110px;" onclick="removeLikedPaper('${paper._id}', event)">Remove</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Restore focus to search input if it was focused
    const searchInput = document.getElementById('likedPapersSearch');
    if (searchInput && document.activeElement?.id === 'likedPapersSearch') {
        setTimeout(() => {
            searchInput.focus();
            searchInput.setSelectionRange(likedPapersSearchQuery.length, likedPapersSearchQuery.length);
        }, 0);
    }
}

function toggleLikedPaper(paperId) {

    if (expandedLikedPaperId === paperId) {
        expandedLikedPaperId = null;
    } else {
        expandedLikedPaperId = paperId;
    }
    renderLikedPapersCollapsible();
}

function handleLikedPapersSearch(event) {
    event.stopPropagation();
    likedPapersSearchQuery = event.target.value;
    renderLikedPapersCollapsible();
}

function removeLikedPaper(paperId, event) {
    if (event) event.stopPropagation();

    let likedPapers = JSON.parse(localStorage.getItem('likedPapers') || '[]');
    const idx = likedPapers.indexOf(paperId);
    if (idx !== -1) likedPapers.splice(idx, 1);
    localStorage.setItem('likedPapers', JSON.stringify(likedPapers));
    // If profile open, refresh UI
    if (!profileSection.classList.contains('hidden')) {
        updateProfileUI();
    }
}

// Interactive Bubble Animation
function initBubbleAnimation() {
    const canvas = document.getElementById('bubbleCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let bubbles = [];
    let mouse = { x: canvas.width / 2, y: canvas.height / 2 };

    class Bubble {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.size = Math.random() * 60 + 20;
            this.speedX = (Math.random() - 0.5) * 2;
            this.speedY = (Math.random() - 0.5) * 2;
            this.opacity = Math.random() * 0.3 + 0.1;
            this.color = `rgba(${99 + Math.random() * 50}, ${102 + Math.random() * 50}, ${241}, ${this.opacity})`;
        }

        update() {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 200) {
                this.x += dx * 0.02;
                this.y += dy * 0.02;
            }

            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;

            this.opacity -= 0.001;
            if (this.opacity <= 0) {
                this.opacity = Math.random() * 0.3 + 0.1;
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
            }
        }

        draw() {
            ctx.beginPath();
            const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
            gradient.addColorStop(0, `rgba(99, 102, 241, ${this.opacity})`);
            gradient.addColorStop(0.5, `rgba(236, 72, 153, ${this.opacity * 0.5})`);
            gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
            ctx.fillStyle = gradient;
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    for (let i = 0; i < 15; i++) {
        bubbles.push(new Bubble(
            Math.random() * canvas.width,
            Math.random() * canvas.height
        ));
    }

    document.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        if (Math.random() < 0.05 && bubbles.length < 25) {
            bubbles.push(new Bubble(e.clientX, e.clientY));
        }
    });

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        bubbles.forEach(bubble => {
            bubble.update();
            bubble.draw();
        });
        if (bubbles.length > 25) {
            bubbles = bubbles.slice(0, 25);
        }
        requestAnimationFrame(animate);
    }

    animate();

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// Cursor Effect
function initCursorEffect() {
    const cursor = document.createElement('div');
    cursor.className = 'cursor-trailer';
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
    });

    // Add style dynamically
    const style = document.createElement('style');
    style.innerHTML = `
        .cursor-trailer {
            position: fixed;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: rgba(99, 102, 241, 0.5);
            filter: blur(5px);
            pointer-events: none;
            transform: translate(-50%, -50%);
            z-index: 9999;
            transition: width 0.2s, height 0.2s;
        }
        body:active .cursor-trailer {
            width: 15px;
            height: 15px;
            background: rgba(236, 72, 153, 0.6);
        }
    `;
    document.head.appendChild(style);
}
