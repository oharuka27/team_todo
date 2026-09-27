import { useEffect, useRef } from 'react'

const RETRY_DELAY_MS = 5_000

/**
 * Keeps a realtime WebSocket open while `channelKey` is set, reconnecting after a disconnect.
 * The socket is reopened only when `channelKey` changes; `open` and `onMessage` may change freely.
 */
export function useRealtimeSocket(channelKey: string | null, open: () => Promise<WebSocket>, onMessage: (event: MessageEvent) => void) {
  const handlers = useRef({ open, onMessage })
  useEffect(() => {
    handlers.current = { open, onMessage }
  })

  useEffect(() => {
    if (!channelKey) return
    let active = true
    let socket: WebSocket | null = null
    let retryId: number | null = null
    const retry = () => { if (active) retryId = window.setTimeout(connect, RETRY_DELAY_MS) }

    async function connect() {
      if (!active) return
      try {
        const nextSocket = await handlers.current.open()
        if (!active) {
          nextSocket.close()
          return
        }
        socket = nextSocket
        socket.onmessage = (event) => handlers.current.onMessage(event)
        socket.onclose = retry
        socket.onerror = () => socket?.close()
      } catch {
        retry()
      }
    }

    void connect()
    return () => {
      active = false
      if (retryId !== null) window.clearTimeout(retryId)
      socket?.close()
    }
  }, [channelKey])
}
