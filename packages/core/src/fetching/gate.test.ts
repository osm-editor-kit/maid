import { describe, expect, test } from 'bun:test'
import { createGate, rateLimitPauseMs } from './gate.ts'
import { createTestClock, settle } from './test-clock.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function setup(concurrency: number) {
  const clock = createTestClock()
  const gate = createGate({ concurrency, now: clock.now, sleep: clock.sleep })
  return { clock, gate }
}

describe('order and concurrency', () => {
  test('runs waiting tasks in the order of the calls', async () => {
    const { gate } = setup(1)
    const order: number[] = []
    const runs = [1, 2, 3, 4].map((n) =>
      gate.run(async () => {
        order.push(n)
        await settle()
        return n
      }),
    )
    expect(await Promise.all(runs)).toEqual([1, 2, 3, 4])
    expect(order).toEqual([1, 2, 3, 4])
  })

  for (const concurrency of [1, 2, 6]) {
    test(`never runs more than ${concurrency} of 20 tasks at once, and uses all ${concurrency} slots`, async () => {
      const { gate } = setup(concurrency)
      const state = { active: 0, peak: 0 }
      const runs = Array.from({ length: 20 }, (_, i) =>
        gate.run(async () => {
          state.active++
          state.peak = Math.max(state.peak, state.active)
          await settle()
          state.active--
          return i
        }),
      )
      expect(await Promise.all(runs)).toEqual(Array.from({ length: 20 }, (_, i) => i))
      expect(state.peak).toBe(concurrency)
      expect(state.active).toBe(0)
    })
  }

  test('a task that throws rejects its own call and frees its slot', async () => {
    const { gate } = setup(1)
    const failing = gate.run(async () => {
      throw new Error('boom')
    })
    const next = gate.run(async () => 'next')
    await expect(failing).rejects.toThrow('boom')
    expect(await next).toBe('next')
  })

  test('rejects a concurrency below 1', () => {
    expect(() => createGate({ concurrency: 0 })).toThrow(RangeError)
  })
})

describe('pause', () => {
  test('holds everything until the time, then releases in order and tells the listeners', async () => {
    const { clock, gate } = setup(2)
    const start = clock.now()
    const seen: string[] = []
    const ends: (number | undefined)[] = []
    gate.subscribe((until) => ends.push(until))

    gate.pause(start + 5000)
    expect(gate.paused()).toBe(start + 5000)

    const runs = ['a', 'b', 'c'].map((name) =>
      gate.run(async () => {
        seen.push(name)
        return name
      }),
    )
    await settle()
    expect(seen).toEqual([])

    await clock.advance(4999)
    expect(seen).toEqual([])
    expect(gate.paused()).toBe(start + 5000)

    await clock.advance(1)
    expect(await Promise.all(runs)).toEqual(['a', 'b', 'c'])
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(gate.paused()).toBeUndefined()
    expect(ends).toEqual([start + 5000, undefined])
  })

  test('a longer pause replaces a shorter one, and a shorter one changes nothing', async () => {
    const { clock, gate } = setup(1)
    const start = clock.now()
    let ran = false
    gate.pause(start + 5000)
    gate.pause(start + 2000)
    expect(gate.paused()).toBe(start + 5000)

    await clock.advance(2000)
    const run = gate.run(async () => {
      ran = true
    })
    gate.pause(start + 12000)
    await clock.advance(5000)
    expect(ran).toBe(false)
    expect(gate.paused()).toBe(start + 12000)
    await clock.advance(5000)
    await run
    expect(ran).toBe(true)
  })

  test('a task that is already running is not stopped by a pause', async () => {
    const { clock, gate } = setup(1)
    const hold = deferred<string>()
    const running = gate.run(() => hold.promise)
    gate.pause(clock.now() + 1000)
    hold.resolve('done')
    expect(await running).toBe('done')
  })
})

describe('abort of a waiting call', () => {
  test('a waiting call is removed from the queue and rejects with the reason', async () => {
    const { gate } = setup(1)
    const hold = deferred<void>()
    const ran: string[] = []
    const first = gate.run(async () => {
      await hold.promise
      ran.push('first')
    })
    const controller = new AbortController()
    const reason = new Error('no longer needed')
    const second = gate.run(async () => {
      ran.push('second')
    }, controller.signal)
    const third = gate.run(async () => {
      ran.push('third')
    })

    controller.abort(reason)
    await expect(second).rejects.toBe(reason)

    hold.resolve()
    await Promise.all([first, third])
    expect(ran).toEqual(['first', 'third'])
  })

  test('a call whose signal is already aborted never runs', async () => {
    const { gate } = setup(1)
    const controller = new AbortController()
    const reason = new Error('early')
    controller.abort(reason)
    let ran = false
    await expect(
      gate.run(async () => {
        ran = true
      }, controller.signal),
    ).rejects.toBe(reason)
    expect(ran).toBe(false)
  })
})

describe('rate limits', () => {
  test('repeated answers without a time pause for 10, 20, 40, 60, 60 seconds', () => {
    const { clock, gate } = setup(1)
    const start = clock.now()
    const pauses: number[] = []
    for (let i = 0; i < 5; i++) pauses.push(gate.rateLimited(undefined) - start)
    expect(pauses).toEqual([10_000, 20_000, 40_000, 60_000, 60_000])
  })

  test('a success resets the back-off to 10 seconds', async () => {
    const { clock, gate } = setup(1)
    for (let i = 0; i < 3; i++) gate.rateLimited(undefined)
    await clock.advance(60_000)
    gate.succeeded()
    expect(gate.rateLimited(undefined) - clock.now()).toBe(10_000)
  })

  test('a time the answer names is used as it is, and still counts for the back-off', async () => {
    const { clock, gate } = setup(1)
    expect(gate.rateLimited(7000) - clock.now()).toBe(7000)
    await clock.advance(7000)
    expect(gate.rateLimited(undefined) - clock.now()).toBe(20_000)
  })

  test('the pause ends and listeners hear it', async () => {
    const { clock, gate } = setup(1)
    const heard: (number | undefined)[] = []
    gate.subscribe((until) => heard.push(until))
    const until = gate.rateLimited(3000)
    await clock.advance(3000)
    expect(heard).toEqual([until, undefined])
  })

  test('the back-off sequence is a pure function of the count', () => {
    expect([1, 2, 3, 4, 5].map(rateLimitPauseMs)).toEqual([10_000, 20_000, 40_000, 60_000, 60_000])
  })
})
