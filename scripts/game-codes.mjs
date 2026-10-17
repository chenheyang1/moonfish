/**
 * Put the redemption codes into game/moonfish.html (and read them back).
 *
 * The codec lives inside the game page, because that page has to stay a single
 * self-contained file. This tool extracts that very block and evaluates it, so
 * the browser and the CLI can never drift apart.
 *
 * Usage:
 *   node scripts/game-codes.mjs set ABCD-1111 EFGH-2222 IJKL-3333 MNOP-4444 QRST-5555
 *   node scripts/game-codes.mjs set --file codes.txt      # 一行一个码
 *   node scripts/game-codes.mjs list                      # 看看现在填了什么
 *   node scripts/game-codes.mjs clear                     # 清空，回到手填模板
 *
 * 反混淆不是加密：它能挡住顺手看源码的人，挡不住铁了心逆向的人。
 * 真要防作弊，得把发码校验放到服务端。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
export const DEFAULT_GAME = join(root, 'game', 'moonfish.html')

const PLAIN_BLOCK = `  var PLAIN_CODES = [
    '',
    '',
    '',
    '',
    '',
  ]`
const PLAIN_RE = /  var PLAIN_CODES = \[[\s\S]*?\n  \]/
const ENCODED_RE = /  var ENCODED_CODES = '[^']*'/

/** Pull the shared codec out of the page and hand back working functions. */
export function loadCodec(html) {
  const match = html.match(/\/\/ #region codec([\s\S]*?)\/\/ #endregion codec/)
  if (!match) throw new Error('game/moonfish.html 里找不到 codec 代码块（// #region codec … // #endregion codec）')
  const build = new Function(
    match[1] + '\nreturn { encodeCodePool: encodeCodePool, decodeCodePool: decodeCodePool }',
  )
  return build()
}

/** Codes currently baked into the page, in slot order. */
export function readCodes(html) {
  const encoded = html.match(ENCODED_RE)
  if (!encoded) throw new Error('game/moonfish.html 里找不到 ENCODED_CODES 声明')
  const blob = encoded[0].slice(encoded[0].indexOf("'") + 1, -1)
  const codec = loadCodec(html)
  if (blob) return { source: 'encoded', codes: codec.decodeCodePool(blob), blob }
  const plain = html.match(PLAIN_RE)
  if (!plain) throw new Error('game/moonfish.html 里找不到 PLAIN_CODES 声明')
  const codes = plain[0]
    .split('\n')
    .slice(1, -1)
    .map(line => {
      const quoted = line.match(/'((?:[^'\\]|\\.)*)'/)
      return quoted ? quoted[1].replace(/\\(.)/g, '$1').trim() : ''
    })
    .filter(Boolean)
  return { source: 'plain', codes, blob: '' }
}

/** Bake a code list into the page: encoded blob wins, plain template goes empty. */
export function writeCodes(html, codes) {
  const clean = codes.map(code => String(code).trim()).filter(Boolean)
  const blob = loadCodec(html).encodeCodePool(clean)
  if (!PLAIN_RE.test(html)) throw new Error('game/moonfish.html 里找不到 PLAIN_CODES 声明')
  if (!ENCODED_RE.test(html)) throw new Error('game/moonfish.html 里找不到 ENCODED_CODES 声明')
  return {
    html: html.replace(PLAIN_RE, PLAIN_BLOCK).replace(ENCODED_RE, `  var ENCODED_CODES = '${blob}'`),
    code: blob,
    codes: clean,
  }
}

/** Reset the page to the hand-editable template. */
export function clearCodes(html) {
  return html.replace(PLAIN_RE, PLAIN_BLOCK).replace(ENCODED_RE, "  var ENCODED_CODES = ''")
}

function parseArgs(argv) {
  const args = { _: [], game: DEFAULT_GAME, file: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--game') { args.game = resolve(argv[i + 1] || ''); i += 1 }
    else if (token === '--file') { args.file = resolve(argv[i + 1] || ''); i += 1 }
    else args._.push(token)
  }
  return args
}

function readInputCodes(args) {
  if (args.file) {
    return readFileSync(args.file, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  }
  return args._.slice(1)
}

function main() {
  const argv = process.argv.slice(2)
  const args = parseArgs(argv)
  const command = args._[0] || 'status'
  const html = readFileSync(args.game, 'utf8')

  if (command === 'set') {
    const codes = readInputCodes(args)
    if (!codes.length) {
      console.error('没有拿到兑换码。用法：node scripts/game-codes.mjs set 码1 码2 码3 码4 码5')
      process.exitCode = 1
      return
    }
    const unique = [...new Set(codes)]
    if (unique.length !== codes.length) console.warn('⚠️  有重复的兑换码，后面的重复项按顺序保留了一份')
    const written = writeCodes(html, unique)
    writeFileSync(args.game, written.html)
    console.log(`已写入 ${written.codes.length} 个兑换码 → ${args.game}`)
    if (written.codes.length > 6) console.warn(`⚠️  现在是 ${written.codes.length} 个码，游戏会按这个数量发；发太多张就不太像"奖品"了`)
    console.log('再跑 node scripts/game-build.mjs 更新可分享的单文件版本。')
    return
  }

  if (command === 'clear') {
    writeFileSync(args.game, clearCodes(html))
    console.log(`已清空兑换码 → ${args.game}（回到手填模板）`)
    return
  }

  if (command === 'list' || command === 'status') {
    const current = readCodes(html)
    if (!current.codes.length) {
      console.log('还没填兑换码。跑：node scripts/game-codes.mjs set 码1 码2 码3 码4 码5')
      return
    }
    console.log(`当前 ${current.codes.length} 个兑换码（存储方式：${current.source === 'encoded' ? '混淆串' : '明文'}）:`)
    current.codes.forEach((code, index) => console.log(`  ${index + 1}. ${code}`))
    if (current.source === 'plain') console.log('提示：明文写在源码里，谁都能看见；跑一次 set 就会换成混淆串。')
    return
  }

  console.error(`不认识这个命令：${command}。可用：set / list / clear`)
  process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
