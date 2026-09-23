/**
 * ============================================================
 *  VIT PYQ's — REPLACE THESE KEYS (Firebase Console → Project settings → Web app)
 * ============================================================
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBdpHU4HUWms83hHI0PPtnK_vdve4zKX9Q",
  authDomain: "vitpyq-s.firebaseapp.com",
  projectId: "vitpyq-s",
  storageBucket: "vitpyq-s.firebasestorage.app",
  messagingSenderId: "414027477638",
  appId: "1:414027477638:web:1d7cf07eb06b454f715707",
  measurementId: "G-9PJWN73MBB"
};

/** Supabase Storage: create a public bucket named "papers" and paste these values. */
window.SUPABASE_CONFIG = {
  url: "https://oajgwhsxjnoqvnnmihgs.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hamd3aHN4am5vcXZubm1paGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDc1NTIsImV4cCI6MjEwNTcyMzU1Mn0.gV7bYiiWpYkiKxbEyX6VAj9RSnkuHpQm146H8EaK3Ig",
  bucket: "papers",
  avatarBucket: "avatars"
};

/** Google OAuth: only these domains */
window.VIT_OAUTH_DOMAINS = ["vitstudent.ac.in"];

/** Email/password registration: only these domains (NOT vitstudent) */
window.PASSWORD_SIGNUP_DOMAINS = ["gmail.com", "googlemail.com"];

/** Set true after keys are filled to force Firebase mode */
window.FORCE_FIREBASE = false;
