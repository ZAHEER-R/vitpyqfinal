/**
 * Firebase Auth + Firestore + Storage bridge for VIT PYQ's
 * Loads only when FIREBASE_CONFIG is filled in (not placeholder).
 */
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  window.VITPYQ_BACKEND = 'local'; // 'local' | 'firebase'

  if (!cfg.apiKey || cfg.apiKey === 'YOUR_API_KEY') {
    console.info('[VITPYQ] Firebase not configured — using localStorage demo mode.');
    return;
  }

  window.VITPYQ_BACKEND = 'firebase';

  // Expect Firebase modular SDK loaded via CDN in index.html
  // This file exposes helpers used by app.js when backend === 'firebase'
})();

/**
 * Auth rules used by both demo and Firebase modes:
 * - Google OAuth: ONLY @vitstudent.ac.in
 * - Email/password register: ONLY gmail.com (not @vitstudent.ac.in)
 * - Login with password: any previously registered email
 */
window.vitAuthRules = {
  isVitStudentEmail(email) {
    const d = (email || '').split('@')[1]?.toLowerCase() || '';
    return (window.VIT_OAUTH_DOMAINS || ['vitstudent.ac.in']).includes(d);
  },
  canPasswordRegister(email) {
    const d = (email || '').split('@')[1]?.toLowerCase() || '';
    // Block VIT student domain on password signup — they must use Google
    if (this.isVitStudentEmail(email)) return false;
    const allowed = window.PASSWORD_SIGNUP_DOMAINS || ['gmail.com', 'googlemail.com'];
    return allowed.includes(d);
  },
  canGoogleSignIn(email) {
    return this.isVitStudentEmail(email);
  }
};
