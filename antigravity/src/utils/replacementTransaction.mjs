const normalizePath = value => String(value || '').normalize('NFC').replace(/\\/g, '/');

const conflictIsActive = value => typeof value === 'function' ? value() : Boolean(value);

export async function executeReplacementTransaction({
  changes,
  activeFilePath = '',
  conflictActive = false,
  setInProgress = () => {},
  readFile,
  writeFile,
  syncActiveFile = async () => {},
}) {
  if (!Array.isArray(changes) || changes.length === 0) return { files: 0, total: 0 };
  if (conflictIsActive(conflictActive)) {
    throw new Error('外部編集との競合が残っているため、置換を実行できません');
  }

  setInProgress(true);
  const written = [];
  try {
    // 全対象を先に照合する。一部を書いた後で別ファイルの競合が判明する
    // 「半分だけ置換」を避けるため、書込み前の検査と書込みを分離する。
    for (const change of changes) {
      const current = String(await readFile(change.path));
      if (current !== change.before) {
        throw new Error(`${change.name} はプレビュー後に更新されたため、置換を停止しました`);
      }
    }

    let total = 0;
    for (const change of changes) {
      if (conflictIsActive(conflictActive)) {
        throw new Error('置換中に外部編集との競合を検知したため、処理を停止しました');
      }

      const result = await writeFile(change.path, change.after, { expectedContent: change.before });
      if (result?.ok === false) throw new Error(`${change.name} の保存結果を確認できませんでした`);

      const readBack = String(await readFile(change.path));
      if (readBack !== change.after) throw new Error(`${change.name} の保存後内容が一致しません`);
      written.push(change);
      total += Number(change.count) || 0;
    }

    const activeChange = written.find(change => normalizePath(activeFilePath) === normalizePath(change.path));
    if (activeChange) await syncActiveFile(activeChange);
    return { files: changes.length, total };
  } catch (error) {
    const rollbackFailures = [];
    for (const change of [...written].reverse()) {
      try {
        await writeFile(change.path, change.before, { expectedContent: change.after });
        const restored = String(await readFile(change.path));
        if (restored !== change.before) throw new Error('復元後内容が一致しません');
      } catch (rollbackError) {
        rollbackFailures.push(`${change.name}: ${rollbackError?.message || rollbackError}`);
      }
    }
    if (rollbackFailures.length) {
      throw new Error(`${error?.message || error}\n一部ファイルを安全に戻せませんでした: ${rollbackFailures.join(', ')}`);
    }
    throw error;
  } finally {
    setInProgress(false);
  }
}
