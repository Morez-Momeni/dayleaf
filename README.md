<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=gradient&customColorList=6&text=Dayleaf&fontSize=58&fontColor=ffffff&animation=twinkling&fontAlignY=38&desc=Make%20space%20for%20what%20matters&descAlignY=58&descSize=16" width="100%" alt="Dayleaf banner" />
</p>

<p align="center">
  A calm, locally hosted space for planning your days, building habits, and keeping track of your progress.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10%2B-718B70?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+" />
  <img src="https://img.shields.io/badge/Flask-Web%20App-718B70?style=flat-square&logo=flask&logoColor=white" alt="Flask" />
  <img src="https://img.shields.io/badge/SQLite-Local%20Storage-718B70?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Frontend-Vanilla%20JS-718B70?style=flat-square&logo=javascript&logoColor=white" alt="Vanilla JavaScript" />
  <img src="https://img.shields.io/badge/Privacy-Local%20First-718B70?style=flat-square" alt="Local first" />
</p>

---

## About

Dayleaf is a personal productivity application designed to bring your daily plans, habits, notes, and progress into one quiet, organized space.

Instead of relying on cloud services or external productivity platforms, Dayleaf runs locally on your own computer and opens directly in your browser. Your tasks, habit history, personal notes, and profile stay in a local SQLite database.

Plan your day, explore your week, build consistent habits, and look back at your progress — all through a minimalist interface designed to feel comfortable rather than overwhelming.

**Your plans. Your progress. Your data.**

## Features

### Daily Planning

Keep your daily responsibilities organized without losing sight of what matters.

- Create, edit, and delete tasks.
- Assign a date and an optional start time.
- Organize tasks using custom categories.
- Set task priorities: Low, Medium, or High.
- Mark tasks as completed using checkboxes.
- Update any property of an existing task.
- Delete tasks with a confirmation dialog.
- View scheduled tasks before unscheduled tasks.
- Sort scheduled tasks by time and unscheduled tasks by creation time.
- Display completed tasks with muted text and strikethrough.
- Receive helpful validation messages when task information is invalid.

Categories are not restricted to a predefined list. You can enter your own category while using suggestions such as Personal, Study, Work, Health, and Other.

When your day has no tasks, Dayleaf keeps the experience simple:

> A fresh page. Add a task and make today count.

### Weekly Planner

See your plans from a wider perspective.

- View the entire week from Monday through Sunday.
- See the date number for every day.
- Preview up to two tasks per day.
- See a `+N more` indicator when a day contains additional tasks.
- Identify today's column visually.
- Highlight the currently selected day.
- Select any day to update the Daily Planner.
- Navigate to the previous week or next week.
- Return to the current week with the This Week action.
- Handle month and year transitions automatically.

The weekly planner connects your daily tasks with your broader schedule, making it easier to understand how your week is taking shape.

### Habit Tracker

Build routines through small, repeatable actions.

- Create habits with a name and a color.
- Choose from seven predefined colors.
- Prevent duplicate habit names, including differences in letter casing.
- Delete habits with a confirmation explaining that their history will also be deleted.
- Mark habits complete or incomplete for any specific date.
- Track today's habits using individual checkboxes.
- Identify habits using their assigned color.
- Display a streak badge when a habit has an active streak.
- Edit historical habit records.
- Edit future habit records.

The habit tracker is not limited to today's progress. You can review and update your history whenever needed.

### Weekly Habit Matrix

See all your habits and their progress across the selected week.

- Display every habit against the seven days of the week.
- Mark or unmark any habit directly from the matrix.
- Highlight today's column.
- Highlight the currently selected date.
- Keep habit history editable.

The weekly matrix provides a compact overview of your routines and helps you identify consistency throughout the week.

### Monthly Habit Matrix

Zoom out and explore your habits across an entire month.

- Display all habits against every day of the selected month.
- Mark or unmark individual habit records using checkboxes.
- Navigate to the previous month or next month.
- Return to the current month using This Month.
- Display the selected month and year.
- Highlight today's column.

The monthly matrix makes it easier to review your routines beyond a single week.

### Yearly Habit Heatmap

Explore your habit history through a GitHub-style contribution heatmap.

- View approximately the last 12 months of habit activity.
- Display roughly 53 weeks across seven weekday rows.
- Arrange days in a Monday-to-Sunday layout.
- Use green cells to represent completed days.
- Use neutral cells for incomplete days.
- Dim future dates.
- Highlight today with an outline.
- Toggle a habit's completion for individual past dates.
- Select which habit appears in the heatmap.
- Display month labels above the grid.
- Use the Less → More activity legend.

Each heatmap includes a summary of:

| Statistic | Description |
|---|---|
| Current streak | Consecutive completed days in the current streak |
| Longest streak | The longest streak achieved for the selected habit |
| Total completed days | Total days the habit has been completed |

The heatmap provides a visual history of your consistency rather than focusing only on daily checkboxes.

### Weekly Activity Chart

Understand your habit activity throughout the selected week.

Dayleaf includes a custom chart rendered using the Canvas 2D API.

Choose between four visualization modes:

- **Bar** — compare daily activity using bars.
- **Line** — view activity as a line chart.
- **Area** — display activity using an area chart.
- **Dots** — view activity as individual points.

The chart:

- Displays habits completed per day for the selected week.
- Updates when the selected week changes.
- Redraws when the browser window is resized.
- Updates when the theme changes.
- Redraws when habit data changes.
- Remembers your selected visualization mode using browser localStorage.

No external chart library is required.

### Daily Notes

Give every day a place for thoughts, reflections, ideas, and small wins.

- Write freeform notes for any date.
- Store each date's notes separately.
- Automatically save changes after a short pause.
- Display a saving status while changes are being written.
- Show whether notes were saved successfully.
- Display an error status if saving fails.

Autosave uses a 600 ms debounce.

Your notes remain available after refreshing the browser, closing the application, or restarting your computer.

### Personal Profile

Create a personal space that reflects your productivity history.

Your profile supports:

- **Name** — required.
- **Bio** — optional, up to 500 characters.
- **Email** — optional, with format validation.
- **Avatar** — an image uploaded from your computer.

Avatar images are converted to base64 data URLs and limited to approximately 350 KB.

When no avatar is configured, Dayleaf displays the first letter of your name inside a colored circle.

#### Profile Statistics

Your profile includes four summary cards.

| Statistic | Description |
|---|---|
| Tasks Done | Total completed tasks across all time |
| Active Habits | Number of habits currently tracked |
| Best Streak | Longest streak achieved across all habits |
| Days Tracked | Distinct days containing any activity |

Activity includes tasks, habit checks, and notes.

An Edit Profile modal lets you update your name, bio, email, and avatar.

### Personal Activity Report

Turn your productivity history into a standalone HTML report.

The Profile section includes a Download Report action.

Before generating a report, choose an activity end date.

You can:

- Download the report as an HTML file.
- Preview the report in a new browser tab.
- Print the report.
- Save the report as PDF using your browser's print functionality.

Reports are generated as self-contained HTML documents with inline CSS. They do not require external files or network requests.

The downloaded filename follows this format:

`dayleaf-report-YYYY-MM-DD.html`

#### Report Contents

| Section | Information |
|---|---|
| Header | Dayleaf branding and report period |
| Hero | Avatar, name, bio, and date range |
| Summary | Tasks completed, total tasks, completion percentage, habit checks, best streak, and active days |
| Notes | Number of notes written |
| Weekly Activity | SVG bar chart covering the last eight weeks of combined activity |
| Task Categories | Category-level completion progress bars |
| Habits | Total completed days and longest streak for each habit |
| Footer | Report generation timestamp |

The report is responsive and handles HTML special characters safely.

Its Print / Save as PDF button is hidden during printing while remaining available in the browser preview.

### Dark & Light Themes

Choose the appearance that feels comfortable.

- Switch between light and dark themes from the top bar.
- Save your preference in browser localStorage.
- Restore your selected theme when reopening the application.
- Use your operating system's preferred color scheme on the first visit.
- Apply carefully designed colors to both themes.
- Update charts and heatmaps when the theme changes.

Dayleaf uses a calm sage-green palette with soft backgrounds, rounded cards, subtle borders, and DM Sans typography.

The interface is designed to remain comfortable in both light and dark environments.

### Notifications & Feedback

Receive clear feedback when you interact with the application.

Dayleaf displays toast notifications for:

- Task creation
- Task updates
- Task deletion
- Habit creation
- Habit deletion
- Profile updates
- Note saving
- Errors

Successful actions use green notifications.

Errors use red notifications.

Notifications automatically disappear after approximately 2.4 seconds.

### Navigation

Move between the main sections without reloading the application.

The sidebar contains three sections:

- Planner
- Habit Tracker
- Profile

Navigation includes:

- Highlighting for the active section.
- Preservation of the selected date when switching views.
- A current-date indicator at the bottom of the sidebar.
- Previous day, Today, and Next day controls in the top bar.
- A selected-date display in the top bar.

The application uses client-side view switching to maintain a continuous planning experience.

### Accessibility

Dayleaf includes accessibility considerations throughout the interface.

- Form inputs have associated labels.
- Modals can be closed using the Escape key.
- Focus states remain visible.
- Semantic HTML is used throughout.
- Both themes are designed with sufficient contrast.
- Destructive actions include confirmation dialogs.

### Responsive Design

Dayleaf adapts to desktop, tablet, and mobile screens.

| Screen | Layout |
|---|---|
| Desktop | Fixed 232px sidebar and main content area |
| Tablet — 1000px and below | Summary cards use two columns, split grids stack, weekly planner displays four columns |
| Mobile — 720px and below | Sidebar becomes a top bar with a hamburger menu, grids collapse to one column, weekly planner displays two columns |
| Small phones — 480px and below | Reduced spacing, font sizes, and chart height |

Additional responsive behavior:

- Habit matrices and heatmaps support horizontal scrolling.
- The first column remains sticky while scrolling.
- Form inputs use a 16px font size on mobile to prevent iOS browser zoom.
- The page is designed to avoid horizontal overflow.

---

## Built With

Dayleaf uses a lightweight stack focused on local execution and straightforward maintenance.

| Technology | Purpose |
|---|---|
| Python 3.10+ | Application backend |
| Flask | Local web server and API |
| SQLite | Persistent local database |
| HTML5 | Application structure |
| CSS3 | Styling, themes, and responsive layout |
| Vanilla JavaScript | Frontend interaction |
| Canvas 2D | Weekly activity chart |
| SVG | Activity report chart |

The application does not use React, frontend frameworks, bundlers, or external chart libraries.

Flask is the only external Python dependency.

SQLite is accessed through Python's built-in `sqlite3` module.

---

## Installation

### Requirements

Before running Dayleaf, make sure your system has:

- Python 3.10 or newer
- A modern browser such as Chrome, Edge, Firefox, or Safari

The application is designed to run on Windows, Linux, and macOS.

### Windows

1. Download and extract the Dayleaf ZIP archive.
2. Place the extracted folder somewhere convenient, such as `C:\dayleaf`.
3. Double-click `start_windows.bat`.
4. Allow the initial setup to create the virtual environment and install Flask.
5. Wait for the application to initialize its database.
6. Open Dayleaf in your browser.

The first run automatically:

- Creates a Python virtual environment.
- Installs the required dependency.
- Initializes the SQLite database.
- Creates a desktop shortcut named Dayleaf.
- Opens the application in your browser.

The application is available at:

`http://127.0.0.1:5000`

For subsequent launches, use the Dayleaf desktop shortcut.

### Linux & macOS

Open a terminal and navigate to the extracted project directory.

```bash
cd ~/dayleaf
```

Make the startup script executable:

```bash
chmod +x start_unix.sh
```

Run the application:

```bash
./start_unix.sh
```

The first run performs the same installation steps as the Windows launcher.

A `Dayleaf.sh` shortcut is created on the desktop.

Once the application starts, open:

`http://127.0.0.1:5000`

---

## Dependency Installation

Dayleaf requires Flask.

The installation process attempts to install dependencies using the following order.

### 1. Offline Wheels

If a `wheels/` directory exists next to `setup.py` and contains Python wheel files, the installer attempts to install from those files first.

This allows installation without an internet connection.

### 2. Runflare Mirror

If offline installation is unavailable, the installer attempts to use:

`https://mirror-pypi.runflare.com/simple`

### 3. Official PyPI

If the mirror cannot be used, the installer falls back to:

`https://pypi.org/simple`

If all installation methods fail, Dayleaf displays an error explaining how to proceed.

### Offline Installation

On a computer with internet access, download the required packages:

```bash
pip download -r requirements.txt -d wheels
```

Copy the resulting `wheels/` directory next to `setup.py`.

Transfer the project and its wheel files to the offline computer, then run the installer.

---

## Running Dayleaf

Once the installation is complete, start the application using the appropriate launcher.

Dayleaf runs locally and is accessed through your browser.

```text
http://127.0.0.1:5000
```

The application uses the local Flask server to provide its interface and API.

Keep the application running while using Dayleaf.

Closing the browser does not delete your data. You can reopen the application later using its launcher.

---

## Local Data & Persistence

Dayleaf stores application data in a single SQLite database:

```text
planner.db
```

The database is located next to the application.

It is initialized automatically on the first run.

All application records are stored locally, including:

- Tasks
- Habits
- Habit completion history
- Daily notes
- User profile
- Avatar data

Your data remains available after:

- Closing the browser
- Stopping the application
- Restarting Dayleaf
- Restarting your computer

The database is separate from the application source files.

**Keep `planner.db` when updating Dayleaf.**

Replacing application files does not require replacing your database.

### Database Structure

Dayleaf uses five SQLite tables.

| Table | Purpose |
|---|---|
| `tasks` | Task details, dates, priorities, completion status, and creation timestamps |
| `habits` | Habit names, colors, and creation timestamps |
| `habit_checks` | Completion records for individual habits and dates |
| `notes` | Daily notes and update timestamps |
| `profile` | User profile information and avatar |

#### Tasks

Stores:

- ID
- Title
- Task date
- Optional start time
- Category
- Priority
- Completion status
- Creation timestamp

Priority values are constrained to Low, Medium, and High.

#### Habits

Stores:

- ID
- Habit title
- Color
- Creation timestamp

Habit names are unique without regard to letter casing.

#### Habit Checks

Stores:

- Habit ID
- Check date
- Completion status

The habit ID and check date form a composite primary key.

A foreign key connects habit checks to their corresponding habits. Deleting a habit automatically deletes its associated completion records.

#### Notes

Stores:

- Note date
- Note content
- Update timestamp

Each date has its own note.

#### Profile

Stores:

- Profile ID
- Name
- Bio
- Email
- Avatar
- Creation timestamp
- Update timestamp

The profile uses a fixed ID of `1`.

SQLite foreign-key enforcement is enabled, and database queries use parameterized SQL.

---

## Backup & Restore

Your productivity history is stored in `planner.db`.

Backing up your data is straightforward.

### Create a Backup

1. Stop Dayleaf.
2. Locate `planner.db` in the project directory.
3. Copy the file to a safe location.
4. Keep the backup separate from the application folder.

For example, you can copy it to an external drive.

### Restore a Backup

1. Stop Dayleaf.
2. Replace the existing `planner.db` with your backup.
3. Start Dayleaf again.

The application will use the restored database.

### Updating Dayleaf

When updating the application:

- Replace the application source files as needed.
- Keep your existing `planner.db`.
- Do not overwrite the database with a fresh copy.

Your tasks, habit history, notes, and profile are stored in the database rather than the frontend files.

---

## Network Access

Dayleaf listens on:

`0.0.0.0`

This allows the application to be accessed from other devices connected to the same local network.

When Dayleaf starts, the terminal displays two addresses.

| Address | Purpose |
|---|---|
| `http://127.0.0.1:5000` | Access from the computer running Dayleaf |
| `http://<local-ip>:5000` | Access from another device on the same network |

For example:

```text
http://192.168.1.25:5000
```

Replace the example address with the local IP displayed by your application.

### Access from a Phone or Laptop

1. Start Dayleaf on your computer.
2. Find the network address printed in the terminal.
3. Connect your phone or laptop to the same Wi-Fi network.
4. Open the network address in its browser.

### Firewall Configuration

On Windows, the firewall may request permission when Dayleaf starts for the first time.

Allow access if you want other devices on your local network to connect.

On Linux systems using UFW, allow the application port:

```bash
sudo ufw allow 5000/tcp
```

If other devices cannot connect, check whether your router blocks communication between devices through AP isolation.

### Security Notice

When Dayleaf listens on `0.0.0.0`, other devices on the same network may be able to access the application.

Dayleaf does not provide accounts, authentication, or access control.

**Do not expose Dayleaf to public Wi-Fi or an untrusted network.**

---

## Privacy

Dayleaf is designed for local use.

- Your data is stored on your own computer.
- No account is required.
- No login is required.
- No telemetry is included.
- No external API calls are used by the application.
- Your tasks, notes, habits, and profile remain in the local SQLite database.

The only network activity during setup is dependency installation.

When accessing Dayleaf from other devices, your application data is served over your local network. Anyone who can reach the application may be able to access it.

---

## API

Dayleaf exposes a local API used by the frontend.

The following endpoints are available.

### Application

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Serves the main application |
| GET | `/js/<filename>` | Serves JavaScript files from the `js/` directory |
| GET | `/api/health` | Returns application and database health status |

The health endpoint returns:

```json
{
  "ok": true,
  "status": "healthy",
  "db": true
}
```

### Overview

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/overview?date=YYYY-MM-DD` | Returns selected date, week bounds, tasks, weekly tasks, habits, habit matrix, notes, task statistics, habit statistics, and chart data |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/<id>` | Update a task |
| DELETE | `/api/tasks/<id>` | Delete a task |

### Habits

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/habits` | Create a habit |
| DELETE | `/api/habits/<id>` | Delete a habit and its associated history |
| PATCH | `/api/habits/<id>/check` | Check or uncheck a habit for a specific date |
| GET | `/api/habits/month?month=YYYY-MM` | Retrieve monthly matrix data |
| GET | `/api/habits/<id>/heatmap` | Retrieve yearly heatmap data |
| GET | `/api/habits/<id>/streak` | Retrieve current streak, longest streak, and total completed days |

### Notes

| Method | Endpoint | Description |
|---|---|---|
| PUT | `/api/notes` | Save a note for a specific date |

### Profile

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/profile` | Retrieve profile information and statistics |
| PUT | `/api/profile` | Save profile information |

### Activity Report

| Method | Endpoint | Description |
|---|---|---|
| GET | `/report?end=YYYY-MM-DD&download=1` | Generate and download the HTML activity report |
| GET | `/report?end=YYYY-MM-DD` | Render the activity report for browser preview |

---

## Project Structure

The delivered application includes the following files and directories:

```text
dayleaf/
├── app.py
├── requirements.txt
├── README.md
├── setup.py
├── run.py
├── start_windows.bat
├── start_unix.sh
├── templates/
│   └── index.html
├── static/
│   └── css/
│       └── style.css
└── js/
    ├── app.js
    └── profile.js
```

---

## Troubleshooting

### Python is not recognized

Python may not be installed, or its installation directory may not be included in your system PATH.

Install Python 3.10 or newer.

On Windows, make sure the option to add Python to PATH is enabled during installation.

Restart your terminal and run the installer again.

### Port 5000 is already in use

Another application may already be using port `5000`.

Open `run.py` and change:

```python
PORT = 5000
```

to another available port.

Restart Dayleaf and open the application using the updated address.

### Could not install dependencies

Dependency installation may fail because:

- The computer has no internet connection.
- The Runflare mirror is unavailable.
- Official PyPI cannot be reached.
- The offline `wheels/` directory is missing or incomplete.

Try running the installer again.

For offline installation, follow the instructions in the Dependency Installation section.

### Blank page in the browser

Check whether the application and database are running correctly.

Open:

```text
http://127.0.0.1:5000/api/health
```

A healthy response should include:

```json
{
  "ok": true,
  "status": "healthy",
  "db": true
}
```

If the application is not running, start it using the appropriate launcher.

### Data disappeared after an update

Check whether `planner.db` was overwritten or replaced.

Your application data is stored in this file.

Restore your previous database backup if necessary.

When updating Dayleaf, keep the existing database instead of replacing it with a new one.

### Other devices cannot connect

Check the following:

- Both devices are connected to the same Wi-Fi network.
- Dayleaf is running.
- You are using the local network IP rather than `127.0.0.1`.
- The firewall allows connections to port `5000`.
- Your router does not block communication between connected devices.

On Linux with UFW:

```bash
sudo ufw allow 5000/tcp
```

---


<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=150&color=gradient&customColorList=6&animation=twinkling&section=footer" width="100%" alt="Dayleaf footer" />
</p>

<p align="center">
  <sub>Make space for what matters.</sub>
</p>
