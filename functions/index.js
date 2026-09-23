/**
 * VIT PYQ's — Cloud Functions (backend API)
 *
 * - requestPasswordOtp / verifyPasswordOtp  → real email OTP
 * - onPaperCreated (optional hook)          → future notifications
 *
 * Deploy: firebase deploy --only functions
 * Secrets: SMTP_USER, SMTP_PASS (or firebase functions:config:set smtp.user smtp.pass)
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

function transporter() {
  const user = process.env.SMTP_USER || (functions.config().smtp && functions.config().smtp.user);
  const pass = process.env.SMTP_PASS || (functions.config().smtp && functions.config().smtp.pass);
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

function otp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

exports.requestPasswordOtp = functions.https.onCall(async (data) => {
  const email = (data.email || '').trim().toLowerCase();
  if (!email.includes('@')) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid email required');
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch {
    return { ok: true, message: 'If registered, an OTP was sent to your inbox.' };
  }

  const code = otp6();
  await db.collection('otps').doc(email).set({
    otp: code,
    expires: Date.now() + 10 * 60 * 1000,
    uid: userRecord.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const tx = transporter();
  if (tx) {
    const from = process.env.SMTP_USER || functions.config().smtp.user;
    await tx.sendMail({
      from: `"VIT PYQ's" <${from}>`,
      to: email,
      subject: "VIT PYQ's — Password reset OTP",
      text: `Your OTP is ${code}. Valid for 10 minutes.`,
      html: `<div style="font-family:sans-serif;padding:16px">
        <h2>Password reset</h2>
        <p>Your OTP:</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>
        <p style="color:#666">Expires in 10 minutes. Ignore if you did not request this.</p>
      </div>`
    });
  } else {
    console.warn('[OTP] SMTP not set. Code for', email, '=', code);
  }

  return { ok: true, message: 'If registered, an OTP was sent to your inbox.' };
});

exports.verifyPasswordOtp = functions.https.onCall(async (data) => {
  const email = (data.email || '').trim().toLowerCase();
  const otp = String(data.otp || '').trim();
  const newPassword = data.newPassword || '';
  if (!email || !otp || newPassword.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'Email, OTP and password (min 6) required');
  }

  const ref = db.collection('otps').doc(email);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'No OTP found');
  const row = snap.data();
  if (row.otp !== otp) throw new functions.https.HttpsError('permission-denied', 'Invalid OTP');
  if (Date.now() > row.expires) {
    await ref.delete();
    throw new functions.https.HttpsError('deadline-exceeded', 'OTP expired');
  }

  await admin.auth().updateUser(row.uid, { password: newPassword });
  await ref.delete();
  return { ok: true, message: 'Password updated. You can log in.' };
});

/** Example: notify on new paper (extend later with FCM) */
exports.onPaperCreate = functions.firestore
  .document('papers/{paperId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    console.log('New paper', context.params.paperId, data.subject);
    return null;
  });
