import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ConfirmTextDialog from './ConfirmTextDialog'

const renderDialog = (onConfirm: () => Promise<void>, onClose = vi.fn()) => render(
  <ConfirmTextDialog
    eyebrow="DELETE PROJECT"
    title="「テスト」を削除"
    warning="この操作は取り消せません。"
    confirmWord="削除"
    busyLabel="削除中…"
    errorMessage="削除できませんでした。"
    onConfirm={onConfirm}
    onClose={onClose}
  />,
)

describe('ConfirmTextDialog', () => {
  it('確認の言葉を入力するまで実行できない', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    renderDialog(onConfirm)

    const execute = screen.getByRole('button', { name: '実行' })
    await user.type(screen.getByRole('textbox', { name: /確認のため「削除」/ }), '削')
    expect(execute).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: /確認のため「削除」/ }), '除')
    await user.click(execute)

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('失敗したらエラーを表示して再実行できる', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined)
    renderDialog(onConfirm)

    await user.type(screen.getByRole('textbox', { name: /確認のため/ }), '削除')
    await user.click(screen.getByRole('button', { name: '実行' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('削除できませんでした。')

    await user.click(screen.getByRole('button', { name: '実行' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2))
  })

  it('キャンセルで閉じる', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDialog(vi.fn(), onClose)

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onClose).toHaveBeenCalled()
  })
})
