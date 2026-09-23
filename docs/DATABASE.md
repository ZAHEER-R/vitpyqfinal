# Database (Firestore) schema

## Collections

### `users/{uid}`
| Field | Type | Notes |
|-------|------|--------|
| email | string | |
| displayName, username | string | |
| branch | string | |
| avatar | string | URL |
| badge | string | bronze…ruby |
| verified | bool | blue tick |
| vcash | number | |
| uploads, downloads, visits | number | |
| isAdmin | bool | |
| items, activeItems | array | Design Studio |
| friends, requests | array | uids |
| customTitle | string | Instagram-style note |
| systemNotifs | array | optional |

### `papers/{paperId}`
| Field | Type |
|-------|------|
| subject, code, year, semester, category, campus | string |
| uploaderId | string (uid) |
| fileUrl, filePath, fileName | string |
| views, downloads, likes | number |
| likedBy | array of uids |
| createdAt | timestamp |

### `chats/global/messages/{id}`
| userId, username, text, ts, isAdmin, pinned |

### `privateChats/{uidA_uidB}/messages/{id}`
| from, text, ts, isAdmin |

### `highlights/{id}`
| userId, name, message, ts | Admin congrats strip |

### `otps/{email}` (Functions only)
| otp, expires, uid |

## Storage paths
- `papers/{uid}/{timestamp}_name.pdf`
- `avatars/{uid}`

Rules: `firestore.rules`, `storage.rules` in repo root.
