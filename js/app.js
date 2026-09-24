import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, orderBy, onSnapshot, updateDoc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

onAuthStateChanged(auth,user=>{if(user)loadUser(user);else resetUI();});
