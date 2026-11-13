import os
import re
import sqlite3
from datetime import date, datetime, timedelta
from html import escape

from flask import Flask, jsonify, request, render_template, g, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "planner.db")
JS_DIR = os.path.join(BASE_DIR, "js")

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False


# ---------- Database ----------

def get_db():
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            task_date TEXT NOT NULL,
            start_time TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'Personal',
            priority TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high')),
            done INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            recur TEXT NOT NULL DEFAULT 'none',
            recur_until TEXT NOT NULL DEFAULT '',
            parent_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL UNIQUE COLLATE NOCASE,
            color TEXT NOT NULL DEFAULT '#718F78',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS habit_checks (
            habit_id INTEGER NOT NULL,
            check_date TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (habit_id, check_date),
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS notes (
            note_date TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL DEFAULT '',
            bio TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            avatar TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS weekly_plans (
            week_start TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pomodoro_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_date TEXT NOT NULL,
            task_id INTEGER,
            duration_sec INTEGER NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(task_date);
        CREATE INDEX IF NOT EXISTS idx_checks_date ON habit_checks(check_date);
        CREATE INDEX IF NOT EXISTS idx_pomodoro_date ON pomodoro_sessions(session_date);
    """)

    cols = {row[1] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    if "recur" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN recur TEXT NOT NULL DEFAULT 'none'")
    if "recur_until" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN recur_until TEXT NOT NULL DEFAULT ''")
    if "parent_id" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN parent_id INTEGER")

    conn.commit()
    conn.close()


# ---------- Validation helpers ----------

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ALLOWED_PRIORITIES = {"low", "medium", "high"}


def parse_iso_date(value):
    if not isinstance(value, str) or not DATE_RE.match(value):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_time(value):
    if value is None:
        return ""
    if not isinstance(value, str):
        return None
    value = value.strip()
    if value == "":
        return ""
    if not TIME_RE.match(value):
        return None
    try:
        datetime.strptime(value, "%H:%M")
    except ValueError:
        return None
    return value


def week_bounds(d):
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def month_bounds(d):
    first = d.replace(day=1)
    if d.month == 12:
        nxt = d.replace(year=d.year + 1, month=1, day=1)
    else:
        nxt = d.replace(month=d.month + 1, day=1)
    last = nxt - timedelta(days=1)
    return first, last


def err(msg, code=400):
    return jsonify({"ok": False, "error": msg}), code


# ---------- Routes: basic ----------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(JS_DIR, filename)


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "status": "healthy", "db": os.path.exists(DB_PATH)})


@app.route("/weekly-plan")
def weekly_plan_view():
    return render_template("weekly_plan.html")


# ---------- Recurring tasks ----------

RECUR_VALUES = {"none", "daily", "weekly", "weekdays"}


def _recur_matches(recur, anchor_date, target_date):
    if target_date < anchor_date:
        return False
    delta = (target_date - anchor_date).days
    if recur == "daily":
        return True
    if recur == "weekly":
        return delta % 7 == 0
    if recur == "weekdays":
        return target_date.weekday() < 5
    return False


def _ensure_recurring_for_date(db, target_date):
    """Create instances of recurring task templates for target_date if missing."""
    templates = db.execute(
        "SELECT * FROM tasks WHERE recur != 'none' AND parent_id IS NULL "
        "AND task_date <= ? AND (recur_until = '' OR recur_until >= ?)",
        (target_date.isoformat(), target_date.isoformat()),
    ).fetchall()

    for tpl in templates:
        anchor = datetime.strptime(tpl["task_date"], "%Y-%m-%d").date()
        if not _recur_matches(tpl["recur"], anchor, target_date):
            continue
        if target_date == anchor:
            continue
        existing = db.execute(
            "SELECT id FROM tasks WHERE parent_id = ? AND task_date = ?",
            (tpl["id"], target_date.isoformat()),
        ).fetchone()
        if existing:
            continue
        db.execute(
            "INSERT INTO tasks "
            "(title, task_date, start_time, category, priority, done, created_at, recur, recur_until, parent_id) "
            "VALUES (?, ?, ?, ?, ?, 0, ?, 'none', '', ?)",
            (tpl["title"], target_date.isoformat(), tpl["start_time"],
             tpl["category"], tpl["priority"], datetime.utcnow().isoformat(), tpl["id"]),
        )
    db.commit()


def _ensure_recurring_for_range(db, start_date, end_date):
    cur = start_date
    while cur <= end_date:
        _ensure_recurring_for_date(db, cur)
        cur += timedelta(days=1)


# ---------- Overview ----------

@app.route("/api/overview")
def api_overview():
    date_param = request.args.get("date")
    selected = parse_iso_date(date_param) if date_param else date.today()
    if selected is None:
        return err("Invalid date. Use YYYY-MM-DD.")

    monday, sunday = week_bounds(selected)
    db = get_db()
    _ensure_recurring_for_range(db, monday, sunday)

    tasks = db.execute(
        "SELECT * FROM tasks WHERE task_date = ? "
        "ORDER BY CASE WHEN start_time = '' THEN 1 ELSE 0 END, "
        "start_time ASC, created_at ASC",
        (selected.isoformat(),),
    ).fetchall()

    week_tasks = db.execute(
        "SELECT * FROM tasks WHERE task_date BETWEEN ? AND ? "
        "ORDER BY task_date ASC, "
        "CASE WHEN start_time = '' THEN 1 ELSE 0 END, "
        "start_time ASC, created_at ASC",
        (monday.isoformat(), sunday.isoformat()),
    ).fetchall()

    habits = db.execute("SELECT * FROM habits ORDER BY created_at ASC, id ASC").fetchall()

    week_checks = db.execute(
        "SELECT habit_id, check_date FROM habit_checks "
        "WHERE check_date BETWEEN ? AND ? AND done = 1",
        (monday.isoformat(), sunday.isoformat()),
    ).fetchall()

    note_row = db.execute(
        "SELECT content FROM notes WHERE note_date = ?", (selected.isoformat(),)
    ).fetchone()

    tasks_list = [dict(t) for t in tasks]
    total_tasks = len(tasks_list)
    done_tasks = sum(1 for t in tasks_list if t["done"])
    task_pct = round(done_tasks / total_tasks * 100) if total_tasks else 0

    done_today_ids = {c["habit_id"] for c in week_checks if c["check_date"] == selected.isoformat()}
    total_habits = len(habits)
    done_habits = sum(1 for h in habits if h["id"] in done_today_ids)
    habit_pct = round(done_habits / total_habits * 100) if total_habits else 0

    matrix = {}
    for c in week_checks:
        matrix.setdefault(str(c["habit_id"]), []).append(c["check_date"])

    week_days = [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    tasks_by_day = {d: [0, 0] for d in week_days}
    for t in week_tasks:
        if t["task_date"] in tasks_by_day:
            tasks_by_day[t["task_date"]][1] += 1
            if t["done"]:
                tasks_by_day[t["task_date"]][0] += 1
    habits_by_day = {d: 0 for d in week_days}
    for c in week_checks:
        if c["check_date"] in habits_by_day:
            habits_by_day[c["check_date"]] += 1

    chart = {
        "days": week_days,
        "tasks_done": [tasks_by_day[d][0] for d in week_days],
        "tasks_total": [tasks_by_day[d][1] for d in week_days],
        "habits_done": [habits_by_day[d] for d in week_days],
        "habits_total": total_habits,
    }

    return jsonify({
        "ok": True,
        "selected_date": selected.isoformat(),
        "week_start": monday.isoformat(),
        "week_end": sunday.isoformat(),
        "today": date.today().isoformat(),
        "tasks": tasks_list,
        "week_tasks": [dict(t) for t in week_tasks],
        "habits": [dict(h) for h in habits],
        "habit_matrix": matrix,
        "notes": note_row["content"] if note_row else "",
        "task_stats": {"total": total_tasks, "completed": done_tasks, "percent": task_pct},
        "habit_stats": {"total": total_habits, "completed": done_habits, "percent": habit_pct},
        "chart": chart,
    })


# ---------- Habits: monthly matrix ----------

@app.route("/api/habits/month")
def habits_month():
    month_param = request.args.get("month")
    if month_param and re.match(r"^\d{4}-\d{2}$", month_param):
        try:
            y, m = map(int, month_param.split("-"))
            anchor = date(y, m, 1)
        except ValueError:
            return err("Invalid month.")
    else:
        anchor = date.today().replace(day=1)

    first, last = month_bounds(anchor)
    db = get_db()
    habits = db.execute("SELECT * FROM habits ORDER BY created_at ASC, id ASC").fetchall()
    checks = db.execute(
        "SELECT habit_id, check_date FROM habit_checks "
        "WHERE check_date BETWEEN ? AND ? AND done = 1",
        (first.isoformat(), last.isoformat()),
    ).fetchall()

    days = []
    cur = first
    while cur <= last:
        days.append(cur.isoformat())
        cur += timedelta(days=1)

    matrix = {}
    for c in checks:
        matrix.setdefault(str(c["habit_id"]), []).append(c["check_date"])

    return jsonify({
        "ok": True,
        "month": anchor.strftime("%Y-%m"),
        "days": days,
        "habits": [dict(h) for h in habits],
        "matrix": matrix,
    })


# ---------- Habits: heatmap + streak ----------

@app.route("/api/habits/<int:habit_id>/heatmap")
def habits_heatmap(habit_id):
    db = get_db()
    if db.execute("SELECT id FROM habits WHERE id = ?", (habit_id,)).fetchone() is None:
        return err("Habit not found.", 404)

    today = date.today()
    end = today + timedelta(days=(5 - today.weekday()))
    start = end - timedelta(days=52 * 7 + 6)

    checks = db.execute(
        "SELECT check_date FROM habit_checks WHERE habit_id = ? "
        "AND check_date BETWEEN ? AND ? AND done = 1",
        (habit_id, start.isoformat(), end.isoformat()),
    ).fetchall()
    done = {c["check_date"] for c in checks}

    days = []
    cur = start
    while cur <= end:
        days.append({
            "date": cur.isoformat(),
            "done": cur.isoformat() in done,
            "in_future": cur > today,
        })
        cur += timedelta(days=1)

    return jsonify({
        "ok": True,
        "habit_id": habit_id,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "today": today.isoformat(),
        "days": days,
    })


@app.route("/api/habits/<int:habit_id>/streak")
def habits_streak(habit_id):
    db = get_db()
    if db.execute("SELECT id FROM habits WHERE id = ?", (habit_id,)).fetchone() is None:
        return err("Habit not found.", 404)

    checks = db.execute(
        "SELECT check_date FROM habit_checks WHERE habit_id = ? AND done = 1 "
        "ORDER BY check_date DESC",
        (habit_id,),
    ).fetchall()
    done = {c["check_date"] for c in checks}

    today = date.today()
    cur = today
    if today.isoformat() not in done:
        cur = today - timedelta(days=1)
    current = 0
    while cur.isoformat() in done:
        current += 1
        cur -= timedelta(days=1)

    longest = 0
    run = 0
    prev = None
    for iso in sorted(done):
        d = datetime.strptime(iso, "%Y-%m-%d").date()
        if prev is not None and (d - prev).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)
        prev = d

    return jsonify({
        "ok": True,
        "habit_id": habit_id,
        "current": current,
        "longest": longest,
        "total_days": len(done),
    })


# ---------- Tasks ----------

@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return err("Task title is required.")
    if len(title) > 200:
        return err("Task title is too long (max 200 characters).")

    task_date = parse_iso_date(data.get("task_date"))
    if task_date is None:
        return err("Valid task date is required (YYYY-MM-DD).")

    start_time = parse_time(data.get("start_time", ""))
    if start_time is None:
        return err("Invalid time. Use HH:MM.")

    category = (data.get("category") or "Personal").strip() or "Personal"
    if len(category) > 40:
        return err("Category is too long (max 40 characters).")

    priority = (data.get("priority") or "medium").strip().lower()
    if priority not in ALLOWED_PRIORITIES:
        return err("Invalid priority. Use low, medium, or high.")

    recur = (data.get("recur") or "none").strip().lower()
    if recur not in RECUR_VALUES:
        return err("Invalid repeat value.")

    recur_until = ""
    if recur != "none":
        raw = (data.get("recur_until") or "").strip()
        if raw:
            d = parse_iso_date(raw)
            if d is None:
                return err("Invalid repeat-until date.")
            if d < task_date:
                return err("Repeat-until date cannot be before the task date.")
            recur_until = d.isoformat()

    db = get_db()
    cur = db.execute(
        "INSERT INTO tasks "
        "(title, task_date, start_time, category, priority, done, created_at, recur, recur_until) "
        "VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
        (title, task_date.isoformat(), start_time, category, priority,
         datetime.utcnow().isoformat(), recur, recur_until),
    )
    db.commit()
    task = db.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify({"ok": True, "task": dict(task)}), 201


@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task(task_id):
    db = get_db()
    row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return err("Task not found.", 404)

    data = request.get_json(silent=True) or {}
    title = row["title"]
    task_date = row["task_date"]
    start_time = row["start_time"] or ""
    category = row["category"]
    priority = row["priority"]
    done = row["done"]
    recur = row["recur"] or "none"
    recur_until = row["recur_until"] or ""

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return err("Task title is required.")
        if len(title) > 200:
            return err("Task title is too long.")
    if "task_date" in data:
        d = parse_iso_date(data.get("task_date"))
        if d is None:
            return err("Invalid date.")
        task_date = d.isoformat()
    if "start_time" in data:
        st = parse_time(data.get("start_time"))
        if st is None:
            return err("Invalid time.")
        start_time = st
    if "category" in data:
        category = (data.get("category") or "Personal").strip() or "Personal"
        if len(category) > 40:
            return err("Category is too long.")
    if "priority" in data:
        p = (data.get("priority") or "").strip().lower()
        if p not in ALLOWED_PRIORITIES:
            return err("Invalid priority.")
        priority = p
    if "done" in data:
        done = 1 if data.get("done") else 0
    if "recur" in data:
        r = (data.get("recur") or "none").strip().lower()
        if r not in RECUR_VALUES:
            return err("Invalid repeat value.")
        recur = r
        if recur == "none":
            recur_until = ""
    if "recur_until" in data and recur != "none":
        raw = (data.get("recur_until") or "").strip()
        if raw:
            d = parse_iso_date(raw)
            if d is None:
                return err("Invalid repeat-until date.")
            if d < datetime.strptime(task_date, "%Y-%m-%d").date():
                return err("Repeat-until cannot be before the task date.")
            recur_until = d.isoformat()
        else:
            recur_until = ""

    db.execute(
        "UPDATE tasks SET title=?, task_date=?, start_time=?, category=?, priority=?, done=?, "
        "recur=?, recur_until=? WHERE id=?",
        (title, task_date, start_time, category, priority, done, recur, recur_until, task_id),
    )
    db.commit()
    updated = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify({"ok": True, "task": dict(updated)})


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    db = get_db()
    row = db.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return err("Task not found.", 404)
    db.execute("DELETE FROM tasks WHERE parent_id = ?", (task_id,))
    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------- Habits: CRUD + check ----------

@app.route("/api/habits", methods=["POST"])
def create_habit():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return err("Habit name is required.")
    if len(title) > 60:
        return err("Habit name is too long (max 60 characters).")

    color = (data.get("color") or "#718F78").strip()
    if not COLOR_RE.match(color):
        return err("Invalid color format.")

    db = get_db()
    if db.execute("SELECT id FROM habits WHERE title = ? COLLATE NOCASE", (title,)).fetchone():
        return err("A habit with that name already exists.", 409)

    cur = db.execute(
        "INSERT INTO habits (title, color, created_at) VALUES (?, ?, ?)",
        (title, color, datetime.utcnow().isoformat()),
    )
    db.commit()
    habit = db.execute("SELECT * FROM habits WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify({"ok": True, "habit": dict(habit)}), 201


@app.route("/api/habits/<int:habit_id>", methods=["DELETE"])
def delete_habit(habit_id):
    db = get_db()
    row = db.execute("SELECT id FROM habits WHERE id = ?", (habit_id,)).fetchone()
    if row is None:
        return err("Habit not found.", 404)
    db.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/habits/<int:habit_id>/check", methods=["PATCH"])
def check_habit(habit_id):
    data = request.get_json(silent=True) or {}
    d = parse_iso_date(data.get("date"))
    if d is None:
        return err("Valid date is required.")
    if "done" not in data:
        return err("Field 'done' is required.")
    done = 1 if data.get("done") else 0

    db = get_db()
    if db.execute("SELECT id FROM habits WHERE id = ?", (habit_id,)).fetchone() is None:
        return err("Habit not found.", 404)

    if done:
        db.execute(
            "INSERT INTO habit_checks (habit_id, check_date, done) VALUES (?, ?, 1) "
            "ON CONFLICT(habit_id, check_date) DO UPDATE SET done=1",
            (habit_id, d.isoformat()),
        )
    else:
        db.execute(
            "DELETE FROM habit_checks WHERE habit_id = ? AND check_date = ?",
            (habit_id, d.isoformat()),
        )
    db.commit()
    return jsonify({"ok": True})


# ---------- Notes ----------

@app.route("/api/notes", methods=["PUT"])
def save_notes():
    data = request.get_json(silent=True) or {}
    d = parse_iso_date(data.get("date"))
    if d is None:
        return err("Valid date required.")
    content = data.get("content", "")
    if not isinstance(content, str):
        return err("Content must be a string.")
    if len(content) > 20000:
        return err("Note is too long (max 20000 characters).")

    db = get_db()
    db.execute(
        "INSERT INTO notes (note_date, content, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(note_date) DO UPDATE SET "
        "content=excluded.content, updated_at=excluded.updated_at",
        (d.isoformat(), content, datetime.utcnow().isoformat()),
    )
    db.commit()
    return jsonify({"ok": True})


# ---------- Profile ----------

def _compute_best_streak(db):
    best = 0
    for h in db.execute("SELECT id FROM habits").fetchall():
        rows = db.execute(
            "SELECT check_date FROM habit_checks WHERE habit_id = ? AND done = 1 ORDER BY check_date",
            (h["id"],),
        ).fetchall()
        run, prev = 0, None
        for r in rows:
            d = datetime.strptime(r["check_date"], "%Y-%m-%d").date()
            if prev is not None and (d - prev).days == 1:
                run += 1
            else:
                run = 1
            best = max(best, run)
            prev = d
    return best


@app.route("/api/profile", methods=["GET"])
def get_profile():
    db = get_db()
    row = db.execute("SELECT * FROM profile WHERE id = 1").fetchone()
    profile = dict(row) if row else {"name": "", "bio": "", "email": "", "avatar": ""}

    tasks_done = db.execute("SELECT COUNT(*) FROM tasks WHERE done = 1").fetchone()[0]
    habits_count = db.execute("SELECT COUNT(*) FROM habits").fetchone()[0]
    best_streak = _compute_best_streak(db)
    days_tracked = db.execute(
        "SELECT COUNT(*) FROM ("
        "  SELECT task_date AS d FROM tasks"
        "  UNION SELECT check_date AS d FROM habit_checks"
        "  UNION SELECT note_date AS d FROM notes WHERE content != ''"
        ")"
    ).fetchone()[0]

    profile["stats"] = {  # type: ignore
        "tasks_done": tasks_done,
        "habits_count": habits_count,
        "best_streak": best_streak,
        "days_tracked": days_tracked,
    }
    return jsonify({"ok": True, "profile": profile})


@app.route("/api/pomodoro/sessions", methods=["GET"])
def pomodoro_list_sessions():
    date_param = request.args.get("date")
    d = parse_iso_date(date_param) if date_param else date.today()
    if d is None:
        return err("Invalid date.")
    db = get_db()
    rows = db.execute(
        "SELECT * FROM pomodoro_sessions "
        "WHERE session_date = ? AND completed = 1 "
        "ORDER BY started_at DESC",
        (d.isoformat(),),
    ).fetchall()
    return jsonify({"ok": True, "sessions": [dict(r) for r in rows]})


@app.route("/api/profile", methods=["PUT"])
def save_profile():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    bio = (data.get("bio") or "").strip()
    email = (data.get("email") or "").strip()
    avatar = data.get("avatar", "") or ""

    if not name:
        return err("Name is required.")
    if len(name) > 60:
        return err("Name is too long (max 60 characters).")
    if len(bio) > 500:
        return err("Bio is too long (max 500 characters).")
    if email and not EMAIL_RE.match(email):
        return err("Invalid email address.")
    if avatar:
        if not isinstance(avatar, str) or not avatar.startswith("data:image/"):
            return err("Invalid avatar format.")
        if len(avatar) > 2_000_000:
            return err("Avatar is too large.")

    db = get_db()
    now = datetime.utcnow().isoformat()
    exists = db.execute("SELECT id FROM profile WHERE id = 1").fetchone()
    if exists:
        db.execute(
            "UPDATE profile SET name=?, bio=?, email=?, avatar=?, updated_at=? WHERE id=1",
            (name, bio, email, avatar, now),
        )
    else:
        db.execute(
            "INSERT INTO profile (id, name, bio, email, avatar, created_at, updated_at) "
            "VALUES (1, ?, ?, ?, ?, ?, ?)",
            (name, bio, email, avatar, now, now),
        )
    db.commit()
    return jsonify({"ok": True})


# ---------- Report ----------

@app.route("/report")
def report_view():
    try:
        end_str = request.args.get("end")
        end_date = parse_iso_date(end_str) if end_str else date.today()
        if end_date is None:
            return "Invalid end date", 400
        html = _build_report_html(end_date)
        headers = {"Content-Type": "text/html; charset=utf-8"}
        if request.args.get("download"):
            filename = f"dayleaf-report-{end_date.isoformat()}.html"
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        return html, 200, headers
    except Exception:
        app.logger.exception("Report generation failed")
        return "Failed to generate report. Please try again.", 500


def _build_report_html(end_date):
    db = get_db()
    end_iso = end_date.isoformat()

    row = db.execute("SELECT * FROM profile WHERE id = 1").fetchone()
    profile = dict(row) if row else {"name": "Anonymous", "bio": "", "email": "", "avatar": ""}
    if not profile["name"]:
        profile["name"] = "Anonymous"

    candidates = []
    for q in (
        "SELECT MIN(task_date) FROM tasks WHERE task_date <= ?",
        "SELECT MIN(check_date) FROM habit_checks WHERE check_date <= ?",
        "SELECT MIN(note_date) FROM notes WHERE note_date <= ? AND content != ''",
    ):
        v = db.execute(q, (end_iso,)).fetchone()[0]
        if v:
            candidates.append(v)
    start_date = (
        min(datetime.strptime(d, "%Y-%m-%d").date() for d in candidates)
        if candidates else end_date
    )

    total_tasks = db.execute(
        "SELECT COUNT(*) FROM tasks WHERE task_date <= ?", (end_iso,)
    ).fetchone()[0]
    done_tasks = db.execute(
        "SELECT COUNT(*) FROM tasks WHERE done=1 AND task_date <= ?", (end_iso,)
    ).fetchone()[0]
    task_pct = round(done_tasks / total_tasks * 100) if total_tasks else 0

    cat_rows = db.execute(
        "SELECT category, COUNT(*) AS total, SUM(done) AS done "
        "FROM tasks WHERE task_date <= ? GROUP BY category ORDER BY total DESC",
        (end_iso,),
    ).fetchall()

    habits = db.execute("SELECT * FROM habits ORDER BY created_at ASC").fetchall()
    habit_stats = []
    for h in habits:
        checks = db.execute(
            "SELECT check_date FROM habit_checks WHERE habit_id = ? AND done = 1 "
            "AND check_date <= ? ORDER BY check_date",
            (h["id"], end_iso),
        ).fetchall()
        dates = [c["check_date"] for c in checks]
        longest = run = 0
        prev = None
        for iso in dates:
            d = datetime.strptime(iso, "%Y-%m-%d").date()
            if prev is not None and (d - prev).days == 1:
                run += 1
            else:
                run = 1
            longest = max(longest, run)
            prev = d
        habit_stats.append({
            "title": h["title"],
            "color": h["color"],
            "total": len(dates),
            "longest": longest,
        })

    total_habits = len(habits)
    best_streak = max((h["longest"] for h in habit_stats), default=0)
    total_habit_checks = sum(h["total"] for h in habit_stats)

    days_tracked = db.execute(
        "SELECT COUNT(*) FROM ("
        "  SELECT task_date AS d FROM tasks WHERE task_date <= ?"
        "  UNION SELECT check_date AS d FROM habit_checks WHERE check_date <= ?"
        "  UNION SELECT note_date AS d FROM notes WHERE note_date <= ? AND content != ''"
        ")",
        (end_iso, end_iso, end_iso),
    ).fetchone()[0]

    notes_count = db.execute(
        "SELECT COUNT(*) FROM notes WHERE note_date <= ? AND content != ''",
        (end_iso,),
    ).fetchone()[0]

    weeks = []
    end_week_start = end_date - timedelta(days=end_date.weekday())
    for i in range(7, -1, -1):
        w_start = end_week_start - timedelta(weeks=i)
        w_end = w_start + timedelta(days=6)
        t = db.execute(
            "SELECT COUNT(*) FROM tasks WHERE done=1 AND task_date BETWEEN ? AND ?",
            (w_start.isoformat(), w_end.isoformat()),
        ).fetchone()[0]
        h = db.execute(
            "SELECT COUNT(*) FROM habit_checks WHERE done=1 AND check_date BETWEEN ? AND ?",
            (w_start.isoformat(), w_end.isoformat()),
        ).fetchone()[0]
        weeks.append({"label": w_start.strftime("%b %d"), "total": t + h})

    chart_w, chart_h, bar_w, gap = 700, 220, 48, 28
    max_val = max((w["total"] for w in weeks), default=1) or 1
    total_bar_w = len(weeks) * bar_w + (len(weeks) - 1) * gap
    offset_x = (chart_w - total_bar_w) / 2
    svg_parts = []
    for i, w in enumerate(weeks):
        x = offset_x + i * (bar_w + gap)
        h_px = (w["total"] / max_val) * (chart_h - 50)
        y = chart_h - 30 - h_px
        svg_parts.append(
            f'<rect x="{x}" y="{y}" width="{bar_w}" height="{h_px}" fill="#718F78" rx="6"/>'
        )
        if w["total"] > 0:
            svg_parts.append(
                f'<text x="{x + bar_w/2}" y="{y - 6}" text-anchor="middle" '
                f'font-size="11" fill="#26342C" font-weight="600">{w["total"]}</text>'
            )
        svg_parts.append(
            f'<text x="{x + bar_w/2}" y="{chart_h - 8}" text-anchor="middle" '
            f'font-size="10" fill="#89938A">{w["label"]}</text>'
        )
    chart_svg = (
        f'<svg viewBox="0 0 {chart_w} {chart_h}" xmlns="http://www.w3.org/2000/svg" '
        f'style="width:100%;height:auto">{"".join(svg_parts)}</svg>'
    )

    cat_html = ""
    for c in cat_rows:
        pct = round((c["done"] or 0) / c["total"] * 100) if c["total"] else 0
        cat_html += (
            f'<div class="cat-row">'
            f'<div class="cat-label">{escape(c["category"])}</div>'
            f'<div class="cat-bar-wrap"><div class="cat-bar" style="width:{pct}%"></div></div>'
            f'<div class="cat-count">{c["done"] or 0} / {c["total"]}</div>'
            f'</div>'
        )

    habits_html = ""
    for h in habit_stats:
        habits_html += (
            f'<div class="habit-row">'
            f'<span class="habit-dot" style="background:{h["color"]}"></span>'
            f'<span class="habit-name">{escape(h["title"])}</span>'
            f'<span class="habit-metric">{h["total"]} days</span>'
            f'<span class="habit-metric">Best: {h["longest"]}</span>'
            f'</div>'
        )

    if profile.get("avatar"):
        avatar_html = f'<img src="{profile["avatar"]}" alt="avatar"/>'
    else:
        avatar_html = f'<span class="avatar-fallback">{escape(profile["name"][:1].upper())}</span>'

    bio_html = f'<p class="hero-bio">{escape(profile["bio"])}</p>' if profile["bio"] else ""
    period = f"{start_date.strftime('%b %d, %Y')} – {end_date.strftime('%b %d, %Y')}"
    generated = datetime.now().strftime("%B %d, %Y · %H:%M")
    safe_name = escape(profile["name"])
    safe_period = escape(period)
    safe_generated = escape(generated)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dayleaf Report — {safe_name}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #F6F7F4; color: #26342C; line-height: 1.55; }}
  .page {{ max-width: 900px; margin: 0 auto; padding: 32px 24px; }}
  .report {{ background: #fff; border-radius: 20px; overflow: hidden;
             box-shadow: 0 10px 40px rgba(38,52,44,.08); }}
  .report-top {{ background: linear-gradient(135deg, #4E6C56 0%, #718F78 100%); color: #fff;
                 padding: 22px 32px; display: flex; justify-content: space-between; align-items: center;
                 gap: 16px; flex-wrap: wrap; }}
  .brand {{ font-weight: 700; font-size: 20px; letter-spacing: -.01em; display: flex; align-items: center; gap: 8px; }}
  .brand-sub {{ font-size: 12px; opacity: .85; letter-spacing: .12em; text-transform: uppercase; }}
  .hero {{ display: flex; align-items: center; gap: 24px; padding: 32px;
           border-bottom: 1px solid #E9EDE7; flex-wrap: wrap; }}
  .avatar {{ width: 84px; height: 84px; border-radius: 50%; background: #EDF4ED;
             display: grid; place-items: center; overflow: hidden; flex-shrink: 0; }}
  .avatar img {{ width: 100%; height: 100%; object-fit: cover; }}
  .avatar-fallback {{ font-size: 36px; font-weight: 700; color: #4E6C56; }}
  .hero-info {{ flex: 1; min-width: 200px; }}
  .hero-name {{ margin: 0 0 4px; font-size: 28px; font-weight: 700; letter-spacing: -.02em; }}
  .hero-bio {{ margin: 0 0 10px; color: #6a756c; font-size: 14px; }}
  .hero-period {{ display: inline-block; font-size: 12px; font-weight: 600;
                  padding: 4px 12px; border-radius: 999px;
                  background: #EDF4ED; color: #4E6C56; }}
  .summary {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
              background: #E9EDE7; }}
  .summary-card {{ background: #fff; padding: 22px 20px; text-align: center; }}
  .summary-label {{ font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
                    color: #89938A; font-weight: 600; margin-bottom: 6px; }}
  .summary-value {{ font-size: 30px; font-weight: 700; color: #26342C; letter-spacing: -.02em; }}
  .summary-sub {{ font-size: 12px; color: #89938A; margin-top: 2px; }}
  .section {{ padding: 28px 32px; border-bottom: 1px solid #E9EDE7; }}
  .section:last-of-type {{ border-bottom: 0; }}
  .section h2 {{ margin: 0 0 18px; font-size: 16px; font-weight: 700;
                 text-transform: uppercase; letter-spacing: .06em; color: #4E6C56; }}
  .chart {{ margin: 0 -8px; }}
  .cat-row {{ display: grid; grid-template-columns: 130px 1fr 70px;
              align-items: center; gap: 12px; padding: 8px 0; }}
  .cat-label {{ font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
  .cat-bar-wrap {{ height: 8px; background: #EDF4ED; border-radius: 999px; overflow: hidden; }}
  .cat-bar {{ height: 100%; background: #718F78; border-radius: 999px; }}
  .cat-count {{ text-align: right; font-size: 13px; color: #89938A; font-variant-numeric: tabular-nums; }}
  .habit-row {{ display: flex; align-items: center; gap: 12px; padding: 10px 0;
                border-bottom: 1px solid #F2F4F0; }}
  .habit-row:last-child {{ border-bottom: 0; }}
  .habit-dot {{ width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }}
  .habit-name {{ flex: 1; font-size: 14px; font-weight: 500; }}
  .habit-metric {{ font-size: 12px; color: #89938A; white-space: nowrap; }}
  .empty {{ padding: 24px; text-align: center; color: #89938A; font-size: 14px; }}
  .footer {{ padding: 20px 32px; background: #F6F7F4; text-align: center;
             font-size: 12px; color: #89938A; }}
  .actions {{ text-align: center; margin-top: 24px; }}
  .print-btn {{ display: inline-block; padding: 10px 20px; background: #718F78; color: #fff;
                border-radius: 10px; font-size: 14px; font-weight: 600;
                text-decoration: none; cursor: pointer; border: 0; font-family: inherit; }}
  .print-btn:hover {{ background: #4E6C56; }}
  @media print {{
    body {{ background: #fff; }}
    .page {{ max-width: none; padding: 0; }}
    .report {{ box-shadow: none; border-radius: 0; }}
    .actions {{ display: none; }}
    @page {{ margin: 1.5cm; }}
  }}
  @media (max-width: 640px) {{
    .summary {{ grid-template-columns: repeat(2, 1fr); }}
    .section {{ padding: 20px 18px; }}
    .hero {{ padding: 22px 18px; }}
    .hero-name {{ font-size: 22px; }}
    .cat-row {{ grid-template-columns: 100px 1fr 60px; }}
  }}
</style>
</head>
<body>
  <div class="page">
    <div class="report">
      <div class="report-top">
        <div class="brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3C8 6 6 9 6 13a6 6 0 0 0 12 0c0-4-2-7-6-10z"/>
            <path d="M12 8v9"/>
          </svg>
          Dayleaf
        </div>
        <div class="brand-sub">Personal Report</div>
      </div>

      <div class="hero">
        <div class="avatar">{avatar_html}</div>
        <div class="hero-info">
          <h1 class="hero-name">{safe_name}</h1>
          {bio_html}
          <div class="hero-period">{safe_period}</div>
        </div>
      </div>

      <div class="summary">
        <div class="summary-card">
          <div class="summary-label">Tasks</div>
          <div class="summary-value">{done_tasks}</div>
          <div class="summary-sub">of {total_tasks} ({task_pct}%)</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Habit checks</div>
          <div class="summary-value">{total_habit_checks}</div>
          <div class="summary-sub">across {total_habits} habits</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Best streak</div>
          <div class="summary-value">{best_streak}</div>
          <div class="summary-sub">days in a row</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Active days</div>
          <div class="summary-value">{days_tracked}</div>
          <div class="summary-sub">{notes_count} notes written</div>
        </div>
      </div>

      <div class="section">
        <h2>Weekly Activity</h2>
        <div class="chart">{chart_svg}</div>
      </div>

      <div class="section">
        <h2>Tasks by Category</h2>
        {cat_html if cat_html else '<div class="empty">No tasks in this period.</div>'}
      </div>

      <div class="section">
        <h2>Habits</h2>
        {habits_html if habits_html else '<div class="empty">No habits created yet.</div>'}
      </div>

      <div class="footer">
        Generated on {safe_generated} · Dayleaf Personal Planner
      </div>
    </div>

    <div class="actions">
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>
</body>
</html>"""


# ---------- Weekly Planner ----------

@app.route("/api/weekly-plan", methods=["GET"])
def get_weekly_plan():
    date_param = request.args.get("date")
    selected = parse_iso_date(date_param) if date_param else date.today()
    if selected is None:
        return err("Invalid date.")

    monday, sunday = week_bounds(selected)
    db = get_db()
    _ensure_recurring_for_range(db, monday, sunday)

    row = db.execute(
        "SELECT content FROM weekly_plans WHERE week_start = ?",
        (monday.isoformat(),),
    ).fetchone()

    tasks = db.execute(
        "SELECT * FROM tasks WHERE task_date BETWEEN ? AND ? "
        "ORDER BY task_date ASC, "
        "CASE WHEN start_time = '' THEN 1 ELSE 0 END, "
        "start_time ASC, created_at ASC",
        (monday.isoformat(), sunday.isoformat()),
    ).fetchall()

    tasks_list = [dict(t) for t in tasks]
    total = len(tasks_list)
    done = sum(1 for t in tasks_list if t["done"])

    return jsonify({
        "ok": True,
        "week_start": monday.isoformat(),
        "week_end": sunday.isoformat(),
        "today": date.today().isoformat(),
        "content": row["content"] if row else "",
        "tasks": tasks_list,
        "stats": {
            "total": total,
            "completed": done,
            "percent": round(done / total * 100) if total else 0,
        },
    })


@app.route("/api/weekly-plan", methods=["PUT"])
def save_weekly_plan():
    data = request.get_json(silent=True) or {}
    d = parse_iso_date(data.get("date"))
    if d is None:
        return err("Valid date required.")

    monday, _ = week_bounds(d)
    content = data.get("content", "")
    if not isinstance(content, str):
        return err("Content must be a string.")
    if len(content) > 20000:
        return err("Plan is too long (max 20000 characters).")

    db = get_db()
    db.execute(
        "INSERT INTO weekly_plans (week_start, content, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(week_start) DO UPDATE SET "
        "content=excluded.content, updated_at=excluded.updated_at",
        (monday.isoformat(), content, datetime.utcnow().isoformat()),
    )
    db.commit()
    return jsonify({"ok": True})


# ---------- Calendar Month View ----------

@app.route("/calendar")
def calendar_view():
    return render_template("calendar.html")


@app.route("/api/tasks/month")
def tasks_month():
    month_param = request.args.get("month")
    if month_param and re.match(r"^\d{4}-\d{2}$", month_param):
        try:
            y, m = map(int, month_param.split("-"))
            anchor = date(y, m, 1)
        except ValueError:
            return err("Invalid month.")
    else:
        anchor = date.today().replace(day=1)

    first, last = month_bounds(anchor)
    db = get_db()
    _ensure_recurring_for_range(db, first, last)

    tasks = db.execute(
        "SELECT * FROM tasks WHERE task_date BETWEEN ? AND ? "
        "ORDER BY task_date ASC, "
        "CASE WHEN start_time = '' THEN 1 ELSE 0 END, "
        "start_time ASC, created_at ASC",
        (first.isoformat(), last.isoformat()),
    ).fetchall()

    return jsonify({
        "ok": True,
        "month": anchor.strftime("%Y-%m"),
        "today": date.today().isoformat(),
        "tasks": [dict(t) for t in tasks],
    })


# ---------- Pomodoro ----------

@app.route("/pomodoro")
def pomodoro_view():
    return render_template("pomodoro.html")


@app.route("/api/pomodoro/stats")
def pomodoro_stats():
    date_param = request.args.get("date")
    d = parse_iso_date(date_param) if date_param else date.today()
    if d is None:
        return err("Invalid date.")

    db = get_db()
    today_row = db.execute(
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(duration_sec), 0) AS total "
        "FROM pomodoro_sessions WHERE session_date = ? AND completed = 1",
        (d.isoformat(),),
    ).fetchone()
    all_row = db.execute(
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(duration_sec), 0) AS total "
        "FROM pomodoro_sessions WHERE completed = 1"
    ).fetchone()

    return jsonify({
        "ok": True,
        "today": {"count": today_row["cnt"], "total_sec": today_row["total"]},
        "all_time": {"count": all_row["cnt"], "total_sec": all_row["total"]},
    })


@app.route("/api/pomodoro/sessions", methods=["POST"])
def pomodoro_add_session():
    data = request.get_json(silent=True) or {}
    duration = data.get("duration_sec")
    if not isinstance(duration, int) or duration < 1 or duration > 7200:
        return err("Invalid duration.")

    d = parse_iso_date(data.get("date"))
    if d is None:
        return err("Valid date required.")

    task_id = data.get("task_id")
    if task_id is not None:
        try:
            task_id = int(task_id)
        except (TypeError, ValueError):
            task_id = None

    db = get_db()
    if task_id is not None:
        exists = db.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not exists:
            task_id = None

    now = datetime.now().isoformat()
    cur = db.execute(
        "INSERT INTO pomodoro_sessions "
        "(session_date, task_id, duration_sec, started_at, ended_at, completed) "
        "VALUES (?, ?, ?, ?, ?, 1)",
        (d.isoformat(), task_id, duration, now, now),
    )
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


# ---------- Error handler ----------

@app.errorhandler(Exception)
def handle_exception(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return e
    app.logger.exception("Unhandled exception")
    return jsonify({"ok": False, "error": "Server error. Please try again."}), 500


# ---------- Entry ----------

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)