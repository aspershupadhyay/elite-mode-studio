import os
from dotenv import load_dotenv

load_dotenv()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# Search "Llama 3.3 70B Instruct" by Meta on build.nvidia.com
LLM_MODEL    = "meta/llama-3.3-70b-instruct"

# Search "Llama 3.2 NV EmbedQA 1B v2" by NVIDIA on build.nvidia.com
EMBED_MODEL  = "nvidia/llama-3.2-nv-embedqa-1b-v2"

# Search "Llama Nemotron Rerank 1B v2" by NVIDIA on build.nvidia.com
RERANK_MODEL = "nvidia/llama-nemotron-rerank-1b-v2"
