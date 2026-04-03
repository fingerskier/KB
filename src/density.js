import { gzipSync } from 'zlib'

export function informationDensity(text) {
  const orig = Buffer.byteLength(text, 'utf8')
  if (orig === 0) return 0
  const compressed = gzipSync(Buffer.from(text, 'utf8'))
  return compressed.length / orig
}
