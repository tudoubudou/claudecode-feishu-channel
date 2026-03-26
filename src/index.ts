#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { sendText, startEventListener } from './feishu.js'
import { createPairRequest, approvePair, isPaired, unpair } from './pairing.js'
import { enqueueMessage, drainQueue } from './config.js'

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'feishu', version: '1.0.0' },
  {
    capabilities: { tools: {} },
    instructions:
      'You have a Feishu channel server. ' +
      'Call get_messages to check for pending messages from Feishu users, then reply to each with the reply tool. ' +
      'Call approve_pair to confirm a pairing request.',
  }
)

// ── Tools ─────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_messages',
      description: 'Get and clear all pending messages from Feishu users. Returns an array of {openId, text, time} objects. Call this periodically to check for new messages.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'reply',
      description: 'Send a text message back to a Feishu user',
      inputSchema: {
        type: 'object',
        properties: {
          open_id: { type: 'string', description: 'The Feishu open_id to reply to' },
          text: { type: 'string', description: 'The message text to send' },
        },
        required: ['open_id', 'text'],
      },
    },
    {
      name: 'approve_pair',
      description: 'Approve a Feishu pairing request. Call this after a user sends /pair and you decide to allow them.',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The 6-character pairing code the user received' },
        },
        required: ['code'],
      },
    },
    {
      name: 'unpair',
      description: 'Remove a Feishu user from the paired list, revoking their access',
      inputSchema: {
        type: 'object',
        properties: {
          open_id: { type: 'string', description: 'The open_id to remove' },
        },
        required: ['open_id'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params

  if (name === 'get_messages') {
    const msgs = drainQueue()
    if (msgs.length === 0) {
      return { content: [{ type: 'text', text: '[]' }] }
    }
    return { content: [{ type: 'text', text: JSON.stringify(msgs, null, 2) }] }
  }

  if (name === 'reply') {
    const { open_id, text } = args as { open_id: string; text: string }
    await sendText(open_id, text)
    return { content: [{ type: 'text', text: 'Sent.' }] }
  }

  if (name === 'approve_pair') {
    const { code } = args as { code: string }
    const openId = approvePair(code.toUpperCase())
    if (!openId) {
      return { content: [{ type: 'text', text: 'Code invalid or expired.' }] }
    }
    await sendText(openId, '✅ 配对成功！你现在可以直接发消息给 Claude 了。发送 /unpair 可以取消配对。')
    return { content: [{ type: 'text', text: `Paired: ${openId}` }] }
  }

  if (name === 'unpair') {
    const { open_id } = args as { open_id: string }
    unpair(open_id)
    await sendText(open_id, '已取消配对。')
    return { content: [{ type: 'text', text: `Unpaired: ${open_id}` }] }
  }

  throw new Error(`Unknown tool: ${name}`)
})

// ── Feishu inbound messages ───────────────────────────────────────────────────

async function onFeishuMessage(openId: string, text: string) {
  // Handle /pair command
  if (text === '/pair') {
    const code = createPairRequest(openId)
    await sendText(openId, `🔗 配对码：${code}\n\n请在 Claude Code 终端中调用 approve_pair 工具，输入此验证码（5 分钟内有效）`)
    return
  }

  // Handle /unpair
  if (text === '/unpair') {
    if (isPaired(openId)) {
      unpair(openId)
      await sendText(openId, '已取消配对。')
    } else {
      await sendText(openId, '你尚未配对。')
    }
    return
  }

  // Gate: only paired users
  if (!isPaired(openId)) {
    await sendText(openId, '请先发送 /pair 进行配对。')
    return
  }

  // Queue the message for Claude to pick up
  enqueueMessage(openId, text)
  await sendText(openId, '✉️ 消息已收到，Claude 正在处理...')
}

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
startEventListener(onFeishuMessage)
