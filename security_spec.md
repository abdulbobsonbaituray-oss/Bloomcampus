# BloomCampus Firestore Security Specification

## 1. Data Invariants
1. Every private user document at `/bloomcampus_users/{userId}` MUST belong strictly to Firebase Auth UID `userId` (`uid == request.auth.uid`), with `email_verified == true`, and MUST NOT contain plaintext `password`.
2. Regular clients CANNOT list `/bloomcampus_users`, CANNOT read/write any other user's document, and CANNOT escalate their own `role` to `'admin'`, set `isVip = true`, or bypass subscription checks.
3. All user-scoped sub-resources (`/bloomcampus_appointments`, `/bloomcampus_skincare_logs`, `/bloomcampus_inquiries`, `/bloomcampus_entries`) MUST carry `userId == request.auth.uid` on creation and immutable `userId` on updates; `get`/`list` are strictly restricted to `resource.data.userId == request.auth.uid || isAdmin()`.
4. Admin configuration (`/bloomcampus_config`) and admin roles (`/admins`) are readable and writable ONLY by verified Admins (`abdulbobsonbaituray@gmail.com` or UIDs in `/admins/{uid}`).
5. Community comments (`/bloomcampus_comments`) contain NO PII (no email/phone) and require verified authentication, matching `userId == request.auth.uid` on creation and ownership/admin on update/delete.

## 2. Red Team Dirty-Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated `get` on `/bloomcampus_users/{anyUid}` -> DENIED.
2. Authenticated client A `get` on `/bloomcampus_users/{clientB_uid}` -> DENIED.
3. Authenticated client A `list` on `/bloomcampus_users` -> DENIED.
4. Client A creating `/bloomcampus_users/{clientA_uid}` with `"role": "admin"` -> DENIED.
5. Client A creating `/bloomcampus_users/{clientA_uid}` with `"isVip": true` -> DENIED.
6. Client A creating `/bloomcampus_users/{clientA_uid}` with plaintext `"password": "secret"` -> DENIED.
7. Client A updating `/bloomcampus_users/{clientA_uid}` to change `"uid"` or `"role": "admin"` -> DENIED.
8. Client A updating `/bloomcampus_users/{clientA_uid}` with an unverified email (`email_verified: false`) -> DENIED.
9. Client A creating `/bloomcampus_appointments/appt-1` with `"userId": "{clientB_uid}"` -> DENIED.
10. Client A listing `/bloomcampus_inquiries` without `where('userId', '==', clientA_uid)` -> DENIED.
11. Client A reading `/bloomcampus_config/main` -> DENIED.
12. Client A injecting an oversized 1MB `name` or `commentText` or invalid doc ID `../hack` -> DENIED.
