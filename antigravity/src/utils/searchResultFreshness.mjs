export function createSearchSignature(term, { isRegex = false, caseSensitive = false, txtOnly = true } = {}) {
  return JSON.stringify([String(term ?? ''), Boolean(isRegex), Boolean(caseSensitive), Boolean(txtOnly)]);
}

export function isCurrentSearchResponse({ responseId, latestId, responseSignature, currentSignature }) {
  return responseId === latestId && responseSignature === currentSignature;
}
