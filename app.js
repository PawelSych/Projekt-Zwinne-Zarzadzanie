/* app.js
   Zakres (Osoba 1 - UI): minimalna obsługa interfejsu (modal) oraz zaczepy pod logikę.
   Zakres (Osoba 2 - Core): stan aplikacji, render, dodawanie/edycja/przenoszenie zadań.
*/

(function () {
  const modal = document.getElementById("taskModal");
  const form = document.getElementById("taskForm");

  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    const titleInput = document.getElementById("taskTitle");
    if (titleInput) titleInput.focus();
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const action = el.getAttribute("data-action");
    if (action === "open-modal") openModal();
    if (action === "close-modal") closeModal();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
  });

  console.log("UI skeleton ready (modal hooks attached).");
})();
