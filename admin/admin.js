import { firebaseConfig, ADMIN_UID } from "../js/firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc,
  setDoc, updateDoc, deleteDoc, getDocs, where, limit,
  serverTimestamp,} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
let currentUser = null;
let selectedUser = null;
let selectedApplication = null;
let selectedTicket = null;
let users = [], applications = [], tickets = [], staff = [];

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[c]));

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}
function openModal(id){ $(id).classList.remove("hidden"); }
function closeModal(id){ $(id).classList.add("hidden"); }
function fmt(ts){
  if(!ts) return "—";
  try { return ts.toDate().toLocaleString(); } catch { return "—"; }
}
function statusPill(s){
  const x = String(s || "unknown");
  const cls = x === "approved" || x === "open" || x === "active" ? "ok" :
              x === "rejected" || x === "closed" || x === "disabled" ? "bad" : "warn";
  return `<span class="pill ${cls}">${esc(x)}</span>`;
}
function emptyRow(cols, text="No records found."){
  return `<tr><td colspan="${cols}" class="empty">${esc(text)}</td></tr>`;
}

function navigate(section){
  document.querySelectorAll(".section").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(x => x.classList.remove("active"));
  $(section).classList.add("active");
  document.querySelector(`[data-section="${section}"]`)?.classList.add("active");
  location.hash = section;
}


const sponsorFields = {
  slot1: { enabled:"s1Enabled", name:"s1Name", logo:"s1Logo", description:"s1Description", url:"s1Url", start:"s1Start", end:"s1End" },
  slot2: { enabled:"s2Enabled", name:"s2Name", logo:"s2Logo", description:"s2Description", url:"s2Url", start:"s2Start", end:"s2End" },
  slot3: { enabled:"s3Enabled", name:"s3Name", logo:"s3Logo", description:"s3Description", url:"s3Url", start:"s3Start", end:"s3End" }
};

function fillSponsorForm(slot, data = {}) {
  const f = sponsorFields[slot];
  $(f.enabled).checked = !!data.enabled;
  $(f.name).value = data.name || "";
  $(f.logo).value = data.logo || "";
  $(f.description).value = data.description || "";
  $(f.url).value = data.url || "";
  $(f.start).value = data.startDate || "";
  $(f.end).value = data.endDate || "";
}

async function loadSponsoredPlacements() {
  for (const slot of Object.keys(sponsorFields)) {
    try {
      const snap = await getDoc(doc(db, "sponsoredPlacements", slot));
      fillSponsorForm(slot, snap.exists() ? snap.data() : {});
    } catch (e) {
      showToast("Sponsor load error: " + e.message);
    }
  }
}

async function saveSponsoredPlacement(slot) {
  const f = sponsorFields[slot];
  const url = $(f.url).value.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    showToast("Sponsor URL must start with http:// or https://");
    return;
  }
  const data = {
    slot,
    enabled: $(f.enabled).checked,
    name: $(f.name).value.trim(),
    logo: $(f.logo).value.trim(),
    description: $(f.description).value.trim(),
    url,
    startDate: $(f.start).value || "",
    endDate: $(f.end).value || "",
    updatedAt: new Date(),
    updatedBy: currentUser.uid
  };
  try {
    await setDoc(doc(db, "sponsoredPlacements", slot), data, { merge:true });
    showToast(`${slot} saved.`);
  } catch (e) {
    showToast("Sponsor save error: " + e.message);
  }
}

document.querySelectorAll(".save-sponsor").forEach(btn => {
  btn.addEventListener("click", () => saveSponsoredPlacement(btn.dataset.slot));
});
$("refreshSponsors")?.addEventListener("click", loadSponsoredPlacements);


document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    navigate(btn.dataset.section);
    if (btn.dataset.section === "whitelist") loadWhitelist();
  });
});
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if(!user){
    location.href = "../";
    return;
  }
  if(user.uid !== ADMIN_UID){
    $("loadingPanel").classList.add("hidden");
    $("deniedPanel").classList.remove("hidden");
    return;
  }

  $("loadingPanel").classList.add("hidden");
  $("adminShell").classList.remove("hidden");

  const profile = await getDoc(doc(db,"users",user.uid));
  $("adminName").textContent = profile.exists() ? (profile.data().ign || "Admin") : "Admin";

  subscribeUsers();
  subscribeApplications();
  subscribeTickets();
  subscribeStaff();
  loadServerSettings();
  loadWebsiteSettings();
  loadSponsoredPlacements();
  loadEarnAdmin();

  const hash = location.hash.replace("#","");
  if(hash && $(hash)) navigate(hash);
});

function subscribeUsers(){
  onSnapshot(query(collection(db,"users")), snap => {
    users = snap.docs.map(d => ({id:d.id,...d.data()}));
    renderUsers();
    $("totalUsers").textContent = users.length;
  }, err => showToast("Users error: " + err.message));
}
function subscribeApplications(){
  onSnapshot(query(collection(db,"applications"),orderBy("createdAt","desc")), snap => {
    applications = snap.docs.map(d => ({id:d.id,...d.data()}));
    renderApplications();
    $("pendingApplications").textContent = applications.filter(x => x.status === "pending").length;
  }, err => showToast("Applications error: " + err.message));
}
function subscribeTickets(){
  onSnapshot(query(collection(db,"tickets"),orderBy("createdAt","desc")), snap => {
    tickets = snap.docs.map(d => ({id:d.id,...d.data()}));
    renderTickets();
    $("openTickets").textContent = tickets.filter(x => x.status === "open").length;
  }, err => showToast("Tickets error: " + err.message));
}
function subscribeStaff(){
  onSnapshot(query(collection(db,"staff")), snap => {
    staff = snap.docs.map(d => ({id:d.id,...d.data()}));
    renderStaff();
    $("staffCount").textContent = staff.length;
  }, err => showToast("Staff error: " + err.message));
}

function renderUsers(){
  const q = $("userSearch").value.toLowerCase();
  const role = $("userRoleFilter").value;
  const list = users.filter(u =>
    (!q || String(u.ign||"").toLowerCase().includes(q) || String(u.email||"").toLowerCase().includes(q)) &&
    (!role || u.role === role)
  );
  $("usersList").innerHTML = list.length ? list.map(u => `
    <tr>
      <td><strong>${esc(u.ign || "Unknown")}</strong></td>
      <td>${esc(u.role || "player")}</td>
      <td>${statusPill(u.status || "active")}</td>
      <td>${fmt(u.createdAt)}</td>
      <td><button class="btn btn-primary user-action" data-id="${esc(u.id)}">Manage</button></td>
    </tr>`).join("") : emptyRow(5);
  document.querySelectorAll(".user-action").forEach(b => b.onclick = () => openUser(b.dataset.id));
}

function openUser(id){
  selectedUser = users.find(x => x.id === id);
  if(!selectedUser) return;
  $("userDetails").innerHTML = `
    <div class="detail-grid">
      <div class="detail"><small>UID</small><strong>${esc(selectedUser.id)}</strong></div>
      <div class="detail"><small>IGN</small><strong>${esc(selectedUser.ign)}</strong></div>
      <div class="detail"><small>Role</small><strong>${esc(selectedUser.role || "player")}</strong></div>
      <div class="detail"><small>Status</small><strong>${esc(selectedUser.status || "active")}</strong></div>
      <div class="detail"><small>Created</small><strong>${esc(fmt(selectedUser.createdAt))}</strong></div>
      <div class="detail"><small>Email</small><strong>${esc(selectedUser.email || "Internal Firebase Auth account")}</strong></div>
    </div>`;
  $("editUserIgn").value = selectedUser.ign || "";
  $("editUserRole").value = selectedUser.role || "player";
  $("editUserStatus").value = selectedUser.status || "active";
  openModal("userModal");
}

$("saveUserBtn").onclick = async () => {
  if(!selectedUser) return;
  const newIgn = $("editUserIgn").value.trim();
  const newRole = $("editUserRole").value;
  const newStatus = $("editUserStatus").value;
  if(!newIgn) return showToast("IGN is required.");
  try{
    await updateDoc(doc(db,"users",selectedUser.id), {
      ign:newIgn, role:newRole, status:newStatus, updatedAt:new Date()
    });
    showToast("User profile updated.");
    closeModal("userModal");
  }catch(e){ showToast(e.message); }
};

$("deleteUserBtn").onclick = async () => {
  if(!selectedUser) return;
  if(selectedUser.id === ADMIN_UID) return showToast("You cannot delete the main admin profile.");
  if(!confirm(`Delete Firestore profile for ${selectedUser.ign || selectedUser.id}? Firebase Authentication account will NOT be deleted.`)) return;
  try{
    await deleteDoc(doc(db,"users",selectedUser.id));
    showToast("Firestore profile deleted.");
    closeModal("userModal");
  }catch(e){ showToast(e.message); }
};

function renderApplications(){
  const q = $("applicationSearch").value.toLowerCase();
  const status = $("applicationStatusFilter").value;
  const list = applications.filter(a =>
    (!q || [a.ign,a.country,a.why,a.experience].some(v => String(v||"").toLowerCase().includes(q))) &&
    (!status || a.status === status)
  );
  $("applicationsList").innerHTML = list.length ? list.map(a => `
    <tr>
      <td><strong>${esc(a.ign)}</strong></td>
      <td>${esc(a.country || "—")}</td>
      <td>${statusPill(a.status)}</td>
      <td>${fmt(a.createdAt)}</td>
      <td><button class="btn btn-primary app-action" data-id="${esc(a.id)}">View</button></td>
    </tr>`).join("") : emptyRow(5);
  document.querySelectorAll(".app-action").forEach(b => b.onclick = () => openApplication(b.dataset.id));
}
function openApplication(id){
  selectedApplication = applications.find(x => x.id === id);
  if(!selectedApplication) return;
  const a = selectedApplication;
  $("applicationDetails").innerHTML = `<div class="detail-grid">
    <div class="detail"><small>IGN</small><strong>${esc(a.ign)}</strong></div>
    <div class="detail"><small>Age</small><strong>${esc(a.age)}</strong></div>
    <div class="detail"><small>Country</small><strong>${esc(a.country)}</strong></div>
    <div class="detail"><small>Status</small><strong>${esc(a.status)}</strong></div>
    <div class="detail"><small>Why join?</small><strong>${esc(a.why)}</strong></div>
    <div class="detail"><small>Contribution</small><strong>${esc(a.contribution)}</strong></div>
    <div class="detail"><small>Experience</small><strong>${esc(a.experience)}</strong></div>
    <div class="detail"><small>Submitted</small><strong>${esc(fmt(a.createdAt))}</strong></div>
  </div>`;
  $("applicationStaffNote").value = a.staffNote || "";
  openModal("applicationModal");
}
async function setApplicationStatus(status){
  if(!selectedApplication) return;
  try{
    await updateDoc(doc(db,"applications",selectedApplication.id), {
      status, reviewedBy: currentUser.uid, reviewedAt:new Date()
    });
    showToast(`Application marked ${status}.`);
    closeModal("applicationModal");
  }catch(e){showToast(e.message); return;}
  if(status === "approved" && selectedApplication.ign){
    try{
      const ignKey = selectedApplication.ign.toLowerCase();
      await setDoc(doc(db,"approvedPlayers",ignKey), {
        ign: selectedApplication.ign,
        approvedAt: new Date(),
        approvedBy: currentUser.uid,
        applicationId: selectedApplication.id
      });
    }catch(e){
      console.warn("approvedPlayers write failed (rules not deployed yet?):", e.message);
    }
    // Email notification — sent after 5 min delay so player is already whitelisted when they read it
    try{
      const userSnap = await getDoc(doc(db,"users",selectedApplication.uid));
      const email = userSnap.exists() ? userSnap.data().email : null;
      if(email && window.emailjs){
        setTimeout(async () => {
          try{
            await window.emailjs.send(
              "service_cacpon8",
              "template_0cfrwpb",
              { to_email: email, ign: selectedApplication.ign, site_url: "https://www.firecraft.fun" }
            );
            console.log("Approval email sent to " + selectedApplication.ign);
          }catch(e2){ console.warn("Email notification failed:", e2.message); }
        }, 2 * 60 * 1000); // 2 minute delay — matches plugin whitelist poll interval
        showToast("Approval email will be sent to " + selectedApplication.ign + " in 2 minutes.");
      }
    }catch(e){
      console.warn("Email notification failed:", e.message);
    }
  }
}
$("approveApplicationBtn").onclick = () => setApplicationStatus("approved");
$("pendingApplicationBtn").onclick = () => setApplicationStatus("pending");
$("rejectApplicationBtn").onclick = () => setApplicationStatus("rejected");
$("saveApplicationNoteBtn").onclick = async () => {
  if(!selectedApplication) return;
  try{
    await updateDoc(doc(db,"applications",selectedApplication.id), {
      staffNote:$("applicationStaffNote").value.trim(),
      reviewedBy:currentUser.uid,
      updatedAt:new Date()
    });
    showToast("Staff note saved.");
  }catch(e){showToast(e.message);}
};

function renderTickets(){
  const q = $("ticketSearch").value.toLowerCase();
  const status = $("ticketStatusFilter").value;
  const list = tickets.filter(t =>
    (!q || [t.ign,t.subject,t.category,t.message].some(v => String(v||"").toLowerCase().includes(q))) &&
    (!status || t.status === status)
  );
  $("ticketsList").innerHTML = list.length ? list.map(t => `
    <tr>
      <td><strong>${esc(t.ign)}</strong></td>
      <td>${esc(t.subject || "—")}</td>
      <td>${statusPill(t.status)}</td>
      <td>${fmt(t.createdAt)}</td>
      <td><button class="btn btn-primary ticket-action" data-id="${esc(t.id)}">View</button></td>
    </tr>`).join("") : emptyRow(5);
  document.querySelectorAll(".ticket-action").forEach(b => b.onclick = () => openTicket(b.dataset.id));
}
function openTicket(id){
  selectedTicket = tickets.find(x => x.id === id);
  if(!selectedTicket) return;
  const t = selectedTicket;
  $("ticketDetails").innerHTML = `<div class="detail-grid">
    <div class="detail"><small>IGN</small><strong>${esc(t.ign)}</strong></div>
    <div class="detail"><small>Category</small><strong>${esc(t.category)}</strong></div>
    <div class="detail"><small>Subject</small><strong>${esc(t.subject)}</strong></div>
    <div class="detail"><small>Status</small><strong>${esc(t.status)}</strong></div>
    <div class="detail"><small>Message</small><strong>${esc(t.message)}</strong></div>
    <div class="detail"><small>Created</small><strong>${esc(fmt(t.createdAt))}</strong></div>
  </div>`;
  $("staffReply").value = t.staffReply || "";
  openModal("ticketModal");
}
$("replyTicketBtn").onclick = async () => {
  if(!selectedTicket) return;
  try{
    await updateDoc(doc(db,"tickets",selectedTicket.id), {
      staffReply:$("staffReply").value.trim(),
      staffReplyBy:currentUser.uid,
      staffReplyAt:new Date()
    });
    showToast("Reply saved.");
  }catch(e){showToast(e.message);}
};
$("closeTicketBtn").onclick = async () => {
  if(!selectedTicket) return;
  try{
    await updateDoc(doc(db,"tickets",selectedTicket.id), {
      status:"closed", closedBy:currentUser.uid, closedAt:new Date()
    });
    showToast("Ticket closed.");
    closeModal("ticketModal");
  }catch(e){showToast(e.message);}
};

async function loadServerSettings(){
  const snap = await getDoc(doc(db,"settings","server"));
  const s = snap.exists() ? snap.data() : {};
  $("serverName").value = s.name || "FireCraft SMP";
  $("javaIp").value = s.javaIp || "";
  $("javaPort").value = s.javaPort || "";
  $("bedrockIp").value = s.bedrockIp || "";
  $("bedrockPort").value = s.bedrockPort || "";
  $("serverMessage").value = s.message || "";
  renderDashboardServer(s);
}
function renderDashboardServer(s){
  $("dashboardServerInfo").innerHTML =
    `<strong>${esc(s.name || "FireCraft SMP")}</strong><br>
     Java: ${esc(s.javaIp || "Not configured")}${s.javaPort ? ":"+esc(s.javaPort) : ""}<br>
     Bedrock: ${esc(s.bedrockIp || "Not configured")}${s.bedrockPort ? ":"+esc(s.bedrockPort) : ""}<br>
     Status: ${esc(s.message || "Not configured")}`;
}
$("saveServerSettings").onclick = async () => {
  try{
    const s = {
      name:$("serverName").value.trim(),
      javaIp:$("javaIp").value.trim(),
      javaPort:$("javaPort").value.trim(),
      bedrockIp:$("bedrockIp").value.trim(),
      bedrockPort:$("bedrockPort").value.trim(),
      message:$("serverMessage").value.trim(),
      updatedAt:new Date(), updatedBy:currentUser.uid
    };
    await setDoc(doc(db,"settings","server"),s,{merge:true});
    renderDashboardServer(s);
    showToast("Server settings saved.");
  }catch(e){showToast(e.message);}
};

async function loadWebsiteSettings(){
  const snap = await getDoc(doc(db,"settings","website"));
  const s = snap.exists() ? snap.data() : {};
  $("announcementText").value = s.announcementText || "";
  $("websiteAnnouncementEnabled").checked = !!s.announcementEnabled;
}
$("saveWebsiteSettings").onclick = async () => {
  try{
    await setDoc(doc(db,"settings","website"),{
      announcementText:$("announcementText").value.trim(),
      announcementEnabled:$("websiteAnnouncementEnabled").checked,
      updatedAt:new Date(),updatedBy:currentUser.uid
    },{merge:true});
    showToast("Website settings saved.");
  }catch(e){showToast(e.message);}
};

function renderStaff(){
  $("staffList").innerHTML = staff.length ? staff.map(s => `
    <tr>
      <td>${esc(s.ign || "—")}</td>
      <td>${esc(s.id)}</td>
      <td>${esc(s.role || "staff")}</td>
      <td>${statusPill(s.active === false ? "disabled" : "active")}</td>
      <td><button class="btn btn-danger staff-delete" data-id="${esc(s.id)}">Remove</button></td>
    </tr>`).join("") : emptyRow(5);
  document.querySelectorAll(".staff-delete").forEach(b => b.onclick = async () => {
    if(b.dataset.id === ADMIN_UID) return showToast("The main admin cannot be removed.");
    if(!confirm("Remove this staff record?")) return;
    try{ await deleteDoc(doc(db,"staff",b.dataset.id)); showToast("Staff record removed."); }
    catch(e){showToast(e.message);}
  });
}
$("saveStaff").onclick = async () => {
  const uid = $("staffUid").value.trim();
  const ign = $("staffIgn").value.trim();
  const role = $("staffRole").value;
  const active = $("staffActive").checked;
  if(!uid || !ign) return showToast("UID and IGN are required.");
  if(role === "admin" && uid !== ADMIN_UID) {
    return showToast("The built-in admin UID is reserved for the main admin. Use Staff role for additional accounts.");
  }
  try{
    await setDoc(doc(db,"staff",uid),{uid,ign,role,active,updatedAt:new Date(),updatedBy:currentUser.uid},{merge:true});
    if(role === "staff"){
      const u = await getDoc(doc(db,"users",uid));
      if(u.exists()) await updateDoc(doc(db,"users",uid),{role:"staff",status:active?"active":"disabled"});
    }
    showToast("Staff record saved.");
    $("staffUid").value = "";
    $("staffIgn").value = "";
  }catch(e){showToast(e.message);}
};

["userSearch","userRoleFilter"].forEach(id => $(id).addEventListener("input",renderUsers));
["applicationSearch","applicationStatusFilter"].forEach(id => $(id).addEventListener("input",renderApplications));
["ticketSearch","ticketStatusFilter"].forEach(id => $(id).addEventListener("input",renderTickets));

$("refreshUsers").onclick = () => showToast("Users are live-updated.");
$("refreshApplications").onclick = () => showToast("Applications are live-updated.");
$("refreshTickets").onclick = () => showToast("Tickets are live-updated.");
$("refreshStaff").onclick = () => showToast("Staff list is live-updated.");
$("refreshAll").onclick = async () => {
  await loadServerSettings();
  await loadWebsiteSettings();
  showToast("Dashboard refreshed.");
};
$("backHomeBtn").onclick = () => location.href = "../";
$("logoutBtn").onclick = async () => {
  await signOut(auth);
  location.href = "../";
};

/* FireCraft announcements admin */
let announcementsCache=[];
const escAnnouncement=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

async function loadAnnouncements(){
  const list=document.getElementById("announcementsList");
  if(!list)return;
  try{
    const snap=await getDocs(collection(db,"announcements"));
    announcementsCache=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));

    list.innerHTML=announcementsCache.length
      ? announcementsCache.map(a=>`
        <div class="announcement-admin-card">
          <div>
            <strong>${escAnnouncement(a.title)}</strong>
            <span class="announcement-type">${escAnnouncement(a.type||"notice")}</span>
            <p>${escAnnouncement(a.message).replace(/\n/g,"<br>")}</p>
            <small>${a.enabled===false?"Hidden":"Visible"}${a.startAt?" • Starts: "+escAnnouncement(a.startAt):""}${a.endAt?" • Ends: "+escAnnouncement(a.endAt):""}</small>
          </div>
          <div class="announcement-actions">
            <button class="secondary-btn" data-ann-edit="${a.id}">Edit</button>
            <button class="danger-btn" data-ann-delete="${a.id}">Delete</button>
          </div>
        </div>`).join("")
      : "<p>No announcements published yet.</p>";

    list.querySelectorAll("[data-ann-edit]").forEach(btn=>{
      btn.onclick=()=>{
        const a=announcementsCache.find(x=>x.id===btn.dataset.annEdit);
        if(!a)return;
        const form=document.getElementById("announcementForm");
        form.querySelector("#announcementId").value=a.id;
        form.querySelector("#announcementTitle").value=a.title||"";
        form.querySelector("#announcementType").value=a.type||"notice";
        form.querySelector("#announcementMessage").value=a.message||"";
        form.querySelector("#announcementStart").value=a.startAt||"";
        form.querySelector("#announcementEnd").value=a.endAt||"";
        form.querySelector("#announcementEnabled").checked=a.enabled!==false;
      };
    });

    list.querySelectorAll("[data-ann-delete]").forEach(btn=>{
      btn.onclick=async()=>{
        if(confirm("Delete this announcement?")){
          await deleteDoc(doc(db,"announcements",btn.dataset.annDelete));
          await loadAnnouncements();
        }
      };
    });
  }catch(e){
    console.error("Announcements admin:",e);
    list.innerHTML="<p>Could not load announcements.</p>";
  }
}

async function saveAnnouncement(e){
  e.preventDefault();

  const form=document.getElementById("announcementForm");
  const id=form.querySelector("#announcementId").value.trim();
  const title=form.querySelector("#announcementTitle").value.trim();
  const type=form.querySelector("#announcementType").value || "notice";
  const message=form.querySelector("#announcementMessage").value.trim();
  const startAt=form.querySelector("#announcementStart").value || "";
  const endAt=form.querySelector("#announcementEnd").value || "";
  const enabled=Boolean(form.querySelector("#announcementEnabled").checked);

  if(!title || !message)return alert("Title and message are required.");
  if(startAt && endAt && endAt<startAt)return alert("End date/time cannot be before start date/time.");

  const data={
    title:String(title),
    type:String(type),
    message:String(message),
    startAt:String(startAt),
    endAt:String(endAt),
    enabled:Boolean(enabled),
    updatedAt:serverTimestamp()
  };

  if(id){
    await updateDoc(doc(db,"announcements",id),data);
  }else{
    data.createdAt=serverTimestamp();
    await setDoc(doc(collection(db,"announcements")),data);
  }

  form.reset();
  form.querySelector("#announcementId").value="";
  form.querySelector("#announcementEnabled").checked=true;
  await loadAnnouncements();
  showToast("Announcement published successfully.");
}

document.getElementById("announcementForm")?.addEventListener("submit",saveAnnouncement);
document.getElementById("announcementCancel")?.addEventListener("click",()=>{
  const form=document.getElementById("announcementForm");
  form.reset();
  form.querySelector("#announcementId").value="";
  form.querySelector("#announcementEnabled").checked=true;
});
loadAnnouncements();

// ── EARN SYSTEM ADMIN ────────────────────────────────────────────────────────

let partnerServers = [], withdrawals = [];
let selectedWithdrawal = null;

// ── Partner Servers ──

async function loadPartnerServers() {
  const snap = await getDocs(collection(db, "partnerServers"));
  partnerServers = snap.docs.map(d => ({id: d.id, ...d.data()}));
  renderPartnerServers();
}

function renderPartnerServers() {
  $("partnerServersList").innerHTML = partnerServers.length ? partnerServers.map(s => `
    <tr>
      <td><strong>${esc(s.name || "—")}</strong></td>
      <td>${esc(s.ip || "—")}${s.port ? ":"+esc(s.port) : ""}</td>
      <td>${esc(String(s.ratePerHour || 0))} PKR</td>
      <td>${statusPill(s.enabled ? "active" : "disabled")}</td>
      <td>
        <button class="btn btn-primary ps-edit" data-id="${esc(s.id)}">Edit</button>
        <button class="btn btn-danger ps-delete" data-id="${esc(s.id)}">Delete</button>
      </td>
    </tr>`).join("") : emptyRow(5, "No partner servers added yet.");
  document.querySelectorAll(".ps-edit").forEach(b => b.onclick = () => editPartnerServer(b.dataset.id));
  document.querySelectorAll(".ps-delete").forEach(b => b.onclick = () => deletePartnerServer(b.dataset.id));
}

function editPartnerServer(id) {
  const s = partnerServers.find(x => x.id === id);
  if (!s) return;
  $("psEditId").value = s.id;
  $("psName").value = s.name || "";
  $("psIp").value = s.ip || "";
  $("psPort").value = s.port || "";
  $("psDesc").value = s.description || "";
  $("psLogo").value = s.logo || "";
  $("psRate").value = s.ratePerHour || "";
  $("psMinHours").value = s.minHoursToEarn || "";
  $("psFirebaseEmail").value = s.firebaseEmail || "";
  $("psServerId").value = s.id || "";
  $("psEnabled").checked = s.enabled !== false;
}

async function deletePartnerServer(id) {
  if (!confirm("Delete this partner server?")) return;
  try {
    await deleteDoc(doc(db, "partnerServers", id));
    showToast("Partner server deleted.");
    loadPartnerServers();
  } catch(e) { showToast(e.message); }
}

$("savePsBtn").onclick = async () => {
  const name = $("psName").value.trim();
  const ip   = $("psIp").value.trim();
  if (!name || !ip) return showToast("Server name and IP are required.");
  const editId = $("psEditId").value.trim();
  const serverId = $("psServerId").value.trim() || crypto.randomUUID().slice(0,8);
  const data = {
    name, ip,
    port: $("psPort").value.trim(),
    description: $("psDesc").value.trim(),
    logo: $("psLogo").value.trim(),
    ratePerHour: parseFloat($("psRate").value) || 0,
    minHoursToEarn: parseFloat($("psMinHours").value) || 1,
    firebaseEmail: $("psFirebaseEmail").value.trim(),
    enabled: $("psEnabled").checked,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.uid
  };
  try {
    const docId = editId || serverId;
    await setDoc(doc(db, "partnerServers", docId), data, {merge: true});
    showToast("Partner server saved. ID: " + docId);
    $("psEditId").value = "";
    ["psName","psIp","psPort","psDesc","psLogo","psRate","psMinHours","psFirebaseEmail","psServerId"]
      .forEach(id => $(id).value = "");
    $("psEnabled").checked = true;
    loadPartnerServers();
  } catch(e) { showToast(e.message); }
};
$("clearPsBtn").onclick = () => {
  $("psEditId").value = "";
  ["psName","psIp","psPort","psDesc","psLogo","psRate","psMinHours","psFirebaseEmail","psServerId"]
    .forEach(id => $(id).value = "");
  $("psEnabled").checked = true;
};
$("refreshPartnerServers").onclick = loadPartnerServers;

// Server Accounts (maps Firebase UID → serverId)
$("saveServerAccountBtn").onclick = async () => {
  const uid = $("saUid").value.trim();
  const serverId = $("saServerId").value.trim();
  if (!uid || !serverId) return showToast("UID and Server ID are required.");
  try {
    await setDoc(doc(db, "serverAccounts", uid), {uid, serverId, active: true, createdAt: serverTimestamp()}, {merge: true});
    showToast("Server account saved.");
    $("saUid").value = "";
    $("saServerId").value = "";
  } catch(e) { showToast(e.message); }
};

// ── Withdrawals ──

async function loadWithdrawals() {
  const snap = await getDocs(query(collection(db, "withdrawalRequests"), orderBy("createdAt", "desc")));
  withdrawals = snap.docs.map(d => ({id: d.id, ...d.data()}));
  renderWithdrawals();
}

function renderWithdrawals() {
  const statusFilter = $("withdrawalStatusFilter").value;
  const list = withdrawals.filter(w => !statusFilter || w.status === statusFilter);
  $("withdrawalsList").innerHTML = list.length ? list.map(w => `
    <tr>
      <td><strong>${esc(w.ign || "—")}</strong></td>
      <td><strong>${esc(String(w.amount || 0))} PKR</strong></td>
      <td>${esc(w.paymentMethod || "—")}</td>
      <td>${statusPill(w.status || "pending")}</td>
      <td>${fmt(w.createdAt)}</td>
      <td><button class="btn btn-primary wd-view" data-id="${esc(w.id)}">View</button></td>
    </tr>`).join("") : emptyRow(6, "No withdrawal requests.");
  document.querySelectorAll(".wd-view").forEach(b => b.onclick = () => openWithdrawal(b.dataset.id));
}

function openWithdrawal(id) {
  selectedWithdrawal = withdrawals.find(x => x.id === id);
  if (!selectedWithdrawal) return;
  const w = selectedWithdrawal;
  $("withdrawalDetails").innerHTML = `<div class="detail-grid">
    <div class="detail"><small>IGN</small><strong>${esc(w.ign || "—")}</strong></div>
    <div class="detail"><small>Amount</small><strong>${esc(String(w.amount))} PKR</strong></div>
    <div class="detail"><small>Method</small><strong>${esc(w.paymentMethod || "—")}</strong></div>
    <div class="detail"><small>Account</small><strong>${esc(w.accountNumber || "—")}</strong></div>
    <div class="detail"><small>Status</small><strong>${esc(w.status || "pending")}</strong></div>
    <div class="detail"><small>Requested</small><strong>${esc(fmt(w.createdAt))}</strong></div>
    ${w.playerNote ? `<div class="detail full"><small>Player Note</small><strong>${esc(w.playerNote)}</strong></div>` : ""}
  </div>`;
  $("withdrawalAdminNote").value = w.adminNote || "";
  openModal("withdrawalModal");
}

$("payWithdrawalBtn").onclick = async () => {
  if (!selectedWithdrawal) return;
  if (!confirm(`Mark PKR ${selectedWithdrawal.amount} as PAID to ${selectedWithdrawal.ign}?`)) return;
  try {
    await updateDoc(doc(db, "withdrawalRequests", selectedWithdrawal.id), {
      status: "paid",
      adminNote: $("withdrawalAdminNote").value.trim(),
      paidBy: currentUser.uid,
      paidAt: serverTimestamp()
    });
    const walletRef = doc(db, "wallets", selectedWithdrawal.uid);
    const walletSnap = await getDoc(walletRef);
    const prev = walletSnap.exists() ? (walletSnap.data().totalPaidOut || 0) : 0;
    await setDoc(walletRef, {totalPaidOut: prev + Number(selectedWithdrawal.amount), uid: selectedWithdrawal.uid}, {merge: true});
    showToast("Marked as paid. Wallet updated.");
    closeModal("withdrawalModal");
    loadWithdrawals();
  } catch(e) { showToast(e.message); }
};

$("rejectWithdrawalBtn").onclick = async () => {
  if (!selectedWithdrawal) return;
  try {
    await updateDoc(doc(db, "withdrawalRequests", selectedWithdrawal.id), {
      status: "rejected",
      adminNote: $("withdrawalAdminNote").value.trim(),
      rejectedBy: currentUser.uid,
      rejectedAt: serverTimestamp()
    });
    showToast("Withdrawal rejected.");
    closeModal("withdrawalModal");
    loadWithdrawals();
  } catch(e) { showToast(e.message); }
};

$("refreshWithdrawals").onclick = loadWithdrawals;
$("withdrawalStatusFilter").addEventListener("input", renderWithdrawals);

// ── Earn Settings ──

async function loadEarnSettings() {
  const snap = await getDoc(doc(db, "earnSettings", "global"));
  const s = snap.exists() ? snap.data() : {};
  $("earnCurrency").value = s.currency || "PKR";
  $("earnMinWithdraw").value = s.minWithdraw || 100;
  $("earnMaxWeekly").value = s.maxWeekly || 5000;
  $("earnNotice").value = s.notice || "";
  $("earnEnabled").checked = s.enabled !== false;
}

$("saveEarnSettings").onclick = async () => {
  try {
    await setDoc(doc(db, "earnSettings", "global"), {
      currency: $("earnCurrency").value.trim() || "PKR",
      minWithdraw: parseFloat($("earnMinWithdraw").value) || 100,
      maxWeekly: parseFloat($("earnMaxWeekly").value) || 5000,
      notice: $("earnNotice").value.trim(),
      enabled: $("earnEnabled").checked,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    });
    showToast("Earn settings saved.");
  } catch(e) { showToast(e.message); }
};

document.querySelector('[data-close="withdrawalModal"]')?.addEventListener("click", () => closeModal("withdrawalModal"));

function loadEarnAdmin() {
  loadPartnerServers();
  loadWithdrawals();
  loadEarnSettings();
}

// ── Whitelist Manager ──────────────────────────────────────────────────────

let allApprovedPlayers = [];

async function loadWhitelist() {
  // Pull from both approvedPlayers collection AND applications with status=approved
  // so we never miss anyone approved before approvedPlayers was created
  const [apSnap, appSnap] = await Promise.all([
    getDocs(collection(db, "approvedPlayers")),
    getDocs(query(collection(db, "applications"), where("status", "==", "approved")))
  ]);

  const map = {};

  // Seed from applications first (has all historical data)
  appSnap.docs.forEach(d => {
    const data = d.data();
    const ign = data.ign?.trim();
    if (!ign) return;
    const key = ign.toLowerCase();
    if (!map[key]) {
      map[key] = { id: key, ign, approvedAt: data.approvedAt || data.createdAt || null };
    }
  });

  // Overlay with approvedPlayers (may have more precise approvedAt)
  apSnap.docs.forEach(d => {
    const data = d.data();
    const ign = data.ign?.trim();
    if (!ign) return;
    const key = ign.toLowerCase();
    map[key] = { id: key, ign, approvedAt: data.approvedAt || map[key]?.approvedAt || null };
  });

  allApprovedPlayers = Object.values(map)
    .sort((a, b) => String(a.ign).localeCompare(String(b.ign)));
  renderWhitelist();
}

async function syncApprovedToWhitelist() {
  const btn = $("syncWhitelistBtn");
  btn.disabled = true;
  btn.textContent = "Syncing...";
  try {
    const appSnap = await getDocs(
      query(collection(db, "applications"), where("status", "==", "approved"))
    );
    let count = 0;
    const writes = [];
    const seen = new Set();
    appSnap.docs.forEach(d => {
      const data = d.data();
      const ign = data.ign?.trim();
      if (!ign) return;
      const key = ign.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      writes.push(setDoc(doc(db, "approvedPlayers", key), {
        ign,
        approvedAt: data.approvedAt || data.createdAt || new Date(),
        approvedBy: data.reviewedBy || "sync",
        syncedAt: new Date()
      }, { merge: true }));
      count++;
    });
    await Promise.all(writes);
    showToast(`Synced ${count} unique approved players to whitelist.`);
    await loadWhitelist();
  } catch(e) {
    showToast("Sync error: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sync from Applications";
  }
}

function renderWhitelist() {
  const q = ($("whitelistSearch")?.value || "").toLowerCase();
  const list = allApprovedPlayers.filter(p =>
    !q || String(p.ign || "").toLowerCase().includes(q)
  );

  $("whitelistTotal").textContent = allApprovedPlayers.length;
  $("whitelistCount").textContent = allApprovedPlayers.length + " approved player(s)";

  const cmds = allApprovedPlayers.map(p => `whitelist add ${p.ign}`).join("\n");
  $("whitelistCmdPreview").value = cmds;

  $("whitelistList").innerHTML = list.length ? list.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(p.ign)}</strong></td>
      <td style="font-size:.8rem;color:var(--muted)">${p.approvedAt?.toDate ? p.approvedAt.toDate().toLocaleDateString() : "—"}</td>
      <td><button class="btn btn-small btn-danger" onclick="removeFromWhitelist('${esc(p.id)}','${esc(p.ign)}')">Remove</button></td>
    </tr>`).join("") :
    `<tr><td colspan="4" class="empty">No approved players found.</td></tr>`;
}

window.removeFromWhitelist = async (id, ign) => {
  if (!confirm(`Remove ${ign} from approved players list?`)) return;
  try {
    await deleteDoc(doc(db, "approvedPlayers", id));
    allApprovedPlayers = allApprovedPlayers.filter(p => p.id !== id);
    renderWhitelist();
    showToast(`${ign} removed.`);
  } catch(e) { showToast(e.message); }
};

$("copyWhitelistCmdsBtn").onclick = () => {
  const cmds = $("whitelistCmdPreview").value;
  if (!cmds) { showToast("No approved players found."); return; }
  navigator.clipboard.writeText(cmds).then(() =>
    showToast("Commands copied! Paste into server console.")
  ).catch(() => {
    $("whitelistCmdPreview").select();
    document.execCommand("copy");
    showToast("Commands copied!");
  });
};

$("downloadWhitelistBtn").onclick = () => {
  if (!allApprovedPlayers.length) { showToast("No approved players."); return; }
  const json = JSON.stringify(
    allApprovedPlayers.map(p => ({ uuid: "", name: p.ign })),
    null, 2
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = "whitelist.json";
  a.click();
  showToast("whitelist.json downloaded. Note: UUIDs are blank — server will fill them when players join.");
};

$("refreshWhitelist").onclick = loadWhitelist;
$("syncWhitelistBtn").onclick = syncApprovedToWhitelist;
$("whitelistSearch").addEventListener("input", renderWhitelist);
