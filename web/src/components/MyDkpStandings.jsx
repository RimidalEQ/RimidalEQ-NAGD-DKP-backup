import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import useSWR from 'swr'
import { useDkpData } from '../lib/dkpLeaderboard'
import { loadAccountActivity } from '../lib/accountData'
import { formatMyDkpTotal, reconcileAccountDkp } from '../lib/accountDkpTotals'

const ACTIVITY_DEDUPING_MS = 60_000

export function claimedAccountId(accountId) {
  if (accountId == null) return ''
  return String(accountId).trim()
}

/**
 * DKP total for the signed-in user's claimed account, using the account page formula.
 * Pass activityByRaid when the page already loaded it (profile) so we don't fetch twice.
 */
export function useMyAccountDkp(accountId, { activityByRaid, activityReady } = {}) {
  const id = claimedAccountId(accountId)
  const provided = activityByRaid !== undefined
  const { accountTotalsByAccountId, isLoading: summaryLoading, error: summaryError } = useDkpData(undefined, { enabled: Boolean(id) })
  const { data, error: activityFetchError, isLoading: activityLoading } = useSWR(
    !provided && id ? `my-account-activity-${id}` : null,
    () => loadAccountActivity(id),
    { dedupingInterval: ACTIVITY_DEDUPING_MS, revalidateOnFocus: false },
  )
  const raids = provided ? (activityByRaid || []) : (data?.activityByRaid || [])
  const raidsReady = provided ? activityReady !== false : !activityLoading
  const activityError = provided ? '' : (data?.error || activityFetchError?.message || '')
  const totals = useMemo(() => {
    if (!id || !raidsReady) return null
    return reconcileAccountDkp(accountTotalsByAccountId?.[id], raids)
  }, [id, raidsReady, accountTotalsByAccountId, raids])
  const loading = Boolean(id) && (summaryLoading || !raidsReady)
  const failed = Boolean(id) && !loading && Boolean(summaryError) && Boolean(activityError)
  return { accountId: id, totals, loading, failed }
}

export function MyDkpStandingsView({ accountId, totals, loading, failed, showClaimPrompt = false }) {
  if (!accountId) {
    if (!showClaimPrompt) return null
    return (
      <p style={{ color: '#a1a1aa' }}>
        Claim your account on the <Link to="/dkp">DKP page</Link> to display your current DKP standings.
      </p>
    )
  }
  if (loading || !totals) {
    return <p style={{ color: '#71717a' }}>Loading your DKP…</p>
  }
  if (failed) {
    return <p style={{ color: '#f87171' }}>Couldn&apos;t load your DKP standings.</p>
  }
  const line = formatMyDkpTotal(totals)
  const balance = Number(totals.balance).toFixed(0)
  const marker = `Your DKP total is: ${balance}`
  const marked = line.startsWith(marker)
  return (
    <p style={{ color: '#a1a1aa' }}>
      {marked ? (
        <>
          Your DKP total is: <strong>{balance}</strong>
          {line.slice(marker.length)}
        </>
      ) : line}
    </p>
  )
}

export default function MyDkpStandings({ accountId, showClaimPrompt = false, activityByRaid, activityReady }) {
  const state = useMyAccountDkp(accountId, { activityByRaid, activityReady })
  return <MyDkpStandingsView {...state} showClaimPrompt={showClaimPrompt} />
}
