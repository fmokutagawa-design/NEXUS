import React, { useEffect, useMemo, useState } from 'react';
import { fileSystem } from '../utils/fileSystem';
import { collectDirectTextFiles, formatAIEditRequest, normalizeDriveFolderUrl } from '../utils/aiEditRequestManifest.mjs';

const targetPath = target => typeof target === 'string' ? target : (target?.path || target?.handle || '');
const targetName = target => target?.name || targetPath(target).split(/[/\\]/).pop() || '名称不明';
const targetHandle = target => target?.handle || target;
const parentPath = value => String(value || '').replace(/[/\\][^/\\]+$/, '');

function flattenFolders(entries = [], result = []) {
  for (const entry of entries) {
    if (entry?.kind !== 'directory') continue;
    result.push(entry);
    flattenFolders(entry.children || [], result);
  }
  return result;
}

export default function AIEditRequestPanel({ activeFile, allFiles = [], fileTree = [], hasUnsavedChanges, showToast }) {
  const [scope, setScope] = useState('current');
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [folderKey, setFolderKey] = useState('');
  const [folderUrl, setFolderUrl] = useState('');
  const [instruction, setInstruction] = useState('');
  const [includeLocalPaths, setIncludeLocalPaths] = useState(true);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const folders = useMemo(() => flattenFolders(fileTree, []), [fileTree]);
  const files = useMemo(() => allFiles.filter(file => file?.kind !== 'directory' && /\.(txt|md|markdown)$/i.test(file.name || targetName(file))), [allFiles]);
  const urlStorageKey = useMemo(() => {
    if (scope === 'folder') return folderKey;
    if (scope === 'current') return parentPath(targetPath(activeFile));
    const first = files.find(file => selectedKeys.has(targetPath(file) || file.name));
    return parentPath(targetPath(first));
  }, [scope, folderKey, activeFile, files, selectedKeys]);

  useEffect(() => {
    setFolderUrl(urlStorageKey ? localStorage.getItem(`nexus-ai-folder-url:${urlStorageKey}`) || '' : '');
  }, [urlStorageKey]);

  const chooseFolder = value => {
    setFolderKey(value);
    setFolderUrl(localStorage.getItem(`nexus-ai-folder-url:${value}`) || '');
  };

  const resolveTargets = () => {
    if (scope === 'current') return activeFile ? [{ name: targetName(activeFile), handle: targetHandle(activeFile), path: targetPath(activeFile) }] : [];
    if (scope === 'multiple') return files.filter(file => selectedKeys.has(targetPath(file) || file.name));
    const folder = folders.find(item => (targetPath(item) || item.name) === folderKey);
    return folder ? collectDirectTextFiles(folder.children || []) : [];
  };

  const generate = async () => {
    if (hasUnsavedChanges) {
      showToast?.('先に現在の原稿を保存してください。未保存本文からは依頼情報を作成しません。');
      return;
    }
    const targets = resolveTargets();
    if (targets.length === 0) {
      showToast?.('対象ファイルを選択してください。');
      return;
    }
    setBusy(true);
    try {
      const fingerprints = await Promise.all(targets.map(file => fileSystem.getFileFingerprint(targetHandle(file))));
      const normalizedUrl = folderUrl ? normalizeDriveFolderUrl(folderUrl) : '';
      if (folderUrl && !normalizedUrl) throw new Error('Google DriveフォルダURLの形式を確認してください');
      if (urlStorageKey && normalizedUrl) localStorage.setItem(`nexus-ai-folder-url:${urlStorageKey}`, normalizedUrl);
      const folder = folders.find(item => (targetPath(item) || item.name) === folderKey);
      const result = formatAIEditRequest({
        scopeLabel: scope === 'current' ? '現在のファイル' : scope === 'multiple' ? '複数ファイル' : 'フォルダ直下',
        folderName: folder?.name || '',
        folderUrl: normalizedUrl,
        instruction,
        includeLocalPaths,
        files: fingerprints,
      });
      setPreview(result);
    } catch (error) {
      setPreview('');
      showToast?.(`依頼情報を生成できませんでした: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      showToast?.('AI編集依頼情報をコピーしました');
    } catch {
      showToast?.('自動コピーに失敗しました。下の本文を選択してコピーしてください。');
    }
  };

  return <div style={{ padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
    <h3 style={{ marginTop: 0 }}>AI編集依頼をコピー</h3>
    <p style={{ fontSize: 12, lineHeight: 1.6 }}>保存済みファイルをハッシュで固定し、旧版や別ファイルなら編集を停止する指示を生成します。</p>
    <label>対象</label>
    <select value={scope} onChange={event => setScope(event.target.value)} style={{ width: '100%', margin: '6px 0 12px' }}>
      <option value="current">現在のファイル</option>
      <option value="multiple">複数ファイル</option>
      <option value="folder">フォルダ直下</option>
    </select>
    {scope === 'current' && <div style={{ padding: 8, background: 'var(--bg-secondary,#eee)', marginBottom: 12 }}>{activeFile ? targetName(activeFile) : 'ファイルが開かれていません'}</div>}
    {scope === 'multiple' && <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border-color,#ccc)', padding: 8, marginBottom: 12 }}>{files.map(file => {
      const key = targetPath(file) || file.name;
      return <label key={key} style={{ display: 'block', marginBottom: 5 }}><input type="checkbox" checked={selectedKeys.has(key)} onChange={() => setSelectedKeys(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; })} /> {file.name || targetName(file)}</label>;
    })}</div>}
    {scope === 'folder' && <select value={folderKey} onChange={event => chooseFolder(event.target.value)} style={{ width: '100%', marginBottom: 12 }}><option value="">フォルダを選択</option>{folders.map(folder => { const key = targetPath(folder) || folder.name; return <option key={key} value={key}>{folder.name}</option>; })}</select>}
    <label>Google DriveフォルダURL（任意）</label>
    <input value={folderUrl} onChange={event => setFolderUrl(event.target.value)} placeholder="https://drive.google.com/drive/folders/..." style={{ width: '100%', boxSizing: 'border-box', margin: '6px 0 12px' }} />
    <label><input type="checkbox" checked={includeLocalPaths} onChange={event => setIncludeLocalPaths(event.target.checked)} /> ローカルパスを含める</label>
    <textarea value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="全文を精査し、この問題を直してください" style={{ width: '100%', minHeight: 90, boxSizing: 'border-box', margin: '12px 0' }} />
    {hasUnsavedChanges && <p style={{ color: '#b42318', fontWeight: 700, fontSize: 12 }}>未保存の変更があります。保存後に生成してください。</p>}
    <button onClick={generate} disabled={busy || hasUnsavedChanges}>{busy ? '確認コードを計算中…' : '依頼情報を生成'}</button>
    {preview && <><textarea readOnly value={preview} style={{ width: '100%', minHeight: 300, boxSizing: 'border-box', marginTop: 12, fontFamily: 'monospace', fontSize: 11 }} /><button onClick={copy} style={{ marginTop: 8 }}>クリップボードへコピー</button></>}
  </div>;
}
