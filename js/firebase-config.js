// Paste the Firebase Web App config from Firebase Console here.
// Do NOT paste a service-account private key here.
<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyAXj6vu9Yshfh29ME2Eqv9WfXmSl1haSzU",
    authDomain: "firecraft-smp-portal.firebaseapp.com",
    projectId: "firecraft-smp-portal",
    storageBucket: "firecraft-smp-portal.firebasestorage.app",
    messagingSenderId: "760715239896",
    appId: "1:760715239896:web:8192a7ac86e645a97492ad"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
</script>

// After creating your first staff account, paste its Firebase Auth UID here.
// This UID is used by the client for UI only; Firestore Rules must also contain it.
export const ADMIN_UID = "PASTE_ADMIN_UID";
