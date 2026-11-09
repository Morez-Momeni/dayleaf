
#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

if [ ! -f "venv/bin/python" ]; then
    echo "Virtual environment not found. Running installer..."
    python3 setup.py || { echo "Installation failed."; exit 1; }
fi

exec "venv/bin/python" run.py