(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const state = {
    selectedDate: toIso(new Date()),
    weekStart: null,
    weekEnd: null,
    saveTimer: null,
    dirty: false,
  };

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // ---------- Utilities ----------
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
  function todayIso() { return toIso(new Date()); }
  function addDays(iso, n) {
    const d = fromIso(iso);
    d.setDate(d.getDate() + n);
    return toIso(d);
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function prettyRange(startIso, endIso) {
    const a = fromIso(startIso);
    const b = fromIso(endIso);
    if (a.getMonth() === b.getMonth()) {
      return `${MONTHS_FULL[a.getMonth()]} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`;
    }
    return `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  }
  function shortDate(iso) {
    const d = fromIso(iso);
    const wd = WEEKDAYS[(d.getDay() + 6) % 7];
    return `${wd} ${d.getDate()}`;
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

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("dayleaf-theme", theme); } catch {}
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("dayleaf-theme"); } catch {}
    if (!saved) {
      saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark" : "light";
    }
    applyTheme(saved);
  }

  // ---------- Save status ----------
  function setStatus(state_) {
    const wrap = $("#save-status");
    const txt = $("#save-text");
    wrap.classList.remove("saving", "saved", "error");
    wrap.classList.add(state_);
    if (state_ === "saving") txt.textContent = "Saving…";
    else if (state_ === "saved") txt.textContent = "Saved";
    else if (state_ === "error") txt.textContent = "Error saving";
  }

  // ---------- Load ----------
  async function load() {
    try {
      const data = await api(`/api/weekly-plan?date=${state.selectedDate}`);
      state.weekStart = data.week_start;
      state.weekEnd = data.week_end;

      $("#week-range").textContent = prettyRange(data.week_start, data.week_end);

      const ta = $("#plan-input");
      if (document.activeElement !== ta) {
        ta.value = data.content || "";
      }

      const stats = data.stats || { total: 0, completed: 0, percent: 0 };
      $("#stat-total").textContent = stats.total;
      $("#stat-done").textContent = stats.completed;
      $("#stat-percent").textContent = `${stats.percent}%`;
      $("#stat-progress-fill").style.width = `${stats.percent}%`;

      renderTasks(data.tasks || []);
      setStatus("saved");
    } catch (e) {
      toast(e.message, "error");
      setStatus("error");
    }
  }

  function renderTasks(tasks) {
    const list = $("#task-list");
    if (!tasks.length) {
      list.innerHTML = `<div class="empty">No tasks planned for this week yet. Add some from the Planner.</div>`;
      return;
    }
    list.innerHTML = "";
    tasks.forEach(t => {
      const row = document.createElement("div");
      row.className = "task-row" + (t.done ? " done" : "");
      row.innerHTML = `
        <span class="priority-dot priority-${escapeHtml(t.priority)}"></span>
        <span class="task-date">${escapeHtml(shortDate(t.task_date))}</span>
        <span class="task-title">${escapeHtml(t.title)}</span>
      `;
      list.appendChild(row);
    });
  }

  // ---------- Autosave ----------
  function scheduleSave() {
    state.dirty = true;
    setStatus("saving");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(doSave, 700);
  }

  async function doSave() {
    if (!state.dirty) return;
    try {
      await api("/api/weekly-plan", {
        method: "PUT",
        body: {
          date: state.selectedDate,
          content: $("#plan-input").value,
        },
      });
      state.dirty = false;
      setStatus("saved");
    } catch (e) {
      setStatus("error");
      toast(e.message, "error");
    }
  }

  // ---------- Navigation ----------
  function changeWeek(deltaDays) {
    if (state.dirty) {
      // flush immediate save before navigation
      clearTimeout(state.saveTimer);
      doSave();
    }
    state.selectedDate = addDays(state.selectedDate, deltaDays);
    load();
  }

  // ---------- Init ----------
  initTheme();

  $("#theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  $("#prev-week").addEventListener("click", () => changeWeek(-7));
  $("#next-week").addEventListener("click", () => changeWeek(7));
  $("#this-week").addEventListener("click", () => {
    if (state.dirty) {
      clearTimeout(state.saveTimer);
      doSave();
    }
    state.selectedDate = todayIso();
    load();
  });

  $("#plan-input").addEventListener("input", scheduleSave);

  window.addEventListener("beforeunload", () => {
    if (state.dirty) {
      // Try best-effort save (may not complete, but often does)
      fetch("/api/weekly-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: state.selectedDate,
          content: $("#plan-input").value,
        }),
        keepalive: true,
      }).catch(() => {});
    }
  });

  load();
})();