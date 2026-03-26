import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const STATE_DIR = join(homedir(), '.claude', 'channels', 'feishu')
const STATE_FILE = join(STATE_DIR, 'state.json')
const QUEUE_FILE = join(STATE_DIR, 'queue.json')

export interface QueuedMessage {
  openId: string
  text: string
  time: string
}

export function enqueueMessage(openId: string, text: string) {
  ensureDir()
  let queue: QueuedMessage[] = []
  try {
    if (existsSync(QUEUE_FILE)) queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'))
  } catch {}
  queue.push({ openId, text, time: new Date().toISOString() })
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2))
}

export function drainQueue(): QueuedMessage[] {
  ensureDir()
  if (!existsSync(QUEUE_FILE)) return []
  try {
    const msgs = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'))
    writeFileSync(QUEUE_FILE, '[]')
    return msgs
  } catch {
    return []
  }
}

export interface State {
  pairedOpenIds: string[]
}

function ensureDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true })
}

export function loadState(): State {
  ensureDir()
  if (!existsSync(STATE_FILE)) return { pairedOpenIds: [] }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return { pairedOpenIds: [] }
  }
}

export function saveState(state: State) {
  ensureDir()
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

export function getConfig() {
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET must be set')
  }
  return { appId, appSecret }
}
