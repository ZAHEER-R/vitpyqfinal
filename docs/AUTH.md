# Authentication policy

## Google OAuth
- Enabled in Firebase Auth → Google.
- App checks email domain ∈ `VIT_OAUTH_DOMAINS` (default `vitstudent.ac.in`).
- Non-matching users are signed out immediately (`VitApi.signInWithGoogle`).

## Email / password
- **Register:** only domains in `PASSWORD_SIGNUP_DOMAINS` (gmail.com).
- `@vitstudent.ac.in` **cannot** register with password.
- **Login:** any existing Auth user with password.

## Admin
- Not via Auth custom claims by default.
- Set Firestore `users/{uid}.isAdmin = true`.

## Password reset OTP
1. Client calls `VitApi.requestPasswordOtp(email)`.
2. Function writes `otps/{email}` and sends mail (SMTP).
3. Client calls `VitApi.verifyPasswordOtp(email, otp, newPassword)`.
4. Admin SDK updates password.
