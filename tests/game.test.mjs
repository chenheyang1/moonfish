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
import { clearCodes, loadCodec, randomCode, readCodes, shuffle, writeCodes } from '../scripts/game-codes.mjs'
import { buildSplit, inlineArt, stampSlot } from '../scripts/game-build.mjs'

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

test('随机码：格式对、不重复、不打乱时保持原顺序', () => {
  let seed = 1
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const code = randomCode('MOON', rand)
  assert.match(code, /^MOON-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  assert.ok(!/[IO01]/.test(code.slice(5)), '不该出现容易看错的 I O 0 1')

  const many = new Set(Array.from({ length: 50 }, () => randomCode('MOON')))
  assert.ok(many.size > 40, '随机码不该大面积撞车')

  const source = [1, 2, 3, 4, 5, 6, 7, 8]
  const mixed = shuffle(source, rand)
  assert.deepEqual(mixed.slice().sort((a, b) => a - b), source, '洗牌不能丢元素')
  assert.notDeepEqual(mixed, source, '洗牌应该真的打乱过')
})

test('拆成一人一份：每份只有一个码，别的码不会泄露', () => {
  const dataUri = 'data:image/png;base64,AAAA'
  const codes = ['MOON-A1-0001', 'MOON-B2-0002', 'MOON-C3-0003']
  const parts = buildSplit(page, codes, dataUri)
  assert.equal(parts.length, 3)
  assert.deepEqual(parts.flatMap((part) => readCodes(part.html).codes).sort(), codes.slice().sort())
  for (const part of parts) {
    assert.equal(readCodes(part.html).codes.length, 1, '每份只能带一个码')
    for (const other of codes.filter((code) => code !== part.code)) {
      assert.ok(!part.html.includes(other), '这一份里不该出现别的码：' + other)
    }
    assert.ok(part.html.includes(`第 ${part.index + 1} 份（共 3 份）`), '每份要有份号')
    const script = part.html.match(/<script>[\s\S]*?<\/script>/)[0]
    assert.doesNotThrow(() => new Function(script.replace(/^<script>/, '').replace(/<\/script>$/, '')))
  }
  assert.throws(() => buildSplit(page, [], dataUri), /还没填兑换码/)
  assert.throws(() => stampSlot('<p>no footer</p>', 0, 1), /footer/)
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

/** 从页面里抠出对局内核，在 Node 里直接跑，不需要浏览器。 */
function loadSim(html) {
  const match = html.match(/\/\/ #region sim([\s\S]*?)\/\/ #endregion sim/)
  assert.ok(match, 'game/moonfish.html 里应该有 sim 区块')
  const build = new Function(match[1] + '\nreturn { SIM, LEVELS, createRound, stepRound }')
  return build()
}

/**
 * 把某一种道具送到猫脚下，返回这一局、逐帧事件，以及"接住那一瞬间"的快照
 * （之后再跑下去会刷出新道具，所以状态要在那一刻取）。
 */
function catchOne(sim, type, extra) {
  const round = sim.createRound(5, 0)
  if (extra) round.items.push(...extra)
  round.items.push({ type, x: 240, y: 430, r: 17, vy: 120, sway: 0, phase: 0 })
  const events = []
  let after = null
  for (let step = 0; step < 400 && round.status === 'playing'; step += 1) {
    const frameEvents = sim.stepRound(round, 240, 1 / 60)
    events.push(...frameEvents)
    if (!after && frameEvents.some((event) => event.type === type)) {
      after = {
        types: round.items.map((item) => item.type),
        score: round.score,
        time: round.time,
        slow: round.slowTimer,
      }
    }
  }
  return { round, events, after }
}

test('九种道具都会刷出来，正负大约 2:3，只有 1 条命', () => {
  const sim = loadSim(page)
  assert.equal(sim.LEVELS[0].lives, 1)
  assert.ok(sim.LEVELS.every((rules) => rules.lives === 1), '每一关都是 1 条命')

  const NEGATIVE = new Set(['bomb', 'ink', 'anchor'])
  const seen = new Set()
  let positive = 0
  let negative = 0
  for (let seed = 1; seed <= 30; seed += 1) {
    const round = sim.createRound(seed, 0)
    let prev = 0
    // 猫缩在最左边，几乎接不到东西，专心数刷出来的道具
    for (let step = 0; step < 60 * 32 && round.status === 'playing'; step += 1) {
      sim.stepRound(round, sim.SIM.padHalf, 1 / 60)
      if (round.items.length > prev) {
        const type = round.items[round.items.length - 1].type
        seen.add(type)
        if (NEGATIVE.has(type)) negative += 1
        else positive += 1
      }
      prev = round.items.length
    }
  }
  for (const type of ['fish', 'gold', 'bomb', 'milk', 'time', 'kelp', 'bell', 'ink', 'anchor']) {
    assert.ok(seen.has(type), '没刷出来的道具：' + type)
  }
  const share = positive / (positive + negative)
  assert.ok(share > 0.33 && share < 0.47, '正面道具占比应该在 40% 左右，实际 ' + share.toFixed(2))
  assert.ok(negative / (positive + negative) > 0.5, '负面道具应该比正面多')
})

test('只有 1 条命时，接到炸弹当场结束', () => {
  const sim = loadSim(page)
  const round = sim.createRound(11, 0)
  round.items.push({ type: 'bomb', x: 240, y: 430, r: 17, vy: 120, sway: 0, phase: 0 })
  const events = []
  for (let step = 0; step < 400 && round.status === 'playing'; step += 1) {
    events.push(...sim.stepRound(round, 240, 1 / 60))
  }
  assert.equal(round.status, 'lost')
  assert.equal(round.reason, 'bomb')
  assert.equal(round.lives, 0)
  assert.ok(events.some((event) => event.type === 'end' && event.reason === 'bomb'))
})

test('沙漏一下子多出 5 秒', () => {
  const sim = loadSim(page)
  const round = sim.createRound(5, 0)
  round.items.push({ type: 'time', x: 240, y: 430, r: 17, vy: 120, sway: 0, phase: 0 })
  let jumped = false
  for (let step = 0; step < 400 && round.status === 'playing'; step += 1) {
    const before = round.time
    const events = sim.stepRound(round, 240, 1 / 60)
    if (events.some((event) => event.type === 'time')) {
      assert.ok(round.time > before + 4, '接住沙漏应该立刻多出约 5 秒')
      jumped = true
    }
  }
  assert.ok(jumped, '沙漏应该被接住过')
})

test('水草让鱼群掉得明显更慢', () => {
  const sim = loadSim(page)
  const fallWith = (slow) => {
    const round = sim.createRound(3, 0)
    round.items = [{ type: 'fish', x: 40, y: 100, r: 16, vy: 120, sway: 0, phase: 0 }]
    round.slowTimer = slow ? 5 : 0
    for (let step = 0; step < 10; step += 1) sim.stepRound(round, 240, 1 / 60)
    return round.items[0].y - 100
  }
  const fast = fallWith(false)
  const slow = fallWith(true)
  assert.ok(fast > 15, '正常掉落应该有位移')
  assert.ok(slow < fast * 0.6, '水草生效时位移应该不到一半')
})

test('铃铛把屏幕上的炸弹清掉，每个加 5 分', () => {
  const sim = loadSim(page)
  const { events, after } = catchOne(sim, 'bell', [
    { type: 'bomb', x: 60, y: 200, r: 17, vy: 0, sway: 0, phase: 0 },
    { type: 'bomb', x: 380, y: 240, r: 17, vy: 0, sway: 0, phase: 0 },
  ])
  const bell = events.find((event) => event.type === 'bell')
  assert.ok(bell, '应该接住了铃铛')
  assert.equal(bell.cleared, 2)
  assert.equal(after.types.filter((type) => type === 'bomb').length, 0, '接住那一刻屏幕上不该有炸弹')
  assert.ok(after.score >= 10, '清掉的炸弹每个 +5 分')
})
