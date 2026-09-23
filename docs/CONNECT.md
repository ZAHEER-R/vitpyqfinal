# Connecting the frontend to Firebase

## Automatic mode switch

| Condition | Mode |
|-----------|------|
| `firebase-config.js` still has `YOUR_API_KEY` | `local` (localStorage demo) |
| Real keys present | `firebase` — `window.VitApi` available |

Check in browser console:

```js
VITPYQ_BACKEND  // 'local' | 'firebase'
VitApi          // object or null
```

## Minimal integration steps (in app.js)

When you are ready to move fully off localStorage:

1. On load:
   ```js
   if (window.VitApi) {
     VitApi.onAuth(async (user) => {
       if (!user) { /* show logged out */ return; }
       const profile = await VitApi.getUser(user.uid);
       /* set state.user from profile */
     });
     VitApi.listenPapers(papers => { /* state.papers = papers; render */ });
     VitApi.listenUsers(users => { /* state.users = users */ });
   }
   ```

2. Replace Google button:
   ```js
   await VitApi.signInWithGoogle();
   ```

3. Replace register:
   ```js
   await VitApi.registerEmail(email, password, { displayName, username, branch, firstName, lastName });
   ```

4. Upload paper:
   ```js
   const { url, path } = await VitApi.uploadPaperFile(uid, file);
   await VitApi.createPaper({ subject, code, year, semester, category, campus, fileUrl: url, filePath: path, uploaderId: uid });
   ```

5. Forgot password:
   ```js
   await VitApi.requestPasswordOtp(email);
   await VitApi.verifyPasswordOtp(email, otp, newPassword);
   ```

6. Notifications: store in `users/{uid}.systemNotifs` or use FCM later; heart UI already reads system notifs + friend requests + last messages in demo mode — map the same fields from Firestore.

## Deploy reminder

Keys stay in `public/firebase-config.js` for this static hosting model.  
For stricter security later, use Firebase **App Check** and restrict API keys by HTTP referrer in Google Cloud Console.
