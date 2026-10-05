document.getElementById("year").textContent = new Date().getFullYear();

const QUESTIONS = [
  {
    text: "You just joined FireCraft SMP. First thing you do?",
    options: [
      { icon: "⛏️", text: "Head straight to a cave", sub: "Gotta get those ores ASAP", power: "miner" },
      { icon: "⚔️", text: "Challenge the nearest player", sub: "PvP on sight, no mercy", power: "pvper" },
      { icon: "🏘️", text: "Find a village to trade", sub: "Economy > everything", power: "trader" },
      { icon: "🪽", text: "Climb the tallest mountain", sub: "Scout the whole map first", power: "flyer" }
    ]
  },
  {
    text: "Your base is getting raided. What do you do?",
    options: [
      { icon: "👻", text: "Go invisible and wait", sub: "They can't raid what they can't see", power: "hider" },
      { icon: "⚔️", text: "Rush out and fight back", sub: "Offense is the best defense", power: "pvper" },
      { icon: "🍖", text: "Stand and regen through it", sub: "My healing outruns their damage", power: "foody" },
      { icon: "⛏️", text: "Escape through a secret tunnel", sub: "Always have an exit plan", power: "miner" }
    ]
  },
  {
    text: "Pick your ideal late-game goal:",
    options: [
      { icon: "💎", text: "Max diamond gear first", sub: "Resources win every game", power: "miner" },
      { icon: "🏆", text: "Top the kill leaderboard", sub: "#1 PvPer on the server", power: "pvper" },
      { icon: "🛒", text: "Build the richest server shop", sub: "Control the economy", power: "trader" },
      { icon: "🌍", text: "Explore every biome", sub: "The world is yours to discover", power: "flyer" }
    ]
  },
  {
    text: "You're low on health during a fight. Your move?",
    options: [
      { icon: "👻", text: "Vanish before they notice", sub: "Disappear like a ghost", power: "hider" },
      { icon: "🍖", text: "Eat and regen back to full", sub: "Full saturation, never worried", power: "foody" },
      { icon: "⚔️", text: "Go harder — pressure them", sub: "Best defense is more offense", power: "pvper" },
      { icon: "💰", text: "Drop a gap apple from your shop stash", sub: "Money spent on prep pays off", power: "trader" }
    ]
  },
  {
    text: "Your squad describes you as...",
    options: [
      { icon: "🔍", text: '"Always knows where the diamonds are"', sub: "Human ore detector", power: "miner" },
      { icon: "⚔️", text: '"Never, ever backs down"', sub: "The fearless one", power: "pvper" },
      { icon: "👁️", text: '"We have no idea where they are"', sub: "The mysterious one", power: "hider" },
      { icon: "🪽", text: '"Appears out of nowhere from above"', sub: "Sky ambush specialist", power: "flyer" }
    ]
  }
];

const POWERS = {
  miner: {
    icon: "⛏️",
    name: "Miner",
    tagline: "The earth bends to your will. Darkness holds no fear for you — only opportunity.",
    abilities: [
      "Haste II — mine at superhuman speed",
      "Night Vision — see perfectly underground",
      "30 sec duration • 2 min cooldown"
    ],
    share: "I got MINER ⛏️ on the FireCraft SMP Power Quiz! The earth fears me. Find your power 👉 firecraft.fun/quiz.html"
  },
  pvper: {
    icon: "⚔️",
    name: "PvPer",
    tagline: "Born for combat. Every fight is a stage and you are the main event.",
    abilities: [
      "Strength II — deal 2× melee damage",
      "Resistance I — take significantly less damage",
      "20 sec duration • 2 min cooldown"
    ],
    share: "I got PVPER ⚔️ on the FireCraft SMP Power Quiz! Born to fight, built to win. Find your power 👉 firecraft.fun/quiz.html"
  },
  trader: {
    icon: "💰",
    name: "Trader",
    tagline: "The economy flows through you. Every village bows, every deal is yours to make.",
    abilities: [
      "Hero of the Village X — infinite trade discounts",
      "Villagers worship you on sight",
      "30 sec duration • 5 min cooldown"
    ],
    share: "I got TRADER 💰 on the FireCraft SMP Power Quiz! The economy is mine. Find your power 👉 firecraft.fun/quiz.html"
  },
  flyer: {
    icon: "🪽",
    name: "Flyer",
    tagline: "The sky is your domain. No wall can cage you — you were born to soar.",
    abilities: [
      "Jump Boost X — leap to insane heights",
      "Slow Falling X — glide back down safely",
      "30 sec duration • 3 min cooldown"
    ],
    share: "I got FLYER 🪽 on the FireCraft SMP Power Quiz! The sky is mine. Find your power 👉 firecraft.fun/quiz.html"
  },
  foody: {
    icon: "🍖",
    name: "Foody",
    tagline: "You never stop healing. You're practically unkillable — a tank in human form.",
    abilities: [
      "Saturation X — never hungry again",
      "Regeneration II — heal at insane speed",
      "30 sec duration • 1 min cooldown"
    ],
    share: "I got FOODY 🍖 on the FireCraft SMP Power Quiz! Can't kill what keeps healing. Find your power 👉 firecraft.fun/quiz.html"
  },
  hider: {
    icon: "👁️",
    name: "Hider",
    tagline: "You exist only when you choose to. Ghost of the server — seen by none, feared by all.",
    abilities: [
      "Invisibility X — completely invisible",
      "Night Vision II — perfect sight in the dark",
      "60 sec duration • 15 min cooldown"
    ],
    share: "I got HIDER 👁️ on the FireCraft SMP Power Quiz! You can't find me. Find your power 👉 firecraft.fun/quiz.html"
  }
};

let scores = { miner: 0, pvper: 0, trader: 0, flyer: 0, foody: 0, hider: 0 };
let current = 0;

const $id = id => document.getElementById(id);

function showCard(id) {
  ["introCard", "quizCard", "resultCard"].forEach(c => $id(c).classList.add("hidden"));
  $id(id).classList.remove("hidden");
}

function renderQuestion() {
  const q = QUESTIONS[current];
  const fill = ((current) / QUESTIONS.length) * 100;
  $id("progressFill").style.width = fill + "%";
  $id("progressLabel").textContent = `${current + 1} / ${QUESTIONS.length}`;

  $id("questionArea").innerHTML = `
    <p class="question-eyebrow">QUESTION ${current + 1} OF ${QUESTIONS.length}</p>
    <h2 class="question-text">${q.text}</h2>
    <div class="options-grid">
      ${q.options.map((o, i) => `
        <button class="option-btn" data-idx="${i}">
          <span class="opt-icon">${o.icon}</span>
          <span class="opt-text">${o.text}</span>
          <span class="opt-sub">${o.sub}</span>
        </button>
      `).join("")}
    </div>
  `;

  $id("questionArea").querySelectorAll(".option-btn").forEach(btn => {
    btn.addEventListener("click", () => pickOption(btn, q.options[+btn.dataset.idx].power));
  });
}

function pickOption(btn, power) {
  $id("questionArea").querySelectorAll(".option-btn").forEach(b => b.disabled = true);
  btn.classList.add("selected");
  scores[power]++;

  setTimeout(() => {
    current++;
    if (current < QUESTIONS.length) {
      renderQuestion();
    } else {
      showResult();
    }
  }, 420);
}

function showResult() {
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const p = POWERS[winner];

  $id("resultIcon").textContent = p.icon;
  $id("resultName").textContent = p.name;
  $id("resultTagline").textContent = p.tagline;
  $id("resultAbilities").innerHTML = p.abilities
    .map(a => `<div class="result-ability">${a}</div>`).join("");

  $id("progressFill").style.width = "100%";
  $id("progressLabel").textContent = "Complete!";

  $id("shareBtn").onclick = () => {
    navigator.clipboard.writeText(p.share).then(() => {
      $id("shareCopied").classList.remove("hidden");
      setTimeout(() => $id("shareCopied").classList.add("hidden"), 2500);
    }).catch(() => {
      prompt("Copy this:", p.share);
    });
  };

  $id("retryBtn").onclick = resetQuiz;

  showCard("resultCard");
}

function resetQuiz() {
  scores = { miner: 0, pvper: 0, trader: 0, flyer: 0, foody: 0, hider: 0 };
  current = 0;
  showCard("quizCard");
  renderQuestion();
}

$id("startBtn").addEventListener("click", () => {
  showCard("quizCard");
  renderQuestion();
});
