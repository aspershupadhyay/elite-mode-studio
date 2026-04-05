# CreatorOS

**AI-powered social media content creation, right on your desktop.**

CreatorOS is a desktop app that helps you write posts, design carousels, and automate content for any social platform. It uses NVIDIA's AI models and live web search to research topics and generate ready-to-post content in seconds.

Posts made with CreatorOS have hit 149K, 152K, and 1.3M views on Instagram.

---

## What it does

- **Generate posts** - Pick a topic, choose your tone and platform, and get polished captions with a single click
- **Design Studio** - Drag-and-drop canvas (like Figma) to create carousels and graphics, with snap guides, rulers, frames, and templates built in
- **AI Browser** - Search the web for fresh content and generate images automatically
- **Doc RAG** - Upload your own documents and use them as context when generating content
- **Templates** - 8 built-in pro designs (Dark Minimal, Bold Gradient, Neon Dark, and more)
- **Post History** - Everything you generate is saved so you can go back and reuse it

---

## Download

Go to the [Releases page](https://github.com/aspershupadhyay/elite-mode-studio/releases) and grab the file for your system:

| Platform | File |
|----------|------|
| Mac (Apple Silicon M1/M2/M3/M4) | `CreatorOS-x.x.x-arm64.dmg` |
| Mac (Intel) | `CreatorOS-x.x.x.dmg` |
| Windows | `CreatorOS Setup x.x.x.exe` |
| Linux | `CreatorOS-x.x.x.AppImage` |

**Mac note:** If macOS says the app cannot be opened, right-click it and choose "Open", then click Open in the dialog that appears. This is normal for apps without an Apple developer certificate.

---

## Setup

You need two free API keys:

1. **NVIDIA API Key** - powers all AI content generation
   - Sign up free at [build.nvidia.com](https://build.nvidia.com)
   - Create an API key and copy it

2. **Tavily API Key** - powers live web search
   - Sign up free at [app.tavily.com](https://app.tavily.com)
   - The free tier is plenty for personal use

When you first open the app it will ask for these keys. You can also update them later in Settings.

---

## Running from source

**You need:** Node.js 20+, Python 3.11+, npm

```bash
# Clone the repo
git clone https://github.com/aspershupadhyay/elite-mode-studio.git
cd elite-mode-studio

# Install frontend dependencies
npm install

# Set up the backend
cd backend
cp .env.example .env
# Open .env and paste your NVIDIA and Tavily API keys
pip install -r requirements.txt
cd ..
```

Then start both processes (two terminals):

```bash
# Terminal 1
cd backend && python3 api.py

# Terminal 2
npm run dev
```

The app window opens automatically once both are running.

---

## Tech stack

- **Frontend:** Electron 29, React 18, Vite, TypeScript, Tailwind CSS
- **Canvas:** Fabric.js (design studio)
- **Backend:** Python FastAPI
- **AI:** NVIDIA NIM (Llama 3.3 70B, NV-Embed, NV-Rerank)
- **Search:** Tavily v2 API

---

## License

MIT
