import os
import sys
import socket
import threading
import subprocess
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_DIR = ROOT / "venv"
PORT = 5000
HOST = "127.0.0.1"


def venv_python():
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def ensure_venv():
    if not venv_python().exists():
        print("[Dayleaf] Virtual environment not found.")
        print("[Dayleaf] Please run setup.py first (python setup.py).")
        sys.exit(1)


def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


def wait_until_ready(host, port, timeout=25):
    """منتظر می‌ماند تا سرور واقعاً روی این پورت پاسخ بدهد."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.25)
    return False


def open_browser_when_ready():
    if wait_until_ready(HOST, PORT, timeout=25):
        webbrowser.open(f"http://{HOST}:{PORT}")
    else:
        print(f"[Dayleaf] Could not confirm the server is up.")
        print(f"[Dayleaf] Try opening http://{HOST}:{PORT} manually.")


def main():
    ensure_venv()

    ip = local_ip()
    print("=" * 46)
    print("Dayleaf is starting...")
    print(f"  Local:   http://{HOST}:{PORT}")
    if ip:
        print(f"  Network: http://{ip}:{PORT}")
        print("           (open this on other devices in the same Wi-Fi)")
    print("=" * 46)
    print("Press Ctrl+C to stop the server.")
    print()

    threading.Thread(target=open_browser_when_ready, daemon=True).start()
    try:
        subprocess.run(
            [str(venv_python()), str(ROOT / "app.py")],
            cwd=str(ROOT),
        )
    except KeyboardInterrupt:
        print("\n[Dayleaf] Server stopped.")


if __name__ == "__main__":
    main()