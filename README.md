# FireCraft SMP Portal

A GitHub Pages frontend + Firebase Authentication + Cloud Firestore portal for a private Minecraft Lifesteal SMP.

## Features
- IGN + password login (implemented using Firebase Email/Password internally with a synthetic FireCraft address; the password is handled by Firebase Auth, not Firestore)
- Whitelist application form
- Player application status
- Support/complaint tickets
- Staff/admin dashboard
- FireCraft rules
- Responsive dark/fire UI
- No Firebase Storage
- No Cloud Functions
- Works as a static GitHub Pages site

## Important limitation
The website can approve an application in Firestore, but it cannot securely call your Minecraft/Pterodactyl server to automatically add a player to the whitelist without a trusted server-side integration. For now, staff should add approved IGN(s) to the Minecraft whitelist manually.

## Firebase setup
1. Create a Firebase project.
2. Enable Authentication > Sign-in method > Email/Password.
3. Create a Cloud Firestore database.
4. Put your Firebase Web App config in `js/firebase-config.js`.
5. Create your first FireCraft staff account through the website.
6. Open Firebase Console > Authentication > Users and copy that account's UID.
7. Put the UID in BOTH:
   - `js/firebase-config.js` as `ADMIN_UID`
   - `firestore.rules` as `PASTE_ADMIN_UID`
8. Publish `firestore.rules` in Firestore Rules.
9. In `index.html`, replace `YOUR-SERVER-IP:PORT` with your real Minecraft address.
10. Push the folder to GitHub and enable GitHub Pages.

## IGN login design
Firebase's browser SDK uses an email/password provider. To give players an IGN-only interface, the frontend deterministically maps an IGN to an internal address like:
`playername@firecraft.local`
Players never see or enter that internal address.

Do not manually store plaintext passwords in Firestore.

## Security
The Firestore rules are intentionally restrictive. Do not replace them with `allow read, write: if true;`. Firebase's own security documentation warns against open production rules.

## Free-plan fit
This build uses Authentication + Cloud Firestore only. Firestore's current free quota includes 1 GiB stored data, 50,000 document reads/day, 20,000 writes/day and 20,000 deletes/day, subject to Firebase's current quotas. No Storage or Cloud Functions are required for this version.

## Recommended next upgrades
- Staff reply field for tickets
- News/announcements collection
- Player profile / whitelist badge
- Manual whitelist management page
- Server status widget
- Discord link
- Pterodactyl integration through a separate trusted backend if you later choose to add one.

## Updated Admin Panel

The `/admin/` panel now focuses on FireCraft website/community administration:

- Server IP/port settings
- Website announcement settings
- User search and account/profile management
- Application management
- Support ticket management
- Staff management
- Dashboard statistics
- Firestore security rules with the main admin UID

### Main Admin UID
`5yLTkB3FBRUauL0fc09vcLhYj7y2`

### Important Firebase setup
1. Deploy the included `firestore.rules` in Firebase Console.
2. Existing application/ticket composite indexes may still be required because the admin panel uses `orderBy(createdAt)`.
3. User profile deletion from this browser panel deletes the Firestore profile only. It does not delete the Firebase Authentication account.
4. Firebase Authentication passwords are never readable by the admin panel.
5. Additional staff should use the `staff` role. The built-in main admin UID remains the protected admin account.
6. Do not put a Pterodactyl API token or Firebase Admin SDK service-account key in this frontend project.
