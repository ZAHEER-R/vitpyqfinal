window.FirebaseSync = {
  async pullIfReady() {
    if (!window.fb || !window.fb.ready || !window.FirebaseAPI) return false;
    let pulled = false;
    try {
      const papers = await window.FirebaseAPI.loadCollection("papers");
      if (Array.isArray(papers) && papers.length) {
        localStorage.setItem("vitpyq_papers", JSON.stringify(papers));
      }
      pulled = true;
    } catch (e) {
      console.warn("[VIT PYQ] Papers sync pull failed", e);
    }
    if (window.fb.auth && window.fb.auth.currentUser) {
      try {
        const users = await window.FirebaseAPI.loadCollection("users");
        if (Array.isArray(users) && users.length) {
          const localUsers = JSON.parse(localStorage.getItem("vitpyq_users") || "[]");
          const localUsersById = new Map(localUsers.map(function (user) { return [user.id, user]; }));
          const safeUsers = users.map(function (user) {
            const safeUser = Object.assign({}, user);
            delete safeUser.password;
            const localUser = localUsersById.get(safeUser.id);
            if (localUser && localUser.password) safeUser.password = localUser.password;
            return safeUser;
          });
          localStorage.setItem("vitpyq_users", JSON.stringify(safeUsers));
        }
        pulled = true;
      } catch (e) {
        console.warn("[VIT PYQ] Users sync pull failed", e);
      }
    }
    return pulled;
  },

  async pushIfReady(stateLike) {
    if (!window.fb || !window.fb.ready || !window.FirebaseAPI || !window.fb.auth || !window.fb.auth.currentUser) return;
    try {
      if (stateLike.papers) await window.FirebaseAPI.saveCollection("papers", stateLike.papers);
      if (stateLike.users) {
        const safeUsers = stateLike.users.map(function (user) {
          const safeUser = Object.assign({}, user);
          delete safeUser.password;
          return safeUser;
        });
        await window.FirebaseAPI.saveCollection("users", safeUsers);
      }
    } catch (e) {
      console.warn("[VIT PYQ] Sync push failed", e);
    }
  }
};
