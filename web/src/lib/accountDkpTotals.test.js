import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatMyDkpTotal, reconcileAccountDkp } from './accountDkpTotals.js'

describe('reconcileAccountDkp', () => {
  it('matches the account page when the summary is ahead of the loaded raids', () => {
    const totals = reconcileAccountDkp(
      { earned: 4791, spent: 4609 },
      [{ dkpEarned: 100, items: [{ cost: 40 }] }],
    )
    assert.deepEqual(totals, {
      earned: 4791,
      spent: 4609,
      balance: 182,
      staleSummary: false,
    })
    assert.equal(formatMyDkpTotal(totals), 'Your DKP total is: 182 (earned 4791 \u00B7 spent 4609)')
  })

  it('keeps the higher live earned and spent when the summary cache lags', () => {
    const totals = reconcileAccountDkp(
      { earned: 100, spent: 10 },
      [
        { dkpEarned: 80, items: [{ cost: '12' }, { cost: 'bad' }] },
        { dkpEarned: 70, items: [{ cost: 5 }] },
      ],
    )
    assert.equal(totals.earned, 150)
    assert.equal(totals.spent, 17)
    assert.equal(totals.balance, 133)
    assert.equal(totals.staleSummary, true)
  })

  it('uses summary spent when this page has no loot rows', () => {
    const totals = reconcileAccountDkp({ earned: 0, spent: 40 }, [{ dkpEarned: 10, items: [] }])
    assert.equal(totals.earned, 10)
    assert.equal(totals.spent, 40)
    assert.equal(totals.balance, -30)
  })
})
