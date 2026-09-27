import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeSocket } from './useRealtimeSocket'

const createSocket = () => ({ onmessage: null, onclose: null, onerror: null, close: vi.fn() }) as unknown as WebSocket

describe('useRealtimeSocket', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('メッセージを受け取り、切断されたら5秒後に再接続する', async () => {
    const sockets: WebSocket[] = []
    const open = vi.fn(async () => { const socket = createSocket(); sockets.push(socket); return socket })
    const onMessage = vi.fn()
    renderHook(() => useRealtimeSocket('project:1', open, onMessage))
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))

    const message = new MessageEvent('message', { data: '{}' })
    sockets[0].onmessage?.(message)
    expect(onMessage).toHaveBeenCalledWith(message)

    sockets[0].onclose?.(new CloseEvent('close'))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('接続に失敗しても再試行する', async () => {
    const open = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(createSocket())
    renderHook(() => useRealtimeSocket('project:1', open, vi.fn()))
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(5_000)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('アンマウント時に切断し、再接続しない', async () => {
    const socket = createSocket()
    const open = vi.fn().mockResolvedValue(socket)
    const { unmount } = renderHook(() => useRealtimeSocket('project:1', open, vi.fn()))
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))

    unmount()
    expect(socket.close).toHaveBeenCalled()
    socket.onclose?.(new CloseEvent('close'))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('チャンネルが未指定のときは接続しない', () => {
    const open = vi.fn()
    renderHook(() => useRealtimeSocket(null, open, vi.fn()))
    expect(open).not.toHaveBeenCalled()
  })
})
