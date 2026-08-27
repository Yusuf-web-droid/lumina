/**
 * Rasterises an SVG to PNG at a given size, using Chromium.
 *
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/render-svg.cjs \
 *     <source.svg> <out.png> [size]
 *
 * Exists because `nativeImage` cannot decode SVG, so make-icon.cjs needs a PNG
 * to work from, and there is no rsvg-convert or ImageMagick to lean on. Runs
 * under Electron, which already ships the only renderer this needs.
 *
 * The source's width/height are rewritten to the target size before it is
 * handed to Chromium: an SVG image is rasterised at its intrinsic size and
 * then scaled, so drawing a 1024px source into a 2048px canvas would come out
 * soft. The canvas is filled white first — the icon script keys a flat
 * backdrop out to alpha itself, and expects one to be there.
 */
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const [srcArg, outArg, sizeArg] = process.argv.slice(2)
const SIZE = Number(sizeArg ?? 2048)

async function main() {
  if (!srcArg || !outArg) throw new Error('usage: render-svg.cjs <source.svg> <out.png> [size]')

  const svg = readFileSync(resolve(srcArg), 'utf8')
    .replace(/\bwidth="\d+"/, `width="${SIZE}"`)
    .replace(/\bheight="\d+"/, `height="${SIZE}"`)

  const win = new BrowserWindow({ show: false, width: 16, height: 16 })
  await win.loadURL('about:blank')

  // A data: URL keeps the image same-origin, so reading the canvas back is not
  // a tainted-canvas error the way a file:// source would be.
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

  const dataUrl = await win.webContents.executeJavaScript(`
    new Promise((done, fail) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = ${SIZE}
        canvas.height = ${SIZE}
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, ${SIZE}, ${SIZE})
        ctx.drawImage(img, 0, 0, ${SIZE}, ${SIZE})
        done(canvas.toDataURL('image/png'))
      }
      img.onerror = () => fail(new Error('the source SVG did not load'))
      img.src = ${JSON.stringify(source)}
    })
  `)

  const png = Buffer.from(dataUrl.split(',')[1], 'base64')
  writeFileSync(resolve(outArg), png)
  console.log(`wrote ${resolve(outArg)} at ${SIZE}x${SIZE}`)
}

app
  .whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch((err) => {
    console.error(err)
    app.exit(1)
  })
