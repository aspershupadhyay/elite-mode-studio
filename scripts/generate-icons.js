'use strict'
const sharp  = require('sharp')
const toIco  = require('to-ico')
const path   = require('path')
const fs     = require('fs')
const { execFileSync } = require('child_process')
const os     = require('os')

const buildDir = path.join(__dirname, '..', 'build')
const svgPath  = path.join(buildDir, 'icon.svg')

async function main() {
  const svgBuf = fs.readFileSync(svgPath)

  // 1. PNG 1024x1024
  await sharp(svgBuf).resize(1024, 1024).png().toFile(path.join(buildDir, 'icon.png'))
  console.log('Generated build/icon.png')

  // 2. ICNS (macOS only)
  if (os.platform() === 'darwin') {
    const iconsetDir = path.join(buildDir, 'icon.iconset')
    fs.mkdirSync(iconsetDir, { recursive: true })
    const sizes = [16, 32, 64, 128, 256, 512, 1024]
    for (const s of sizes) {
      await sharp(svgBuf).resize(s, s).png()
        .toFile(path.join(iconsetDir, `icon_${s}x${s}.png`))
      if (s <= 512) {
        await sharp(svgBuf).resize(s * 2, s * 2).png()
          .toFile(path.join(iconsetDir, `icon_${s}x${s}@2x.png`))
      }
    }
    execFileSync('iconutil', [
      '-c', 'icns',
      iconsetDir,
      '-o', path.join(buildDir, 'icon.icns'),
    ])
    fs.rmSync(iconsetDir, { recursive: true })
    console.log('Generated build/icon.icns')
  }

  // 3. ICO (Windows)
  const icoBufs = await Promise.all(
    [16, 32, 48, 64, 128, 256].map(s =>
      sharp(svgBuf).resize(s, s).png().toBuffer()
    )
  )
  const icoBuf = await toIco(icoBufs)
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf)
  console.log('Generated build/icon.ico')

  console.log('All icons generated.')
}

main().catch(err => { console.error(err); process.exit(1) })
