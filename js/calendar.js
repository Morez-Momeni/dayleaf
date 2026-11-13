(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const state = {
    monthAnchor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    tasksByDate: {},
    today: null,
    selectedDay: null,
  };

  const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function toIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  function fromIso(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function api(url, options = {}) {
    const opts = { headers: { "Content-Type": "application/json" }, ...options };
    if (opts.body && typeof opts.body !== "string") opts.body = JSON.stringify(opts.body);
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { data = { ok: false, error: "Invalid response" }; }
    if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function toast(msg, type = "success") {
    const c = $("#toast-container");
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("dayleaf-theme", theme); } catch {}
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("dayleaf-theme"); } catch {}
    if (!saved) {
      saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(saved);
  }

  async function load() {
    try {
      const ym = `${state.monthAnchor.getFullYear()}-${String(state.monthAnchor.getMonth() + 1).padStart(2, "0")}`;
      const data = await api(`/api/tasks/month?month=${ym}`);
      state.today = data.today;
      state.tasksByDate = {};
      data.tasks.forEach(t => {
        (state.tasksByDate[t.task_date] ||= []).push(t);
      });
      render();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function render() {
    const anchor = state.monthAnchor;
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    $("#month-label").textContent = `${MONTHS_FULL[month]} ${year}`;

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    // Days from Monday of the week containing the 1st
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);

    // Total cells: full weeks that cover the month
    const totalDays = startOffset + lastOfMonth.getDate();
    const totalWeeks = Math.ceil(totalDays / 7);
    const totalCells = totalWeeks * 7;

    const grid = $("#month-grid");
    grid.innerHTML = "";

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = toIso(d);
      const inMonth = d.getMonth() === month;
      const dayTasks = state.tasksByDate[iso] || [];

      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.iso = iso;
      if (!inMonth) cell.classList.add("other-month");
      if (iso === state.today) cell.classList.add("today");

      // Hide badge if 0 tasks
      const countLabel = dayTasks.length ? dayTasks.length : "";
      const countHtml = countLabel !== "" ? `<span class="cell-count">${countLabel}</span>` : "";

      const shown = dayTasks.slice(0, 2);
      const tasksHtml = shown.map(t =>
        `<div class="cell-task ${t.done ? "done" : ""}" title="${escapeHtml(t.title)}">
           <span class="cell-dot priority-dot-${escapeHtml(t.priority)}" style="margin-right:4px;"></span>${escapeHtml(t.title)}
         </div>`
      ).join("");
      const moreHtml = dayTasks.length > 2 ? `<div class="cell-more">+${dayTasks.length - 2} more</div>` : "";

      cell.innerHTML = `
        <div class="cell-top">
          <span class="cell-day">${d.getDate()}</span>
          ${countHtml}
        </div>
        ${tasksHtml}${moreHtml}
      `;

      cell.addEventListener("click", () => openDay(iso));
      grid.appendChild(cell);
    }
  }

  function openDay(iso) {
    state.selectedDay = iso;
    const d = fromIso(iso);
    $("#day-modal-title").textContent = `Tasks — ${WEEKDAYS[(d.getDay() + 6) % 7]}`;
    $("#day-modal-date").textContent = `${MONTHS_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    const body = $("#day-modal-body");
    const tasks = state.tasksByDate[iso] || [];

    if (!tasks.length) {
      body.innerHTML = `<div class="empty">No tasks scheduled for this day.</div>`;
    } else {
      body.innerHTML = "";
      tasks.forEach(t => {
        const item = document.createElement("div");
        item.className = "task-item" + (t.done ? " done" : "");
        item.innerHTML = `
          <input type="checkbox" class="task-check" ${t.done ? "checked" : ""} />
          <div class="task-body">
            <div class="task-title">${escapeHtml(t.title)}</div>
            <div class="task-meta">
              <span><span class="priority-dot priority-dot-${escapeHtml(t.priority)}"></span>${escapeHtml(t.priority)}</span>
              <span>${escapeHtml(t.category)}</span>
              ${t.start_time ? `<span>${escapeHtml(t.start_time)}</span>` : ""}
            </div>
          </div>
        `;
        item.querySelector(".task-check").addEventListener("change", async (e) => {
          try {
            await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: e.target.checked } });
            t.done = e.target.checked ? 1 : 0;
            item.classList.toggle("done", e.target.checked);
            // Badge doesn't need updating on toggle, as the total count of tasks doesn't change.
          } catch (err) {
            e.target.checked = !e.target.checked;
            toast(err.message, "error");
          }
        });
        body.appendChild(item);
      });
    }

    $("#day-modal").classList.remove("hidden");
  }

  function closeDay() {
    $("#day-modal").classList.add("hidden");
  }

  $("#close-day-modal").addEventListener("click", closeDay);
  $("#day-modal").addEventListener("click", (e) => {
    if (e.target.id === "day-modal") closeDay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDay();
  });

  $("#prev-month").addEventListener("click", () => {
    state.monthAnchor = new Date(state.monthAnchor.getFullYear(), state.monthAnchor.getMonth() - 1, 1);
    load();
  });
  $("#next-month").addEventListener("click", () => {
    state.monthAnchor = new Date(state.monthAnchor.getFullYear(), state.monthAnchor.getMonth() + 1, 1);
    load();
  });
  $("#this-month").addEventListener("click", () => {
    const t = new Date();
    state.monthAnchor = new Date(t.getFullYear(), t.getMonth(), 1);
    load();
  });

  $("#theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  initTheme();
  load();
})();