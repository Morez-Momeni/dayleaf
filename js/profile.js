(() => {
  "use strict";

  const MAX_INPUT_FILE_BYTES = 5 * 1024 * 1024; // 5MB input
  const MAX_AVATAR_BYTES = 2_000_000;           // ~2MB after compression
  const MAX_OUTPUT_SIDE = 1024;
  const JPEG_QUALITY = 0.85;
  const $ = (s) => document.querySelector(s);

  let currentProfile = null;
  let pendingAvatar = null;

  function toIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  function todayIso() { return toIso(new Date()); }

  function toast(msg, type = "success") {
    const c = $("#toast-container");
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 2400);
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

  // ---------- Load & render ----------
  async function load() {
    try {
      const data = await api("/api/profile");
      currentProfile = data.profile;
      render();
    } catch (e) { toast(e.message, "error"); }
  }

  function render() {
    if (!currentProfile) return;
    const p = currentProfile;

    $("#profile-name").textContent = p.name || "No profile yet";
    $("#profile-bio").textContent = p.bio || (p.name
      ? "No bio yet."
      : 'Click "Edit Profile" to add your name, photo and bio.');

    const emailEl = $("#profile-email");
    if (p.email) {
      emailEl.textContent = p.email;
      emailEl.classList.remove("hidden");
    } else {
      emailEl.classList.add("hidden");
    }

    const img = $("#profile-avatar");
    const init = $("#profile-initial");
    if (p.avatar) {
      img.src = p.avatar;
      img.classList.remove("hidden");
      init.classList.add("hidden");
    } else {
      img.src = "";
      img.classList.add("hidden");
      init.classList.remove("hidden");
      init.textContent = (p.name || "?").trim().charAt(0).toUpperCase() || "?";
    }

    const stats = p.stats || {};
    $("#profile-stat-tasks").textContent = stats.tasks_done ?? 0;
    $("#profile-stat-habits").textContent = stats.habits_count ?? 0;
    $("#profile-stat-streak").textContent = stats.best_streak ?? 0;
    $("#profile-stat-days").textContent = stats.days_tracked ?? 0;

    $("#report-card").classList.toggle("hidden", !p.name);
    const dateInput = $("#report-end-date");
    if (!dateInput.value) dateInput.value = todayIso();
  }

  // ---------- Modal ----------
  function openModal() {
    const p = currentProfile || { name: "", bio: "", email: "", avatar: "" };
    $("#profile-name-input").value = p.name || "";
    $("#profile-bio-input").value = p.bio || "";
    $("#profile-email-input").value = p.email || "";
    pendingAvatar = null;
    setPreviewAvatar(p.avatar || "");
    $("#profile-error").classList.add("hidden");
    $("#profile-modal").classList.remove("hidden");
    setTimeout(() => $("#profile-name-input").focus(), 50);
  }

  function closeModal() {
    $("#profile-modal").classList.add("hidden");
  }

  function setPreviewAvatar(dataUrl) {
    const img = $("#avatar-preview-img");
    const fb = $("#avatar-preview-fallback");
    const removeBtn = $("#remove-avatar-btn");
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove("hidden");
      fb.classList.add("hidden");
      removeBtn.classList.remove("hidden");
    } else {
      img.src = "";
      img.classList.add("hidden");
      fb.classList.remove("hidden");
      fb.textContent = ($("#profile-name-input").value.trim().charAt(0) || "?").toUpperCase();
      removeBtn.classList.add("hidden");
    }
  }

  // ---------- Avatar input with compression ----------
  $("#avatar-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file.", "error");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_INPUT_FILE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      toast(`Image is too large (${mb}MB). Max 5MB.`, "error");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        toast("Could not read the image.", "error");
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > MAX_OUTPUT_SIDE || height > MAX_OUTPUT_SIDE) {
            if (width >= height) {
              height = Math.round((height * MAX_OUTPUT_SIDE) / width);
              width = MAX_OUTPUT_SIDE;
            } else {
              width = Math.round((width * MAX_OUTPUT_SIDE) / height);
              height = MAX_OUTPUT_SIDE;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressed = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

          if (compressed.length > MAX_AVATAR_BYTES) {
            toast("Image is still too large after compression. Try a smaller image.", "error");
            return;
          }

          pendingAvatar = compressed;
          setPreviewAvatar(compressed);
        } catch (err) {
          console.error(err);
          toast("Could not process the image.", "error");
        }
      };
      img.onerror = () => toast("This image could not be loaded.", "error");
      img.src = dataUrl;
    };
    reader.onerror = () => toast("Could not read the image.", "error");
    reader.readAsDataURL(file);
  });

  $("#remove-avatar-btn").addEventListener("click", () => {
    pendingAvatar = "";
    setPreviewAvatar("");
    $("#avatar-input").value = "";
  });

  $("#profile-name-input").addEventListener("input", () => {
    if (!pendingAvatar && !(currentProfile && currentProfile.avatar)) {
      const fb = $("#avatar-preview-fallback");
      fb.textContent = ($("#profile-name-input").value.trim().charAt(0) || "?").toUpperCase();
    }
  });

  // ---------- Save ----------
  $("#profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("#profile-error");
    const btn = $("#save-profile-btn");
    errEl.classList.add("hidden");

    const name = $("#profile-name-input").value.trim();
    const bio = $("#profile-bio-input").value.trim();
    const email = $("#profile-email-input").value.trim();
    const avatar = pendingAvatar === null
      ? (currentProfile ? currentProfile.avatar || "" : "")
      : pendingAvatar;

    if (!name) {
      errEl.textContent = "Name is required.";
      errEl.classList.remove("hidden");
      return;
    }

    btn.disabled = true;
    try {
      await api("/api/profile", {
        method: "PUT",
        body: { name, bio, email, avatar },
      });
      toast("Profile saved");
      closeModal();
      await load();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Report ----------
  $("#generate-report-btn").addEventListener("click", () => {
    const end = $("#report-end-date").value || todayIso();
    const a = document.createElement("a");
    a.href = `/report?end=${encodeURIComponent(end)}&download=1`;
    a.download = `dayleaf-report-${end}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  $("#preview-report-btn").addEventListener("click", () => {
    const end = $("#report-end-date").value || todayIso();
    window.open(`/report?end=${encodeURIComponent(end)}`, "_blank", "noopener");
  });

  // ---------- Buttons ----------
  $("#open-profile-modal").addEventListener("click", openModal);
  $("#close-profile-modal").addEventListener("click", closeModal);
  $("#cancel-profile").addEventListener("click", closeModal);
  $("#profile-modal").addEventListener("click", (e) => {
    if (e.target.id === "profile-modal") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

 
  window.DayleafProfile = { load };
})();