/**
 * imageGenConfig.ts
 *
 * Persists the ChatGPT image-generation URL to a JSON config file
 * so the user can change it from Settings without restarting the app.
 *
 * Config file: <userData>/elite_image_gen.json
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const DEFAULT_URL = 'https://chatgpt.com/g/g-p-695fa0174ec88191a103a44f86864e61-image-generation/project'

interface ImageGenConfig {
  chatGptUrl: string
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'elite_image_gen.json')
}

export function readImageGenConfig(): ImageGenConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ImageGenConfig>
    return {
      chatGptUrl: (parsed.chatGptUrl && parsed.chatGptUrl.trim()) ? parsed.chatGptUrl.trim() : DEFAULT_URL,
    }
  } catch {
    return { chatGptUrl: DEFAULT_URL }
  }
}

export function writeImageGenConfig(config: Partial<ImageGenConfig>): void {
  const current = readImageGenConfig()
  const merged: ImageGenConfig = { ...current, ...config }
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf8')
}

export function getChatGptUrl(): string {
  return readImageGenConfig().chatGptUrl
}
