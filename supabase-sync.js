window.SupabaseSync = {
  ready: false,
  pending: Promise.resolve(),
  refreshTimer: null,
  refreshBusy: false,
  async initialize() {
    if (!window.sb) return false;
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      this.ready = true;
      await this.pull();
      this.startRefresh();
      return true;
    } catch (error) {
      const message = (error && error.message) || String(error || '');
      if (/Could not find the table|PGRST205|does not exist/i.test(message)) {
        console.warn('[VIT PYQ] Supabase schema is not created yet. Run the SQL migration in the Supabase dashboard, then refresh.', error);
        this.ready = false;
        return false;
      }
      throw error;
    }
  },
  async pull() {
    if (!window.sb) return false;
    try {
      let cachedUsers = [];
      try { cachedUsers = JSON.parse(localStorage.getItem('vitpyq_users') || '[]'); } catch (e) {}
      const user = (await window.sb.auth.getUser()).data.user;
      const [profileResult, paperResult, chatResult, feedbackResult, highlightResult] = await Promise.all([
        window.sb.from('profiles').select('*'),
        window.sb.from('papers').select('id,uploader_id,data,file_path,created_at').order('created_at', { ascending: false }),
        user ? window.sb.from('global_messages').select('id,user_id,data,created_at').order('created_at', { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
        window.sb.from('feedbacks').select('id,user_id,data,created_at').order('created_at', { ascending: false }).limit(100),
        window.sb.from('highlights').select('id,user_id,data,created_at').order('created_at', { ascending: false }).limit(30)
      ]);
    for (const result of [profileResult, paperResult, chatResult, feedbackResult, highlightResult]) {
      if (result.error) throw result.error;
    }
    const profiles = profileResult.data || [];
    const admin = !!user && profiles.some(profile => profile.id === user.id && profile.is_admin);
    let stateQuery = user ? window.sb.from('user_state').select('user_id,payload') : Promise.resolve({ data: [], error: null });
    if (user && !admin) stateQuery = stateQuery.eq('user_id', user.id);
    const privateMessagesQuery = user
      ? window.sb.from('private_messages').select('id,sender_id,recipient_id,data,created_at')
        .or(admin ? 'sender_id.not.is.null' : `sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: true }).limit(1000)
      : Promise.resolve({ data: [], error: null });
    const friendQuery = user ? window.sb.from('friend_requests').select('from_id,to_id,accepted') : Promise.resolve({ data: [], error: null });
    let inventoryQuery = user ? window.sb.from('user_inventory').select('user_id,item_id') : Promise.resolve({ data: [], error: null });
    if (user && !admin) inventoryQuery = inventoryQuery.eq('user_id', user.id);
    const [stateResult, privateMessageResult, friendResult, inventoryResult] = await Promise.all([
      stateQuery,
      privateMessagesQuery,
      friendQuery,
      inventoryQuery
    ]);
    if (stateResult.error) throw stateResult.error;
    if (privateMessageResult.error) throw privateMessageResult.error;
    if (friendResult.error) throw friendResult.error;
    if (inventoryResult.error) throw inventoryResult.error;
    const privateRows = stateResult.data || [];
    const privateById = new Map(privateRows.map(row => [row.user_id, row.payload || {}]));
    const adminProfile = profiles.find(profile => profile.is_admin);
    const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
    state.users = profiles.map(profile => {
      const privateData = privateById.get(profile.id) || {};
      const stored = privateData.user || {};
      const cachedUser = user && profile.id === user.id
        ? cachedUsers.find(item => item.id === user.id || String(item.email || '').toLowerCase() === String(user.email || '').toLowerCase())
        : null;
      const restored = Object.assign({}, cachedUser || {}, stored);
      ['uploadHistory', 'downloadHistory', 'systemNotifs', 'rewardHistory'].forEach(function (key) {
        const serverRows = Array.isArray(stored[key]) ? stored[key] : [];
        const cachedRows = Array.isArray(cachedUser && cachedUser[key]) ? cachedUser[key] : [];
        const rowsById = new Map();
        serverRows.concat(cachedRows).forEach(function (row, index) {
          const rowId = row.id || row.paperId || `${row.ts || 0}_${index}`;
          if (!rowsById.has(rowId)) rowsById.set(rowId, row);
        });
        if (rowsById.size) restored[key] = Array.from(rowsById.values()).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      });
      delete restored.password;
      return Object.assign({}, restored, {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        branch: profile.branch,
        avatar: profile.avatar_url || restored.avatar || '',
        badge: profile.badge,
        isPublic: profile.is_public,
        verified: profile.verified,
        isAdmin: profile.is_admin,
        terminated: profile.terminated,
        vcash: profile.vcash,
        uploads: Math.max(Number(profile.uploads) || 0, Number(stored.uploads) || 0, Number(cachedUser && cachedUser.uploads) || 0),
        downloads: Math.max(Number(profile.downloads) || 0, Number(stored.downloads) || 0, Number(cachedUser && cachedUser.downloads) || 0),
        visits: Math.max(Number(profile.visits) || 0, Number(stored.visits) || 0, Number(cachedUser && cachedUser.visits) || 0),
        friends: stored.friends || [],
        requests: stored.requests || [],
        email: stored.email || (user && profile.id === user.id ? user.email : ''),
        password: ''
      });
    });
    state.users.forEach(profile => {
      profile.items = (inventoryResult.data || []).filter(item => item.user_id === profile.id).map(item => item.item_id);
    });
    const mine = user && state.users.find(profile => profile.id === user.id);
    if (mine) {
      state.user = mine;
      const mineState = privateById.get(user.id) || {};
      state.messages = mineState.messages || [];
      state.privateChats = mineState.privateChats || {};
    }
    state.papers = (paperResult.data || []).map(row => {
      const data = row.data || {};
      const fileUrl = row.file_path
        ? window.sb.storage.from(window.SUPABASE_CONFIG.bucket).getPublicUrl(row.file_path).data.publicUrl
        : '';
      return Object.assign({}, data, { id: row.id, uploaderId: row.uploader_id, fileData: fileUrl, createdAt: data.createdAt || new Date(row.created_at).getTime() });
    });
    state.users.forEach(profile => { profile.friends = []; profile.requests = []; });
    (friendResult.data || []).forEach(link => {
      const from = state.users.find(profile => profile.id === link.from_id);
      const to = state.users.find(profile => profile.id === link.to_id);
      if (link.accepted) {
        if (from && !from.friends.includes(link.to_id)) from.friends.push(link.to_id);
        if (to && !to.friends.includes(link.from_id)) to.friends.push(link.from_id);
      } else if (user && link.to_id === user.id && to && !to.requests.includes(link.from_id)) {
        to.requests.push(link.from_id);
      } else if (user && link.from_id === user.id && to && !to.requests.includes(link.from_id)) {
        to.requests.push(link.from_id);
      }
    });
    state.user = user ? state.users.find(profile => profile.id === user.id) || null : null;
    state.messages = (chatResult.data || []).map(row => Object.assign({}, row.data, { id: row.id, userId: row.user_id }));
    state.privateChats = {};
    (privateMessageResult.data || []).forEach(row => {
      const senderId = adminProfile && row.sender_id === adminProfile.id ? 'admin' : row.sender_id;
      const recipientId = adminProfile && row.recipient_id === adminProfile.id ? 'admin' : row.recipient_id;
      const key = [senderId, recipientId].sort().join('_');
      if (!state.privateChats[key]) state.privateChats[key] = [];
      state.privateChats[key].push(Object.assign({}, row.data, { id: row.id, from: row.sender_id, ts: new Date(row.created_at).getTime() }));
    });
    const feedbacks = (feedbackResult.data || []).map(row => Object.assign({}, row.data, { id: row.id, userId: row.user_id }));
    localStorage.setItem('vitpyq_feedbacks', JSON.stringify(feedbacks));
    const reportsQuery = window.sb.from('reports').select('id,user_id,data,created_at').order('created_at', { ascending: false });
    const reportResult = user
      ? (admin ? await reportsQuery : await reportsQuery.eq('user_id', user.id))
      : { data: [], error: null };
    if (!reportResult.error) localStorage.setItem('vitpyq_reports', JSON.stringify((reportResult.data || []).map(row => Object.assign({}, row.data, { id: row.id, fromId: row.user_id }))));
    localStorage.setItem('vitpyq_highlights', JSON.stringify((highlightResult.data || []).map(row => Object.assign({}, row.data, { id: row.id, userId: row.user_id }))));
    const { data: likedRows, error: likeError } = await window.sb.from('paper_likes').select('paper_id,user_id');
    if (!likeError) {
      const likes = new Map();
      likedRows.forEach(row => likes.set(row.paper_id, [...(likes.get(row.paper_id) || []), row.user_id]));
      state.papers.forEach(paper => {
        paper.likedBy = likes.get(paper.id) || [];
        paper.likes = paper.likedBy.length;
      });
    }
    localStorage.setItem('vitpyq_papers', JSON.stringify(state.papers));
    localStorage.setItem('vitpyq_users', JSON.stringify(state.users));
    localStorage.setItem('vitpyq_chat', JSON.stringify(state.messages));
    localStorage.setItem('vitpyq_pchat', JSON.stringify(state.privateChats));
    if (state.user) localStorage.setItem('vitpyq_uid', state.user.id);
      return true;
    } catch (error) {
      const message = (error && error.message) || String(error || '');
      if (/Could not find the table|PGRST205|does not exist/i.test(message)) {
        console.warn('[VIT PYQ] Supabase schema is not available yet. Please import the SQL migration before using cloud sync.', error);
        return false;
      }
      throw error;
    }
  },
  async push() {
    if (!window.sb || !state.user) return;
    const authUser = (await window.sb.auth.getUser()).data.user;
    if (!authUser || authUser.id !== state.user.id) return;
    const currentUser = state.user;
    let avatarUrl = currentUser.avatar && !currentUser.avatar.startsWith('data:') ? currentUser.avatar : '';
    if (currentUser.avatar && currentUser.avatar.startsWith('data:')) {
      const avatarResponse = await fetch(currentUser.avatar);
      const avatarBlob = await avatarResponse.blob();
      const avatarPath = `avatars/${authUser.id}/profile.${avatarBlob.type === 'image/png' ? 'png' : 'jpg'}`;
      const { error: avatarError } = await window.sb.storage.from(window.SUPABASE_CONFIG.bucket).upload(avatarPath, avatarBlob, { upsert: true, contentType: avatarBlob.type || 'image/jpeg' });
      if (avatarError) throw avatarError;
      avatarUrl = window.sb.storage.from(window.SUPABASE_CONFIG.bucket).getPublicUrl(avatarPath).data.publicUrl;
      currentUser.avatar = avatarUrl;
    }
    const profileRow = {
      id: authUser.id,
      username: currentUser.username || authUser.email.split('@')[0],
      display_name: currentUser.displayName || currentUser.username || 'VIT Student',
      branch: currentUser.branch || 'VIT',
      avatar_url: avatarUrl,
      badge: currentUser.badge || 'bronze',
      is_public: currentUser.isPublic !== false,
      updated_at: new Date().toISOString()
    };
    if (currentUser.isAdmin) {
      const cloudProfiles = state.users.map(profile => ({
        id: profile.id,
        username: profile.username,
        display_name: profile.displayName || profile.username,
        branch: profile.branch || 'VIT',
        avatar_url: profile.avatar && !profile.avatar.startsWith('data:') ? profile.avatar : '',
        badge: profile.badge || 'bronze',
        is_public: profile.isPublic !== false,
        verified: !!profile.verified,
        is_admin: !!profile.isAdmin,
        terminated: !!profile.terminated,
        vcash: profile.vcash || 0,
        uploads: profile.uploads || 0,
        downloads: profile.downloads || 0,
        visits: profile.visits || 0,
        updated_at: new Date().toISOString()
      }));
      const { error: profileError } = await window.sb.from('profiles').upsert(cloudProfiles);
      if (profileError) throw profileError;
    } else {
      const { error: profileError } = await window.sb.from('profiles').upsert(profileRow);
      if (profileError) throw profileError;
    }

    const privateUser = Object.assign({}, currentUser);
    delete privateUser.password;
    delete privateUser.isAdmin;
    delete privateUser.terminated;
    delete privateUser.vcash;
    const privatePayload = {
      user: privateUser,
      messages: state.messages,
      privateChats: state.privateChats
    };
    const privateRows = currentUser.isAdmin
      ? state.users.map(profile => {
        const safeUser = Object.assign({}, profile);
        delete safeUser.password;
        delete safeUser.isAdmin;
        delete safeUser.terminated;
        delete safeUser.vcash;
        return { user_id: profile.id, payload: { user: safeUser }, updated_at: new Date().toISOString() };
      })
      : [{ user_id: authUser.id, payload: privatePayload, updated_at: new Date().toISOString() }];
    const { error: privateError } = await window.sb.from('user_state').upsert(privateRows);
    if (privateError) throw privateError;

    const papers = [];
    for (const paper of state.papers) {
      if (paper.uploaderId !== authUser.id && !currentUser.isAdmin) continue;
      const data = Object.assign({}, paper);
      delete data.fileData;
      delete data.password;
      let filePath = paper.filePath || null;
      if (paper.fileData && paper.fileData.startsWith('data:')) {
        const response = await fetch(paper.fileData);
        const blob = await response.blob();
        const safeName = (paper.fileName || 'paper').replace(/[^a-zA-Z0-9._-]/g, '_');
        filePath = `papers/${authUser.id}/${paper.id}/${safeName}`;
        const { error: storageError } = await window.sb.storage.from(window.SUPABASE_CONFIG.bucket).upload(filePath, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
        if (storageError) throw storageError;
        paper.filePath = filePath;
        data.filePath = filePath;
      }
      papers.push({ id: paper.id, uploader_id: paper.uploaderId, data, file_path: filePath, created_at: new Date(paper.createdAt || Date.now()).toISOString() });
    }
    if (papers.length) {
      const { error } = await window.sb.from('papers').upsert(papers);
      if (error) throw error;
    }
    if (currentUser.isAdmin) {
      const { data: cloudPapers, error: listError } = await window.sb.from('papers').select('id');
      if (listError) throw listError;
      const currentIds = new Set(state.papers.map(paper => paper.id));
      const removedIds = cloudPapers.filter(paper => !currentIds.has(paper.id)).map(paper => paper.id);
      if (removedIds.length) {
        const { error } = await window.sb.from('papers').delete().in('id', removedIds);
        if (error) throw error;
      }
    }
    const ownMessages = state.messages.filter(message => message.userId === authUser.id);
    if (ownMessages.length) {
      const { error } = await window.sb.from('global_messages').upsert(ownMessages.map(message => ({ id: message.id, user_id: authUser.id, data: message, created_at: new Date(message.ts || Date.now()).toISOString() })), { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    const adminId = state.users.find(item => item.isAdmin)?.id;
    const directMessages = [];
    Object.entries(state.privateChats || {}).forEach(([key, messages]) => {
      const otherId = currentUser.isAdmin
        ? key.split('_').find(id => id !== 'admin')
        : key.split('_').find(id => id !== authUser.id);
      const recipientId = otherId === 'admin' ? adminId : otherId;
      if (!recipientId) return;
      messages.filter(message => message.from === authUser.id).forEach(message => {
        directMessages.push({
          id: message.id || `dm_${authUser.id}_${message.ts}`,
          sender_id: authUser.id,
          recipient_id: recipientId,
          data: message,
          created_at: new Date(message.ts || Date.now()).toISOString()
        });
      });
    });
    if (directMessages.length) {
      const { error } = await window.sb.from('private_messages').upsert(directMessages, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    const ownFeedbacks = JSON.parse(localStorage.getItem('vitpyq_feedbacks') || '[]').filter(item => item.userId === authUser.id);
    if (ownFeedbacks.length) {
      const { error } = await window.sb.from('feedbacks').upsert(ownFeedbacks.map(item => ({ id: item.id, user_id: authUser.id, data: item, created_at: new Date(item.ts || Date.now()).toISOString() })), { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    const ownReports = JSON.parse(localStorage.getItem('vitpyq_reports') || '[]').filter(item => item.fromId === authUser.id);
    if (ownReports.length) {
      const { error } = await window.sb.from('reports').upsert(ownReports.map(item => ({ id: item.id, user_id: authUser.id, data: item, status: item.status || 'open', created_at: new Date(item.ts || Date.now()).toISOString() })), { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    if (currentUser.isAdmin) {
      const highlights = JSON.parse(localStorage.getItem('vitpyq_highlights') || '[]');
      if (highlights.length) {
        const { error } = await window.sb.from('highlights').upsert(highlights.map(item => ({ id: item.id, user_id: item.userId, data: item, created_at: new Date(item.ts || Date.now()).toISOString() })));
        if (error) throw error;
      }
    }
  },
  schedulePush() {
    this.pending = this.pending.catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, 250))).then(() => this.push()).then(() => true).catch(error => {
      console.error('[VIT PYQ] Supabase sync failed', error);
      if (document.visibilityState !== 'hidden' && typeof toast === 'function') toast('Cloud save failed: ' + (error.message || 'check your connection'), 'error');
      return false;
    });
    return this.pending;
  },
  startRefresh() {
    if (this.refreshTimer) return;
    const signature = function () {
      return JSON.stringify({
        users: state.users.map(user => [user.id, user.displayName, user.uploads, user.downloads, user.vcash, user.friends && user.friends.length, user.requests && user.requests.length]),
        papers: state.papers.map(paper => paper.id),
        messages: state.messages.map(message => message.id),
        privateChats: Object.entries(state.privateChats || {}).map(([key, messages]) => [key, messages.length, messages.length ? messages[messages.length - 1].id || messages[messages.length - 1].ts : 0])
      });
    };
    const refresh = async () => {
      if (this.refreshBusy || document.visibilityState === 'hidden') return;
      try {
        const { data: { session } } = await window.sb.auth.getSession();
        if (!session) return;
        this.refreshBusy = true;
        const before = signature();
        await this.pull();
        if (before !== signature()) {
          updateUI();
          if (document.getElementById('home')?.classList.contains('active')) renderHomePapers();
          if (document.getElementById('papers')?.classList.contains('active')) renderPapers();
          if (document.getElementById('leaderboard')?.classList.contains('active')) renderLeaderboard();
          if (document.getElementById('chat')?.classList.contains('active')) renderChat();
          if (document.getElementById('personalChatPanel')?.style.display === 'block') {
            renderPcFriends();
            renderPcMessages();
          }
          renderNotifs();
        }
      } catch (error) {
        console.warn('[VIT PYQ] Cross-device refresh failed', error);
      } finally {
        this.refreshBusy = false;
      }
    };
    this.refreshTimer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
  }
};
