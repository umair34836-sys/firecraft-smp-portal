import { firebaseConfig, ADMIN_UID } from "../js/firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc,
  setDoc, updateDoc, deleteDoc, getDocs, where, limit
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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
  btn.addEventListener("click", () => navigate(btn.dataset.section));
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
  }catch(e){showToast(e.message);}
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
  $("announcementEnabled").checked = !!s.announcementEnabled;
}
$("saveWebsiteSettings").onclick = async () => {
  try{
    await setDoc(doc(db,"settings","website"),{
      announcementText:$("announcementText").value.trim(),
      announcementEnabled:$("announcementEnabled").checked,
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
