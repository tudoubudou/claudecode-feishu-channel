import * as lark from '@larksuiteoapi/node-sdk'
import { getConfig } from './config.js'

let client: lark.Client | null = null

export function getClient(): lark.Client {
  if (!client) {
    const { appId, appSecret } = getConfig()
    client = new lark.Client({ appId, appSecret })
  }
  return client
}

export async function sendText(openId: string, text: string) {
  await getClient().im.message.create({
    params: { receive_id_type: 'open_id' },
    data: {
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  })
}

type MessageHandler = (openId: string, text: string) => void

export function startEventListener(onMessage: MessageHandler) {
  const { appId, appSecret } = getConfig()
  const wsClient = new lark.WSClient({ appId, appSecret, loggerLevel: lark.LoggerLevel.error })

  wsClient.start({
    eventDispatcher: new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        const openId: string = data.sender?.sender_id?.open_id ?? ''
        const msgType: string = data.message?.message_type ?? ''
        if (msgType !== 'text') return
        let text = ''
        try {
          text = JSON.parse(data.message.content).text ?? ''
        } catch {
          return
        }
        onMessage(openId, text.trim())
      },
    }),
  })
}
