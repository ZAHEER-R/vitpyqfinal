# Data model

## Client (always)
| Key | Purpose |
|-----|---------|
| `vitpyq_users` | User profiles, balances, friends, history |
| `vitpyq_papers` | Question papers metadata + file data/URL |
| `vitpyq_chat` | Global chat messages |
| `vitpyq_pchat` | Private / support chats |
| `vitpyq_feedbacks` | Student feedback |
| `vitpyq_reports` | Paper reports |
| `vitpyq_highlights` | Legendary highlights |
| `vitpyq_uid` | Current session user id |

## Firestore (when Firebase is on)
| Collection | Purpose |
|------------|---------|
| `users/{id}` | User profile documents |
| `mirrors/papers` | Mirror of papers array |
| `mirrors/users` | Mirror of users array |
| `feedbacks` | Optional cloud feedback |
| `reports` | Optional cloud reports |

## Storage paths
- `papers/{paperId}/{filename}`
- `avatars/{userId}/profile.jpg`

Rules files: `firestore.rules`, `storage.rules`
