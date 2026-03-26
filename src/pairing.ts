import { loadState, saveState } from './config.js'

interface PendingPair {
  openId: string
  code: string
  expiry: number
}

const pending = new Map<string, PendingPair>()

export function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function createPairRequest(openId: string): string {
  const code = generateCode()
  pending.set(code, { openId, code, expiry: Date.now() + 5 * 60 * 1000 })
  return code
}

export function approvePair(code: string): string | null {
  const entry = pending.get(code)
  if (!entry || Date.now() > entry.expiry) {
    pending.delete(code)
    return null
  }
  pending.delete(code)
  const state = loadState()
  if (!state.pairedOpenIds.includes(entry.openId)) {
    state.pairedOpenIds.push(entry.openId)
    saveState(state)
  }
  return entry.openId
}

export function isPaired(openId: string): boolean {
  return loadState().pairedOpenIds.includes(openId)
}

export function unpair(openId: string) {
  const state = loadState()
  state.pairedOpenIds = state.pairedOpenIds.filter(id => id !== openId)
  saveState(state)
}

export function getPendingByOpenId(openId: string): PendingPair | undefined {
  for (const entry of pending.values()) {
    if (entry.openId === openId) return entry
  }
}
