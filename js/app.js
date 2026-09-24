import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, orderBy, onSnapshot, updateDoc, serverTimestamp, runTransaction,
  getDocs,} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function loadFireCraftPublicSettings() {
  try {
    const serverSnap = await getDoc(doc(db, "settings", "server"));
    if (serverSnap.exists()) {
      const s = serverSnap.data();
      const ipCandidates = document.querySelectorAll("[data-server-java-ip]");
      ipCandidates.forEach(el => el.textContent = `${s.javaIp || ""}${s.javaPort ? ":" + s.javaPort : ""}`);
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

function openAuth(view="login"){ $("authModal").classList.remove("hidden"); $("loginView").classList.toggle("hidden",view!=="login"); $("signupView").classList.toggle("hidden",view!=="signup"); }
function closeAuth(){ $("authModal").classList.add("hidden"); }
$("authBtn").onclick=()=>auth.currentUser ? signOut(auth) : openAuth();
$("closeAuth").onclick=closeAuth;
$("showSignup").onclick=()=>openAuth("signup");
$("showLogin").onclick=()=>openAuth("login");

function setMsg(id,msg,error=true){$(id).textContent=msg;$(id).style.color=error?"#ff9d87":"#62e6a0";}

$("signupForm").onsubmit=async e=>{
  e.preventDefault();
  const ign=$("signupIgn").value.trim();
  const p=$("signupPassword").value, p2=$("signupPassword2").value;
  if(!/^[A-Za-z0-9_]{3,16}$/.test(ign)) return setMsg("signupMsg","IGN must be 3–16 letters, numbers or underscores.");
  if(p!==p2) return setMsg("signupMsg","Passwords do not match.");
  try{
    // The real password is handled by Firebase Authentication; it is never stored in Firestore.
    const cred=await createUserWithEmailAndPassword(auth,pseudoEmail(ign),p);
    const user=cred.user;
    try{
      await runTransaction(db, async tx=>{
        const ref=doc(db,"usernames",normIgn(ign));
        const existing=await tx.get(ref);
        if(existing.exists()) throw new Error("IGN_TAKEN");
        tx.set(ref,{uid:user.uid,ign});
        tx.set(doc(db,"users",user.uid),{uid:user.uid,ign,ignLower:normIgn(ign),role:"player",createdAt:serverTimestamp()});
      });
      setMsg("signupMsg","Account created. Welcome to FireCraft!","success");
      setTimeout(closeAuth,700);
    }catch(err){ await deleteUser(user); if(err.message==="IGN_TAKEN") throw new Error("That IGN is already registered."); throw err; }
  }catch(err){ setMsg("signupMsg",friendlyAuth(err)); }
};

$("loginForm").onsubmit=async e=>{
  e.preventDefault();
  try{ await signInWithEmailAndPassword(auth,pseudoEmail($("loginIgn").value),$("loginPassword").value); setMsg("loginMsg","Login successful.","success"); setTimeout(closeAuth,400); }
  catch(err){setMsg("loginMsg",friendlyAuth(err));}
};

function friendlyAuth(e){
  const c=e?.code||"";
  if(c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found")) return "Invalid IGN or password.";
  if(c.includes("email-already-in-use")) return "That IGN is already registered.";
  if(c.includes("weak-password")) return "Password must be at least 6 characters.";
  return e?.message||"Something went wrong.";
}

let unsubApps=null, unsubTickets=null;
async function loadUser(user){
  const snap=await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()) return;
  const profile=snap.data();
  $("authBtn").textContent=`Logout (${profile.ign})`;
  $("appIgn").value=profile.ign;
  await loadStatus(user.uid);
  await loadTickets(user.uid);
  if(profile.role==="admin" || user.uid===ADMIN_UID){ $("adminPanel").classList.remove("hidden"); loadAdmin(); }
}
function resetUI(){
  $("authBtn").textContent="Login";
  document.querySelectorAll(".auth-required").forEach(x=>x.classList.add("needs-login"));
  $("statusBox").innerHTML="<p>Login to view your whitelist/application status.</p>";
  $("myTickets").innerHTML="";
  $("adminPanel").classList.add("hidden");
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
    setMsg("applicationMsg","Application submitted. Staff will review it.","success"); e.target.reset(); $("appIgn").value=p.ign;
  }catch(err){setMsg("applicationMsg","Could not submit application: "+err.message);}
};

$("ticketForm").onsubmit=async e=>{
  e.preventDefault(); const u=auth.currentUser;if(!u){openAuth();return;}
  const p=(await getDoc(doc(db,"users",u.uid))).data();
  try{await addDoc(collection(db,"tickets"),{uid:u.uid,ign:p.ign,category:$("ticketCategory").value,subject:$("ticketSubject").value.trim(),message:$("ticketMessage").value.trim(),status:"open",createdAt:serverTimestamp(),staffReply:""});setMsg("ticketMsg","Ticket opened.","success");e.target.reset();}catch(err){setMsg("ticketMsg","Could not open ticket: "+err.message);}
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
