(function () {
  const config = window.SUPABASE_CONFIG;
  if (!config || !window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[VIT PYQ] Supabase SDK/config unavailable.');
    return;
  }
  window.sb = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });
  window.SupabaseAPI = {
    async register(email, password, metadata) {
      const { data, error } = await window.sb.auth.signUp({
        email,
        password,
        options: { data: metadata, emailRedirectTo: config.redirectUrl }
      });
      if (error) throw error;
      return data;
    },
    async login(email, password) {
      const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async loginWithGoogle() {
      const { data, error } = await window.sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: config.redirectUrl,
          queryParams: { hd: config.vitEmailDomain, prompt: 'select_account' }
        }
      });
      if (error) throw error;
      return data;
    },
    async logout() {
      const { error } = await window.sb.auth.signOut();
      if (error) throw error;
    }
  };
})();
