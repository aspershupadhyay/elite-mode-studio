# backend/backend.spec
# PyInstaller spec for standalone backend binary
# Usage: cd backend && pyinstaller backend.spec

from PyInstaller.utils.hooks import collect_all

block_cipher = None

datas    = []
binaries = []
hidden   = []

# Collect all sub-packages and data files for the heavy dependencies
for pkg in [
    'uvicorn', 'fastapi', 'starlette', 'anyio', 'httpx', 'httpcore', 'h11',
    'langchain', 'langchain_community', 'langchain_nvidia_ai_endpoints',
    'langchain_core', 'langchain_text_splitters',
    'faiss', 'pypdf', 'multipart', 'PIL',
    'tavily', 'tiktoken', 'certifi', 'dotenv',
]:
    try:
        d, b, hi = collect_all(pkg)
        datas    += d
        binaries += b
        hidden   += hi
    except Exception:
        pass  # package not installed — skip silently

# Bake in the elite_mode_instruction.md prompt document
# It will be available at sys._MEIPASS/docs/elite_mode_instruction.md
datas += [('../docs/elite_mode_instruction.md', 'docs')]

a = Analysis(
    ['server.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden + [
        # uvicorn internals
        'uvicorn.lifespan.on',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.loops.asyncio',
        # stdlib
        'asyncio',
        'sqlite3',
        '_sqlite3',
        'email.mime.multipart',
        'email.mime.text',
        'numpy',
        'numpy.core._methods',
        'numpy.lib.format',
        # Local backend modules — uvicorn.run('api:app') is a string import,
        # so PyInstaller cannot trace these automatically.
        'api',
        'rag',
        'config',
        'database',
        'storage',
        'auth',
        'auth_db',
        'image_agent',
        'llm_factory',
        'model_discovery',
        'model_registry',
        'providers',
        'dedup',
        'dedup_store',
        'dedup_gate1',
        'dedup_gate2',
        'dedup_gate3',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        'playwright', 'cv2', 'opencv',
        'tkinter', 'matplotlib', 'IPython', 'notebook',
        'scipy', 'pandas', 'pytest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='api_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,   # no terminal window on Windows
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='api_server',
)
