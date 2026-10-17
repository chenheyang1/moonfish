/**
 * Tests for the pond game's redemption-code plumbing.
 *
 * The rules worth pinning down:
 *   1. the page stays a single file that parses on its own,
 *   2. the codec lives in the page and the CLI uses that same block,
 *   3. codes are not sitting in the page as plain text,
 *   4. the build bakes the artwork in so the release file travels alone.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearCodes, loadCodec, readCodes, writeCodes } from '../scripts/game-codes.mjs'
import { inlineArt } from '../scripts/game-build.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GAME = join(root, 'game', 'moonfish.html')
const page = readFileSync(GAME, 'utf8')
const CODES = ['MOON-2F7A-1111', 'MOON-9K3B-2222', 'MOON-QQ7C-3333', 'MOON-8ZP1-4444', 'MOON-4TT6-5555']

test('the page is one self-contained file whose inline script parses', () => {
  const scripts = page.match(/<script>[\s\S]*?<\/script>/g) || []
  assert.equal(scripts.length, 1, 'exactly one inline script')
  const source = scripts[0].replace(/^<script>/, '').replace(/<\/script>$/, '')
  assert.doesNotThrow(() => new Function(source))
  assert.ok(!/\ssrc=/.test(scripts[0]), 'no external script')
  assert.ok(page.includes('../assets/pet-cutout.png'), 'relative artwork path for local play')
  assert.ok(page.includes('var ART_SRC'), 'the build has a slot to bake artwork into')
})

test('the codec round-trips codes, including awkward characters', () => {
  const { encodeCodePool, decodeCodePool } = loadCodec(page)
  const sample = ['A-1', "quote'inside", '空格 与 中文', 'x'.repeat(120)]
  assert.deepEqual(decodeCodePool(encodeCodePool(sample)), sample)
  assert.deepEqual(decodeCodePool(''), [])
  assert.deepEqual(decodeCodePool('not base64 at all'), [])
})

test('writing codes empties the plaintext template and hides them from a reader', () => {
  const written = writeCodes(page, CODES)
  assert.equal(readCodes(written.html).source, 'encoded')
  assert.deepEqual(readCodes(written.html).codes, CODES)
  for (const code of CODES) {
    assert.ok(!written.html.includes(code), code + ' must not appear in the page source')
  }
  assert.ok(written.html.includes("var PLAIN_CODES = [\n    '',"), 'the plaintext template is emptied')
  assert.equal(writeCodes(written.html, CODES).html, written.html, 'writing twice is idempotent')
})

test('a half-filled page still reads back the codes someone typed by hand', () => {
  const handEdited = page.replace(
    /  var PLAIN_CODES = \[[\s\S]*?\n  \]/,
    "  var PLAIN_CODES = [\n    'HAND-1111',\n    'HAND-2222', // 第二个\n    '',\n  ]",
  )
  assert.deepEqual(readCodes(handEdited), { source: 'plain', codes: ['HAND-1111', 'HAND-2222'], blob: '' })
})

test('clearing puts the page back to its empty template', () => {
  const cleared = clearCodes(writeCodes(page, CODES).html)
  assert.deepEqual(readCodes(cleared).codes, [])
  assert.equal(cleared, page, 'clear restores the shipped file byte for byte')
})

test('the release build bakes the cat artwork into the page', () => {
  const dataUri = 'data:image/png;base64,AAAA'
  const baked = inlineArt(page, dataUri)
  assert.ok(baked.includes("var ART_SRC = '" + dataUri + "'"))
  assert.equal(inlineArt(baked, dataUri), baked, 're-baking is idempotent')
  const scripts = baked.match(/<script>[\s\S]*?<\/script>/g)
  assert.doesNotThrow(() => new Function(scripts[0].replace(/^<script>/, '').replace(/<\/script>$/, '')))
})

test('the CLI writes, lists and clears codes in a copy of the page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-game-'))
  const target = join(dir, 'moonfish.html')
  writeFileSync(target, page)
  try {
    const run = args => spawnSync(process.execPath, [join(root, 'scripts', 'game-codes.mjs'), ...args, '--game', target], { encoding: 'utf8' })

    const before = run(['list'])
    assert.match(before.stdout, /还没填兑换码/)

    const set = run(['set', ...CODES])
    assert.equal(set.status, 0, set.stderr)
    assert.match(set.stdout, /已写入 5 个兑换码/)

    const list = run(['list'])
    assert.equal(list.status, 0, list.stderr)
    for (const code of CODES) assert.ok(list.stdout.includes(code), code + ' should be listed')
    assert.deepEqual(readCodes(readFileSync(target, 'utf8')).codes, CODES)

    const cleared = run(['clear'])
    assert.equal(cleared.status, 0, cleared.stderr)
    assert.deepEqual(readCodes(readFileSync(target, 'utf8')).codes, [])

    const unknown = run(['nonsense'])
    assert.equal(unknown.status, 1)
    assert.match(unknown.stderr, /不认识这个命令/)

    const empty = run(['set'])
    assert.equal(empty.status, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
