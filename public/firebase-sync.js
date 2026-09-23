/**
 * Bridges UI state ↔ Firestore when VitApi is active.
 * Safe no-op in local demo mode.
 */
(function () {
  if (!window.VitApi || window.VITPYQ_BACKEND !== 'firebase') {
    console.info('[VITPYQ] firebase-sync idle (demo/local mode)');
    return;
  }

  const Api = window.VitApi;
  let unsubPapers = null;
  let unsubUsers = null;
  let unsubGlobalChat = null;
  let unsubPrivateChat = null;

  function mapUser(d) {
    if (!d) return null;
    return {
      id: d.id || d.uid,
      ...d,
      friends: d.friends || [],
      requests: d.requests || [],
      items: d.items || [],
      activeItems: d.activeItems || [],
      likedPapers: d.likedPapers || [],
      systemNotifs: d.systemNotifs || []
    };
  }

  Api.onAuth(async (fbUser) => {
    if (!fbUser) {
      if (window.state) {
        state.user = null;
        if (typeof updateUI === 'function') updateUI();
      }
      return;
    }
    const profile = await Api.getUser(fbUser.uid);
    if (window.state && profile) {
      state.user = mapUser(profile);
      if (typeof updateUI === 'function') updateUI();
      if (typeof renderProfile === 'function' && document.getElementById('profile')?.classList.contains('active')) {
        renderProfile();
      }
    }
  });

  unsubPapers = Api.listenPapers((papers) => {
    if (!window.state) return;
    state.papers = papers.map(p => ({
      ...p,
      createdAt: p.createdAt?.toMillis ? p.createdAt.toMillis() : (p.createdAt || Date.now()),
      fileData: p.fileUrl || p.fileData || ''
    }));
    if (typeof renderHomePapers === 'function') renderHomePapers();
    if (typeof renderPapers === 'function') renderPapers();
  });

  unsubUsers = Api.listenUsers((users) => {
    if (!window.state) return;
    state.users = users.map(mapUser);
    if (state.user) {
      const me = state.users.find(u => u.id === state.user.id);
      if (me) state.user = me;
      const admin = state.users.find(u => u.isAdmin && u.id !== state.user.id);
      if (admin && !(state.user.friends || []).includes(admin.id)) {
        state.user.friends = [...(state.user.friends || []), admin.id];
        syncUser(state.user);
      }
    }
    if (typeof renderLeaderboard === 'function') renderLeaderboard();
  });

  // Override save to also push current user profile when online
  const _save = window.save;
  function syncUser(user) {
    if (!user || !Api.auth.currentUser) return Promise.resolve();
    const payload = { ...user };
    delete payload.id;
    return Api.updateUser(user.id || Api.auth.currentUser.uid, payload).catch(e => console.warn('sync user', e));
  }

  window.save = function () {
    if (typeof _save === 'function') _save();
    syncUser(state.user);
  };

  unsubGlobalChat = Api.listenGlobalChat((messages) => {
    state.messages = messages;
    if (typeof renderChat === 'function') renderChat();
  });

  // Google button uses real popup when available
  const _google = window.googleLogin;
  window.googleLogin = async function () {
    try {
      await Api.signInWithGoogle();
      toast('Signed in with Google', 'success');
      if (typeof showSection === 'function') showSection('home');
    } catch (e) {
      toast(e.message || 'Google sign-in failed', 'error');
    }
  };

  const _register = window.handleRegister;
  window.handleRegister = async function (e) {
    e.preventDefault();
    const profile = {
      firstName: document.getElementById('regFirst').value.trim(),
      lastName: document.getElementById('regLast').value.trim(),
      username: document.getElementById('regUser').value.trim().toLowerCase(),
      branch: document.getElementById('regBranch').value.trim(),
      displayName: `${document.getElementById('regFirst').value.trim()} ${document.getElementById('regLast').value.trim()}`.trim()
    };
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPass').value;
    try {
      await Api.registerEmail(email, password, profile);
      document.getElementById('registerForm')?.reset();
      toast('Account created!', 'success');
      showSection('home');
    } catch (err) {
      toast(err.message || 'Registration failed', 'error');
    }
  };

  const _login = window.handleLogin;
  window.handleLogin = async function (e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPass').value;
    try {
      await Api.loginEmail(email, password);
      toast('Welcome back!', 'success');
      showSection('home');
    } catch (err) {
      toast(err.message || 'Login failed', 'error');
    }
  };

  const _logout = window.logout;
  window.logout = async function () {
    try { await Api.logout(); } catch (err) { toast(err.message || 'Logout failed', 'error'); }
    state.user = null;
    updateUI();
    showSection('home');
    closeMenu();
  };

  window.handleUpload = async function (e) {
    e.preventDefault();
    if (!state.user || !Api.auth.currentUser) { toast('Login required', 'error'); showSection('auth'); return; }
    const file = state.pendingFile || document.getElementById('upFile')?.files[0];
    if (!file) { toast('Select a file first', 'error'); return; }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast('Only PDF files are allowed', 'error'); return;
    }
    try {
      const uploaded = await Api.uploadPaperFile(Api.auth.currentUser.uid, file);
      const paper = {
        subject: document.getElementById('upSubject').value.trim(),
        code: document.getElementById('upCode').value.trim().toUpperCase(),
        year: document.getElementById('upYear').value,
        semester: document.getElementById('upSem').value,
        category: document.getElementById('upCat').value,
        campus: document.getElementById('upCampus').value,
        uploaderId: Api.auth.currentUser.uid,
        fileName: file.name,
        fileUrl: uploaded.url,
        filePath: uploaded.path
      };
      await Api.createPaper(paper);
      state.user.uploads = (state.user.uploads || 0) + 1;
      state.user.vcash = (state.user.vcash || 0) + 500;
      if (!state.user.uploadHistory) state.user.uploadHistory = [];
      state.user.uploadHistory.unshift({ paperId: uploaded.path, name: paper.subject, fileName: file.name, ts: Date.now() });
      save();
      e.target.reset();
      clearPreview();
      toast('+500 VX! Paper uploaded', 'success');
      showSection('home');
    } catch (err) {
      toast(err.message || 'Upload failed', 'error');
    }
  };

  const _sendChat = window.sendChat;
  window.sendChat = async function (e) {
    e.preventDefault();
    if (!state.user) { toast('Login to chat', 'error'); showSection('auth'); return; }
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    try {
      await Api.sendGlobalMessage({
        userId: state.user.id,
        username: state.user.username,
        text,
        isAdmin: !!state.user.isAdmin,
        pinned: !!state.user.isAdmin
      });
      input.value = '';
    } catch (err) {
      toast(err.message || 'Message failed', 'error');
    }
  };

  const _openPersonalThread = window.openPersonalThread;
  window.openPersonalThread = function (friendId) {
    if (unsubPrivateChat) unsubPrivateChat();
    _openPersonalThread(friendId);
    if (!state.user) return;
    unsubPrivateChat = Api.listenPrivateChat(state.user.id, friendId, (messages) => {
      state.privateChats[chatKey(state.user.id, friendId)] = messages.map(m => ({
        ...m,
        from: m.from || m.userId
      }));
      renderPcMessages();
    });
  };

  const _sendPersonalChat = window.sendPersonalChat;
  window.sendPersonalChat = async function (e) {
    e.preventDefault();
    if (!state.user || !state.activeFriendId) { toast('Select a friend first', 'error'); return; }
    const input = document.getElementById('pcInput');
    const text = input.value.trim();
    if (!text) return;
    try {
      await Api.sendPrivateMessage(state.user.id, state.activeFriendId, {
        from: state.user.id,
        userId: state.user.id,
        text
      });
      input.value = '';
    } catch (err) {
      toast(err.message || 'Message failed', 'error');
    }
  };

  const _sendFriendRequest = window.sendFriendRequest;
  window.sendFriendRequest = async function (toId) {
    _sendFriendRequest(toId);
    const target = state.users.find(u => u.id === toId);
    if (target) await syncUser(target);
  };

  const _acceptFriend = window.acceptFriend;
  window.acceptFriend = async function (fromId) {
    _acceptFriend(fromId);
    const other = state.users.find(u => u.id === fromId);
    await Promise.all([syncUser(state.user), syncUser(other)]);
  };

  const _rejectFriend = window.rejectFriend;
  window.rejectFriend = async function (fromId) {
    _rejectFriend(fromId);
    await syncUser(state.user);
  };

  const _updateProfilePic = window.updateProfilePic;
  window.updateProfilePic = async function (e) {
    const file = e.target.files[0];
    if (!file || !state.user) return;
    try {
      const uploaded = await Api.uploadAvatar(state.user.id, file);
      state.user.avatar = uploaded.url;
      const u = state.users.find(x => x.id === state.user.id);
      if (u) u.avatar = uploaded.url;
      save(); updateUI(); renderProfile();
      toast('Photo updated', 'success');
    } catch (err) {
      toast(err.message || 'Photo upload failed', 'error');
    }
  };

  const _renderPcFriendsCloud = window.renderPcFriends;
  window.renderPcFriends = function () {
    _renderPcFriendsCloud();
    const admin = state.users.find(u => u.isAdmin && u.id !== state.user?.id);
    if (!admin) return;
    const box = document.getElementById('pcFriendsList');
    const adminRow = [...box.querySelectorAll('.pc-friend')].find(row => row.getAttribute('onclick')?.includes(`'${admin.id}'`));
    if (adminRow) {
      adminRow.classList.add('admin-contact');
      adminRow.innerHTML = `<i class="fas fa-shield-alt"></i> @${escapeHtml(admin.username)} <span class="muted">Admin</span>`;
      box.prepend(adminRow);
    }
  };

  const _forgot = window.handleForgot;
  window.handleForgot = async function (e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
    const otpStep = document.getElementById('otpStep');
    const btn = document.getElementById('forgotBtn');
    if (!otpStep.classList.contains('hidden') === false && !document.getElementById('forgotOtp').value) {
      // first step
    }
    try {
      if (otpStep.classList.contains('hidden') || otpStep.style.display === 'none') {
        await Api.requestPasswordOtp(email);
        otpStep.classList.remove('hidden');
        if (otpStep.style) otpStep.style.display = 'block';
        btn.textContent = 'Reset Password';
        toast('OTP sent to your Gmail (check inbox)', 'success');
        return;
      }
      const otp = document.getElementById('forgotOtp').value.trim();
      const pass = document.getElementById('forgotNewPass').value;
      await Api.verifyPasswordOtp(email, otp, pass);
      toast('Password updated. Please login.', 'success');
      if (typeof switchAuth === 'function') switchAuth('login');
    } catch (err) {
      toast(err.message || 'OTP failed', 'error');
    }
  };

  console.info('[VITPYQ] firebase-sync active — data is cloud-backed');
})();
