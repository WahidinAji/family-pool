import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { pickRandomWinner } from './arisan.js'

describe('pickRandomWinner', () => {
  test('throws when there are no eligible members', () => {
    assert.throws(() => pickRandomWinner([]))
  })

  test('returns the only candidate when there is exactly one', () => {
    assert.equal(pickRandomWinner(['a']), 'a')
  })

  test('always returns one of the given candidates', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e']
    for (let i = 0; i < 200; i++) {
      assert.ok(candidates.includes(pickRandomWinner(candidates)))
    }
  })

  test('over many draws, every candidate gets picked at least once (no obvious bias)', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e']
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      seen.add(pickRandomWinner(candidates))
    }
    assert.equal(seen.size, candidates.length)
  })
})
