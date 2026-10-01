window.SupabaseSync = {
  ready: false,
  loading: true,
  pending: Promise.resolve(),
  refreshTimer: null,
  privateRefreshTimer: null,
  privateMessageChannel: null,
  privateMessageUserId: null,
  refreshBusy: false,
  isRecoveryRedirect() {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (query.get('type') === 'recovery' || hash.get('type') === 'recovery') return true;
    if (!query.has('code')) return false;
    try {
      const pending = JSON.parse(localStorage.getItem('vitpyq_pending_password_recovery') || 'null');
      return !!pending?.requestedAt && Date.now() - pending.requestedAt < 60 * 60 * 1000;
    } catch (error) {
      return false;
    }
  },
  async initialize() {
    if (!window.sb) { this.loading = false; return false; }
    this.loading = true;
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      const recoveryLink = this.isRecoveryRedirect();
      this.ready = true;
      if (!recoveryLink) {
        await this.pull();
        this.startRefresh();
      }
      this.loading = false;
      return true;
    } catch (error) {
      const message = (error && error.message) || String(error || '');
      if (/Could not find the table|PGRST205|does not exist/i.test(message)) {
        console.warn('[VIT PYQ] Supabase schema is not created yet. Run the SQL migration in the Supabase dashboard, then refresh.', error);
        this.ready = false;
        this.loading = false;
        return false;
      }
      this.loading = false;
      throw error;
    }
  },
  async pull() {
    if (!window.sb) return false;
    try {
      let cachedUsers = [];
      try { cachedUsers = JSON.parse(localStorage.getItem('vitpyq_users') || '[]'); } catch (e) {}
      const user = (await window.sb.auth.getUser()).data.user;
      const [profileResult, paperResult, chatResult, feedbackResult, highlightResult, paperEventsResult] = await Promise.all([
        window.sb.from('profiles').select('*'),
        window.sb.from('papers').select('id,uploader_id,data,file_path,created_at').order('created_at', { ascending: false }),
        user ? window.sb.from('global_messages').select('id,user_id,data,created_at').order('created_at', { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
        window.sb.from('feedbacks').select('id,user_id,data,created_at').order('created_at', { ascending: false }).limit(100),
        window.sb.from('highlights').select('id,user_id,data,created_at').order('created_at', { ascending: false }).limit(30),
        user ? window.sb.from('paper_events').select('id,paper_id,event_type,created_at').eq('user_id', user.id).eq('event_type', 'download').order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null })
      ]);
      const paperEventsMissing = paperEventsResult.error && /PGRST205|Could not find the table|does not exist/i.test(paperEventsResult.error.message || '');
      if (paperEventsMissing) console.warn('[VIT PYQ] Download event table is missing; using saved profile history instead.');
      const paperEventsForHistory = paperEventsMissing ? { data: [], error: null } : paperEventsResult;
      let timetableResult = user
        ? await window.sb.from('user_timetables').select('id,timetable_name,payload,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1)
        : { data: [], error: null };
      if (timetableResult.error && /PGRST205|Could not find the table|does not exist/i.test(timetableResult.error.message || '')) {
        console.warn('[VIT PYQ] Timetable table is not installed yet; keeping timetable data in the user profile.');
        timetableResult = { data: [], error: null };
      }
      let announcementResult = await window.sb.from('announcements').select('id,title,body,created_at,active').eq('active', true).order('created_at', { ascending: false }).limit(20);
      if (announcementResult.error && /PGRST205|Could not find the table|does not exist/i.test(announcementResult.error.message || '')) {
        console.warn('[VIT PYQ] Announcements table is not installed yet; skipping announcements.');
        announcementResult = { data: [], error: null };
      }
    const notificationResult = user
      ? await window.sb.from('user_notifications').select('id,actor_id,kind,text,data,created_at,read_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100)
      : { data: [], error: null };
    for (const result of [profileResult, paperResult, chatResult, feedbackResult, highlightResult, paperEventsForHistory, notificationResult, announcementResult, timetableResult]) {
      if (result.error) throw result.error;
    }
    const profiles = profileResult.data || [];
    const admin = !!user && profiles.some(profile => profile.id === user.id && profile.is_admin);
    let stateQuery = user ? window.sb.from('user_state').select('user_id,payload') : Promise.resolve({ data: [], error: null });
    if (user && !admin) stateQuery = stateQuery.eq('user_id', user.id);
    const privateMessagesQuery = user
      ? window.sb.from('private_messages').select('id,sender_id,recipient_id,data,created_at,read_at')
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
        campus: profile.campus || restored.campus || '',
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
      const inventoryItems = (inventoryResult.data || []).filter(item => item.user_id === profile.id).map(item => item.item_id);
      const savedItems = Array.isArray(profile.items) ? profile.items : [];
      const equippedBadge = profile.badge && profile.badge !== 'bronze' ? [`badge_${profile.badge}`] : [];
      profile.items = [...new Set(['badge_bronze', ...savedItems, ...inventoryItems, ...equippedBadge])];
    });
    const mine = user && state.users.find(profile => profile.id === user.id);
    if (mine) {
      state.user = mine;
      const mineState = privateById.get(user.id) || {};
      state.messages = mineState.messages || [];
      state.privateChats = mineState.privateChats || {};
    }
    const resources = (paperResult.data || []).map(row => {
      const data = row.data || {};
      const fileUrl = row.file_path
        ? window.sb.storage.from(window.SUPABASE_CONFIG.bucket).getPublicUrl(row.file_path).data.publicUrl
        : '';
      return Object.assign({}, data, { id: row.id, uploaderId: row.uploader_id, fileData: fileUrl, createdAt: data.createdAt || new Date(row.created_at).getTime() });
    });
    state.notes = resources.filter(resource => resource.resourceType === 'note');
    state.papers = resources.filter(resource => resource.resourceType !== 'note');
    const profileIds = new Set(state.users.map(profile => profile.id));
    state.users.forEach(profile => {
      profile.friends = (Array.isArray(profile.friends) ? profile.friends : []).filter(id => profileIds.has(id));
      profile.requests = (Array.isArray(profile.requests) ? profile.requests : []).filter(id => profileIds.has(id));
    });
    if (user) {
      const currentProfile = state.users.find(profile => profile.id === user.id);
      if (currentProfile) currentProfile.requests = [];
      state.users.forEach(profile => {
        profile.requests = (profile.requests || []).filter(requesterId => requesterId !== user.id);
      });
    }
    (friendResult.data || []).forEach(link => {
      const from = state.users.find(profile => profile.id === link.from_id);
      const to = state.users.find(profile => profile.id === link.to_id);
      if (link.accepted) {
        if (from && !from.friends.includes(link.to_id)) from.friends.push(link.to_id);
        if (to && !to.friends.includes(link.from_id)) to.friends.push(link.from_id);
        if (to) to.requests = (to.requests || []).filter(id => id !== link.from_id);
      } else if (user && link.to_id === user.id && to && !to.requests.includes(link.from_id)) {
        to.requests.push(link.from_id);
      } else if (user && link.from_id === user.id && to && !to.requests.includes(link.from_id)) {
        to.requests.push(link.from_id);
      }
    });
    state.user = user ? state.users.find(profile => profile.id === user.id) || null : null;
    const timetableRow = (timetableResult.data || [])[0];
    if (state.user && timetableRow) {
      const timetablePayload = timetableRow.payload || {};
      state.user.timetableId = timetableRow.id;
      state.user.timetableName = timetableRow.timetable_name;
      state.user.timetableCourses = Array.isArray(timetablePayload.courses) ? timetablePayload.courses : [];
      state.user.timetableEntries = Array.isArray(timetablePayload.entries) ? timetablePayload.entries : [];
    }
    if (state.user) {
      const ownResources = [...state.papers, ...state.notes].filter(resource => resource.uploaderId === state.user.id);
      const uploadedIds = new Set(ownResources.map(resource => resource.id));
      const savedUploads = Array.isArray(state.user.uploadHistory) ? state.user.uploadHistory : [];
      const resourceUploads = ownResources.map(resource => ({
        paperId: resource.id,
        name: resource.subject || resource.code || 'Shared resource',
        fileName: resource.fileName || resource.code || '',
        resourceType: resource.resourceType === 'note' ? 'note' : 'paper',
        ts: resource.createdAt || 0
      }));
      state.user.uploadHistory = resourceUploads.concat(savedUploads.filter(item => !uploadedIds.has(item.paperId)))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));

      const downloadEvents = paperEventsForHistory.data || [];
      const downloadedIds = new Set(downloadEvents.map(item => item.paper_id));
      const savedDownloads = Array.isArray(state.user.downloadHistory) ? state.user.downloadHistory : [];
      const resourceById = new Map([...state.papers, ...state.notes].map(resource => [resource.id, resource]));
      const eventDownloads = downloadEvents.map(item => {
        const resource = resourceById.get(item.paper_id);
        return {
          id: item.id,
          paperId: item.paper_id,
          name: resource?.subject || resource?.code || 'Downloaded resource',
          fileName: resource?.fileName || resource?.code || '',
          ts: new Date(item.created_at).getTime()
        };
      });
      state.user.downloadHistory = eventDownloads.concat(savedDownloads.filter(item => !downloadedIds.has(item.paperId)))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const userProfile = state.users.find(profile => profile.id === state.user.id);
      if (userProfile) {
        userProfile.uploadHistory = state.user.uploadHistory;
        userProfile.downloadHistory = state.user.downloadHistory;
      }
    }
    state.announcements = (announcementResult.data || []).map(row => ({ id: row.id, title: row.title, body: row.body, createdAt: new Date(row.created_at).getTime() }));
    const globalChatClearedAt = Number(state.user && state.user.globalChatClearedAt) || 0;
    state.messages = (chatResult.data || [])
      .map(row => Object.assign({}, row.data, { id: row.id, userId: row.user_id }))
      .filter(message => message.isAdmin || message.pinned || !globalChatClearedAt || (Number(message.ts) || 0) > globalChatClearedAt);
    state.privateChats = {};
    (privateMessageResult.data || []).forEach(row => {
      const senderId = adminProfile && row.sender_id === adminProfile.id ? 'admin' : row.sender_id;
      const recipientId = adminProfile && row.recipient_id === adminProfile.id ? 'admin' : row.recipient_id;
      const key = [senderId, recipientId].sort().join('_');
      if (!state.privateChats[key]) state.privateChats[key] = [];
      state.privateChats[key].push(Object.assign({}, row.data, {
        id: row.id,
        from: row.sender_id,
        ts: new Date(row.created_at).getTime(),
        read: !!row.read_at
      }));
    });
    const clearedChats = state.user && state.user.privateChatClearedAt || {};
    Object.keys(state.privateChats).forEach(key => {
      const clearedAt = Number(clearedChats[key]) || 0;
      if (clearedAt) state.privateChats[key] = state.privateChats[key].filter(message => (Number(message.ts) || 0) > clearedAt);
    });
    if (state.user) {
      const storedNotifications = state.user.systemNotifs || [];
      const cloudNotifications = (notificationResult.data || []).map(row => ({
        id: row.id,
        type: row.kind || 'info',
        text: row.text,
        data: row.data || {},
        actorId: row.actor_id,
        ts: new Date(row.created_at).getTime(),
        read: !!row.read_at,
        fromAdmin: row.kind === 'admin' || row.kind === 'reward' || row.kind === 'bonus' || row.kind === 'congrats',
        pinned: row.kind === 'admin' || row.kind === 'reward' || row.kind === 'bonus' || row.kind === 'congrats'
      }));
      const byId = new Map([...storedNotifications, ...cloudNotifications].map(notification => [notification.id, notification]));
      const seenEvents = new Set();
      state.user.systemNotifs = Array.from(byId.values()).sort((a, b) => (b.ts || 0) - (a.ts || 0)).filter(notification => {
        const actorId = notification.actorId || notification.data?.actorId || notification.data?.friendId || '';
        let eventKey = notification.id;
        if (notification.type === 'friend' && /accepted your friend request/i.test(notification.text || '')) {
          eventKey = `friend-accept:${actorId}:${notification.text}:${Math.floor((notification.ts || 0) / 86400000)}`;
        } else if (notification.type === 'chat') {
          const messageId = notification.data?.messageId;
          eventKey = messageId ? `chat:${messageId}` : `chat:${actorId}:${notification.text}:${Math.floor((notification.ts || 0) / 30000)}`;
        }
        if (seenEvents.has(eventKey)) return false;
        seenEvents.add(eventKey);
        return true;
      }).slice(0, 100);
    }
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
      [...state.papers, ...(state.notes || [])].forEach(paper => {
        paper.likedBy = likes.get(paper.id) || [];
        paper.likes = paper.likedBy.length;
      });
    }
    if (user && state.user) {
      const bookmarkResult = await window.sb.from('resource_bookmarks').select('resource_id').eq('user_id', user.id);
      if (bookmarkResult.error && !/PGRST205|PGRST202|Could not find the table|does not exist/i.test(bookmarkResult.error.message || '')) throw bookmarkResult.error;
      if (!bookmarkResult.error) state.user.bookmarks = (bookmarkResult.data || []).map(row => row.resource_id);
    }
    localStorage.setItem('vitpyq_papers', JSON.stringify(state.papers));
    localStorage.setItem('vitpyq_notes', JSON.stringify(state.notes));
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
      campus: currentUser.campus || null,
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
        campus: profile.campus || null,
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

    if (!currentUser.isAdmin) {
      const { error: timetableError } = await window.sb.from('user_timetables').upsert({
        id: currentUser.timetableId || authUser.id,
        user_id: authUser.id,
        timetable_name: currentUser.timetableName || 'My VIT timetable',
        payload: {
          courses: currentUser.timetableCourses || [],
          entries: currentUser.timetableEntries || []
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (timetableError && !/PGRST205|Could not find the table|does not exist/i.test(timetableError.message || '')) throw timetableError;
    }

    const ownedPapers = [...state.papers, ...(state.notes || [])].filter(paper => paper.uploaderId === authUser.id || currentUser.isAdmin);
    const papers = await Promise.all(ownedPapers.map(async paper => {
      const data = Object.assign({}, paper);
      delete data.fileData;
      delete data.password;
      let filePath = paper.filePath || null;
      if (paper.fileData && paper.fileData.startsWith('data:') && !filePath) {
        const response = await fetch(paper.fileData);
        const blob = await response.blob();
        const safeName = (paper.fileName || 'paper').replace(/[^a-zA-Z0-9._-]/g, '_');
        filePath = `papers/${authUser.id}/${paper.id}/${safeName}`;
        const { error: storageError } = await window.sb.storage.from(window.SUPABASE_CONFIG.bucket).upload(filePath, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
        if (storageError) throw storageError;
      }
      if (filePath) {
        paper.filePath = filePath;
        paper.fileData = window.sb.storage.from(window.SUPABASE_CONFIG.bucket).getPublicUrl(filePath).data.publicUrl;
        data.filePath = filePath;
      }
      return { id: paper.id, uploader_id: paper.uploaderId, data, file_path: filePath, created_at: new Date(paper.createdAt || Date.now()).toISOString() };
    }));
    if (papers.length) {
      const { error } = await window.sb.from('papers').upsert(papers);
      if (error) throw error;
    }
    if (currentUser.isAdmin) {
      const { data: cloudPapers, error: listError } = await window.sb.from('papers').select('id');
      if (listError) throw listError;
      const currentIds = new Set([...state.papers, ...(state.notes || [])].map(paper => paper.id));
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
  mergePrivateMessageRow(row) {
    if (!row || !state.user) return;
    const adminProfile = state.users.find(user => user.isAdmin);
    const sender = adminProfile && row.sender_id === adminProfile.id ? 'admin' : row.sender_id;
    const recipient = adminProfile && row.recipient_id === adminProfile.id ? 'admin' : row.recipient_id;
    const key = typeof chatKey === 'function' ? chatKey(sender, recipient) : [sender, recipient].sort().join('_');
    state.privateChats = state.privateChats || {};
    const messages = state.privateChats[key] || (state.privateChats[key] = []);
    const message = Object.assign({}, row.data || {}, {
      id: row.id,
      from: row.sender_id,
      ts: new Date(row.created_at).getTime(),
      read: !!row.read_at
    });
    const existing = messages.findIndex(item => item.id === row.id);
    let changed = false;
    if (existing >= 0) {
      const previous = messages[existing];
      changed = previous.read !== message.read || previous.text !== message.text || previous.ts !== message.ts;
      if (changed) messages[existing] = Object.assign({}, previous, message);
    } else {
      messages.push(message);
      changed = true;
    }
    if (!changed) return;
    messages.sort((first, second) => (first.ts || 0) - (second.ts || 0));
    if (document.getElementById('personalChatPanel')?.style.display === 'block') {
      renderPcFriends();
      renderPcMessages();
    }
    renderNotifs();
    updateNotifDot();
    const activePeer = state.activeFriendId === 'admin' ? adminProfile?.id : state.activeFriendId;
    if (row.recipient_id === state.user.id && row.sender_id === activePeer && typeof markPrivateThreadRead === 'function') {
      markPrivateThreadRead(state.activeFriendId);
    }
  },
  async refreshPrivateMessages() {
    if (!window.sb || !state.user) return;
    try {
      const userId = state.user.id;
      const { data, error } = await window.sb.from('private_messages')
        .select('id,sender_id,recipient_id,data,created_at,read_at')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('created_at', { ascending: true }).limit(1000);
      if (error) throw error;
      (data || []).forEach(row => this.mergePrivateMessageRow(row));
    } catch (error) {
      console.warn('[VIT PYQ] Private message refresh failed', error);
    }
  },
  async startPrivateMessageRealtime() {
    if (!window.sb || !state.user) return;
    const userId = state.user.id;
    if (this.privateMessageChannel && this.privateMessageUserId === userId) return;
    if (this.privateMessageChannel) {
      await window.sb.removeChannel(this.privateMessageChannel);
      this.privateMessageChannel = null;
    }
    this.privateMessageChannel = window.sb.channel(`vitpyq-private-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_messages', filter: `recipient_id=eq.${userId}` }, payload => {
        if (payload.eventType === 'DELETE') {
          Object.values(state.privateChats || {}).forEach(messages => {
            const index = messages.findIndex(message => message.id === payload.old.id);
            if (index >= 0) messages.splice(index, 1);
          });
          renderPcMessages(); updateNotifDot();
        } else this.mergePrivateMessageRow(payload.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_messages', filter: `sender_id=eq.${userId}` }, payload => {
        if (payload.eventType === 'DELETE') {
          Object.values(state.privateChats || {}).forEach(messages => {
            const index = messages.findIndex(message => message.id === payload.old.id);
            if (index >= 0) messages.splice(index, 1);
          });
          renderPcMessages();
        } else this.mergePrivateMessageRow(payload.new);
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('[VIT PYQ] Private message realtime unavailable; using refresh fallback.');
      });
    this.privateMessageUserId = userId;
    if (!this.privateRefreshTimer) this.privateRefreshTimer = setInterval(() => this.refreshPrivateMessages(), 5000);
    this.refreshPrivateMessages();
  },
  startRefresh() {
    if (this.refreshTimer) { this.startPrivateMessageRealtime(); return; }
    const signature = function () {
      return JSON.stringify({
        users: state.users.map(user => [user.id, user.displayName, user.uploads, user.downloads, user.vcash, user.friends && user.friends.length, user.requests && user.requests.length]),
        announcements: (state.announcements || []).map(item => item.id),
        highlights: JSON.parse(localStorage.getItem('vitpyq_highlights') || '[]').map(item => item.id),
        papers: state.papers.map(paper => paper.id),
        notes: (state.notes || []).map(note => note.id),
        notifications: state.user && (state.user.systemNotifs || []).map(notification => [notification.id, !!notification.read]),
        messages: state.messages.map(message => message.id),
        privateChats: Object.entries(state.privateChats || {}).map(([key, messages]) => [key, messages.map(message => [message.id || message.ts, !!message.read])])
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
        this.startPrivateMessageRealtime();
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
          renderAnnouncements();
          updateNotifDot();
        }
      } catch (error) {
        console.warn('[VIT PYQ] Cross-device refresh failed', error);
      } finally {
        this.refreshBusy = false;
      }
    };
    this.refreshTimer = setInterval(refresh, 15000);
    this.startPrivateMessageRealtime();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
  }
};
