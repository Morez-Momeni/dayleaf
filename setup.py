import os
import sys
import subprocess
import platform
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_DIR = ROOT / "venv"
WHEELS_DIR = ROOT / "wheels"

RUNFLARE_INDEX = "https://mirror-pypi.runflare.com/simple"
RUNFLARE_HOST = "mirror-pypi.runflare.com"
OFFICIAL_INDEX = "https://pypi.org/simple"


def log(msg):
    print(f"[Dayleaf] {msg}")


def run(cmd, **kwargs):
    log("Running: " + " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, check=True, **kwargs)


def try_run(cmd, **kwargs):
    """مثل run ولی خطا را raise نمی‌کند، فقط True/False برمی‌گرداند."""
    try:
        log("Running: " + " ".join(str(c) for c in cmd))
        subprocess.run(cmd, check=True, **kwargs)
        return True
    except subprocess.CalledProcessError as e:
        log(f"Command failed (exit {e.returncode})")
        return False


def python_exe():
    return sys.executable


def venv_python():
    if platform.system() == "Windows":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def create_venv():
    if VENV_DIR.exists():
        log("Virtual environment already exists, skipping creation.")
        return
    log("Creating virtual environment...")
    run([python_exe(), "-m", "venv", str(VENV_DIR)])


def _pip_install(args, extra_index_options):
    """pip install با گزینه‌های داده‌شده."""
    base = [str(venv_python()), "-m", "pip", "install"]
    return base + extra_index_options + args


def install_deps():
    log("Upgrading pip...")
    pip_upgrade_runflare = [
        "--index-url", RUNFLARE_INDEX,
        "--trusted-host", RUNFLARE_HOST,
        "--upgrade", "pip",
    ]
    if not try_run(_pip_install([], pip_upgrade_runflare)):
        log("Could not upgrade pip via Runflare, trying official PyPI...")
        try_run(_pip_install([], ["--index-url", OFFICIAL_INDEX, "--upgrade", "pip"]))

    if WHEELS_DIR.is_dir() and any(WHEELS_DIR.iterdir()):
        log("Found offline wheels folder, installing from it first...")
        offline_ok = try_run([
            str(venv_python()), "-m", "pip", "install",
            "--no-index",
            "--find-links", str(WHEELS_DIR),
            "-r", str(ROOT / "requirements.txt"),
        ])
        if offline_ok:
            log("Dependencies installed from offline wheels.")
            return
        log("Offline install failed, falling back to online mirrors...")

    log("Installing dependencies from Runflare mirror...")
    runflare_ok = try_run([
        str(venv_python()), "-m", "pip", "install",
        "--index-url", RUNFLARE_INDEX,
        "--trusted-host", RUNFLARE_HOST,
        "-r", str(ROOT / "requirements.txt"),
    ])
    if runflare_ok:
        log("Dependencies installed from Runflare.")
        return

    log("Runflare failed. Trying official PyPI...")
    pypi_ok = try_run([
        str(venv_python()), "-m", "pip", "install",
        "--index-url", OFFICIAL_INDEX,
        "-r", str(ROOT / "requirements.txt"),
    ])
    if pypi_ok:
        log("Dependencies installed from official PyPI.")
        return

    print()
    print("=" * 62)
    print("ERROR: Could not install dependencies.")
    print()
    print("All three methods failed:")
    print("  1. Offline wheels folder (wheels/)")
    print(f"  2. Runflare mirror ({RUNFLARE_INDEX})")
    print(f"  3. Official PyPI ({OFFICIAL_INDEX})")
    print()
    print("What you can do:")
    print()
    print("  • If you have an internet connection on another computer:")
    print("       pip download -r requirements.txt -d wheels")
    print("    Copy the 'wheels' folder next to this project and re-run setup.py.")
    print()
    print("  • Or install Flask manually inside the venv:")
    print(f"       {venv_python()} -m pip install \\")
    print(f"           --index-url {RUNFLARE_INDEX} \\")
    print(f"           --trusted-host {RUNFLARE_HOST} \\")
    print(f"           Flask")
    print()
    print("  • Or use the prebuilt Dayleaf.exe if provided.")
    print("=" * 62)
    sys.exit(1)


def init_database():
    log("Initializing database...")
    code = (
        "import sys; sys.path.insert(0, r'%s'); "
        "from app import init_db; init_db(); print('DB ready.')"
    ) % str(ROOT)
    run([str(venv_python()), "-c", code])


def create_shortcut():
    try:
        home = Path.home()
        for candidate in ("Desktop", "desktop", "دسکتاپ", "Bureau", "Escritorio"):
            desktop = home / candidate
            if desktop.is_dir():
                break
        else:
            desktop = home

        if platform.system() == "Windows":
            shortcut = desktop / "Dayleaf.bat"
            content = (
                '@echo off\r\n'
                f'cd /d "{ROOT}"\r\n'
                f'"{venv_python()}" run.py\r\n'
                'pause\r\n'
            )
            shortcut.write_text(content, encoding="utf-8")
        else:
            shortcut = desktop / "Dayleaf.sh"
            content = (
                '#!/usr/bin/env bash\n'
                f'cd "{ROOT}"\n'
                f'"{venv_python()}" run.py\n'
            )
            shortcut.write_text(content, encoding="utf-8")
            shortcut.chmod(0o755)

        log(f"Shortcut created at: {shortcut}")
    except Exception as e:
        log(f"Could not create desktop shortcut: {e}")


def main():
    log("Starting Dayleaf installation...")
    log(f"Project directory: {ROOT}")

    if sys.version_info < (3, 10):
        log("ERROR: Python 3.10 or newer is required.")
        sys.exit(1)

    create_venv()
    install_deps()
    init_database()
    create_shortcut()

    log("")
    log("Installation complete.")
    log("From now on, run Dayleaf by double-clicking the shortcut")
    log("'Dayleaf' on your desktop, or by running:")
    log(f"    {venv_python()} run.py")


if __name__ == "__main__":
    main()