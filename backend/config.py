import os
import sys
from dotenv import load_dotenv
from pathlib import Path

if sys.platform == "darwin":
    DATA_DIR = Path.home() / "Library" / "Application Support" / "CreatorOS" / "backend"
elif sys.platform == "win32":
    DATA_DIR = Path(os.environ.get("APPDATA", Path.home())) / "CreatorOS" / "backend"
else:
    DATA_DIR = Path.home() / ".creatoros" / "backend"

DATA_DIR.mkdir(parents=True, exist_ok=True)

_usr_env = DATA_DIR / ".env"
_bundled_env = Path(__file__).parent / ".env"

if _usr_env.exists():
    load_dotenv(_usr_env, override=True)
else:
    load_dotenv(_bundled_env, override=True)

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# Search "Llama 3.3 70B Instruct" by Meta on build.nvidia.com
LLM_MODEL    = "meta/llama-3.3-70b-instruct"

# Search "Llama 3.2 NV EmbedQA 1B v2" by NVIDIA on build.nvidia.com
EMBED_MODEL  = "nvidia/llama-3.2-nv-embedqa-1b-v2"

# Search "Llama Nemotron Rerank 1B v2" by NVIDIA on build.nvidia.com
RERANK_MODEL = "nvidia/llama-nemotron-rerank-1b-v2"
