(() => {
  "use strict";

  const state = {
    selectedDate: toIso(new Date()),
    overview: null,
    view: "planner",
    noteTimer: null,
    monthAnchor: null,
    monthData: null,
    chartType: "bar",
    heatmapHabitId: null,
    heatmapCache: {},
    streakMap: {},
    // Filters
    taskSearchQuery: "",
    taskFilterCategory: "all",
    taskFilterPriority: "all",
    taskFilterStatus: "all",
    // Energy
    currentEnergy: 3,
  };

  const HABIT_COLORS = ["#718F78", "#D9A441", "#9B8BC4", "#C9758B", "#6E8FB5", "#8FA678", "#C47E5A"];
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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
  function prettyDate(iso) {
    const d = fromIso(iso);
    return `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const $ = (s) => document.querySelector(s);

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
    if (state.overview) drawHabitChart();
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("dayleaf-theme"); } catch {}
    if (!saved) {
      saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(saved);
  }

  // ---------- Chart type ----------
  function loadChartType() {
    try {
      const v = localStorage.getItem("dayleaf-chart-type");
      if (v && ["bar","line","area","dots"].includes(v)) return v;
    } catch {}
    return "bar";
  }
  function setChartType(t) {
    state.chartType = t;
    try { localStorage.setItem("dayleaf-chart-type", t); } catch {}
    document.querySelectorAll(".chart-type-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.chart === t);
    });
    drawHabitChart();
  }

  // ---------- Date Change & Filter Reset ----------
  function resetTaskFilters() {
    state.taskSearchQuery = "";
    state.taskFilterCategory = "all";
    state.taskFilterPriority = "all";
    state.taskFilterStatus = "all";
    if ($("#task-search")) $("#task-search").value = "";
    if ($("#clear-search")) $("#clear-search").classList.add("hidden");
    if ($("#filter-priority")) $("#filter-priority").value = "all";
    if ($("#filter-status")) $("#filter-status").value = "all";
  }

  function changeDate(iso) {
    state.selectedDate = iso;
    resetTaskFilters();
    loadOverview();
  }

  // ---------- Loading ----------
  async function loadOverview() {
    try {
      const data = await api(`/api/overview?date=${state.selectedDate}`);
      state.overview = data;
      state.currentEnergy = data.energy || 3;
      renderAll();
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadMonth() {
    if (!state.monthAnchor) {
      const t = new Date();
      state.monthAnchor = new Date(t.getFullYear(), t.getMonth(), 1);
    }
    const ym = `${state.monthAnchor.getFullYear()}-${String(state.monthAnchor.getMonth() + 1).padStart(2, "0")}`;
    try {
      const data = await api(`/api/habits/month?month=${ym}`);
      state.monthData = data;
      renderMonthMatrix();
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadHeatmap(habitId) {
    if (!habitId) return;
    try {
      const [heat, streak] = await Promise.all([
        api(`/api/habits/${habitId}/heatmap`),
        api(`/api/habits/${habitId}/streak`),
      ]);
      state.heatmapCache[habitId] = { data: heat, streak };
      state.streakMap[habitId] = streak;
      renderHeatmap();
      renderHabitListStreaks();
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadAllStreaks() {
    if (!state.overview) return;
    const ids = state.overview.habits.map(h => h.id);
    await Promise.all(ids.map(async id => {
      try {
        const streak = await api(`/api/habits/${id}/streak`);
        state.streakMap[id] = streak;
      } catch {}
    }));
    renderHabitListStreaks();
  }

  // ---------- Render ----------
  function renderAll() {
    if (!state.overview) return;
    renderTopbar();
    renderSummary();
    renderWeek();
    renderTaskList();
    renderNotes();
    renderHabits();
    drawHabitChart();
    populateHeatmapSelect();
    if (state.heatmapHabitId) loadHeatmap(state.heatmapHabitId);
  }

  function renderTopbar() {
    $("#sidebar-today").textContent = prettyDate(todayIso());
    $("#topbar-date").textContent = prettyDate(state.selectedDate);
  }

  function renderSummary() {
    const o = state.overview;
    $("#sum-tasks-done").textContent = o.task_stats.completed;
    $("#sum-tasks-total").textContent = `/ ${o.task_stats.total}`;
    $("#task-progress").style.width = `${o.task_stats.percent}%`;
    $("#task-percent").textContent = `${o.task_stats.percent}% complete`;

    $("#sum-habits-done").textContent = o.habit_stats.completed;
    $("#sum-habits-total").textContent = `/ ${o.habit_stats.total}`;
    $("#habit-percent").textContent = `${o.habit_stats.percent}% complete`;

    const dots = $("#habit-dots");
    dots.innerHTML = "";
    const doneIds = new Set(
      Object.entries(o.habit_matrix)
        .filter(([, dates]) => dates.includes(o.selected_date))
        .map(([id]) => Number(id))
    );
    o.habits.forEach(h => {
      const d = document.createElement("span");
      d.className = "habit-dot" + (doneIds.has(h.id) ? " done" : "");
      d.style.background = doneIds.has(h.id) ? h.color : "";
      d.title = h.title;
      dots.appendChild(d);
    });
  }

  function renderWeek() {
    const o = state.overview;
    const monday = fromIso(o.week_start);
    const sunday = fromIso(o.week_end);
    $("#week-range").textContent =
      `${MONTHS[monday.getMonth()]} ${monday.getDate()} – ` +
      `${MONTHS[sunday.getMonth()]} ${sunday.getDate()}, ${sunday.getFullYear()}`;

    const tasksByDate = {};
    o.week_tasks.forEach(t => { (tasksByDate[t.task_date] ||= []).push(t); });

    const grid = $("#week-grid");
    grid.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const iso = addDays(o.week_start, i);
      const d = fromIso(iso);
      const dayTasks = tasksByDate[iso] || [];
      const el = document.createElement("div");
      el.className = "week-day";
      if (iso === o.today) el.classList.add("today");
      if (iso === o.selected_date) el.classList.add("selected");
      const preview = dayTasks.slice(0, 2).map(t =>
        `<div class="week-task ${t.done ? "done" : ""}">${escapeHtml(t.title)}</div>`
      ).join("");
      const more = dayTasks.length > 2
        ? `<div class="week-more">+${dayTasks.length - 2} more</div>` : "";
      el.innerHTML = `
        <div class="week-day-head">
          <span class="week-day-name">${WEEKDAYS[i]}</span>
          <span class="week-day-date">${d.getDate()}</span>
        </div>
        ${preview}${more}
      `;
      el.addEventListener("click", () => changeDate(iso));
      grid.appendChild(el);
    }
  }

  function repeatBadge(t) {
    const isTpl = t.recur && t.recur !== "none";
    const isInstance = !!t.parent_id;
    if (!isTpl && !isInstance) return "";
    const label = isInstance ? "Part of recurring series" : `Repeats: ${t.recur}`;
    return ` <svg class="recur-badge" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="${label}"><title>${label}</title><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`;
  }
  
  function energyBadge(t, isSuggested) {
    const cost = t.energy_cost || "medium";
    const label = cost.charAt(0).toUpperCase() + cost.slice(1);
    const cls = `task-energy-badge ${cost} ${isSuggested ? 'suggested' : ''}`;
    const title = isSuggested ? "Matches your current low energy" : "Energy required";
    return `<span class="${cls}" title="${title}">${label}</span>`;
  }

  function renderTaskList() {
    const o = state.overview;
    const list = $("#task-list");
    $("#daily-subtitle").textContent = prettyDate(o.selected_date);

    // --- Energy Render ---
    const isLowEnergy = state.currentEnergy <= 2;
    document.querySelectorAll(".energy-bar").forEach(b => {
      b.classList.toggle("active", Number(b.dataset.level) <= state.currentEnergy);
    });
    
    $("#energy-suggestion").classList.toggle("hidden", !isLowEnergy);

    // 1. Update Category options dynamically
    const catSelect = $("#filter-category");
    const currentCatValue = state.taskFilterCategory;
    const uniqueCats = new Set(o.tasks.map(t => t.category));
    let optionsHtml = '<option value="all">All Categories</option>';
    Array.from(uniqueCats).sort().forEach(c => {
      optionsHtml += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
    });
    
    if (catSelect.innerHTML !== optionsHtml) {
      catSelect.innerHTML = optionsHtml;
    }
    
    if (uniqueCats.has(currentCatValue) || currentCatValue === "all") {
      catSelect.value = currentCatValue;
    } else {
      state.taskFilterCategory = "all";
      catSelect.value = "all";
    }

    // 2. Apply Filters
    const filteredTasks = o.tasks.filter(t => {
      if (state.taskSearchQuery) {
        const q = state.taskSearchQuery;
        if (!t.title.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (state.taskFilterCategory !== "all" && t.category !== state.taskFilterCategory) {
        return false;
      }
      if (state.taskFilterPriority !== "all" && t.priority !== state.taskFilterPriority) {
        return false;
      }
      if (state.taskFilterStatus === "active" && t.done) return false;
      if (state.taskFilterStatus === "completed" && !t.done) return false;
      return true;
    });

    // 3. Empty States
    if (!o.tasks.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">A fresh page.</div>
          <div class="empty-sub">Add a task and make today count.</div>
        </div>`;
      return;
    }

    if (!filteredTasks.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No matching tasks.</div>
          <div class="empty-sub">Try changing your search or filters.</div>
        </div>`;
      return;
    }

    // 4. Render Filtered Tasks
    list.innerHTML = "";
    filteredTasks.forEach(t => {
      // 🚨 منطق جدید قفل کردن تسک‌های سخت
      // اگر انرژی پایین (1 یا 2) باشد، و تسک سخت باشد، و انجام نشده باشد -> همیشه قفل می‌شود
      const isLocked = isLowEnergy && t.energy_cost === 'high' && !t.done;
      
      const isSuggested = isLowEnergy && t.energy_cost === 'low' && !t.done;
      
      const item = document.createElement("div");
      item.className = "task-item" + (t.done ? " done" : "") + (isLocked ? " locked" : "");
      
      item.innerHTML = `
        <div class="task-checkbox-wrapper">
          <input type="checkbox" class="task-check" ${t.done ? "checked" : ""} ${isLocked ? "disabled" : ""} />
          ${isLocked ? `<svg class="lock-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` : ''}
        </div>
        <div class="task-body">
          <div class="task-title">${escapeHtml(t.title)}${repeatBadge(t)}</div>
          <div class="task-meta">
            <span><span class="priority-dot priority-${t.priority}"></span>${escapeHtml(t.priority)}</span>
            <span>${escapeHtml(t.category)}</span>
            ${t.start_time ? `<span>${escapeHtml(t.start_time)}</span>` : ""}
            ${energyBadge(t, isSuggested)}
            ${isLocked ? `<span class="locked-text">Increase energy to unlock</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="icon-btn" data-action="edit" title="Edit">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
          </button>
          <button class="icon-btn" data-action="delete" title="Delete">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/>
            </svg>
          </button>
        </div>`;
      
      item.querySelector(".task-check").addEventListener("change", async e => {
        try {
          await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: e.target.checked } });
          await loadOverview();
        } catch (err) { toast(err.message, "error"); }
      });
      item.querySelector('[data-action="edit"]').addEventListener("click", () => openTaskModal(t));
      item.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        const confirmMsg = (t.recur && t.recur !== "none")
          ? `Delete "${t.title}" and all its recurring instances?`
          : `Delete "${t.title}"?`;
        if (!confirm(confirmMsg)) return;
        try {
          await api(`/api/tasks/${t.id}`, { method: "DELETE" });
          toast("Task deleted");
          await loadOverview();
        } catch (err) { toast(err.message, "error"); }
      });
      list.appendChild(item);
    });
  }

  function renderNotes() {
    if (document.activeElement !== $("#notes-input")) {
      $("#notes-input").value = state.overview.notes || "";
    }
  }

  function renderHabits() {
    const o = state.overview;
    $("#hb-total").textContent = o.habit_stats.total;
    $("#hb-done").textContent = o.habit_stats.completed;
    $("#hb-percent").textContent = `${o.habit_stats.percent}%`;
    $("#hb-progress").style.width = `${o.habit_stats.percent}%`;

    const doneIds = new Set(
      Object.entries(o.habit_matrix)
        .filter(([, dates]) => dates.includes(o.selected_date))
        .map(([id]) => Number(id))
    );

    const list = $("#habit-list");
    if (!o.habits.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">No habits yet.</div>
          <div class="empty-sub">Add your first habit to start tracking.</div>
        </div>`;
    } else {
      list.innerHTML = "";
      o.habits.forEach(h => {
        const row = document.createElement("div");
        row.className = "habit-row";
        row.innerHTML = `
          <input type="checkbox" class="task-check" ${doneIds.has(h.id) ? "checked" : ""} />
          <span class="habit-color" style="background:${h.color}"></span>
          <span class="habit-name">${escapeHtml(h.title)}<span class="streak-badge hidden" data-streak="${h.id}"></span></span>
          <div class="task-actions">
            <button class="icon-btn" data-action="delete" title="Delete">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/>
              </svg>
            </button>
          </div>`;
        row.querySelector("input").addEventListener("change", async e => {
          try {
            await api(`/api/habits/${h.id}/check`, {
              method: "PATCH",
              body: { date: o.selected_date, done: e.target.checked },
            });
            await loadOverview();
            if (state.monthAnchor) await loadMonth();
            if (state.heatmapHabitId === h.id) await loadHeatmap(h.id);
            else await loadAllStreaks();
          } catch (err) { toast(err.message, "error"); }
        });
        row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
          if (!confirm(`Delete habit "${h.title}" and all its history?`)) return;
          try {
            await api(`/api/habits/${h.id}`, { method: "DELETE" });
            toast("Habit deleted");
            delete state.heatmapCache[h.id];
            delete state.streakMap[h.id];
            await loadOverview();
            if (state.monthAnchor) await loadMonth();
            if (state.heatmapHabitId === h.id) {
              state.heatmapHabitId = null;
              $("#heatmap-grid").innerHTML = "";
              $("#heatmap-months").innerHTML = "";
              $("#heatmap-stats").textContent = "";
            }
          } catch (err) { toast(err.message, "error"); }
        });
        list.appendChild(row);
      });
      loadAllStreaks();
    }

    // Weekly matrix
    const table = $("#habit-matrix");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(o.week_start, i));

    thead.innerHTML = `<tr><th>Habit</th>${days.map(d => {
      const date = fromIso(d);
      const wd = WEEKDAYS_SHORT[(date.getDay() + 6) % 7];
      return `<th>${wd}<br><span style="font-weight:400">${date.getDate()}</span></th>`;
    }).join("")}</tr>`;

    tbody.innerHTML = "";
    o.habits.forEach(h => {
      const doneSet = new Set(o.habit_matrix[String(h.id)] || []);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><div class="habit-label"><span class="habit-color" style="background:${h.color}"></span>${escapeHtml(h.title)}</div></td>
        ${days.map(d => {
          const cls = d === o.today ? "today" : (d === o.selected_date ? "selected" : "");
          return `<td class="${cls}"><input type="checkbox" data-date="${d}" ${doneSet.has(d) ? "checked" : ""} /></td>`;
        }).join("")}`;
      tr.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", async e => {
          const date = e.target.dataset.date;
          try {
            await api(`/api/habits/${h.id}/check`, {
              method: "PATCH", body: { date, done: e.target.checked },
            });
            await loadOverview();
            if (state.monthAnchor) await loadMonth();
            if (state.heatmapHabitId === h.id) await loadHeatmap(h.id);
            else await loadAllStreaks();
          } catch (err) {
            e.target.checked = !e.target.checked;
            toast(err.message, "error");
          }
        });
      });
      tbody.appendChild(tr);
    });
  }

  function renderHabitListStreaks() {
    document.querySelectorAll("[data-streak]").forEach(el => {
      const id = Number(el.dataset.streak);
      const s = state.streakMap[id];
      if (s && s.current > 0) {
        el.textContent = `${s.current}d streak`;
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
        el.textContent = "";
      }
    });
  }

  function renderMonthMatrix() {
    const data = state.monthData;
    if (!data) return;
    const anchor = fromIso(data.days[0]);
    $("#month-label").textContent = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;

    const table = $("#habit-month-matrix");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    thead.innerHTML = `<tr><th>Habit</th>${data.days.map(d => {
      const dt = fromIso(d);
      return `<th title="${d}">${dt.getDate()}</th>`;
    }).join("")}</tr>`;

    tbody.innerHTML = "";
    const today = todayIso();
    data.habits.forEach(h => {
      const doneSet = new Set(data.matrix[String(h.id)] || []);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><div class="habit-label"><span class="habit-color" style="background:${h.color}"></span>${escapeHtml(h.title)}</div></td>
        ${data.days.map(d => {
          const cls = d === today ? "today" : "";
          return `<td class="${cls}"><input type="checkbox" data-date="${d}" ${doneSet.has(d) ? "checked" : ""} /></td>`;
        }).join("")}`;
      tr.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", async e => {
          const date = e.target.dataset.date;
          try {
            await api(`/api/habits/${h.id}/check`, {
              method: "PATCH", body: { date, done: e.target.checked },
            });
            await loadOverview();
            await loadMonth();
            if (state.heatmapHabitId === h.id) await loadHeatmap(h.id);
            else await loadAllStreaks();
          } catch (err) {
            e.target.checked = !e.target.checked;
            toast(err.message, "error");
          }
        });
      });
      tbody.appendChild(tr);
    });
  }

  // ---------- Heatmap ----------
  function populateHeatmapSelect() {
    const o = state.overview;
    const sel = $("#heatmap-habit-select");
    if (!o || !sel) return;
    const currentValue = state.heatmapHabitId ?? (o.habits[0] ? o.habits[0].id : null);
    sel.innerHTML = "";
    if (!o.habits.length) {
      const opt = document.createElement("option");
      opt.textContent = "No habits yet";
      opt.value = "";
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    o.habits.forEach(h => {
      const opt = document.createElement("option");
      opt.value = h.id;
      opt.textContent = h.title;
      sel.appendChild(opt);
    });
    if (currentValue && o.habits.some(h => h.id === currentValue)) {
      sel.value = currentValue;
      state.heatmapHabitId = currentValue;
    } else {
      sel.value = o.habits[0].id;
      state.heatmapHabitId = o.habits[0].id;
    }
    if (!state.heatmapCache[state.heatmapHabitId]) loadHeatmap(state.heatmapHabitId);
    else renderHeatmap();
  }

  function renderHeatmap() {
    const id = state.heatmapHabitId;
    const cached = state.heatmapCache[id];
    const grid = $("#heatmap-grid");
    const monthsEl = $("#heatmap-months");
    const statsEl = $("#heatmap-stats");
    if (!grid || !monthsEl || !statsEl) return;
    if (!cached) {
      grid.innerHTML = "";
      monthsEl.innerHTML = "";
      statsEl.textContent = "";
      return;
    }
    const { data, streak } = cached;
    const days = data.days;
    const totalCells = days.length;
    const weeks = Math.ceil(totalCells / 7);

    monthsEl.innerHTML = "";
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const firstDay = days[w * 7];
      if (!firstDay) continue;
      const m = fromIso(firstDay.date).getMonth();
      const span = document.createElement("span");
      if (m !== lastMonth) {
        span.textContent = MONTHS_SHORT[m];
        lastMonth = m;
      } else {
        span.textContent = "";
      }
      monthsEl.appendChild(span);
    }

    grid.innerHTML = "";
    const today = data.today;
    days.forEach(day => {
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.dataset.date = day.date;
      cell.title = `${day.date} — ${day.done ? "completed" : "not completed"}`;
      if (day.in_future) cell.classList.add("future");
      if (day.date === today) cell.classList.add("today");
      cell.classList.add(day.done ? "level-4" : "level-0");
      cell.addEventListener("click", async () => {
        if (day.in_future) return;
        const newDone = !day.done;
        try {
          await api(`/api/habits/${id}/check`, {
            method: "PATCH", body: { date: day.date, done: newDone },
          });
          await loadHeatmap(id);
          await loadOverview();
          if (state.monthAnchor) await loadMonth();
        } catch (err) { toast(err.message, "error"); }
      });
      grid.appendChild(cell);
    });

    statsEl.innerHTML = `
      <span>Current streak: <strong>${streak.current} day${streak.current === 1 ? "" : "s"}</strong></span>
      <span>Longest: <strong>${streak.longest} day${streak.longest === 1 ? "" : "s"}</strong></span>
      <span>Total: <strong>${streak.total_days}</strong></span>
    `;
  }

  // ---------- Chart ----------
  function drawHabitChart() {
    const canvas = $("#habit-chart");
    if (!canvas || !state.overview) return;
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth;
    const cssH = wrap.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const styles = getComputedStyle(document.documentElement);
    const green = styles.getPropertyValue("--green").trim() || "#718F78";
    const muted = styles.getPropertyValue("--muted").trim() || "#89938A";
    const border = styles.getPropertyValue("--border").trim() || "#E9EDE7";
    const text = styles.getPropertyValue("--text").trim() || "#26342C";
    const greenLight = styles.getPropertyValue("--green-light").trim() || "#EDF4ED";

    const data = state.overview.chart;
    const values = data.habits_done;
    const maxVal = Math.max(1, ...values);

    const padL = 28, padR = 12, padT = 16, padB = 28;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    const n = values.length;
    const step = plotW / n;

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const y = padT + (plotH / rows) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      const val = Math.round(maxVal - (maxVal / rows) * i);
      ctx.fillStyle = muted;
      ctx.font = "10px 'DM Sans', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(val), padL - 6, y);
    }

    const type = state.chartType;

    if (type === "bar") {
      const barW = Math.min(34, (plotW / n) * 0.55);
      for (let i = 0; i < n; i++) {
        const x = padL + step * i + (step - barW) / 2;
        const h = (values[i] / maxVal) * plotH;
        const y = padT + plotH - h;
        ctx.fillStyle = green;
        const r = Math.min(6, barW / 2);
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, y + h);
        ctx.closePath();
        ctx.fill();
      }
    } else if (type === "line" || type === "area") {
      const points = values.map((v, i) => ({
        x: padL + step * i + step / 2,
        y: padT + plotH - (v / maxVal) * plotH,
      }));
      if (type === "area") {
        ctx.beginPath();
        ctx.moveTo(points[0].x, padT + plotH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padT + plotH);
        ctx.closePath();
        ctx.fillStyle = greenLight;
        ctx.fill();
      }
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = green;
      ctx.lineWidth = 2;
      ctx.stroke();
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = green;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    } else if (type === "dots") {
      for (let i = 0; i < n; i++) {
        const x = padL + step * i + step / 2;
        const y = padT + plotH - (values[i] / maxVal) * plotH;
        const r = 6 + (values[i] / maxVal) * 10;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = green;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    for (let i = 0; i < n; i++) {
      const date = fromIso(data.days[i]);
      const wd = WEEKDAYS_SHORT[(date.getDay() + 6) % 7];
      const x = padL + step * i + step / 2;
      ctx.fillStyle = text;
      ctx.font = "11px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(wd, x, padT + plotH + 8);
    }
  }

  // ---------- Navigation ----------
  function setView(v) {
    state.view = v;
    document.querySelectorAll(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.view === v)
    );
    const views = {
      planner: $("#view-planner"),
      habits: $("#view-habits"),
      profile: $("#view-profile"),
    };
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.classList.toggle("hidden", key !== v);
    });

    if (v === "habits") {
      if (!state.monthAnchor) {
        const t = new Date();
        state.monthAnchor = new Date(t.getFullYear(), t.getMonth(), 1);
        loadMonth();
      }
      setTimeout(() => {
        drawHabitChart();
        populateHeatmapSelect();
      }, 30);
    }
    if (v === "profile" && window.DayleafProfile && window.DayleafProfile.load) {
      window.DayleafProfile.load();
    }
    closeMobileMenu();
  }

  document.querySelectorAll(".nav-item").forEach(b => {
    b.addEventListener("click", () => setView(b.dataset.view));
  });

  $("#prev-day").addEventListener("click", () => changeDate(addDays(state.selectedDate, -1)));
  $("#next-day").addEventListener("click", () => changeDate(addDays(state.selectedDate, 1)));
  $("#today-btn").addEventListener("click", () => changeDate(todayIso()));
  $("#prev-week").addEventListener("click", () => changeDate(addDays(state.selectedDate, -7)));
  $("#next-week").addEventListener("click", () => changeDate(addDays(state.selectedDate, 7)));
  $("#this-week").addEventListener("click", () => changeDate(todayIso()));

  $("#prev-month").addEventListener("click", () => {
    const a = state.monthAnchor || new Date();
    state.monthAnchor = new Date(a.getFullYear(), a.getMonth() - 1, 1);
    loadMonth();
  });
  $("#next-month").addEventListener("click", () => {
    const a = state.monthAnchor || new Date();
    state.monthAnchor = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    loadMonth();
  });
  $("#this-month").addEventListener("click", () => {
    const t = new Date();
    state.monthAnchor = new Date(t.getFullYear(), t.getMonth(), 1);
    loadMonth();
  });

  $("#heatmap-habit-select").addEventListener("change", e => {
    state.heatmapHabitId = Number(e.target.value);
    if (!state.heatmapCache[state.heatmapHabitId]) loadHeatmap(state.heatmapHabitId);
    else renderHeatmap();
  });

  document.querySelectorAll(".chart-type-btn").forEach(b => {
    b.addEventListener("click", () => setChartType(b.dataset.chart));
  });

  // ---------- Energy Bar Listeners ----------
  document.querySelectorAll(".energy-bar").forEach(bar => {
    bar.addEventListener("click", async () => {
      const level = Number(bar.dataset.level);
      if (level === state.currentEnergy) return;
      
      state.currentEnergy = level;
      try {
        await api("/api/energy", {
          method: "PUT",
          body: { date: state.selectedDate, level: level }
        });
        renderTaskList();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });

  // ---------- Search & Filter Listeners ----------
  $("#task-search").addEventListener("input", e => {
    state.taskSearchQuery = e.target.value.trim().toLowerCase();
    $("#clear-search").classList.toggle("hidden", !state.taskSearchQuery);
    renderTaskList();
  });

  $("#clear-search").addEventListener("click", () => {
    $("#task-search").value = "";
    state.taskSearchQuery = "";
    $("#clear-search").classList.add("hidden");
    renderTaskList();
  });

  $("#filter-category").addEventListener("change", e => {
    state.taskFilterCategory = e.target.value;
    renderTaskList();
  });

  $("#filter-priority").addEventListener("change", e => {
    state.taskFilterPriority = e.target.value;
    renderTaskList();
  });

  $("#filter-status").addEventListener("change", e => {
    state.taskFilterStatus = e.target.value;
    renderTaskList();
  });

  // ---------- Mobile ----------
  function openMobileMenu() {
    $("#sidebar .nav").classList.add("open");
    $("#mobile-backdrop").classList.add("open");
  }
  function closeMobileMenu() {
    $("#sidebar .nav").classList.remove("open");
    $("#mobile-backdrop").classList.remove("open");
  }
  $("#mobile-menu-btn").addEventListener("click", () => {
    const nav = $("#sidebar .nav");
    if (nav.classList.contains("open")) closeMobileMenu(); else openMobileMenu();
  });
  $("#mobile-backdrop").addEventListener("click", closeMobileMenu);

  // ---------- Task modal ----------
  function openTaskModal(task = null) {
    $("#task-modal-title").textContent = task ? "Edit Task" : "Add Task";
    $("#task-id").value = task ? task.id : "";
    $("#task-title").value = task ? task.title : "";
    $("#task-date").value = task ? task.task_date : state.selectedDate;
    $("#task-time").value = task ? (task.start_time || "") : "";
    $("#task-category").value = task ? task.category : "Personal";
    $("#task-priority").value = task ? task.priority : "medium";
    $("#task-energy").value = task ? (task.energy_cost || "medium") : "medium";
    const recur = task ? (task.recur || "none") : "none";
    $("#task-recur").value = recur;
    $("#task-recur-until").value = task ? (task.recur_until || "") : "";
    $("#recur-until-row").style.display = recur === "none" ? "none" : "";
    $("#task-error").classList.add("hidden");
    $("#task-modal").classList.remove("hidden");
    setTimeout(() => $("#task-title").focus(), 50);
  }
  function closeTaskModal() { $("#task-modal").classList.add("hidden"); }

  $("#open-task-modal").addEventListener("click", () => openTaskModal());
  $("#close-task-modal").addEventListener("click", closeTaskModal);
  $("#cancel-task").addEventListener("click", closeTaskModal);
  $("#task-modal").addEventListener("click", e => { if (e.target.id === "task-modal") closeTaskModal(); });

  $("#task-recur").addEventListener("change", () => {
    const v = $("#task-recur").value;
    $("#recur-until-row").style.display = v === "none" ? "none" : "";
  });

  $("#task-form").addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("#task-id").value;
    const recur = $("#task-recur").value || "none";
    const payload = {
      title: $("#task-title").value.trim(),
      task_date: $("#task-date").value,
      start_time: $("#task-time").value,
      category: $("#task-category").value.trim() || "Personal",
      priority: $("#task-priority").value,
      energy_cost: $("#task-energy").value,
      recur: recur,
      recur_until: recur === "none" ? "" : ($("#task-recur-until").value || ""),
    };
    const errEl = $("#task-error");
    const btn = $("#save-task-btn");
    errEl.classList.add("hidden");
    if (!payload.title) {
      errEl.textContent = "Task title is required.";
      errEl.classList.remove("hidden");
      return;
    }
    btn.disabled = true;
    try {
      if (id) {
        await api(`/api/tasks/${id}`, { method: "PATCH", body: payload });
        toast("Task updated");
      } else {
        await api("/api/tasks", { method: "POST", body: payload });
        toast("Task created");
      }
      closeTaskModal();
      await loadOverview();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Habit modal ----------
  let habitColor = HABIT_COLORS[0];
  function buildSwatches() {
    const wrap = $("#color-swatches");
    wrap.innerHTML = "";
    HABIT_COLORS.forEach(c => {
      const s = document.createElement("div");
      s.className = "swatch" + (c === habitColor ? " active" : "");
      s.style.background = c;
      s.addEventListener("click", () => { habitColor = c; buildSwatches(); });
      wrap.appendChild(s);
    });
  }
  function openHabitModal() {
    $("#habit-title").value = "";
    $("#habit-error").classList.add("hidden");
    habitColor = HABIT_COLORS[0];
    buildSwatches();
    $("#habit-modal").classList.remove("hidden");
    setTimeout(() => $("#habit-title").focus(), 50);
  }
  function closeHabitModal() { $("#habit-modal").classList.add("hidden"); }

  $("#open-habit-modal").addEventListener("click", openHabitModal);
  $("#close-habit-modal").addEventListener("click", closeHabitModal);
  $("#cancel-habit").addEventListener("click", closeHabitModal);
  $("#habit-modal").addEventListener("click", e => { if (e.target.id === "habit-modal") closeHabitModal(); });

  $("#habit-form").addEventListener("submit", async e => {
    e.preventDefault();
    const title = $("#habit-title").value.trim();
    const errEl = $("#habit-error");
    const btn = $("#save-habit-btn");
    errEl.classList.add("hidden");
    if (!title) {
      errEl.textContent = "Habit name is required.";
      errEl.classList.remove("hidden");
      return;
    }
    btn.disabled = true;
    try {
      await api("/api/habits", { method: "POST", body: { title, color: habitColor } });
      toast("Habit added");
      closeHabitModal();
      await loadOverview();
      if (state.monthAnchor) await loadMonth();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Notes autosave ----------
  $("#notes-input").addEventListener("input", () => {
    $("#note-status").textContent = "Saving…";
    clearTimeout(state.noteTimer);
    state.noteTimer = setTimeout(async () => {
      const content = $("#notes-input").value;
      try {
        await api("/api/notes", { method: "PUT", body: { date: state.selectedDate, content } });
        $("#note-status").textContent = "Saved";
      } catch (err) {
        $("#note-status").textContent = "Error saving";
        toast(err.message, "error");
      }
    }, 600);
  });

  // ---------- Theme toggle + resize ----------
  $("#theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawHabitChart, 150);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeTaskModal();
      closeHabitModal();
      closeMobileMenu();
    }
  });

  // ---------- Init ----------
  initTheme();
  state.chartType = loadChartType();
  document.querySelectorAll(".chart-type-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.chart === state.chartType);
  });
  buildSwatches();
  loadOverview();
})();