import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractAmountFromText } from './ocr.js'

describe('extractAmountFromText', () => {
  it('extracts Indonesian formatted rupiah amounts', () => {
    assert.equal(extractAmountFromText('transfer Rp 125.000 sukses'), 125000)
  })

  it('chooses the largest plausible amount from noisy text', () => {
    assert.equal(extractAmountFromText('ref 123 paid 45,000 fee 2.500 total 150.000'), 150000)
  })

  it('returns null when no amount-like text exists', () => {
    assert.equal(extractAmountFromText('receipt image'), null)
  })
})
