const form = document.getElementById("waitlist-form");
const statusEl = document.getElementById("waitlist-status");
const STORAGE_KEY = "kickfeed.waitlist.emails";

function showStatus(message, isError) {
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = form.elements.namedItem("email");
  const email = String(input?.value || "").trim().toLowerCase();
  if (!email || !input.checkValidity()) {
    showStatus("Enter a valid email to join the stub waitlist.", true);
    input?.focus();
    return;
  }

  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    saved = [];
  }
  if (!saved.includes(email)) {
    saved.push(email);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }

  form.reset();
  showStatus(
    "You’re on the KickFeed waitlist on this browser. This form is a demo stub — no email is sent and there is no backend yet.",
    false,
  );
});
