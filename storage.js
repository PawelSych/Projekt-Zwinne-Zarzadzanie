/* storage.js
   Zakres (Storage/UX): localStorage (odczyt/zapis), import/export JSON, komunikaty UX,
   puste stany, usuwanie (potwierdzenie/Undo), walidacja struktury.
*/

(function () {
  // Konfiguracja localStorage (wersjonowany klucz)
  const STORAGE_VERSION = 1;
  const STORAGE_KEY = `kanban_mvp:v${STORAGE_VERSION}`;

  // Dozwolone statusy (musi pasować do Core)
  const ALLOWED_STATUS = new Set(["todo", "inprogress", "done"]);

  // Host na toasty (istnieje w index.html)
  const toastHost = document.getElementById("toastHost");

  // Stan Undo dla usuwania
  let undoTimer = null;
  let lastDeleted = null;

  // Pomocnicze: timestamp
  function nowTs() {
    return Date.now();
  }

  // Pomocnicze: bezpieczny JSON.parse
  function safeJsonParse(text) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  // Pomocnicze: generowanie ID (gdy brak/duplikat)
  function makeId() {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Pomocnicze: sprawdzenie czy obiekt jest "plain object"
  function isPlainObject(x) {
    return typeof x === "object" && x !== null && !Array.isArray(x);
  }

  // Walidacja i normalizacja pojedynczego zadania
  function normalizeOneTask(raw) {
    if (!isPlainObject(raw)) return null;

    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) return null;

    const status = typeof raw.status === "string" ? raw.status : "todo";
    const safeStatus = ALLOWED_STATUS.has(status) ? status : "todo";

    const description = typeof raw.description === "string" ? raw.description : "";

    const createdAt =
      typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : nowTs();
    const updatedAt =
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;

    let id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) id = makeId();

    return { id, title, description, status: safeStatus, createdAt, updatedAt };
  }

  // Walidacja i normalizacja tablicy zadań + ochrona przed duplikatami ID
  function normalizeTasks(input) {
    const result = [];
    const seen = new Set();

    if (!Array.isArray(input)) return result;

    for (const raw of input) {
      const t = normalizeOneTask(raw);
      if (!t) continue;

      if (seen.has(t.id)) {
        t.id = makeId();
      }
      seen.add(t.id);
      result.push(t);
    }

    return result;
  }

  // Wspieramy format pliku JSON jako [tasks] albo { tasks: [...] }
  function extractTasksFromStoredValue(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (isPlainObject(parsed) && Array.isArray(parsed.tasks)) return parsed.tasks;
    return [];
  }

  // UI: prosty toast w #toastHost (opcjonalny przycisk akcji)
  function showToast(message, opts = {}) {
    if (!toastHost) return;

    const type = opts.type || "info";
    const actionText = opts.actionText || "";
    const onAction = typeof opts.onAction === "function" ? opts.onAction : null;
    const ttl = typeof opts.ttl === "number" ? opts.ttl : 3500;

    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.setAttribute("role", "status");

    const msg = document.createElement("div");
    msg.className = "toast-message";
    msg.textContent = message;

    el.appendChild(msg);

    if (actionText && onAction) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-small";
      btn.textContent = actionText;
      btn.addEventListener("click", () => {
        try {
          onAction();
        } finally {
          removeToast(el);
        }
      });
      el.appendChild(btn);
    }

    toastHost.appendChild(el);

    const timer = setTimeout(() => removeToast(el), ttl);
    el.dataset.timer = String(timer);
  }

  // UI: usunięcie toasta (i wyczyszczenie timera)
  function removeToast(el) {
    if (!el) return;
    const t = el.dataset.timer ? Number(el.dataset.timer) : null;
    if (t) clearTimeout(t);
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  // LocalStorage: get w try/catch (np. gdy storage zablokowany)
  function safeLocalStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_err) {
      return null;
    }
  }

  // LocalStorage: set w try/catch
  function safeLocalStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_err) {
      return false;
    }
  }

  // LocalStorage: odczyt i walidacja danych spod STORAGE_KEY
  function load() {
    const raw = safeLocalStorageGet(STORAGE_KEY);
    if (!raw) return [];

    const parsed = safeJsonParse(raw);
    if (!parsed.ok) {
      showToast("Nie udało się odczytać danych z localStorage.", { type: "error" });
      return [];
    }

    const tasksRaw = extractTasksFromStoredValue(parsed.value);
    const tasks = normalizeTasks(tasksRaw);
    return tasks;
  }

  // LocalStorage: zapis aktualnych zadań (z payloadem wersji)
  function save(tasks) {
    const safeTasks = normalizeTasks(tasks);

    const payload = {
      v: STORAGE_VERSION,
      savedAt: nowTs(),
      tasks: safeTasks,
    };

    const ok = safeLocalStorageSet(STORAGE_KEY, JSON.stringify(payload));
    if (!ok) {
      showToast("Nie udało się zapisać danych w localStorage.", { type: "error" });
    }
  }

  // Integracja z Core: pobranie tasks z window.KanbanCore
  function getCoreTasks() {
    if (!window.KanbanCore || typeof window.KanbanCore.getState !== "function") return [];
    const st = window.KanbanCore.getState();
    if (!st || !Array.isArray(st.tasks)) return [];
    return st.tasks;
  }

  // Integracja z Core: ustawienie tasks w window.KanbanCore
  function setCoreTasks(tasks) {
    if (!window.KanbanCore || typeof window.KanbanCore.setTasks !== "function") return;
    window.KanbanCore.setTasks(tasks);
  }

  // UX: placeholdery dla pustych kolumn (gdy brak kart)
  function updateEmptyStates() {
    const cols = [
      { el: document.getElementById("colTodo"), key: "todo", label: "Brak zadań w To do." },
      { el: document.getElementById("colInprogress"), key: "inprogress", label: "Brak zadań w In progress." },
      { el: document.getElementById("colDone"), key: "done", label: "Brak zadań w Done." },
    ];

    for (const c of cols) {
      if (!c.el) continue;

      const hasCards = c.el.querySelector(".card") !== null;
      const existing = c.el.querySelector(`[data-empty-state="${c.key}"]`);

      if (!hasCards && !existing) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = c.label;
        p.setAttribute("data-empty-state", c.key);
        c.el.appendChild(p);
      }

      if (hasCards && existing) {
        existing.parentNode.removeChild(existing);
      }
    }
  }

  // UX: zapis + puste stany po zdarzeniach Core (po renderze)
  function schedulePersistAndUX() {
    setTimeout(() => {
      const tasks = getCoreTasks();
      save(tasks);
      updateEmptyStates();
    }, 0);
  }

  // UX: usuwanie zadania z potwierdzeniem + Undo przez toast
  function handleDelete(taskId) {
    const tasks = getCoreTasks();
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx < 0) return;

    const ok = window.confirm("Usunąć to zadanie?");
    if (!ok) return;

    const removed = tasks[idx];
    const next = tasks.slice(0, idx).concat(tasks.slice(idx + 1));

    lastDeleted = { task: removed, index: idx };
    if (undoTimer) clearTimeout(undoTimer);

    setCoreTasks(next);
    save(next);
    updateEmptyStates();

    showToast("Zadanie usunięte.", {
      type: "info",
      actionText: "Cofnij",
      onAction: () => undoDelete(),
      ttl: 5000,
    });

    undoTimer = setTimeout(() => {
      lastDeleted = null;
      undoTimer = null;
    }, 5000);
  }

  // UX: cofnięcie ostatniego usunięcia (Undo)
  function undoDelete() {
    if (!lastDeleted) return;

    const tasks = getCoreTasks();
    const exists = tasks.some((t) => t.id === lastDeleted.task.id);
    if (exists) {
      lastDeleted = null;
      return;
    }

    const next = tasks.slice();
    const insertAt = Math.max(0, Math.min(lastDeleted.index, next.length));
    next.splice(insertAt, 0, lastDeleted.task);

    setCoreTasks(next);
    save(next);
    updateEmptyStates();

    lastDeleted = null;
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = null;

    showToast("Przywrócono zadanie.", { type: "success" });
  }

  // Import/Export: dodanie przycisków do #toolbarRight bez grzebania w HTML
  function ensureToolbar() {
    const host = document.getElementById("toolbarRight");
    if (!host) return;

    if (!document.getElementById("btnExportJson")) {
      const btn = document.createElement("button");
      btn.id = "btnExportJson";
      btn.type = "button";
      btn.className = "btn btn-small";
      btn.textContent = "Eksport";
      btn.addEventListener("click", exportJson);
      host.appendChild(btn);
    }

    if (!document.getElementById("btnImportJson")) {
      const btn = document.createElement("button");
      btn.id = "btnImportJson";
      btn.type = "button";
      btn.className = "btn btn-small";
      btn.textContent = "Import";
      btn.addEventListener("click", importJson);
      host.appendChild(btn);
    }
  }

  // Export: zapis pliku kanban-tasks.json
  function exportJson() {
    const tasks = normalizeTasks(getCoreTasks());
    const payload = {
      v: STORAGE_VERSION,
      exportedAt: nowTs(),
      tasks,
    };

    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "kanban-tasks.json";
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);

    URL.revokeObjectURL(url);

    showToast("Wyeksportowano dane.", { type: "success" });
  }

  // Import: wczytanie pliku JSON i nadpisanie obecnych zadań
  function importJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.style.display = "none";

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) {
        if (input.parentNode) input.parentNode.removeChild(input);
        return;
      }

      const text = await file.text();
      const parsed = safeJsonParse(text);

      if (!parsed.ok) {
        showToast("Nieprawidłowy plik JSON.", { type: "error" });
        if (input.parentNode) input.parentNode.removeChild(input);
        return;
      }

      const tasksRaw = extractTasksFromStoredValue(parsed.value);
      const tasks = normalizeTasks(tasksRaw);

      if (!tasks.length) {
        showToast("Brak poprawnych zadań w pliku.", { type: "error" });
        if (input.parentNode) input.parentNode.removeChild(input);
        return;
      }

      const ok = window.confirm("Zaimportować zadania i nadpisać obecne?");
      if (!ok) {
        if (input.parentNode) input.parentNode.removeChild(input);
        return;
      }

      setCoreTasks(tasks);
      save(tasks);
      updateEmptyStates();

      showToast("Zaimportowano dane.", { type: "success" });

      if (input.parentNode) input.parentNode.removeChild(input);
    });

    document.body.appendChild(input);
    input.click();
  }

  // UX: obserwacja zmian w kolumnach, żeby placeholdery były zawsze poprawne
  function observeBoardForEmptyStates() {
    const targets = [
      document.getElementById("colTodo"),
      document.getElementById("colInprogress"),
      document.getElementById("colDone"),
    ].filter(Boolean);

    if (!targets.length) return;

    const obs = new MutationObserver(() => updateEmptyStates());
    for (const t of targets) {
      obs.observe(t, { childList: true, subtree: true });
    }
  }

  // Integracja: nasłuch zdarzeń Core i zapis/UX po akcjach użytkownika
  function hookCoreEvents() {
    // Kliknięcia: move-left/move-right i delete
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;

      const action = el.getAttribute("data-action");
      const card = el.closest(".card");
      const id = card && card.dataset ? card.dataset.id : "";

      if (action === "delete" && id) {
        handleDelete(id);
        return;
      }

      if (action === "move-left" || action === "move-right") {
        schedulePersistAndUX();
        return;
      }
    });

    // Submit formularza: zapis po add/edit
    const form = document.getElementById("taskForm");
    if (form) {
      form.addEventListener("submit", () => {
        schedulePersistAndUX();
      });
    }
  }

  // Start: czekamy aż Core (window.KanbanCore) będzie gotowe, potem load + hooki
  function waitForCoreReady() {
    const startedAt = nowTs();

    const tick = () => {
      const hasCore =
        window.KanbanCore &&
        typeof window.KanbanCore.getState === "function" &&
        typeof window.KanbanCore.setTasks === "function";

      if (hasCore) {
        const tasks = load();
        if (tasks.length) {
          setCoreTasks(tasks);
          showToast("Wczytano zadania z localStorage.", { type: "info" });
        } else {
          updateEmptyStates();
        }

        ensureToolbar();
        observeBoardForEmptyStates();
        hookCoreEvents();
        return;
      }

      if (nowTs() - startedAt > 6000) {
        showToast("Nie udało się podłączyć Storage (brak KanbanCore).", { type: "error" });
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  // API modułu (głównie do debugowania)
  window.KanbanStorage = {
    load,
    save,
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
  };

  waitForCoreReady();

  console.log("Storage/UX ready (localStorage + delete + import/export + empty states).");
})();
