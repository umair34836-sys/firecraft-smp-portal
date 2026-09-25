import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
$("year").textContent = new Date().getFullYear();
$("menuBtn").onclick = () => $("nav").classList.toggle("open");

document.querySelectorAll("nav a").forEach(a => a.onclick = () => $("nav").classList.remove("open"));

const POWERS = [
  {id:"miner", name:"MINER POWER", icon:"⛏️", tagline:"The Resource Master", abilities:["Haste II • 30 seconds","Night Vision • 30 seconds","Cooldown • 2 minutes"]},
  {id:"pvper", name:"PVPER POWER", icon:"⚔️", tagline:"The Warrior", abilities:["Strength II • 20 seconds","Resistance I • 20 seconds","Cooldown • 2 minutes"]},
  {id:"trader", name:"TRADER POWER", icon:"💰", tagline:"The Merchant", abilities:["Hero of the Village X • 30 seconds","Cooldown • 5 minutes"]},
  {id:"flyer", name:"FLYER POWER", icon:"🪽", tagline:"The Skyborn", abilities:["Jump Boost X • 30 seconds","Slow Falling X • 30 seconds","Cooldown • 3 minutes"]},
  {id:"foody", name:"FOODY POWER", icon:"🍖", tagline:"The Survivor", abilities:["Saturation X • 30 seconds","Regeneration II • 30 seconds","Cooldown • 1 minute"]},
  {id:"hider", name:"HIDER POWER", icon:"👁️", tagline:"The Shadow", abilities:["Invisibility X • 60 seconds","Night Vision II • 60 seconds","Cooldown • 15 minutes"]}
];

let currentUser = null;
let spinning = false;

function escapeHtml(value=""){
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
}

function showOnly(id){
  ["loginCard","loadingCard","spinCard","resultCard"].forEach(x => $(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function renderResult(power){
  $("resultIcon").textContent = power.icon;
  $("resultName").textContent = power.name;
  $("resultTagline").textContent = power.tagline;
  $("resultAbilities").innerHTML = power.abilities.map(x => `<span class="ability">${escapeHtml(x)}</span>`).join("");
  showOnly("resultCard");
}

function powerById(id){ return POWERS.find(x => x.id === id) || null; }

async function loadExistingPower(user){
  const snap = await getDoc(doc(db,"powerAssignments",user.uid));
  if(!snap.exists()) return null;
  return powerById(snap.data().powerId);
}

function secureRandomIndex(){
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % POWERS.length;
}

async function spinForPower(){
  if(!currentUser || spinning) return;
  spinning = true;
  const btn = $("spinBtn");
  btn.disabled = true;
  $("spinStatus").textContent = "Spinning...";

  const index = secureRandomIndex();
  const selected = POWERS[index];
  const turns = 6 + Math.floor(Math.random() * 3);
  const segment = 360 / POWERS.length;
  const target = 360 - (index * segment + segment / 2);
  $("powerWheel").style.transform = `rotate(${turns * 360 + target}deg)`;

  await new Promise(resolve => setTimeout(resolve, 4700));

  try{
    let assignedId = null;
    await runTransaction(db, async tx => {
      const ref = doc(db,"powerAssignments",currentUser.uid);
      const existing = await tx.get(ref);
      if(existing.exists()){
        assignedId = existing.data().powerId;
        return;
      }
      tx.set(ref,{
        uid: currentUser.uid,
        powerId: selected.id,
        ign: currentUser.displayName || "",
        assignedAt: serverTimestamp()
      });
    });

    if(assignedId){
      const existing = powerById(assignedId);
      if(existing) renderResult(existing);
      return;
    }

    renderResult(selected);
  }catch(error){
    console.error("Power assignment failed:",error);
    btn.disabled = false;
    spinning = false;
    $("spinStatus").textContent = "Could not save your Power. Please try again.";
  }
}

$("spinBtn").onclick = spinForPower;

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if(!user){
    showOnly("loginCard");
    return;
  }

  showOnly("loadingCard");
  try{
    const existing = await loadExistingPower(user);
    if(existing){
      renderResult(existing);
      return;
    }
    showOnly("spinCard");
  }catch(error){
    console.error("Power check failed:",error);
    $("spinStatus").textContent = "Could not check your Power. Refresh the page and try again.";
    showOnly("spinCard");
  }
});
