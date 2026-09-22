'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  profileLabel,
  refreshProfileDairyNames,
  switchSavedProfile,
  type SavedProfile,
} from '@/lib/account-switch'
import { listSavedProfiles, logoutSavedProfile, removeSavedProfile } from '@/lib/auth'
import { toast } from 'sonner'

export function useSavedProfiles() {
  const [profiles, setProfiles] = useState<SavedProfile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    // NOTE: never delete profiles here based on the stored planExpiry
    // snapshot — it can be stale (plan renewed after login). Expiry is
    // enforced by ensurePlanValid() and by server PLAN_EXPIRED responses.
    const next = listSavedProfiles()
    setProfiles(next)
    try {
      const raw = window.localStorage.getItem('bill-manager-auth')
      if (!raw) {
        setActiveId(null)
        return
      }
      const active = JSON.parse(raw) as { dairyId: number; uuid: string }
      setActiveId(`${active.dairyId}:${active.uuid}`)
    } catch {
      setActiveId(null)
    }
  }, [])

  useEffect(() => {
    refresh()
    void refreshProfileDairyNames(listSavedProfiles(), setProfiles)
    const handleChange = () => {
      refresh()
      void refreshProfileDairyNames(listSavedProfiles(), setProfiles)
    }
    window.addEventListener('storage', handleChange)
    window.addEventListener('bill-manager-profiles-updated', handleChange)
    return () => {
      window.removeEventListener('storage', handleChange)
      window.removeEventListener('bill-manager-profiles-updated', handleChange)
    }
  }, [refresh])

  const switchTo = useCallback(async (profileId: string) => {
    if (switchingId) return
    setSwitchingId(profileId)
    try {
      const switched = await switchSavedProfile(profileId)
      if (!switched) {
        toast.error('That account is no longer available.')
        refresh()
      }
    } catch {
      toast.error('Could not switch accounts. Please try again.')
    } finally {
      setSwitchingId(null)
    }
  }, [refresh, switchingId])

  const remove = useCallback((profileId: string, wasActive: boolean) => {
    if (wasActive) {
      logoutSavedProfile(profileId)
      window.location.replace('/')
      return
    }
    const next = removeSavedProfile(profileId)
    setProfiles(next)
    toast.success('Account removed from this device.')
  }, [])

  return { profiles, activeId, switchingId, refresh, switchTo, remove }
}

function initialsFor(username: string): string {
  return username
    .split(/[\s_.-]+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '•'
}

export function ProfileSwitcherList({ onAddAccount }: { onAddAccount?: () => void }) {
  const { profiles, activeId, switchingId, switchTo, remove } = useSavedProfiles()
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  if (profiles.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          No other accounts are signed in on this device yet.
        </p>
        <Button asChild variant="outline" className="w-full gap-2" onClick={onAddAccount}>
          <Link href="/?add-account=1">
            <Plus className="h-4 w-4" />
            Log in to another dairy
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-0.5">
        {profiles.map((profile) => {
          const profileId = `${profile.dairyId}:${profile.uuid}`
          const isActive = profileId === activeId
          const isSwitching = switchingId === profileId
          return (
            <li
              key={profileId}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                isActive ? 'border-primary/40 bg-primary/5' : 'border-border bg-background'
              }`}
            >
              <div className="grid size-9 shrink-0 place-content-center rounded-full bg-gradient-to-br from-violet-500 to-violet-600 text-xs font-bold text-white">
                {initialsFor(profile.username)}
              </div>
              <button
                type="button"
                disabled={isActive || isSwitching}
                onClick={() => void switchTo(profileId)}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
                title={isActive ? 'Currently active account' : `Switch to ${profile.username}`}
              >
                <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  <span className="truncate">{profile.username}</span>
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {profile.role} · {profileLabel(profile)}
                </span>
              </button>
              {isSwitching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {confirmRemoveId === profileId ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-xs"
                    onClick={() => remove(profileId, isActive)}
                  >
                    Remove
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmRemoveId(null)}
                  >
                    Keep
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  title={`Remove ${profile.username} from this device`}
                  aria-label={`Remove ${profile.username} from this device`}
                  onClick={() => setConfirmRemoveId(profileId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <Button asChild variant="outline" className="w-full gap-2" onClick={onAddAccount}>
        <Link href="/?add-account=1">
          <Plus className="h-4 w-4" />
          Log in to another dairy
        </Link>
      </Button>
    </div>
  )
}
