const TEXT_FILE_PATTERN = /\.(txt|md|markdown)$/i;

export function normalizeDriveFolderUrl(value = '') {
  const match = String(value).trim().match(/^https:\/\/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]{10,})/);
  return match ? `https://drive.google.com/drive/folders/${match[1]}` : '';
}

export function collectDirectTextFiles(entries = []) {
  return entries
    .filter(entry => entry?.kind === 'file' && TEXT_FILE_PATTERN.test(entry.name || ''))
    .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
}

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function formatAIEditRequest({
  scopeLabel = '指定ファイル',
  folderName = '',
  folderUrl = '',
  generatedAt = new Date().toISOString(),
  instruction = '',
  files = [],
  includeLocalPaths = false,
}) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('対象ファイルがありません');
  const names = files.map(file => file?.name).filter(Boolean);
  if (new Set(names).size !== names.length) throw new Error('同名ファイルが複数あるため依頼情報を生成できません');
  const fileLines = files.map((file, index) => {
    if (!file?.name || !file?.sha256) throw new Error(`対象ファイル${index + 1}の確認情報が不足しています`);
    return [
      `${index + 1}. ${file.name}`,
      ...(includeLocalPaths && file.path ? [`   ローカルパス: ${file.path}`] : []),
      `   文字数: ${file.characterCount}`,
      `   更新日時: ${file.modifiedAt}`,
      `   SHA-256: ${file.sha256}`,
    ].join('\n');
  }).join('\n');

  return `[NEXUS AI編集依頼]
対象種別: ${scopeLabel}
${folderName ? `対象フォルダ: ${folderName}\n` : ''}${folderUrl ? `フォルダURL: ${folderUrl}\n` : ''}生成日時: ${generatedAt}

[対象ファイル目録]
${fileLines}

[依頼内容]
${instruction.trim() || '（依頼内容を追記してください）'}

[必須の安全手順]
1. 編集前に対象ファイルを取得してください。
2. 各ファイルのSHA-256を計算し、上の目録と照合してください。
3. 一つでも一致しない、取得できない、同名ファイルが複数ある場合は編集しないでください。
4. 不一致のファイル名、取得したSHA-256、想定SHA-256を報告して確認を求めてください。
5. 一致確認後も、書き込み直前に対象ファイルが変化していないことを再確認してください。`;
}
