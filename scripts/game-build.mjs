/**
 * Build the share-ready single-file version of the pond game.
 *
 * game/moonfish.html keeps the cat artwork as a relative path so the source
 * stays readable; this script bakes the PNG into the page as a data URI and
 * writes release/moonfish.html, which can be sent to someone as one file.
 *
 * With `--split N` it instead writes N files under release/split/, each
 * carrying exactly ONE of the configured codes — "one file per friend".
 * A split file can only ever hand out its own code, so three friends who each
 * get one file cannot end up with the same code. (That guarantee is per file:
 * if you send two files to the same person, they can win two codes.)
 *
 * Usage:
 *   node scripts/game-build.mjs                  # 一份，带全部码
 *   node scripts/game-build.mjs --split 3        # 三份，每份只含 1 个码
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_GAME, readCodes, writeCodes } from './game-codes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const ART_RE = /  var ART_SRC = '[^']*'/
const FOOT_RE = /<footer class="foot">[\s\S]*?<\/footer>/

/** Bake an image (data URI) into the page's ART_SRC slot. */
export function inlineArt(html, dataUri) {
  if (!ART_RE.test(html)) throw new Error('game/moonfish.html 里找不到 ART_SRC 声明')
  return html.replace(ART_RE, `  var ART_SRC = '${dataUri}'`)
}

/** Label a split copy so the recipient (and you) can tell which one it is. */
export function stampSlot(html, index, total) {
  if (!FOOT_RE.test(html)) throw new Error('game/moonfish.html 里找不到 <footer class="foot">')
  return html.replace(
    FOOT_RE,
    `<footer class="foot">第 ${index + 1} 份（共 ${total} 份）· 赢一局解一张码，解过的码收在「兑换码」里</footer>`,
  )
}

/**
 * One file per code: each page gets a single-code pool, so it can only ever
 * hand out that one code. Returns [{ index, code, html }].
 */
export function buildSplit(html, codes, dataUri) {
  if (!codes.length) throw new Error('还没填兑换码：node scripts/game-codes.mjs set 码1 码2 码3')
  return codes.map((code, index) => {
    const only = writeCodes(html, [code]).html
    return { index, code, html: stampSlot(inlineArt(only, dataUri), index, codes.length) }
  })
}

function main() {
  const argv = process.argv.slice(2)
  const argOf = (flag) => {
    const at = argv.indexOf(flag)
    return at >= 0 ? argv[at + 1] : undefined
  }
  const gamePath = argOf('--game') ? resolve(argOf('--game')) : DEFAULT_GAME
  const html = readFileSync(gamePath, 'utf8')
  const art = readFileSync(join(root, 'assets', 'pet-cutout.png'))
  const dataUri = `data:image/png;base64,${art.toString('base64')}`
  const current = readCodes(html)
  const split = argOf('--split')

  if (split !== undefined) {
    const count = Number(split)
    if (!Number.isInteger(count) || count < 1) throw new Error('--split 后面要跟一个正整数，例如 --split 3')
    if (current.codes.length !== count) {
      throw new Error(
        `--split ${count} 需要正好 ${count} 个兑换码，现在填了 ${current.codes.length} 个。` +
          `${current.codes.length === 0 ? '先 node scripts/game-codes.mjs set 码1 码2 …' : '先把码改成 ' + count + ' 个，或者 --split ' + current.codes.length}`,
      )
    }
    const dir = join(root, 'release', 'split')
    mkdirSync(dir, { recursive: true })
    for (const part of buildSplit(html, current.codes, dataUri)) {
      const file = join(dir, `moonfish-${part.index + 1}.html`)
      writeFileSync(file, part.html)
      console.log(`第 ${part.index + 1} 份 → ${file}（只含 ${part.code}，${(part.html.length / 1024).toFixed(0)} KB）`)
    }
    console.log(`\n共 ${count} 份，一人一份发出去即可；同一份里赢到的那张码不会再来第二次。`)
    console.log('⚠️  release/split/ 里是真码，别提交、别发到大群。')
    return
  }

  const outPath = argOf('--out') ? resolve(argOf('--out')) : join(root, 'release', 'moonfish.html')
  const out = inlineArt(html, dataUri)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, out)
  console.log(`built ${outPath} (${(out.length / 1024).toFixed(0)} KB, 猫贴图已内嵌)`)
  if (current.codes.length) console.log(`里面带了 ${current.codes.length} 个兑换码（${current.source === 'encoded' ? '混淆串' : '明文'}）`)
  else console.log('⚠️  还没填兑换码：node scripts/game-codes.mjs set 码1 码2 码3')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
