import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig } from "/js/firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

function syncOverlayCopy(text, href, clickHandler) {
  const copy = document.querySelector('#fc-mobile-nav [data-origin-id="authNavLink"]');
  if (!copy) return;
  copy.textContent = text;
  copy.href = href;
  copy.onclick = clickHandler;
}

function setNavAuth(user) {
  const link = document.getElementById('authNavLink');
  if (!link) return;

  if (user) {
    let ign = '';
    try { ign = localStorage.getItem('fc_ign') || ''; } catch (_) {}
    const label = ign ? `Logout (${ign})` : 'Logout';

    link.textContent = label;
    link.href = '#';
    const doLogout = (e) => {
      e.preventDefault();
      signOut(auth).then(() => {
        try { localStorage.removeItem('fc_ign'); } catch (_) {}
        window.location.href = '/';
      });
    };
    link.onclick = doLogout;
    syncOverlayCopy(label, '#', doLogout);
  } else {
    link.textContent = 'Login';
    link.href = '/#status';
    link.onclick = null;
    syncOverlayCopy('Login', '/#status', null);
  }
}

onAuthStateChanged(auth, setNavAuth);
