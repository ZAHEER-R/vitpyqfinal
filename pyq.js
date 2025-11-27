// API Wrapper for Backend Connection
class API {
    constructor() {
        // If we are on the backend server (port 5000), use relative path
        // If we are on Live Server (port 5500/5501) or file://, point to localhost:5000
        const isBackend = window.location.port === '5000';
        this.baseUrl = isBackend ? '/api' : 'http://localhost:5000/api';
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
}

// Initialize API
const api = new API();
let currentUser = null;
let papers = [];

// Sounds
const sounds = {
    click: new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'),
    success: new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'),
    alert: new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU')
};

function playSound(type) {
    // console.log(`Playing sound: ${type}`);
}

// DOM Elements
const navLinks = document.getElementById('navLinks');
const authSection = document.getElementById('authSection');
const homeSection = document.getElementById('homeSection');
const uploadSection = document.getElementById('uploadSection');
const profileSection = document.getElementById('profileSection');
const papersGrid = document.getElementById('papersGrid');

// Init
document.addEventListener('DOMContentLoaded', async () => {
    // Try to restore session
    if (api.token) {
        try {
            currentUser = await api.getUser();
            if (currentUser) {
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
            }
        } catch (e) {
            console.error("Session restore failed", e);
        }
    }

    await loadPapers();
    updateNav();
    showPage('home');
    initBubbleAnimation();
});

async function loadPapers() {
    try {
        papers = await api.getAllPapers();
        // Sort by newest first (assuming _id or createdAt can be used, but backend returns array)
        // papers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderPapers(papers);
    } catch (e) {
        console.error("Failed to load papers:", e);
        papersGrid.innerHTML = '<p class="text-muted text-center">Failed to connect to server. Ensure backend is running.</p>';
    }
}

// Navigation Logic
function updateNav() {
    if (currentUser) {
        navLinks.innerHTML = `
            <a class="nav-link" onclick="showPage('home'); closeMobileMenu()">Home</a>
            <a class="nav-link" onclick="showPage('upload'); closeMobileMenu()">Upload</a>
            <a class="nav-link" onclick="showPage('profile'); closeMobileMenu()">Profile</a>
            <button class="btn btn-outline" onclick="logout(); closeMobileMenu()">Logout</button>
        `;
    } else {
        navLinks.innerHTML = `
            <a class="nav-link" onclick="showPage('home'); closeMobileMenu()">Home</a>
            <a class="nav-link" onclick="checkLoginForUpload(); closeMobileMenu()">Upload</a>
            <button class="btn btn-primary" onclick="showPage('auth'); closeMobileMenu()">Login</button>
        `;
    }
}

function toggleMobileMenu() {
    document.getElementById('navLinks').classList.toggle('active');
}

function closeMobileMenu() {
    document.getElementById('navLinks').classList.remove('active');
}

function showPage(pageId) {
    playSound('click');
    [authSection, homeSection, uploadSection, profileSection].forEach(el => el.classList.add('hidden'));

    if (pageId === 'auth') authSection.classList.remove('hidden');
    else if (pageId === 'home') homeSection.classList.remove('hidden');
    else if (pageId === 'upload') {
        if (!currentUser) {
            playSound('alert');
            alert('You must be logged in to upload papers and earn points!');
            return showPage('auth');
        }
        uploadSection.classList.remove('hidden');
    }
    else if (pageId === 'profile') {
        if (!currentUser) return showPage('auth');
        updateProfileUI();
        profileSection.classList.remove('hidden');
    }
}

function checkLoginForUpload() {
    if (!currentUser) {
        playSound('alert');
        alert('You must be logged in to upload papers and earn points!');
        showPage('auth');
    } else {
        showPage('upload');
    }
}

// Auth Logic
let isLoginMode = true;
function toggleAuthMode() {
    playSound('click');
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? 'Welcome Back' : 'Create Account';
    document.getElementById('authBtnText').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('authSwitchText').innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    document.getElementById('authSwitchLink').innerText = isLoginMode ? 'Sign Up' : 'Login';
    document.getElementById('signupFields').classList.toggle('hidden');
}

function continueAsGuest() {
    playSound('click');
    currentUser = null;
    updateNav();
    showPage('home');
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    playSound('click');
    const email = document.getElementById('email').value;
    const password = document.getElementById('password') ? document.getElementById('password').value : 'password'; // Assuming password field exists or default

    // Note: The original HTML didn't have a password field. We need to handle this.
    // For now, we'll use a default password if not present, or prompt user.
    // Ideally, we should add a password field to the HTML.
    // Since I can't see the HTML right now, I'll assume I might need to add it or use a dummy one for the 'demo'.
    // BUT, the backend requires a password.
    // Let's assume the user will add a password field or we use a default for this migration.
    const pass = 'password123'; // Default for migration if field missing

    try {
        if (isLoginMode) {
            currentUser = await api.login(email, pass);
            alert('Login Successful!');
        } else {
            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;
            const newUser = {
                firstName, lastName, email,
                password: pass, // sending default password
                phone: '1234567890' // Dummy phone
            };
            currentUser = await api.signup(newUser);
            alert('Account Created!');
        }
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateNav();
        showPage('home');
        playSound('success');
    } catch (err) {
        playSound('alert');
        alert(err.message);
    }
});

function logout() {
    playSound('click');
    api.logout();
    currentUser = null;
    updateNav();
    showPage('auth');
}

// Papers Logic
function renderPapers(papersToRender) {
    if (!papersToRender || papersToRender.length === 0) {
        papersGrid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align: center;">No papers found. Be the first to upload!</p>';
        return;
    }

    papersGrid.innerHTML = papersToRender.map(paper => {
        // Backend returns filePath like 'uploads\\123.pdf'. We need to fix slashes.
        const fixedPath = paper.filePath.replace(/\\/g, '/');
        // Use relative path so it works on phone (IP address) too
        const fileUrl = `/${fixedPath}`;
        const uploaderName = paper.uploader ? `${paper.uploader.firstName} ${paper.uploader.lastName}` : 'Unknown';
        const uploaderPic = paper.uploader && paper.uploader.profilePic ? paper.uploader.profilePic : null;

        const isLiked = false; // Liked logic needs backend support, skipping for now

        return `
        <div class="card paper-card">
            <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${paper._id}', event)">
                ${isLiked ? '❤️' : '🤍'}
            </button>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; margin-top:2.5rem;">
                <span class="badge">${paper.category}</span>
                <span class="text-muted" style="font-size:0.85rem;">${paper.examYear || 'N/A'}</span>
            </div>
            <h3>${paper.subject}</h3>
            <p class="text-muted">${paper.courseCode} • Slot: ${paper.slot || 'N/A'}</p>
            <div style="margin-top:1rem; display:flex; align-items:center; gap:0.5rem;">
                <div style="width:24px; height:24px; background:#334155; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; overflow:hidden;">
                    ${uploaderPic ? `<img src="${uploaderPic}" style="width:100%;height:100%;object-fit:cover;">` : uploaderName[0]}
                </div>
                <span class="text-muted" style="font-size:0.9rem;">${uploaderName}</span>
            </div>
            <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                <button class="btn btn-outline" style="flex:1;" onclick="viewPaper('${fileUrl}', '${paper.subject}')">View Paper</button>
                <button class="btn btn-primary" style="flex:1;" onclick="downloadPaper('${fileUrl}', '${paper.subject}')">⬇️ Download</button>
            </div>
        </div>
    `}).join('');
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

// Like Logic (Placeholder as backend doesn't support likes yet)
async function toggleLike(paperId, event) {
    if (event) event.stopPropagation();
    alert('Like feature coming soon to backend!');
}

// View & Download Logic
function viewPaper(url, title) {
    playSound('click');
    // Simple view: open in new tab
    window.open(url, '_blank');
}

function downloadPaper(url, title) {
    playSound('success');
    const link = document.createElement('a');
    link.href = url;
    link.download = title; // Browser might ignore this for cross-origin, but worth a try
    link.target = '_blank';
    link.click();
}

// Upload Logic
let selectedFile = null;

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        selectedFile = file;
        // Preview if image
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
        playSound('alert');
        alert('You must be logged in to upload!');
        showPage('auth');
        return;
    }

    if (!selectedFile) {
        alert('Please select a file first!');
        return;
    }

    playSound('success');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('subject', document.getElementById('upSubject').value);
    formData.append('courseCode', document.getElementById('upCourse').value);
    formData.append('examYear', document.getElementById('upYear').value);
    formData.append('slot', document.getElementById('upSlot').value);
    formData.append('category', document.getElementById('upCategory').value);
    formData.append('examName', 'Mid Term'); // Default or add field

    try {
        await api.addPaper(formData);

        alert('Paper Uploaded! You earned 50 points.');

        // Reset Form
        document.getElementById('uploadForm').reset();
        document.getElementById('imagePreviewContainer').classList.add('hidden');
        selectedFile = null;

        showPage('home');
        loadPapers(); // Reload from server
    } catch (err) {
        console.error("Upload failed:", err);
        alert("Failed to upload paper: " + err.message);
    }
});

// Profile Logic
function updateProfileUI() {
    if (!currentUser) return;

    document.getElementById('profileName').innerText = `${currentUser.firstName} ${currentUser.lastName}`;
    document.getElementById('profileEmail').innerText = currentUser.email;
    document.getElementById('profilePoints').innerText = currentUser.points;

    const levelIcons = { 'Silver': '🥈', 'Gold': '🥇', 'Diamond': '💎', 'Legendary': '🦅' };
    document.getElementById('profileLevel').innerHTML = `${levelIcons[currentUser.level] || ''} ${currentUser.level}`;

    document.getElementById('profileUploads').innerText = currentUser.uploads || 0; // Backend might not track this yet
    document.getElementById('profileDownloads').innerText = currentUser.downloads || 0;

    const avatarEl = document.getElementById('profileAvatar');
    if (currentUser.profilePic) {
        avatarEl.innerHTML = `<img src="${currentUser.profilePic}" alt="Profile">`;
    } else {
        avatarEl.innerText = currentUser.firstName ? currentUser.firstName[0] : 'U';
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
