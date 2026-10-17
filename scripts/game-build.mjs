/**
 * Build the share-ready single-file version of the pond game.
 *
 * game/moonfish.html keeps the cat artwork as a relative path so the source
 * stays readable; this script bakes the PNG into the page as a data URI and
 * writes release/moonfish.html, which can be sent to someone as one file.
 *
 * Usage: node scripts/game-build.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_GAME, readCodes } from './game-codes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const ART_RE = /  var ART_SRC = '[^']*'/

/** Bake an image (data URI) into the page's ART_SRC slot. */
export function inlineArt(html, dataUri) {
  if (!ART_RE.test(html)) throw new Error('game/moonfish.html 里找不到 ART_SRC 声明')
  return html.replace(ART_RE, `  var ART_SRC = '${dataUri}'`)
}

function main() {
  const argv = process.argv.slice(2)
  const gameIndex = argv.indexOf('--game')
  const gamePath = gameIndex >= 0 ? resolve(argv[gameIndex + 1]) : DEFAULT_GAME
  const outIndex = argv.indexOf('--out')
  const outPath = outIndex >= 0 ? resolve(argv[outIndex + 1]) : join(root, 'release', 'moonfish.html')

  const html = readFileSync(gamePath, 'utf8')
  const art = readFileSync(join(root, 'assets', 'pet-cutout.png'))
  const out = inlineArt(html, `data:image/png;base64,${art.toString('base64')}`)

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, out)

  const current = readCodes(html)
  console.log(`built ${outPath} (${(out.length / 1024).toFixed(0)} KB, 猫贴图已内嵌)`)
  if (current.codes.length) console.log(`里面带了 ${current.codes.length} 个兑换码（${current.source === 'encoded' ? '混淆串' : '明文'}）`)
  else console.log('⚠️  还没填兑换码：node scripts/game-codes.mjs set 码1 码2 码3 码4 码5')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
