import { describe, expect, it } from 'vitest'
import { avatarTextColor, initialOf } from './avatar'

describe('avatar utils', () => {
  it('名前の先頭1文字を大文字で返す（サロゲートペアも1文字として扱う）', () => {
    expect(initialOf('haruka')).toBe('H')
    expect(initialOf('山田')).toBe('山')
    expect(initialOf('𠮷田')).toBe('𠮷')
    expect(initialOf('')).toBe('?')
  })

  it('背景色の明るさに応じて読みやすい文字色を返す', () => {
    expect(avatarTextColor('#123456')).toBe('#ffffff')
    expect(avatarTextColor('#f2e9a1')).toBe('#29464b')
    expect(avatarTextColor('invalid')).toBe('#29464b')
  })
})
