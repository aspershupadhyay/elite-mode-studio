"""
server.py — PyInstaller-compatible backend launcher.

In production (frozen): spawned by Electron main process.
In dev: not used — Electron runs `python3 -m uvicorn api:app` directly.
"""
import sys
import os
import argparse

# When PyInstaller freezes this app, __file__-relative paths break.
# Set CREATOROS_BASE so every module can resolve paths relative to the binary.
if getattr(sys, 'frozen', False):
    # sys._MEIPASS is the directory containing the binary in --onedir mode
    os.environ.setdefault('CREATOROS_BASE', sys._MEIPASS)
else:
    os.environ.setdefault(
        'CREATOROS_BASE',
        os.path.dirname(os.path.abspath(__file__)),
    )

import uvicorn  # noqa: E402 — must come after path env is set


def main() -> None:
    parser = argparse.ArgumentParser(description='CreatorOS backend server')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()

    uvicorn.run(
        'api:app',
        host=args.host,
        port=args.port,
        log_level='warning',
    )


if __name__ == '__main__':
    main()
