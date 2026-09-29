/** Parse Aozora Bunko ruby without modifying the source text. */
export function parseRubyTokens(text = '') {
  const tokens = [];
  const rubyPattern = /｜([^｜《]+)《([^》]+)》|([一-龠々〆ヵヶ]+)《([^》]+)》/g;
  let cursor = 0;
  let match;
  while ((match = rubyPattern.exec(text)) !== null) {
    if (match.index > cursor) tokens.push(text.slice(cursor, match.index));
    tokens.push({ type: 'ruby', base: match[1] ?? match[3], ruby: match[2] ?? match[4] });
    cursor = rubyPattern.lastIndex;
  }
  if (cursor < text.length) tokens.push(text.slice(cursor));
  return tokens;
}

export function rubyTokensToText(tokens = []) {
  return tokens.map(token => typeof token === 'string' ? token : token.base).join('');
}
