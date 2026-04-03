const DEFAULT_CHUNK_SIZE = 512
const DEFAULT_OVERLAP = 64

export function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const chunks = []
  const lines = text.split('\n')
  let current = ''

  for (const line of lines) {
    if (current.length + line.length + 1 > chunkSize && current.length > 0) {
      chunks.push(current.trim())
      // keep overlap from end of previous chunk
      const words = current.split(/\s+/)
      const overlapWords = words.slice(-Math.ceil(overlap / 5))
      current = overlapWords.join(' ') + '\n' + line
    } else {
      current += (current ? '\n' : '') + line
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks
}
