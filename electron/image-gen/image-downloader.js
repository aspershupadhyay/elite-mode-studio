"use strict";
/**
 * image-downloader.ts
 *
 * Downloads a captured image URL to a local temp file.
 * Applies quality gate (size + dimensions + sharpness) before writing.
 * Only writes to disk when ALL checks pass.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadImageToTmp = downloadImageToTmp;
exports.cleanTmpImages = cleanTmpImages;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const electron_1 = require("electron");
const image_verifier_1 = require("./image-verifier");
const TMP_DIR = path_1.default.join(os_1.default.tmpdir(), 'elite_gen_images');
const PARTITION = 'persist:ai-browser';
const CLEAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
function ensureTmpDir() {
    if (!fs_1.default.existsSync(TMP_DIR))
        fs_1.default.mkdirSync(TMP_DIR, { recursive: true });
}
function extFromUrl(url) {
    const clean = url.split('?')[0].toLowerCase();
    const match = clean.match(/\.(png|jpg|jpeg|webp|gif)$/);
    return match ? match[1] : 'png';
}
/**
 * Download an image URL and verify quality before writing to disk.
 * Returns qualityFail=true if the image fails size/dimensions/sharpness checks.
 */
async function downloadImageToTmp(imageUrl, postId) {
    ensureTmpDir();
    const ext = extFromUrl(imageUrl);
    const tmpPath = path_1.default.join(TMP_DIR, `gen_${postId}_${Date.now()}.${ext}`);
    const fetched = await fetchBuffer(imageUrl);
    if (!fetched.ok) {
        return { success: false, tmpPath: '', error: fetched.error };
    }
    const verify = (0, image_verifier_1.verifyImageBuffer)(fetched.data);
    if (!verify.ok) {
        console.log(`[image-downloader] Quality gate FAILED: ${verify.reason}`);
        return { success: false, tmpPath: '', qualityFail: true, reason: verify.reason };
    }
    fs_1.default.writeFileSync(tmpPath, fetched.data);
    console.log(`[image-downloader] Saved: ${path_1.default.basename(tmpPath)} [${verify.reason}]`);
    return { success: true, tmpPath };
}
function fetchBuffer(imageUrl) {
    return new Promise((resolve) => {
        const ses = electron_1.session.fromPartition(PARTITION);
        ses.cookies.get({ url: imageUrl })
            .then((cookies) => {
            const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            const mod = imageUrl.startsWith('https') ? https_1.default : http_1.default;
            const headers = {
                'User-Agent': CLEAN_UA,
                ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            };
            const req = mod.get(imageUrl, { headers }, (res) => {
                if (res.statusCode !== 200) {
                    resolve({ ok: false, error: `HTTP ${res.statusCode}` });
                    return;
                }
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({ ok: true, data: Buffer.concat(chunks) }));
                res.on('error', (e) => resolve({ ok: false, error: e.message }));
            });
            req.on('error', (e) => resolve({ ok: false, error: e.message }));
        })
            .catch((e) => resolve({ ok: false, error: e.message }));
    });
}
/** Clean up tmp files older than maxAgeMs (default 1 hour). */
function cleanTmpImages(maxAgeMs = 60 * 60 * 1000) {
    if (!fs_1.default.existsSync(TMP_DIR))
        return;
    const now = Date.now();
    for (const file of fs_1.default.readdirSync(TMP_DIR)) {
        const p = path_1.default.join(TMP_DIR, file);
        try {
            const stat = fs_1.default.statSync(p);
            if (now - stat.mtimeMs > maxAgeMs)
                fs_1.default.unlinkSync(p);
        }
        catch { /* ignore */ }
    }
}
