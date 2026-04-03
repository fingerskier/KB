/**
 * Lightweight local text embedder using character n-gram hashing.
 * No external model download required - creates fixed-size vectors
 * using hash projections of character and word n-grams.
 */

const DIMENSIONS = 384
const CHAR_NGRAM_SIZES = [3, 4, 5]
const WORD_NGRAM_SIZES = [1, 2]

function hashCode(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return h
}

function hashToIndex(str, dim) {
  const h = hashCode(str)
  return ((h % dim) + dim) % dim
}

function hashToSign(str) {
  return (hashCode(str + '_sign') & 1) === 0 ? 1 : -1
}

function extractCharNgrams(text) {
  const ngrams = []
  const lower = text.toLowerCase()
  for (const n of CHAR_NGRAM_SIZES) {
    for (let i = 0; i <= lower.length - n; i++) {
      ngrams.push(lower.slice(i, i + n))
    }
  }
  return ngrams
}

function extractWordNgrams(text) {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0)
  const ngrams = []
  for (const n of WORD_NGRAM_SIZES) {
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '))
    }
  }
  return ngrams
}

function normalize(vec) {
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm === 0) return vec
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return vec
}

function embedText(text) {
  const vec = new Float64Array(DIMENSIONS)

  // Character n-gram features (weighted higher)
  const charNgrams = extractCharNgrams(text)
  for (const ng of charNgrams) {
    const idx = hashToIndex(ng, DIMENSIONS)
    vec[idx] += hashToSign(ng) * 1.0
  }

  // Word n-gram features (weighted higher for semantic meaning)
  const wordNgrams = extractWordNgrams(text)
  for (const ng of wordNgrams) {
    const idx = hashToIndex('w_' + ng, DIMENSIONS)
    vec[idx] += hashToSign('w_' + ng) * 2.0
  }

  return Array.from(normalize(vec))
}

export async function initEmbedder() {
  return {
    dimensions: DIMENSIONS,
    embed: async (text) => embedText(text),
  }
}
