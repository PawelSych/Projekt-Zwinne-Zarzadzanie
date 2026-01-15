/* app.js
   Zakres (Osoba 1 - UI): minimalna obsługa interfejsu (modal) oraz zaczepy pod logikę.
   Zakres (Osoba 2 - Core): stan aplikacji, render, dodawanie/edycja/przenoszenie zadań.
*/

(function () {
  //  UI (Osoba 1) - było, zostaje 
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

  //  Core (Osoba 2) 

  /** @typedef {"todo"|"inprogress"|"done"} TaskStatus */
  /** @typedef {{id:string,title:string,description:string,status:TaskStatus,createdAt:number,updatedAt:number}} Task */

  /** @type {{tasks: Task[]}} */
  const state = {
    tasks: [],
  };

  const els = {
    colTodo: document.getElementById("colTodo"),
    colInprogress: document.getElementById("colInprogress"),
    colDone: document.getElementById("colDone"),
    countTodo: document.getElementById("countTodo"),
    countInprogress: document.getElementById("countInprogress"),
    countDone: document.getElementById("countDone"),
    tpl: document.getElementById("taskCardTemplate"),
    taskId: document.getElementById("taskId"),
    taskTitle: document.getElementById("taskTitle"),
    taskDesc: document.getElementById("taskDesc"),
    taskStatus: document.getElementById("taskStatus"),
  };

  /** Mapowanie status -> kolumna */
  const statusToColumnEl = {
    todo: els.colTodo,
    inprogress: els.colInprogress,
    done: els.colDone,
  };

  /** Kolejność statusów dla przesuwania */
  const statusOrder = /** @type {TaskStatus[]} */ (["todo", "inprogress", "done"]);

  function makeId() {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** @param {TaskStatus} status */
  function clampMove(status, dir) {
    const idx = statusOrder.indexOf(status);
    const nextIdx = dir === "left" ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= statusOrder.length) return status;
    return statusOrder[nextIdx];
  }

  /** @param {string} id */
  function findTask(id) {
    return state.tasks.find((t) => t.id === id) || null;
  }

  function updateCounts() {
    const cTodo = state.tasks.filter((t) => t.status === "todo").length;
    const cIn = state.tasks.filter((t) => t.status === "inprogress").length;
    const cDone = state.tasks.filter((t) => t.status === "done").length;

    if (els.countTodo) els.countTodo.textContent = String(cTodo);
    if (els.countInprogress) els.countInprogress.textContent = String(cIn);
    if (els.countDone) els.countDone.textContent = String(cDone);
  }

  /** @param {Task} task */
  function buildCard(task) {
    const node = els.tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;

    const titleEl = node.querySelector('[data-field="title"]');
    const descEl = node.querySelector('[data-field="description"]');

    if (titleEl) titleEl.textContent = task.title;
    if (descEl) {
      const hasDesc = (task.description || "").trim().length > 0;
      descEl.textContent = task.description || "";
      descEl.style.display = hasDesc ? "" : "none";
    }

    // Zablokuj przesuwanie na brzegach
    const btnLeft = node.querySelector('[data-action="move-left"]');
    const btnRight = node.querySelector('[data-action="move-right"]');

    const atLeftEdge = task.status === "todo";
    const atRightEdge = task.status === "done";

    if (btnLeft) btnLeft.disabled = atLeftEdge;
    if (btnRight) btnRight.disabled = atRightEdge;

    return node;
  }

  function clearColumns() {
    if (els.colTodo) els.colTodo.innerHTML = "";
    if (els.colInprogress) els.colInprogress.innerHTML = "";
    if (els.colDone) els.colDone.innerHTML = "";
  }

  function renderBoard() {
    clearColumns();

    // Render po statusach (czytelniej)
    for (const status of statusOrder) {
      const col = statusToColumnEl[status];
      if (!col) continue;

      const tasks = state.tasks.filter((t) => t.status === status);
      for (const task of tasks) {
        col.appendChild(buildCard(task));
      }
    }

    updateCounts();
  }

  function setFormModeCreate() {
    form.reset();
    if (els.taskId) els.taskId.value = "";
    if (els.taskStatus) els.taskStatus.value = "todo";
  }

  /** @param {Task} task */
  function setFormModeEdit(task) {
    if (els.taskId) els.taskId.value = task.id;
    if (els.taskTitle) els.taskTitle.value = task.title;
    if (els.taskDesc) els.taskDesc.value = task.description || "";
    if (els.taskStatus) els.taskStatus.value = task.status;
  }

  function upsertTaskFromForm() {
    const id = (els.taskId?.value || "").trim();
    const title = (els.taskTitle?.value || "").trim();
    const description = (els.taskDesc?.value || "").trim();
    /** @type {TaskStatus} */
    const status = (els.taskStatus?.value || "todo");

    if (!title) return; // HTML "required" i tak pilnuje, ale zostawiamy

    const now = Date.now();

    if (!id) {
      /** @type {Task} */
      const task = {
        id: makeId(),
        title,
        description,
        status,
        createdAt: now,
        updatedAt: now,
      };
      state.tasks.push(task);
    } else {
      const task = findTask(id);
      if (!task) return;

      task.title = title;
      task.description = description;
      task.status = status;
      task.updatedAt = now;
    }

    renderBoard();
    closeModal();
  }

  /** @param {string} taskId */
  function moveTask(taskId, dir) {
    const task = findTask(taskId);
    if (!task) return;

    const nextStatus = clampMove(task.status, dir);
    if (nextStatus === task.status) return;

    task.status = nextStatus;
    task.updatedAt = Date.now();
    renderBoard();
  }

  //  Zdarzenia (delegacja klików) 
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const action = el.getAttribute("data-action");

    // Karta (jeśli klik jest w obrębie .card)
    const cardEl = el.closest(".card");
    const cardId = cardEl?.dataset?.id || "";

    if (action === "open-modal") {
      setFormModeCreate();
      openModal();
      return;
    }

    if (action === "close-modal") {
      closeModal();
      return;
    }

    if (action === "edit" && cardId) {
      const task = findTask(cardId);
      if (!task) return;
      setFormModeEdit(task);
      openModal();
      return;
    }

    if (action === "move-left" && cardId) {
      moveTask(cardId, "left");
      return;
    }

    if (action === "move-right" && cardId) {
      moveTask(cardId, "right");
      return;
    }

    // delete jest w zakresie Osoby 3 -> tu celowo brak implementacji
  });

  // Submit formularza = dodanie/edycja
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    upsertTaskFromForm();
  });

  // Start: render pustej tablicy
  renderBoard();

  // Minimalny "hook" dla integracji (np. później storage)
  window.KanbanCore = {
    getState: () => structuredClone(state),
    setTasks: (tasks) => {
      if (Array.isArray(tasks)) {
        state.tasks = tasks;
        renderBoard();
      }
    },
    render: renderBoard,
  };

  console.log("Core ready (state + render + add/edit + move).");
})();
