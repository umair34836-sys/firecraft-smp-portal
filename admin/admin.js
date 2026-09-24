import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  firebaseConfig,
  ADMIN_UID
} from "../js/firebase-config.js";


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


const $ = id => document.getElementById(id);


let applications = [];
let tickets = [];

let selectedApplication = null;
let selectedTicket = null;

let unsubscribeApplications = null;
let unsubscribeTickets = null;


/* ----------------------------- */
/* BASIC HELPERS */
/* ----------------------------- */

function escapeHtml(value = "") {

  return String(value).replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );

}


function showToast(message) {

  const toast = $("toast");

  toast.textContent = message;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);

}


function formatDate(timestamp) {

  if (!timestamp) {
    return "Just now";
  }

  try {

    const date = timestamp.toDate();

    return date.toLocaleString();

  } catch {

    return "Unknown date";

  }

}


function statusBadge(status) {

  const value = String(status || "pending").toLowerCase();

  let className = "badge-pending";

  if (value === "approved") {
    className = "badge-approved";
  }

  if (value === "rejected") {
    className = "badge-rejected";
  }

  if (value === "open") {
    className = "badge-open";
  }

  if (value === "closed") {
    className = "badge-closed";
  }

  return `
    <span class="badge ${className}">
      ${escapeHtml(value)}
    </span>
  `;

}


/* ----------------------------- */
/* AUTHENTICATION */
/* ----------------------------- */

onAuthStateChanged(auth, async user => {

  if (!user) {

    window.location.href = "../";

    return;

  }


  $("adminName").textContent = "Checking access...";


  if (user.uid !== ADMIN_UID) {

    $("loadingPanel").classList.add("hidden");

    $("deniedPanel").classList.remove("hidden");

    $("adminName").textContent = "Access denied";

    return;

  }


  $("loadingPanel").classList.add("hidden");

  $("adminContent").classList.remove("hidden");

  $("adminName").textContent =
    user.email || "Administrator";


  startApplicationsListener();

  startTicketsListener();

});


/* ----------------------------- */
/* LOGOUT */
/* ----------------------------- */

$("logoutBtn").onclick = async () => {

  try {

    await signOut(auth);

    window.location.href = "../";

  } catch (error) {

    showToast("Logout failed.");

  }

};


/* ----------------------------- */
/* BACK HOME */
/* ----------------------------- */

$("backHomeBtn").onclick = () => {

  window.location.href = "../";

};


/* ----------------------------- */
/* APPLICATIONS */
/* ----------------------------- */

function startApplicationsListener() {

  unsubscribeApplications?.();


  const q = query(
    collection(db, "applications"),
    orderBy("createdAt", "desc")
  );


  unsubscribeApplications = onSnapshot(
    q,

    snapshot => {

      applications = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderApplications();

      updateStatistics();

    },

    error => {

      console.error("Applications listener:", error);

      $("applicationsList").innerHTML = `
        <div class="empty-state">
          Could not load applications.
          <br><br>
          ${escapeHtml(error.message)}
        </div>
      `;

    }
  );

}


function renderApplications() {

  const container = $("applicationsList");


  if (!applications.length) {

    container.innerHTML = `
      <div class="empty-state">
        No whitelist applications yet.
      </div>
    `;

    return;

  }


  container.innerHTML = applications.map(application => {

    const status =
      application.status || "pending";


    return `
      <article class="item">

        <div class="item-top">

          <div>

            <div class="item-title">
              ${escapeHtml(application.ign || "Unknown")}
            </div>

            <div class="item-meta">
              Submitted:
              ${escapeHtml(formatDate(application.createdAt))}
            </div>

          </div>

          ${statusBadge(status)}

        </div>


        <div class="item-preview">
          ${escapeHtml(application.why || "No reason provided.")}
        </div>


        <div class="item-actions">

          <button
            class="small-btn"
            data-view-application="${application.id}">
            View Application
          </button>

          ${
            status !== "approved"
              ? `
                <button
                  class="approve-btn"
                  data-approve-application="${application.id}">
                  Approve
                </button>
              `
              : ""
          }

          ${
            status !== "rejected"
              ? `
                <button
                  class="reject-btn"
                  data-reject-application="${application.id}">
                  Reject
                </button>
              `
              : ""
          }

        </div>

      </article>
    `;

  }).join("");


  document
    .querySelectorAll("[data-view-application]")
    .forEach(button => {

      button.onclick = () => {

        openApplication(
          button.dataset.viewApplication
        );

      };

    });


  document
    .querySelectorAll("[data-approve-application]")
    .forEach(button => {

      button.onclick = () => {

        changeApplicationStatus(
          button.dataset.approveApplication,
          "approved"
        );

      };

    });


  document
    .querySelectorAll("[data-reject-application]")
    .forEach(button => {

      button.onclick = () => {

        changeApplicationStatus(
          button.dataset.rejectApplication,
          "rejected"
        );

      };

    });

}


/* ----------------------------- */
/* APPLICATION MODAL */
/* ----------------------------- */

function openApplication(id) {

  const application =
    applications.find(item => item.id === id);


  if (!application) {
    return;
  }


  selectedApplication = application;


  $("modalApplicationTitle").textContent =
    `${application.ign || "Unknown"} — Application`;


  $("applicationDetails").innerHTML = `

    <div class="detail-row">
      <strong>IGN</strong>
      <span>${escapeHtml(application.ign)}</span>
    </div>

    <div class="detail-row">
      <strong>Age</strong>
      <span>${escapeHtml(application.age)}</span>
    </div>

    <div class="detail-row">
      <strong>Country</strong>
      <span>${escapeHtml(application.country)}</span>
    </div>

    <div class="detail-row">
      <strong>Experience</strong>
      <span>${escapeHtml(application.experience)}</span>
    </div>

    <div class="detail-row">
      <strong>Why do you want to join?</strong>
      <span>${escapeHtml(application.why)}</span>
    </div>

    <div class="detail-row">
      <strong>What can you contribute?</strong>
      <span>${escapeHtml(application.contribution)}</span>
    </div>

    <div class="detail-row">
      <strong>Status</strong>
      <span>${statusBadge(application.status)}</span>
    </div>

    <div class="detail-row">
      <strong>Submitted</strong>
      <span>${escapeHtml(formatDate(application.createdAt))}</span>
    </div>

  `;


  $("applicationModal").classList.remove("hidden");

}


async function changeApplicationStatus(id, status) {

  try {

    await updateDoc(
      doc(db, "applications", id),
      {
        status: status
      }
    );

    showToast(
      `Application ${status}.`
    );

  } catch (error) {

    console.error(error);

    showToast(
      "Could not update application."
    );

  }

}


/* ----------------------------- */
/* APPLICATION MODAL BUTTONS */
/* ----------------------------- */

$("approveApplicationBtn").onclick = async () => {

  if (!selectedApplication) {
    return;
  }

  await changeApplicationStatus(
    selectedApplication.id,
    "approved"
  );

  closeModal("applicationModal");

};


$("rejectApplicationBtn").onclick = async () => {

  if (!selectedApplication) {
    return;
  }

  await changeApplicationStatus(
    selectedApplication.id,
    "rejected"
  );

  closeModal("applicationModal");

};


$("pendingApplicationBtn").onclick = async () => {

  if (!selectedApplication) {
    return;
  }

  await changeApplicationStatus(
    selectedApplication.id,
    "pending"
  );

  closeModal("applicationModal");

};


/* ----------------------------- */
/* TICKETS */
/* ----------------------------- */

function startTicketsListener() {

  unsubscribeTickets?.();


  const q = query(
    collection(db, "tickets"),
    orderBy("createdAt", "desc")
  );


  unsubscribeTickets = onSnapshot(
    q,

    snapshot => {

      tickets = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderTickets();

      updateStatistics();

    },

    error => {

      console.error("Tickets listener:", error);

      $("ticketsList").innerHTML = `
        <div class="empty-state">
          Could not load tickets.
          <br><br>
          ${escapeHtml(error.message)}
        </div>
      `;

    }
  );

}


function renderTickets() {

  const container = $("ticketsList");


  if (!tickets.length) {

    container.innerHTML = `
      <div class="empty-state">
        No support tickets yet.
      </div>
    `;

    return;

  }


  container.innerHTML = tickets.map(ticket => {

    return `
      <article class="item">

        <div class="item-top">

          <div>

            <div class="item-title">
              ${escapeHtml(ticket.subject || "No subject")}
            </div>

            <div class="item-meta">
              ${escapeHtml(ticket.ign || "Unknown IGN")}
              ·
              ${escapeHtml(ticket.category || "General")}
            </div>

          </div>

          ${statusBadge(ticket.status || "open")}

        </div>


        <div class="item-preview">
          ${escapeHtml(ticket.message || "")}
        </div>


        <div class="item-actions">

          <button
            class="small-btn"
            data-view-ticket="${ticket.id}">
            View Ticket
          </button>

          ${
            ticket.status !== "closed"
              ? `
                <button
                  class="reject-btn"
                  data-close-ticket="${ticket.id}">
                  Close Ticket
                </button>
              `
              : ""
          }

        </div>

      </article>
    `;

  }).join("");


  document
    .querySelectorAll("[data-view-ticket]")
    .forEach(button => {

      button.onclick = () => {

        openTicket(
          button.dataset.viewTicket
        );

      };

    });


  document
    .querySelectorAll("[data-close-ticket]")
    .forEach(button => {

      button.onclick = () => {

        closeTicket(
          button.dataset.closeTicket
        );

      };

    });

}


/* ----------------------------- */
/* TICKET MODAL */
/* ----------------------------- */

function openTicket(id) {

  const ticket =
    tickets.find(item => item.id === id);


  if (!ticket) {
    return;
  }


  selectedTicket = ticket;


  $("modalTicketTitle").textContent =
    ticket.subject || "Support Ticket";


  $("ticketDetails").innerHTML = `

    <div class="detail-row">
      <strong>Player</strong>
      <span>${escapeHtml(ticket.ign)}</span>
    </div>

    <div class="detail-row">
      <strong>Category</strong>
      <span>${escapeHtml(ticket.category)}</span>
    </div>

    <div class="detail-row">
      <strong>Status</strong>
      <span>${statusBadge(ticket.status)}</span>
    </div>

    <div class="detail-row">
      <strong>Message</strong>
      <span>${escapeHtml(ticket.message)}</span>
    </div>

    <div class="detail-row">
      <strong>Created</strong>
      <span>${escapeHtml(formatDate(ticket.createdAt))}</span>
    </div>

  `;


  $("staffReply").value =
    ticket.staffReply || "";


  $("ticketModal").classList.remove("hidden");

}


$("replyTicketBtn").onclick = async () => {

  if (!selectedTicket) {
    return;
  }


  const reply =
    $("staffReply").value.trim();


  try {

    await updateDoc(
      doc(db, "tickets", selectedTicket.id),
      {
        staffReply: reply
      }
    );


    showToast("Staff reply saved.");

    closeModal("ticketModal");

  } catch (error) {

    console.error(error);

    showToast(
      "Could not save staff reply."
    );

  }

};


async function closeTicket(id) {

  try {

    await updateDoc(
      doc(db, "tickets", id),
      {
        status: "closed"
      }
    );


    showToast("Ticket closed.");

  } catch (error) {

    console.error(error);

    showToast(
      "Could not close ticket."
    );

  }

}


$("closeTicketBtn").onclick = async () => {

  if (!selectedTicket) {
    return;
  }


  await closeTicket(
    selectedTicket.id
  );

  closeModal("ticketModal");

};


/* ----------------------------- */
/* STATISTICS */
/* ----------------------------- */

function updateStatistics() {

  const totalApplications =
    applications.length;


  const pendingApplications =
    applications.filter(
      item => item.status === "pending"
    ).length;


  const totalTickets =
    tickets.length;


  const openTickets =
    tickets.filter(
      item => item.status === "open"
    ).length;


  $("totalApplications").textContent =
    totalApplications;


  $("pendingApplications").textContent =
    pendingApplications;


  $("totalTickets").textContent =
    totalTickets;


  $("openTickets").textContent =
    openTickets;

}


/* ----------------------------- */
/* REFRESH */
/* ----------------------------- */

$("refreshApplications").onclick = () => {

  startApplicationsListener();

  showToast("Applications refreshed.");

};


$("refreshTickets").onclick = () => {

  startTicketsListener();

  showToast("Tickets refreshed.");

};


/* ----------------------------- */
/* MODALS */
/* ----------------------------- */

function closeModal(id) {

  $(id).classList.add("hidden");

}


document
  .querySelectorAll("[data-close]")
  .forEach(button => {

    button.onclick = () => {

      closeModal(
        button.dataset.close
      );

    };

  });


document
  .querySelectorAll(".modal")
  .forEach(modal => {

    modal.addEventListener("click", event => {

      if (event.target === modal) {

        closeModal(modal.id);

      }

    });

  });


document.addEventListener("keydown", event => {

  if (event.key !== "Escape") {
    return;
  }


  document
    .querySelectorAll(".modal:not(.hidden)")
    .forEach(modal => {

      closeModal(modal.id);

    });

});