export const DEFAULT_AVATAR_COLOR = '#4a9c9b'

/** The first character of a name (Unicode-aware), used as an avatar label. */
export const initialOf = (name: string) => Array.from(name)[0]?.toUpperCase() || '?'

/** Dark or light text, whichever is readable on the given avatar background. */
export const avatarTextColor = (backgroundColor: string) => {
  const hex = backgroundColor.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (!hex) return '#29464b'
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return luminance > 0.45 ? '#29464b' : '#ffffff'
}
