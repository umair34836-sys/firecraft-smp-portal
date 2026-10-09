import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, orderBy, onSnapshot, updateDoc, serverTimestamp, runTransaction,
  getDocs, limit,} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

/* ── EmailJS Admin Notifications ─────────────────────────────────── */
const EJS_PUBLIC_KEY      = '325XI1qvpgynRSErT';
const EJS_SERVICE_ID      = 'service_cacpon8';
const EJS_TPL_APPLICATION = 'template_tzgqo7a';
const EJS_TPL_TICKET      = 'REPLACE_TEMPLATE_TICKET';

(function initEJS() {
  if (window.emailjs && !EJS_PUBLIC_KEY.startsWith('REPLACE')) {
    window.emailjs.init({ publicKey: EJS_PUBLIC_KEY });
  }
})();

function adminMail(templateId, params) {
  if (!window.emailjs || EJS_SERVICE_ID.startsWith('REPLACE')) return;
  window.emailjs.send(EJS_SERVICE_ID, templateId, params).catch(() => {});
}
/* ─────────────────────────────────────────────────────────────────── */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function loadFireCraftPublicSettings() {
  try {
    const serverSnap = await getDoc(doc(db, "settings", "server"));
    if (serverSnap.exists()) {
      const s = serverSnap.data();
      const ipCandidates = document.querySelectorAll("[data-server-java-ip]");
      const resolvedIp = `${s.javaIp || "play.firecraft.fun"}${s.javaPort ? ":" + s.javaPort : ":20011"}`;
      ipCandidates.forEach(el => el.textContent = resolvedIp);
      document.querySelectorAll(".copy-btn[data-copy]").forEach(btn => { if (btn.dataset.copy && btn.dataset.copy.includes("firecraft")) btn.dataset.copy = resolvedIp; });
      document.querySelectorAll("[data-server-name]").forEach(el => el.textContent = s.name || "FireCraft SMP");
      document.querySelectorAll("[data-server-message]").forEach(el => el.textContent = s.message || "");
      document.querySelectorAll("[data-server-bedrock-ip]").forEach(el => el.textContent = `${s.bedrockIp || ""}${s.bedrockPort ? ":" + s.bedrockPort : ""}`);
    }
    const webSnap = await getDoc(doc(db, "settings", "website"));
    if (webSnap.exists()) {
      const w = webSnap.data();
      document.querySelectorAll("[data-announcement]").forEach(el => {
        el.textContent = w.announcementText || "";
        el.closest("[data-announcement-wrap]")?.classList.toggle("hidden", !w.announcementEnabled);
      });
    }
  } catch (e) {
    console.warn("Public settings could not be loaded:", e);
  }
}


async function loadFireCraftSponsoredPlacements(){
  const containers=Array.from(document.querySelectorAll("[data-sponsored-slot]"));
  if(!containers.length)return;

  const today=new Date().toISOString().slice(0,10);

  for(const container of containers){
    const slot=container.dataset.sponsoredSlot;

    try{
      const snap=await getDoc(doc(db,"sponsoredPlacements",slot));

      container.innerHTML="";
      container.hidden=true;
      container.classList.remove("fc-sponsored-visible");

      if(!snap.exists())continue;

      const s=snap.data();

      // Current schema + compatibility with older saved sponsor documents.
      const enabled=s.enabled===true;
      const name=s.name ?? s.sponsorName ?? "";
      const logo=s.logo ?? s.logoUrl ?? "";
      const description=s.description ?? "";
      const url=s.url ?? s.destinationUrl ?? "";
      const startDate=s.startDate ?? "";
      const endDate=s.endDate ?? "";

      const activeDates=
        (!startDate || today>=String(startDate).slice(0,10)) &&
        (!endDate || today<=String(endDate).slice(0,10));

      if(!enabled || !name || !/^https?:\/\//i.test(url) || !activeDates)continue;

      const clean=v=>String(v??"").replace(/[&<>"']/g,c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
      }[c]));

      container.innerHTML=`
        <article class="fc-sponsored">
          <div class="fc-sponsored-media">
            ${logo
              ? `<img src="${clean(logo)}" alt="${clean(name)} logo">`
              : `<span class="fc-sponsored-placeholder">AD</span>`}
          </div>
          <div class="fc-sponsored-body">
            <span class="fc-sponsored-label">SPONSORED</span>
            <h3 class="fc-sponsored-title">${clean(name)}</h3>
            <p class="fc-sponsored-desc">${clean(description||"Official FireCraft partner.")}</p>
            <a class="fc-sponsored-btn" href="${clean(url)}" target="_blank" rel="sponsored noopener noreferrer">Visit Sponsor</a>
          </div>
        </article>`;

      container.hidden=false;
      container.classList.add("fc-sponsored-visible");
    }catch(e){
      console.error("Sponsored placement error:",e);
      container.hidden=true;
      container.classList.remove("fc-sponsored-visible");
    }
  }
}

const $ = id => document.getElementById(id);
const toast = (msg) => { const t=$("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2500); };
const normIgn = s => s.trim().toLowerCase();
const pseudoEmail = ign => `${normIgn(ign).replace(/[^a-z0-9_]/g,"") || "user"}@firecraft.local`;

$("year").textContent = new Date().getFullYear();

$("menuBtn").onclick=()=>$("nav").classList.toggle("open");
document.querySelectorAll("nav a").forEach(a=>a.onclick=()=>$("nav").classList.remove("open"));
document.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.copy);toast("Server address copied.");});

function openAuth(view="login"){
  $("authModal").classList.remove("hidden");
  $("loginView").classList.toggle("hidden",view!=="login");
  $("signupView").classList.toggle("hidden",view!=="signup");
  $("resetView").classList.toggle("hidden",view!=="reset");
}
function closeAuth(){ $("authModal").classList.add("hidden"); }
$("authBtn").onclick=(e)=>{e.preventDefault();auth.currentUser ? signOut(auth) : openAuth();};
$("closeAuth").onclick=closeAuth;
$("showSignup").onclick=()=>openAuth("signup");
$("showLogin").onclick=()=>openAuth("login");
$("showReset").onclick=()=>openAuth("reset");
$("backToLogin").onclick=()=>openAuth("login");

function setMsg(id,msg,error=true){$(id).textContent=msg;$(id).style.color=error?"#ff9d87":"#62e6a0";}

let _signupBusy=false;
$("signupForm").onsubmit=async e=>{
  e.preventDefault();
  if(_signupBusy) return;
  const ign=$("signupIgn").value.trim();
  const email=$("signupEmail").value.trim().toLowerCase();
  const p=$("signupPassword").value, p2=$("signupPassword2").value;
  if(!/^[A-Za-z0-9_]{3,16}$/.test(ign)) return setMsg("signupMsg","IGN must be 3–16 letters, numbers or underscores.");
  if(!email) return setMsg("signupMsg","Email address is required.");
  if(p.length<6) return setMsg("signupMsg","Password must be at least 6 characters.");
  if(p!==p2) return setMsg("signupMsg","Passwords do not match.");
  _signupBusy=true;
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,p);
    const user=cred.user;
    try{
      await runTransaction(db, async tx=>{
        const ref=doc(db,"usernames",normIgn(ign));
        const existing=await tx.get(ref);
        if(existing.exists()) throw new Error("IGN_TAKEN");
        tx.set(ref,{uid:user.uid,ign,email});
        tx.set(doc(db,"users",user.uid),{uid:user.uid,ign,ignLower:normIgn(ign),email,role:"player",createdAt:serverTimestamp()});
      });
      setMsg("signupMsg","Account created. Welcome to FireCraft!",false);
      setTimeout(async()=>{ closeAuth(); await loadUser(auth.currentUser); },700);
    }catch(err){ await deleteUser(user); if(err.message==="IGN_TAKEN") throw new Error("That IGN is already taken. Choose a different IGN."); throw err; }
  }catch(err){ setMsg("signupMsg",friendlyAuth(err)); }
  finally{ _signupBusy=false; }
};

$("loginForm").onsubmit=async e=>{
  e.preventDefault();
  const ign=$("loginIgn").value.trim();
  const pass=$("loginPassword").value;
  try{
    let authEmail=pseudoEmail(ign);
    try{
      const usernameSnap=await getDoc(doc(db,"usernames",normIgn(ign)));
      if(usernameSnap.exists()&&usernameSnap.data().email) authEmail=usernameSnap.data().email;
    }catch{ /* rules not deployed yet — fall back to pseudoEmail */ }
    await signInWithEmailAndPassword(auth,authEmail,pass);
    setMsg("loginMsg","Login successful.","success");
    setTimeout(closeAuth,400);
  }catch(err){setMsg("loginMsg",friendlyAuth(err));}
};

$("resetForm").onsubmit=async e=>{
  e.preventDefault();
  const ign=$("resetIgn").value.trim();
  try{
    const usernameSnap=await getDoc(doc(db,"usernames",normIgn(ign)));
    if(!usernameSnap.exists()) return setMsg("resetMsg","No account found for that IGN.");
    const email=usernameSnap.data().email;
    if(!email) return setMsg("resetMsg","No recovery email on file. Contact staff on Discord to reset your password.",true);
    await sendPasswordResetEmail(auth,email);
    setMsg("resetMsg","Reset link sent! Check your inbox.","success");
  }catch(err){setMsg("resetMsg",friendlyAuth(err));}
};

function friendlyAuth(e){
  const c=e?.code||"";
  if(c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found")) return "Invalid IGN or password.";
  if(c.includes("email-already-in-use")) return "That email address is already registered. Try logging in or use password reset.";
  if(c.includes("weak-password")) return "Password must be at least 6 characters.";
  if(c.includes("operation-not-allowed")) return "Sign-up is currently disabled. Please contact an admin.";
  if(c.includes("invalid-email")) return "Please enter a valid email address.";
  if(c.includes("network-request-failed")) return "Network error. Check your connection and try again.";
  if(c.includes("too-many-requests")) return "Too many attempts. Please wait a few minutes and try again.";
  console.error("Auth error:", c, e?.message);
  return e?.message||"Something went wrong. Try again.";
}

let unsubApps=null, unsubTickets=null;
async function loadUser(user){
  const snap=await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()) return;
  const profile=snap.data();
  const logoutLabel=`Logout (${profile.ign})`;
  $("authBtn").textContent=logoutLabel;
  try{localStorage.setItem('fc_ign',profile.ign);}catch(_){}
  const _oc=document.querySelector('#fc-mobile-nav [data-origin-id="authBtn"]');
  if(_oc)_oc.textContent=logoutLabel;
  $("appIgn").value=profile.ign;
  renderProfile(profile);
  await loadStatus(user.uid);
  await loadTickets(user.uid);
  await loadWallet(user.uid, profile.ign);
  if(profile.role==="admin" || user.uid===ADMIN_UID){ $("adminPanel").classList.remove("hidden"); loadAdmin(); }
  initReviewForm(user);
}
function renderProfile(profile){
  const joined=profile.createdAt?.toDate?.().toLocaleDateString()||"Unknown";
  const roleLabel=profile.role==="admin"?"⭐ Admin":profile.role==="staff"?"🛡 Staff":"🎮 Player";
  $("profileGrid").innerHTML=`
    <div class="profile-stat"><div class="profile-stat-label">IGN</div><div class="profile-stat-value">${escapeHtml(profile.ign)}</div></div>
    <div class="profile-stat"><div class="profile-stat-label">Role</div><div class="profile-stat-value">${roleLabel}</div></div>
    <div class="profile-stat"><div class="profile-stat-label">Joined</div><div class="profile-stat-value">${escapeHtml(joined)}</div></div>
    <div class="profile-stat"><div class="profile-stat-label">Email</div><div class="profile-stat-value profile-stat-muted">${escapeHtml(profile.email||"Not set")}</div></div>
  `;
  $("profileBox").classList.remove("hidden");
}
function resetUI(){
  $("authBtn").textContent="Login";
  try{localStorage.removeItem('fc_ign');}catch(_){}
  const _oc=document.querySelector('#fc-mobile-nav [data-origin-id="authBtn"]');
  if(_oc)_oc.textContent="Login";
  document.querySelectorAll(".auth-required").forEach(x=>x.classList.add("needs-login"));
  $("statusBox").innerHTML="<p>Login to view your profile and application status.</p>";
  $("profileBox").classList.add("hidden");
  $("myTickets").innerHTML="";
  $("adminPanel").classList.add("hidden");
  initReviewForm(null);
}

async function loadStatus(uid){
  const q=query(collection(db,"applications"),where("uid","==",uid),orderBy("createdAt","desc"));
  unsubApps?.();
  unsubApps=onSnapshot(q,snap=>{
    if(snap.empty){$("statusBox").innerHTML='<div class="status-card"><div class="status-large">No application yet</div><p>Submit the whitelist application above.</p></div>';return;}
    const d=snap.docs[0].data();
    $("statusBox").innerHTML=`<div class="status-card"><div class="status-large">${escapeHtml(d.status||"pending").toUpperCase()}</div><p><b>IGN:</b> ${escapeHtml(d.ign)}</p><p><b>Submitted:</b> ${d.createdAt?.toDate?.().toLocaleString?.()||"Just now"}</p>${d.staffNote?`<p><b>Staff note:</b> ${escapeHtml(d.staffNote)}</p>`:""}</div>`;
  });
}

$("applicationForm").onsubmit=async e=>{
  e.preventDefault(); const u=auth.currentUser; if(!u){openAuth();return;}
  const rules=$("appRules").value; if(rules!=="yes") return setMsg("applicationMsg","You must agree to the rules.");
  const existing=await getDoc(doc(db,"users",u.uid));
  const p=existing.data();
  try{
    await addDoc(collection(db,"applications"),{uid:u.uid,ign:p.ign,age:Number($("appAge").value),country:$("appCountry").value.trim(),why:$("appWhy").value.trim(),contribution:$("appContribution").value.trim(),experience:$("appExperience").value,status:"pending",createdAt:serverTimestamp()});
    adminMail(EJS_TPL_APPLICATION,{ign:p.ign,age:$("appAge").value,country:$("appCountry").value.trim(),why:$("appWhy").value.trim(),contribution:$("appContribution").value.trim(),experience:$("appExperience").value,review_url:"https://www.firecraft.fun/admin/"});
    setMsg("applicationMsg","Application submitted. Staff will review it.","success"); e.target.reset(); $("appIgn").value=p.ign;
    setTimeout(()=>{ if(window.showApplyAd) window.showApplyAd(); }, 800);
  }catch(err){setMsg("applicationMsg","Could not submit application: "+err.message);}
};

$("ticketForm").onsubmit=async e=>{
  e.preventDefault(); const u=auth.currentUser;if(!u){openAuth();return;}
  const p=(await getDoc(doc(db,"users",u.uid))).data();
  try{await addDoc(collection(db,"tickets"),{uid:u.uid,ign:p.ign,category:$("ticketCategory").value,subject:$("ticketSubject").value.trim(),message:$("ticketMessage").value.trim(),status:"open",createdAt:serverTimestamp(),staffReply:""});
    adminMail(EJS_TPL_TICKET,{ign:p.ign,category:$("ticketCategory").value,subject:$("ticketSubject").value.trim(),message:$("ticketMessage").value.trim(),review_url:"https://www.firecraft.fun/admin/"});
    setMsg("ticketMsg","Ticket opened.","success");e.target.reset();}catch(err){setMsg("ticketMsg","Could not open ticket: "+err.message);}
};

async function loadTickets(uid){
  const q=query(collection(db,"tickets"),where("uid","==",uid),orderBy("createdAt","desc"));
  unsubTickets?.(); unsubTickets=onSnapshot(q,snap=>{
    $("myTickets").innerHTML="<h3>Your tickets</h3>"+snap.docs.map(x=>{const d=x.data();return `<div class="ticket"><div class="ticket-top"><b>${escapeHtml(d.subject)}</b><span class="badge">${escapeHtml(d.status)}</span></div><small>${escapeHtml(d.category)}</small><p>${escapeHtml(d.message)}</p>${d.staffReply?`<p><b>Staff:</b> ${escapeHtml(d.staffReply)}</p>`:""}</div>`}).join("");
  });
}

function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

function loadAdmin(){
  onSnapshot(query(collection(db,"applications"),orderBy("createdAt","desc")),snap=>{
    $("adminApps").innerHTML=snap.docs.map(x=>{const d=x.data();return `<div class="admin-item"><b>${escapeHtml(d.ign)}</b> <span class="badge">${escapeHtml(d.status)}</span><p>${escapeHtml(d.why)}</p><button class="copy-btn" data-app="${x.id}" data-status="approved">Approve</button><button class="copy-btn" data-app="${x.id}" data-status="rejected">Reject</button><button class="copy-btn" data-app="${x.id}" data-status="pending">Pending</button></div>`}).join("")||"<p>No applications.</p>";
    document.querySelectorAll("[data-app]").forEach(b=>b.onclick=()=>updateDoc(doc(db,"applications",b.dataset.app),{status:b.dataset.status}));
  });
  onSnapshot(query(collection(db,"tickets"),orderBy("createdAt","desc")),snap=>{
    $("adminTickets").innerHTML=snap.docs.map(x=>{const d=x.data();return `<div class="admin-item"><b>${escapeHtml(d.ign)} — ${escapeHtml(d.subject)}</b> <span class="badge">${escapeHtml(d.status)}</span><p>${escapeHtml(d.message)}</p><button class="copy-btn" data-ticket="${x.id}">Mark Closed</button></div>`}).join("")||"<p>No tickets.</p>";
    document.querySelectorAll("[data-ticket]").forEach(b=>b.onclick=()=>updateDoc(doc(db,"tickets",b.dataset.ticket),{status:"closed"}));
  });
}

/* Character counters */
document.querySelectorAll(".counter[data-for]").forEach(counter => {
  const field = document.getElementById(counter.dataset.for);
  if (!field) return;
  const max = field.maxLength;
  const update = () => {
    const len = field.value.length;
    counter.textContent = `${len} / ${max} characters`;
    counter.style.color = len > max * 0.9 ? "#ff8c70" : "";
  };
  field.addEventListener("input", update);
  update();
});

loadFireCraftPublicSettings();
loadFireCraftSponsoredPlacements();

onAuthStateChanged(auth,user=>{if(user)loadUser(user);else resetUI();});

/* FireCraft announcements */
async function loadFireCraftAnnouncements() {
  const list=document.getElementById("firecraft-announcements-list");
  if(!list)return;
  try{
    const snap=await getDocs(collection(db,"announcements")), now=Date.now();
    const items=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(a=>a.enabled!==false)
      .filter(a=>!a.startAt||!Date.parse(a.startAt)||Date.parse(a.startAt)<=now)
      .filter(a=>!a.endAt||!Date.parse(a.endAt)||Date.parse(a.endAt)>=now)
      .sort((a,b)=>(Date.parse(b.startAt||"")||0)-(Date.parse(a.startAt||"")||0));
    const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
    list.innerHTML=items.length?items.map(a=>`<article class="fc-announcement-card"><div class="fc-announcement-top"><span class="fc-announcement-type">${esc(a.type||"notice")}</span><span>${esc(a.startAt||"")}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.message).replace(/\n/g,"<br>")}</p></article>`).join(""):'<p class="fc-announcements-empty">No new announcements right now.</p>';
  }catch(e){console.error("Announcements:",e);list.innerHTML='<p class="fc-announcements-empty">Announcements are temporarily unavailable.</p>';}
}
loadFireCraftAnnouncements();

/* Server Status Widget */
async function loadServerStatus(){
  const dot=$("statusDot"), text=$("statusText");
  if(!dot||!text) return;
  try{
    const res=await fetch("https://api.mcsrvstat.us/3/play.firecraft.fun:20011");
    if(!res.ok) throw new Error("API error");
    const data=await res.json();
    if(data.online){
      const online=data.players?.online??0, max=data.players?.max??20;
      dot.className="dot";
      text.textContent=`Online — ${online}/${max} players`;
    }else{
      dot.className="dot dot-offline";
      text.textContent="Server offline";
    }
  }catch{
    dot.className="dot dot-offline";
    text.textContent="Status unavailable";
  }
}
loadServerStatus();

/* Gallery */
async function loadGallery(){
  const grid=$("galleryGrid");
  if(!grid) return;
  try{
    const snap=await getDocs(collection(db,"gallery"));
    const items=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.enabled!==false&&x.imageUrl);
    if(!items.length) return;
    const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
    grid.innerHTML=items.map(item=>`
      <div class="gallery-item">
        <img src="${esc(item.imageUrl)}" alt="${esc(item.caption||"FireCraft SMP screenshot")}" loading="lazy">
        ${item.caption?`<div class="gallery-caption">${esc(item.caption)}</div>`:""}
      </div>`).join("");
  }catch(e){ console.warn("Gallery load error:",e); }
}
loadGallery();

// ── REVIEWS SYSTEM ──────────────────────────────────────────────────────────

async function loadReviews() {
  const list = document.getElementById("reviewsList");
  if (!list) return;
  try {
    const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(50)));
    if (snap.empty) {
      list.innerHTML = '<p class="reviews-empty">No reviews yet — be the first to share your experience!</p>';
      return;
    }
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
    list.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const stars = "★".repeat(Math.max(1, Math.min(5, r.rating || 0))) + "☆".repeat(5 - Math.max(1, Math.min(5, r.rating || 0)));
      const date = r.createdAt?.toDate?.().toLocaleDateString?.() || "";
      return `<div class="review-card">
        <div class="review-top">
          <span class="review-ign">${esc(r.ign)}</span>
          <span class="review-stars" title="${esc(r.rating)} out of 5">${stars}</span>
        </div>
        <p class="review-text">${esc(r.text).replace(/\n/g, "<br>")}</p>
        ${date ? `<small class="review-date">${date}</small>` : ""}
      </div>`;
    }).join("");
  } catch (e) {
    console.warn("Reviews load error:", e);
    list.innerHTML = '<p class="reviews-empty">Could not load reviews.</p>';
  }
}
loadReviews();

function initReviewForm(user) {
  const wrap = document.getElementById("reviewFormWrap");
  const prompt = document.getElementById("reviewLoginPrompt");
  if (!wrap || !prompt) return;

  if (!user) {
    wrap.classList.add("hidden");
    prompt.classList.remove("hidden");
    return;
  }

  // Check if user already submitted
  getDoc(doc(db, "reviews", user.uid)).then(snap => {
    if (snap.exists()) {
      wrap.innerHTML = '<p class="reviews-already">You have already submitted a review. Thank you!</p>';
      wrap.classList.remove("hidden");
    } else {
      wrap.classList.remove("hidden");
    }
    prompt.classList.add("hidden");
  });
}

// Star picker interactivity
(function() {
  const picker = document.getElementById("starPicker");
  const ratingInput = document.getElementById("reviewRating");
  if (!picker || !ratingInput) return;
  let selected = 0;
  const stars = picker.querySelectorAll(".star");

  function paint(val) {
    stars.forEach(s => s.classList.toggle("active", Number(s.dataset.val) <= val));
  }

  stars.forEach(s => {
    s.addEventListener("click", () => {
      selected = Number(s.dataset.val);
      ratingInput.value = selected;
      paint(selected);
    });
    s.addEventListener("mouseenter", () => paint(Number(s.dataset.val)));
    s.addEventListener("mouseleave", () => paint(selected));
  });
})();

document.getElementById("reviewForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const u = auth.currentUser;
  if (!u) { openAuth(); return; }
  const rating = Number(document.getElementById("reviewRating").value);
  if (!rating || rating < 1 || rating > 5) {
    setMsg("reviewMsg", "Please select a star rating.");
    return;
  }
  const text = document.getElementById("reviewText").value.trim();
  if (text.length < 10) {
    setMsg("reviewMsg", "Review must be at least 10 characters.");
    return;
  }
  try {
    const userDoc = await getDoc(doc(db, "users", u.uid));
    const ign = userDoc.data()?.ign || "Player";
    // UID as doc ID enforces one review per user
    await setDoc(doc(db, "reviews", u.uid), {
      uid: u.uid,
      ign,
      rating,
      text,
      createdAt: serverTimestamp()
    });
    setMsg("reviewMsg", "Review submitted! Thank you.", "success");
    e.target.reset();
    document.getElementById("reviewRating").value = "";
    document.querySelectorAll("#starPicker .star").forEach(s => s.classList.remove("active"));
    const wrap = document.getElementById("reviewFormWrap");
    if (wrap) wrap.innerHTML = '<p class="reviews-already">Thank you for your review!</p>';
    loadReviews();
  } catch (err) {
    setMsg("reviewMsg", err.code === "permission-denied"
      ? "You have already submitted a review."
      : "Could not submit review: " + err.message);
  }
});

document.getElementById("reviewLoginLink")?.addEventListener("click", e => { e.preventDefault(); openAuth(); });

// ── EARN SYSTEM ─────────────────────────────────────────────────────────────

let _earnSettings = {currency:"PKR", minWithdraw:100, enabled:true};
let _walletData = {totalPaidOut:0};
let _earnedTotal = 0;

async function loadEarnSystem() {
  // Load global earn settings (public)
  try {
    const snap = await getDoc(doc(db, "earnSettings", "global"));
    if (snap.exists()) _earnSettings = {..._earnSettings, ...snap.data()};
  } catch(e) { console.warn("Earn settings:", e); }

  // Render partner servers (public)
  await loadPartnerServersPublic();

  // Show notice if set
  const noticeEl = $("earnSystemNotice");
  if (noticeEl && _earnSettings.notice) {
    noticeEl.textContent = _earnSettings.notice;
    noticeEl.classList.remove("hidden");
  }
  if (!_earnSettings.enabled) {
    $("earnDisabledMsg")?.classList.remove("hidden");
    $("partnerServerGrid").innerHTML = "";
  }
}

async function loadPartnerServersPublic() {
  const grid = $("partnerServerGrid");
  if (!grid) return;
  try {
    const snap = await getDocs(collection(db, "partnerServers"));
    const servers = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(s => s.enabled !== false);
    if (!servers.length) {
      grid.innerHTML = '<p class="ps-empty">No partner servers available right now. Check back soon!</p>';
      return;
    }
    grid.innerHTML = servers.map(s => `
      <div class="partner-server-card">
        ${s.logo ? `<img class="ps-logo" src="${escapeHtml(s.logo)}" alt="${escapeHtml(s.name)} logo">` : `<div class="ps-logo-placeholder">🎮</div>`}
        <div class="ps-body">
          <div class="ps-name">${escapeHtml(s.name)}</div>
          <div class="ps-ip">${escapeHtml(s.ip)}${s.port ? ":"+escapeHtml(s.port) : ""}</div>
          <p class="ps-desc">${escapeHtml(s.description || "")}</p>
          <div class="ps-rate">
            <span class="ps-rate-amount">${escapeHtml(_earnSettings.currency || "PKR")} ${escapeHtml(String(s.ratePerHour || 0))}/hr</span>
            <span class="ps-min-hours">Min ${escapeHtml(String(s.minHoursToEarn || 1))}h to start earning</span>
          </div>
        </div>
        <button class="btn btn-small btn-primary copy-btn" data-copy="${escapeHtml(s.ip)}${s.port ? ":"+escapeHtml(s.port) : ""}">Copy IP</button>
      </div>`).join("");
    // Re-bind copy buttons
    grid.querySelectorAll(".copy-btn[data-copy]").forEach(b => {
      b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); b.textContent = "Copied!"; setTimeout(()=>b.textContent="Copy IP",1500); };
    });
  } catch(e) { console.warn("Partner servers:", e); grid.innerHTML = '<p class="ps-empty">Could not load servers.</p>'; }
}

async function loadWallet(uid, ign) {
  const walletBox = $("walletBox");
  if (!walletBox) return;
  if (!_earnSettings.enabled) return;
  try {
    // Load wallet doc (paid out amount)
    const walletSnap = await getDoc(doc(db, "wallets", uid));
    _walletData = walletSnap.exists() ? walletSnap.data() : {totalPaidOut: 0};

    // Sum earnings from playtime logs
    const logsSnap = await getDocs(query(collection(db, "playtimeLogs"), where("uid","==",uid)));
    _earnedTotal = 0;
    const recentLogs = [];
    logsSnap.docs.forEach(d => {
      const log = d.data();
      if (log.earned) _earnedTotal += Number(log.earned);
      recentLogs.push(log);
    });
    recentLogs.sort((a,b) => (b.sessionEnd?.seconds||0) - (a.sessionEnd?.seconds||0));

    const available = Math.max(0, _earnedTotal - (_walletData.totalPaidOut || 0));
    $("walletBalance").textContent = `${_earnSettings.currency || "PKR"} ${available.toFixed(2)}`;

    // Recent history (last 5 sessions)
    const histEl = $("walletHistory");
    if (histEl) {
      histEl.innerHTML = recentLogs.slice(0,5).map(log => {
        const serverName = log.serverName || log.serverId || "Unknown";
        const mins = log.minutesPlayed || 0;
        const earned = (log.earned || 0).toFixed(2);
        const date = log.sessionEnd?.toDate?.().toLocaleDateString() || "—";
        return `<div class="wallet-log-row"><span>${escapeHtml(serverName)}</span><span>${escapeHtml(String(Math.floor(mins/60)))+'h '+escapeHtml(String(mins%60))+'m'}</span><span>+${_earnSettings.currency} ${escapeHtml(earned)}</span><span class="wallet-log-date">${escapeHtml(date)}</span></div>`;
      }).join("") || '<p class="wallet-empty">No earnings yet. Play on a partner server to start earning!</p>';
    }

    walletBox.classList.remove("hidden");

    // Set available amount hint on withdraw modal
    $("withdrawAvailableHint").textContent = `Available: ${_earnSettings.currency} ${available.toFixed(2)}`;
    $("withdrawAmount").max = available.toFixed(2);
  } catch(e) { console.warn("Wallet load:", e); }
}

// Withdraw button
$("withdrawBtn")?.addEventListener("click", () => {
  if (!auth.currentUser) return openAuth();
  $("withdrawModal").classList.remove("hidden");
});
$("closeWithdrawModal")?.addEventListener("click", () => $("withdrawModal").classList.add("hidden"));

let _withdrawBusy = false;
$("withdrawForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (_withdrawBusy) return;
  const u = auth.currentUser;
  if (!u) return openAuth();
  const amount = parseFloat($("withdrawAmount").value);
  const method = $("withdrawMethod").value;
  const account = $("withdrawAccount").value.trim();
  const note = $("withdrawNote").value.trim();
  const available = Math.max(0, _earnedTotal - (_walletData.totalPaidOut || 0));
  if (!amount || amount <= 0) return setMsg("withdrawMsg", "Enter a valid amount.");
  if (amount > available) return setMsg("withdrawMsg", `Maximum available is ${_earnSettings.currency} ${available.toFixed(2)}.`);
  if (amount < (_earnSettings.minWithdraw || 100)) return setMsg("withdrawMsg", `Minimum withdrawal is ${_earnSettings.currency} ${_earnSettings.minWithdraw || 100}.`);
  if (!method) return setMsg("withdrawMsg", "Choose a payment method.");
  if (!account) return setMsg("withdrawMsg", "Enter your account number.");
  _withdrawBusy = true;
  try {
    const profile = (await getDoc(doc(db,"users",u.uid))).data();
    await addDoc(collection(db,"withdrawalRequests"), {
      uid: u.uid,
      ign: profile?.ign || "Unknown",
      amount,
      paymentMethod: method,
      accountNumber: account,
      playerNote: note,
      status: "pending",
      createdAt: serverTimestamp()
    });
    setMsg("withdrawMsg", "Withdrawal request submitted! Admin will contact you on Discord.", false);
    setTimeout(() => $("withdrawModal").classList.add("hidden"), 2500);
    $("withdrawForm").reset();
  } catch(err) { setMsg("withdrawMsg", "Could not submit: " + err.message); }
  finally { _withdrawBusy = false; }
});

loadEarnSystem();
