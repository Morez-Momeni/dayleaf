(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const CIRCUMFERENCE = 2 * Math.PI * 140; // 879.6

  const state = {
    mode: "focus",
    focusMin: 25,
    breakMin: 5,
    totalSec: 25 * 60,
    remainingSec: 25 * 60,
    running: false,
    intervalId: null,
    startedAt: null,
    selectedTaskId: null,
  };

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function toIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  function todayIso() { return toIso(new Date()); }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function formatHours(sec) {
    const h = sec / 3600;
    if (h < 1) return `${Math.round(sec / 60)}m`;
    return `${h.toFixed(1)}h`;
  }
  function formatTimeOfDay(iso) {
    const d = new Date(iso);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
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

  // ---------- Rendering ----------
  function updateDisplay() {
    $("#timer-time").textContent = formatTime(state.remainingSec);
    $("#timer-label").textContent = state.mode === "focus" ? "Focus" : "Break";
    const progress = state.totalSec > 0 ? state.remainingSec / state.totalSec : 0;
    const offset = CIRCUMFERENCE * (1 - progress);
    $("#timer-progress").style.strokeDashoffset = offset;
  }

  function updateModeButtons() {
    document.querySelectorAll(".mode-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === state.mode);
    });
  }

  function updateStartButton() {
    const btn = $("#start-btn");
    if (state.running) btn.textContent = "Pause";
    else if (state.remainingSec < state.totalSec) btn.textContent = "Resume";
    else btn.textContent = "Start";
  }

  // ---------- Timer logic ----------
  function tick() {
    if (state.remainingSec > 0) {
      state.remainingSec -= 1;
      updateDisplay();
    }
    if (state.remainingSec <= 0) {
      completeSession();
    }
  }

  function startTimer() {
    if (state.running) return;
    state.running = true;
    state.startedAt = state.startedAt || new Date().toISOString();
    state.intervalId = setInterval(tick, 1000);
    updateStartButton();
    // Ask for notification permission once
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

  function pauseTimer() {
    if (!state.running) return;
    state.running = false;
    clearInterval(state.intervalId);
    state.intervalId = null;
    updateStartButton();
  }

  function resetTimer() {
    pauseTimer();
    state.startedAt = null;
    if (state.mode === "focus") state.totalSec = state.focusMin * 60;
    else state.totalSec = state.breakMin * 60;
    state.remainingSec = state.totalSec;
    updateDisplay();
    updateStartButton();
  }

  function completeSession() {
    pauseTimer();
    playBell();

    if (state.mode === "focus") {
      // Record the session
      const durationSec = state.totalSec;
      api("/api/pomodoro/sessions", {
        method: "POST",
        body: {
          date: todayIso(),
          task_id: state.selectedTaskId,
          duration_sec: durationSec,
        },
      }).then(() => {
        toast("Focus session recorded. Take a break.", "success");
        loadStats();
        loadSessions();
      }).catch(err => {
        toast(err.message, "error");
      });

      notify("Focus complete", "Time for a break.");

      // Switch to break mode
      state.mode = "break";
      state.totalSec = state.breakMin * 60;
      state.remainingSec = state.totalSec;
      state.startedAt = null;
      updateModeButtons();
      updateDisplay();
      updateStartButton();
    } else {
      // Break ended
      toast("Break is over. Ready for another focus session?", "success");
      notify("Break complete", "Ready for another focus session.");
      state.mode = "focus";
      state.totalSec = state.focusMin * 60;
      state.remainingSec = state.totalSec;
      state.startedAt = null;
      updateModeButtons();
      updateDisplay();
      updateStartButton();
    }
  }

  function notify(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body, silent: false });
      } catch {}
    }
  }

  function playBell() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      // Two soft notes
      const notes = [880, 660];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.3 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.3 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.3);
        osc.stop(now + i * 0.3 + 0.6);
      });
    } catch {}
  }

  // ---------- Data ----------
  async function loadStats() {
    try {
      const data = await api(`/api/pomodoro/stats?date=${todayIso()}`);
      const t = data.today;
      const a = data.all_time;
      $("#stat-today-count").textContent = t.count;
      $("#stat-today-min").textContent = `${Math.round(t.total_sec / 60)}m`;
      $("#stat-all-count").textContent = a.count;
      $("#stat-all-hours").textContent = formatHours(a.total_sec);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function loadTasks() {
    try {
      const data = await api(`/api/overview?date=${todayIso()}`);
      const sel = $("#task-select");
      sel.innerHTML = `<option value="">— None —</option>`;
      data.tasks.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.title}${t.done ? " ✓" : ""}`;
        sel.appendChild(opt);
      });
    } catch (e) {
      // Silent — task picker is optional
    }
  }

  async function loadSessions() {
    try {
      const data = await api(`/api/pomodoro/sessions?date=${todayIso()}`);
      // The /api/pomodoro/stats endpoint doesn't return individual sessions,
      // so we call the server-side GET on the sessions endpoint.
      // (Adding this in app.py if not present.)
    } catch {}
  }

  // The GET endpoint for sessions we add in app.py:
  // /api/pomodoro/sessions?date=... returns the list
  async function loadSessionList() {
    try {
      const res = await fetch(`/api/pomodoro/sessions?date=${todayIso()}`);
      const data = await res.json();
      if (!data.ok) return;
      const list = $("#session-list");
      if (!data.sessions.length) {
        list.innerHTML = `<div class="empty">No sessions yet today. Start your first focus session.</div>`;
        return;
      }
      list.innerHTML = "";
      data.sessions.forEach(s => {
        const row = document.createElement("div");
        row.className = "session-row";
        const mins = Math.round(s.duration_sec / 60);
        row.innerHTML = `
          <span class="dot"></span>
          <span class="session-dur">${mins}m</span>
          <span class="session-time">${formatTimeOfDay(s.started_at)}</span>
          <span class="session-task">${s.task_id ? "Linked task" : ""}</span>
        `;
        list.appendChild(row);
      });
    } catch {}
  }

  // ---------- Events ----------
  $("#start-btn").addEventListener("click", () => {
    if (state.running) pauseTimer();
    else startTimer();
  });

  $("#reset-btn").addEventListener("click", resetTimer);

  document.querySelectorAll(".mode-btn").forEach(b => {
    b.addEventListener("click", () => {
      if (state.running) {
        if (!confirm("Stop the current timer and switch mode?")) return;
        pauseTimer();
      }
      state.mode = b.dataset.mode;
      state.startedAt = null;
      if (state.mode === "focus") state.totalSec = state.focusMin * 60;
      else state.totalSec = state.breakMin * 60;
      state.remainingSec = state.totalSec;
      updateModeButtons();
      updateDisplay();
      updateStartButton();
    });
  });

  $("#focus-min").addEventListener("change", e => {
    state.focusMin = parseInt(e.target.value, 10);
    if (state.mode === "focus" && !state.running && state.remainingSec === state.totalSec) {
      state.totalSec = state.focusMin * 60;
      state.remainingSec = state.totalSec;
      updateDisplay();
    }
  });

  $("#break-min").addEventListener("change", e => {
    state.breakMin = parseInt(e.target.value, 10);
    if (state.mode === "break" && !state.running && state.remainingSec === state.totalSec) {
      state.totalSec = state.breakMin * 60;
      state.remainingSec = state.totalSec;
      updateDisplay();
    }
  });

  $("#task-select").addEventListener("change", e => {
    state.selectedTaskId = e.target.value ? parseInt(e.target.value, 10) : null;
  });

  $("#theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  // Save timer state to survive tab switches (best-effort)
  setInterval(() => {
    if (state.running) {
      try { localStorage.setItem("dayleaf-pomodoro-remaining", String(state.remainingSec)); } catch {}
    }
  }, 5000);

  // ---------- Init ----------
  initTheme();
  updateDisplay();
  updateModeButtons();
  updateStartButton();
  loadStats();
  loadTasks();
  loadSessionList();
})();