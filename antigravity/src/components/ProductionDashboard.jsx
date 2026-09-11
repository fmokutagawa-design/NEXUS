import React, { useEffect, useMemo, useState } from 'react';
import { fileSystem } from '../utils/fileSystem.js';
import { readManifest, loadSegmentTexts } from '../utils/manifest';
import literaryPrizes, { getFollowingDeadlineInfo, getNextDeadlineInfo } from '../data/literaryPrizes';
import { resolveMergedWorkId, workLocationPriority } from '../utils/workManagement.mjs';
import { indexedWorkRoot, manuscriptCandidateScore, readWorkRegistration, readWorkspaceRegistrations, registerWork, resolveWorkRoot, setCurrentManuscript } from '../utils/workRegistry.js';

const PURPOSES = [
  ['main', '本命応募'], ['submit', '応募予定'], ['candidate', '応募候補'],
  ['hobby', '趣味・お遊び'], ['practice', '練習・実験'], ['archive', '休止・保管'],
];
const STAGES = [
  ['unclassified', '未設定'], ['concept', '企画・構想'], ['settings', '設定整理'], ['plot', 'プロット'],
  ['draft', '初稿執筆'], ['ai-draft', 'AI草稿確認'], ['rewrite', '全面改稿'],
  ['revision', '部分改稿'], ['proofreading', '校正'], ['submission', '提出準備'], ['done', '完成'],
];
const NEXT_ACTIONS = ['続きを書く', '次の章を書く', '設定を詰める', 'プロットを直す', '読み直す', '改稿する', '校正する', '提出物を作る', '後で決める'];

const normalizePath = value => String(value || '').normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '');
const normalizeTitle = value => String(value || '').normalize('NFC').replace(/\.nexus$/i, '').replace(/\s+/g, ' ').trim();
const folderWorkId = folder => normalizePath(folder.path || (typeof folder.handle === 'string' ? folder.handle : '') || folder.name);

const dateAtEndOfDay = value => value ? new Date(`${value}T23:59:59`) : null;
function blockedDays(periods, from, to) {
  const dates = new Set();
  (periods || []).forEach(period => {
    const start = new Date(`${period.start}T00:00:00`);
    const end = new Date(`${period.end}T23:59:59`);
    const overlapStart = start > from ? start : from;
    const overlapEnd = end < to ? end : to;
    if (overlapEnd < overlapStart) return;
    const cursor = new Date(overlapStart);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= overlapEnd) {
      dates.add(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return dates.size;
}

export default function ProductionDashboard({ projectHandle, allMaterialFiles = [], submissions = [], profiles = {}, onUpdateProfile, onAddSubmission, onWorkRegistered, onOpenWork, onShowWorkFolder, currentWorkId }) {
  const [inventory, setInventory] = useState({});
  const [isScanning, setIsScanning] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [mergeTargets, setMergeTargets] = useState({});
  const [registryRevision, setRegistryRevision] = useState(0);
  const [registeringId, setRegisteringId] = useState('');
  const [prizePickerWorkId, setPrizePickerWorkId] = useState('');
  const [prizeQuery, setPrizeQuery] = useState('');
  const [prizeGenre, setPrizeGenre] = useState('all');
  const [savingCurrentId, setSavingCurrentId] = useState('');

  const addPrizeToWork = (work, prizeId, selectedDeadline = null) => {
    const prize = literaryPrizes.find(item => item.id === prizeId);
    if (!prize) return;
    const deadlineInfo = selectedDeadline || getNextDeadlineInfo(prize);
    onAddSubmission?.({
      workId: work.workId,
      workTitle: work.title,
      prizeId: prize.id,
      prizeName: prize.name,
      deadline: deadlineInfo?.dateString || null,
      deadlineIsEstimated: Boolean(deadlineInfo?.isEstimated),
      deadlineSelection: selectedDeadline ? 'chosen' : 'automatic',
      targetPages: prize.pageLimit?.max || prize.pageLimit?.min || 0,
      targetChars: prize.charLimit?.max || 0,
      editorFormat: prize.editorFormat || null,
      pageCountBasis: prize.pageCountBasis || '400-page',
    });
  };

  const nexusFolders = useMemo(() => {
    const seen = new Set();
    return allMaterialFiles.filter(item => item.kind === 'directory' && item.name?.endsWith('.nexus')).filter(item => {
      const id = folderWorkId(item);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [allMaterialFiles]);

  useEffect(() => {
    let active = true;
    const scan = async () => {
      setIsScanning(true);
      const next = {};
      const indexedWorks = await readWorkspaceRegistrations(projectHandle);
      for (const folder of nexusFolders) {
        const workId = folderWorkId(folder);
        let workRoot = null;
        let registration = null;
        let manifest = null;
        try {
          manifest = await readManifest(folder.handle || folder);
          if (!manifest) continue;
          workRoot = await resolveWorkRoot(folder, projectHandle);
          registration = await readWorkRegistration(workRoot.handle)
            || indexedWorks.find(item => normalizePath(item.rootPath) === normalizePath(workRoot.path));
          const segments = await loadSegmentTexts(folder.handle || folder, manifest);
          next[workId] = {
            workId,
            title: manifest.title || folder.name.replace(/\.nexus$/, ''),
            chars: segments.reduce((sum, segment) => sum + segment.text.length, 0),
            chapters: segments.length,
            manuscriptPath: workRoot.manuscriptPath,
            manuscriptFolder: folder.handle || folder,
            firstSegmentFile: manifest.segments[0]?.file || '',
            workRoot,
            registration,
          };
        } catch (error) {
          // A missing chapter must not erase the work registration itself.
          // Keep the work manageable so the user can select/open the intended
          // manuscript and repair the manifest independently.
          next[workId] = {
            workId,
            title: manifest?.title || folder.name.replace(/\.nexus$/, ''),
            chars: null,
            chapters: manifest?.segments?.length ?? null,
            manuscriptPath: workRoot?.manuscriptPath || folderWorkId(folder),
            manuscriptFolder: folder.handle || folder,
            firstSegmentFile: manifest?.segments?.[0]?.file || '',
            workRoot,
            registration,
            error: error.message,
          };
        }
      }
      indexedWorks.forEach(registration => {
        if (Object.values(next).some(item => item.registration?.workId === registration.workId)) return;
        const workRoot = indexedWorkRoot(registration);
        next[`registered:${registration.workId}`] = {
          workId: registration.workId,
          title: registration.title,
          chars: null,
          chapters: null,
          workRoot,
          registration,
        };
      });
      if (active) {
        const grouped = {};
        Object.values(next).forEach(version => {
          if (!version.registration) {
            grouped[version.workId] = { ...version, registered: false, versionWorkIds: [version.workId] };
            return;
          }
          const stableId = version.registration.workId;
          const existing = grouped[stableId];
          const isPreferred = version.registration.currentManuscriptPath
            && normalizePath(version.manuscriptPath).endsWith(normalizePath(version.registration.currentManuscriptPath));
          if (!existing || isPreferred || workLocationPriority(version.workId) < workLocationPriority(existing.workId)) {
            grouped[stableId] = {
              ...version,
              workId: stableId,
              title: version.registration.title,
              registered: true,
              versionWorkIds: [...(existing?.versionWorkIds || []), version.workId],
            };
          } else {
            existing.versionWorkIds.push(version.workId);
          }
        });
        setInventory(grouped);
        setIsScanning(false);
      }
    };
    scan();
    return () => { active = false; };
  }, [nexusFolders, projectHandle, registryRevision]);

  const works = useMemo(() => {
    const map = new Map(Object.values(inventory).map(work => [work.workId, { ...work, aliasIds: new Set([work.workId, ...(work.versionWorkIds || [])]) }]));
    const findByTitle = title => {
      const normalized = normalizeTitle(title);
      return normalized ? [...map.values()].find(work => normalizeTitle(work.title) === normalized) : null;
    };
    submissions.forEach(item => {
      const existing = map.get(item.workId) || findByTitle(item.workTitle);
      if (existing) {
        if (item.workId) existing.aliasIds.add(item.workId);
      } else {
        map.set(item.workId, { workId: item.workId, title: item.workTitle, chars: null, chapters: null, aliasIds: new Set([item.workId]) });
      }
    });
    if (currentWorkId && !map.has(currentWorkId)) {
      const title = currentWorkId.split(/[/\\]/).pop()?.replace(/\.nexus$/, '') || '現在の作品';
      const existing = findByTitle(title);
      if (existing) existing.aliasIds.add(currentWorkId);
      else map.set(currentWorkId, { workId: currentWorkId, title, chars: null, chapters: null, aliasIds: new Set([currentWorkId]) });
    }

    // Explicitly connect old versions to the selected current version. Files
    // remain untouched; only their planning/submission identities are grouped.
    for (const source of [...map.values()]) {
      const targetId = resolveMergedWorkId(source.workId, profiles);
      if (targetId === source.workId) continue;
      const target = map.get(targetId);
      if (!target) continue;
      source.aliasIds.forEach(id => target.aliasIds.add(id));
      target.historyVersions = [...(target.historyVersions || []), { workId: source.workId, title: source.title }];
      map.delete(source.workId);
    }

    const now = new Date();
    return [...map.values()].map(work => {
      const aliasIds = work.aliasIds || new Set([work.workId]);
      const inheritedIds = [...aliasIds].filter(id => id !== work.workId);
      const profile = { ...inheritedIds.reduce((merged, id) => ({ ...merged, ...(profiles[id] || {}) }), {}), ...(profiles[work.workId] || {}) };
      const workSubmissions = submissions.filter(item => aliasIds.has(item.workId) || normalizeTitle(item.workTitle) === normalizeTitle(work.title));
      const nextDeadline = [...workSubmissions].filter(item => item.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0] || null;
      const due = dateAtEndOfDay(nextDeadline?.deadline);
      const daysLeft = due ? Math.ceil((due - now) / 86400000) : null;
      const reserveDays = Number(profile.revisionDays ?? 14) + Number(profile.proofreadingDays ?? 7) + Number(profile.submissionDays ?? 3);
      const pausePeriod = profile.pausedUntil
        ? [{ start: now.toISOString().slice(0, 10), end: profile.pausedUntil }]
        : [];
      const unavailable = due ? blockedDays([...(profile.unavailablePeriods || []), ...pausePeriod], now, due) : 0;
      const writingDays = daysLeft === null ? null : Math.max(0, daysLeft - reserveDays - unavailable);
      const targetChars = Number(profile.targetChars || nextDeadline?.targetChars || 0);
      const remainingChars = work.chars == null || !targetChars ? null : Math.max(0, targetChars - work.chars);
      const dailyChars = remainingChars == null || writingDays === null ? null : writingDays > 0 ? Math.ceil(remainingChars / writingDays) : remainingChars;
      const purpose = profile.purpose || (workSubmissions.length ? 'submit' : 'candidate');
      let rank = 999999;
      if (!['hobby', 'practice', 'archive'].includes(purpose) && daysLeft !== null) {
        rank = daysLeft - reserveDays - unavailable;
      }
      const isCurrent = aliasIds.has(currentWorkId);
      const preferredAt = Date.parse(profile.preferredAt || '') || 0;
      const managementStatus = profile.managementStatus || 'active';
      return { ...work, profile, workSubmissions, nextDeadline, daysLeft, reserveDays, unavailable, writingDays, remainingChars, dailyChars, purpose, rank, isCurrent, preferredAt, managementStatus, locationPriority: workLocationPriority(work.workId) };
    }).sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      if (a.preferredAt !== b.preferredAt) return b.preferredAt - a.preferredAt;
      const statusOrder = { active: 0, history: 1, hidden: 2 };
      if (a.managementStatus !== b.managementStatus) return (statusOrder[a.managementStatus] ?? 0) - (statusOrder[b.managementStatus] ?? 0);
      if (a.locationPriority !== b.locationPriority) return a.locationPriority - b.locationPriority;
      return a.rank - b.rank || a.title.localeCompare(b.title, 'ja');
    });
  }, [inventory, submissions, profiles, currentWorkId]);

  const visibleWorks = useMemo(() => works.filter(work => showHidden || work.managementStatus !== 'hidden'), [works, showHidden]);
  const prizePickerWork = works.find(work => work.workId === prizePickerWorkId) || null;
  const prizeGenres = useMemo(() => [...new Set(literaryPrizes.map(prize => prize.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')), []);
  const filteredPrizes = useMemo(() => {
    const query = normalizeTitle(prizeQuery).toLowerCase();
    return literaryPrizes.filter(prize => {
      if (prizeGenre !== 'all' && prize.genre !== prizeGenre) return false;
      if (!query) return true;
      return [prize.name, prize.organizer, prize.genre, prize.deadlineNote]
        .some(value => normalizeTitle(value).toLowerCase().includes(query));
    });
  }, [prizeGenre, prizeQuery]);

  const openPrizePicker = work => {
    setPrizePickerWorkId(work.workId);
    setPrizeQuery('');
    setPrizeGenre('all');
  };

  const closePrizePicker = () => setPrizePickerWorkId('');

  const manuscriptCandidatesFor = work => {
    const rootPath = normalizePath(work.workRoot?.path || work.workRoot?.handle?.handle || work.workRoot?.handle);
    return allMaterialFiles
      .filter(item => {
        const path = normalizePath(item.handle || item.path);
        return (!rootPath || path.startsWith(`${rootPath}/`)) && manuscriptCandidateScore(item, work.title) > 0;
      })
      .sort((a, b) => manuscriptCandidateScore(b, work.title) - manuscriptCandidateScore(a, work.title));
  };

  const handleCurrentManuscriptChange = async (work, targetPath) => {
    if (!targetPath || !work.workRoot) return;
    setSavingCurrentId(work.workId);
    try {
      await setCurrentManuscript(work.workRoot, projectHandle, targetPath);
      setRegistryRevision(value => value + 1);
    } catch (error) {
      window.alert(`現行原稿を保存できませんでした: ${error.message}`);
    } finally {
      setSavingCurrentId('');
    }
  };

  useEffect(() => {
    if (!prizePickerWorkId) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') setPrizePickerWorkId('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prizePickerWorkId]);

  const handleRegister = async work => {
    if (!work.workRoot) return;
    setRegisteringId(work.workId);
    try {
      const registration = await registerWork(work.workRoot, work.workRoot.title || work.title, work.manuscriptPath, projectHandle);
      await onWorkRegistered?.(registration, work.versionWorkIds || [work.workId]);
      setRegistryRevision(value => value + 1);
    } catch (error) {
      window.alert(`作品登録に失敗しました: ${error.message}`);
    } finally {
      setRegisteringId('');
    }
  };

  const handleRegisterChosenFolder = async () => {
    const selected = await fileSystem.openProjectDialog();
    if (!selected) return;
    const rootPath = normalizePath(selected.handle || selected.path || '');
    const workRoot = { handle: selected, path: rootPath, title: selected.name || rootPath.split('/').pop() || '作品' };
    setRegisteringId('__chosen__');
    try {
      const registration = await registerWork(workRoot, workRoot.title, '', projectHandle);
      await onWorkRegistered?.(registration, []);
      setRegistryRevision(value => value + 1);
    } catch (error) {
      window.alert(`作品登録に失敗しました: ${error.message}`);
    } finally {
      setRegisteringId('');
    }
  };

  const conflicts = useMemo(() => {
    const scheduled = works.filter(w => w.managementStatus !== 'hidden' && !['hobby', 'practice', 'archive'].includes(w.purpose) && w.nextDeadline?.deadline).map(work => {
      const end = dateAtEndOfDay(work.nextDeadline.deadline);
      const start = new Date(end);
      start.setDate(start.getDate() - work.reserveDays);
      return { work, start, end };
    });
    const result = [];
    for (let i = 0; i < scheduled.length; i++) for (let j = i + 1; j < scheduled.length; j++) {
      if (scheduled[i].start <= scheduled[j].end && scheduled[j].start <= scheduled[i].end) {
        result.push(`${scheduled[i].work.title} と ${scheduled[j].work.title} の推敲・提出準備期間が重なります`);
      }
    }
    return result;
  }, [works]);

  return (
    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong>🧭 作品進行</strong><div style={{ fontSize: '10px', color: '#777' }}>現在の版、工程、締め切りと次の一手</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px' }}>
          <label><input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)} /> 管理外も表示</label>
          {isScanning && <span style={{ color: '#777' }}>作品を確認中…</span>}
        </div>
      </div>
      <button onClick={handleRegisterChosenFolder} disabled={registeringId === '__chosen__'} style={{ padding: '7px', cursor: 'pointer' }}>
        {registeringId === '__chosen__' ? '作品フォルダを登録中…' : '＋ 作品フォルダを選んで登録'}
      </button>

      {conflicts.map((message, index) => <div key={index} style={{ padding: '7px', background: '#fff3cd', color: '#7c5a00', borderRadius: '6px', fontSize: '10px' }}>⚠ {message}</div>)}

      {visibleWorks.map((work, index) => {
        const excluded = ['hobby', 'practice', 'archive'].includes(work.purpose);
        const danger = !excluded && work.writingDays !== null && work.writingDays <= 14;
        const manuscriptCandidates = manuscriptCandidatesFor(work);
        const currentManuscriptPath = normalizePath(work.registration?.currentManuscriptPath);
        return (
          <div key={work.workId} style={{ padding: '10px', border: `1px solid ${danger ? '#ef4444' : work.isCurrent ? '#8e44ad' : 'var(--border-color, #ddd)'}`, borderRadius: '8px', background: 'var(--bg-paper, #fff)', opacity: work.managementStatus === 'hidden' ? 0.58 : work.managementStatus === 'history' ? 0.78 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <div><strong style={{ fontSize: '12px' }}>{excluded ? '🎨' : index === 0 ? '🔥' : '📖'} {work.title}</strong><div style={{ fontSize: '10px', color: '#777' }}>{work.chars == null ? '文字数未取得' : `${work.chars.toLocaleString()}字・${work.chapters}章`} {work.isCurrent ? '・編集中' : ''} {work.registered ? `・登録済${(work.versionWorkIds?.length || 0) > 1 ? `（${work.versionWorkIds.length}版）` : ''}` : '・未登録'} {work.managementStatus === 'history' ? '・履歴' : ''} {work.managementStatus === 'hidden' ? '・管理外' : ''}</div></div>
              <div style={{ textAlign: 'right', fontSize: '10px', color: danger ? '#dc2626' : '#555' }}>
                {work.nextDeadline ? <><strong>{work.nextDeadline.prizeName}</strong><br/>{work.daysLeft < 0 ? `${Math.abs(work.daysLeft)}日超過` : `あと${work.daysLeft}日`}</> : '応募先未定'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
              <button onClick={() => onOpenWork?.(work)} style={{ padding: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>✍️ 執筆を開く</button>
              <button disabled={!work.workRoot} onClick={() => onShowWorkFolder?.(work)} style={{ padding: '8px', fontSize: '12px', cursor: work.workRoot ? 'pointer' : 'default' }}>📁 フォルダを見る</button>
            </div>

            {work.registered && (
              <label style={{ display: 'block', marginTop: '7px', fontSize: '11px' }}>執筆する原稿
                <select value={currentManuscriptPath} disabled={savingCurrentId === work.workId} onChange={event => handleCurrentManuscriptChange(work, event.target.value)} style={{ width: '100%', marginTop: '3px', padding: '6px', fontSize: '12px' }}>
                  <option value="">選択してください…</option>
                  {manuscriptCandidates.map(candidate => {
                    const path = normalizePath(candidate.handle || candidate.path);
                    return <option key={path} value={path}>{candidate.name}{path.includes('/manuscripts/') ? '（manuscripts）' : path.includes('/archive/') ? '（archive）' : ''}</option>;
                  })}
                </select>
              </label>
            )}

            {!work.registered && work.workRoot && (
              <button onClick={() => handleRegister(work)} disabled={registeringId === work.workId} style={{ marginTop: '7px', width: '100%', padding: '6px', cursor: 'pointer' }}>
                {registeringId === work.workId ? '登録中…' : `このフォルダを作品として登録（${work.workRoot.title}）`}
              </button>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
              <label style={{ fontSize: '9px' }}>作品の目的<select value={work.purpose} onChange={e => onUpdateProfile(work.workId, { purpose: e.target.value, title: work.title })} style={{ width: '100%', fontSize: '10px' }}>{PURPOSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label style={{ fontSize: '9px' }}>現在工程<select value={work.profile.stage || 'unclassified'} onChange={e => onUpdateProfile(work.workId, { stage: e.target.value, title: work.title })} style={{ width: '100%', fontSize: '10px' }}>{STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label style={{ fontSize: '9px', gridColumn: '1 / -1' }}>次にやること<select value={work.profile.nextAction || '後で決める'} onChange={e => onUpdateProfile(work.workId, { nextAction: e.target.value, title: work.title })} style={{ width: '100%', fontSize: '10px' }}>{NEXT_ACTIONS.map(value => <option key={value}>{value}</option>)}</select></label>
              <button onClick={() => openPrizePicker(work)} style={{ gridColumn: '1 / -1', width: '100%', padding: '8px', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}>
                🏆 賞を検索して追加…
              </button>
            </div>

            {work.workSubmissions.length > 0 && (
              <div style={{ marginTop: '6px', fontSize: '9px', color: '#666' }}>
                応募予定: {work.workSubmissions.map(item => item.prizeName).join(' / ')}
              </div>
            )}

            <details style={{ marginTop: '7px', fontSize: '10px' }}>
              <summary style={{ cursor: 'pointer', color: '#666' }}>版・履歴の整理</summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                <button onClick={() => onUpdateProfile(work.workId, { preferredAt: new Date().toISOString(), managementStatus: 'active', title: work.title })}>現行版にする</button>
                <button onClick={() => onUpdateProfile(work.workId, { managementStatus: 'history', title: work.title })}>履歴にする</button>
                <button onClick={() => onUpdateProfile(work.workId, { managementStatus: work.managementStatus === 'hidden' ? 'active' : 'hidden', title: work.title })}>{work.managementStatus === 'hidden' ? '管理に戻す' : '管理から外す'}</button>
              </div>
              {works.some(candidate => candidate.workId !== work.workId && candidate.managementStatus !== 'hidden') && (
                <div style={{ marginTop: '7px', padding: '6px', background: 'var(--bg-secondary, #f6f6f6)', borderRadius: '5px' }}>
                  <div style={{ marginBottom: '3px' }}>この版の進捗・応募情報を次の版へ継承</div>
                  <select
                    value={mergeTargets[work.workId] || ''}
                    onChange={event => setMergeTargets(previous => ({ ...previous, [work.workId]: event.target.value }))}
                    style={{ width: '100%', fontSize: '10px' }}
                  >
                    <option value="">継承先を選択…</option>
                    {works.filter(candidate => candidate.workId !== work.workId && candidate.managementStatus !== 'hidden').map(candidate => <option key={candidate.workId} value={candidate.workId}>{candidate.title}{candidate.isCurrent ? '（編集中）' : ''}</option>)}
                  </select>
                  <button
                    disabled={!mergeTargets[work.workId]}
                    onClick={() => {
                      const targetId = mergeTargets[work.workId];
                      if (!targetId) return;
                      onUpdateProfile(work.workId, { mergedInto: targetId, managementStatus: 'history', title: work.title });
                      setMergeTargets(previous => ({ ...previous, [work.workId]: '' }));
                    }}
                    style={{ marginTop: '4px' }}
                  >継承して旧版をまとめる</button>
                  <div style={{ marginTop: '3px', color: '#777' }}>ファイルは移動・削除されません。応募予定も継承先にまとめて表示されます。</div>
                </div>
              )}
              {(work.historyVersions || []).length > 0 && (
                <div style={{ marginTop: '6px', color: '#666' }}>
                  過去版: {(work.historyVersions || []).map(version => (
                    <span key={version.workId} style={{ display: 'block' }}>・{version.title} <button onClick={() => onUpdateProfile(version.workId, { mergedInto: null, managementStatus: 'history', title: version.title })}>分離</button></span>
                  ))}
                </div>
              )}
            </details>

            {!excluded && work.nextDeadline && (
              <div style={{ marginTop: '8px', padding: '7px', background: danger ? '#fee2e2' : '#f3f4f6', borderRadius: '6px', fontSize: '10px' }}>
                実執筆可能：<strong>{work.writingDays}日</strong>（推敲等{work.reserveDays}日・執筆不可{work.unavailable}日を除外）
                {work.dailyChars !== null && <> ／ 必要ペース：<strong>1日{work.dailyChars.toLocaleString()}字</strong></>}
              </div>
            )}

            <details style={{ marginTop: '7px', fontSize: '10px' }}>
              <summary style={{ cursor: 'pointer', color: '#666' }}>計画の詳細</summary>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '6px' }}>
                <label>目標文字数<input type="number" value={work.profile.targetChars || ''} placeholder="例 120000" onChange={e => onUpdateProfile(work.workId, { targetChars: Number(e.target.value) || 0, title: work.title })} style={{ width: '100%' }} /></label>
                <label>再開予定日<input type="date" value={work.profile.pausedUntil || ''} onChange={e => onUpdateProfile(work.workId, { pausedUntil: e.target.value, title: work.title })} style={{ width: '100%' }} /></label>
                <label>推敲日数<input type="number" min="0" value={work.profile.revisionDays ?? 14} onChange={e => onUpdateProfile(work.workId, { revisionDays: Number(e.target.value), title: work.title })} style={{ width: '100%' }} /></label>
                <label>校正日数<input type="number" min="0" value={work.profile.proofreadingDays ?? 7} onChange={e => onUpdateProfile(work.workId, { proofreadingDays: Number(e.target.value), title: work.title })} style={{ width: '100%' }} /></label>
                <label>書けない期間・開始<input type="date" value={work.profile.newBlockedStart || ''} onChange={e => onUpdateProfile(work.workId, { newBlockedStart: e.target.value, title: work.title })} style={{ width: '100%' }} /></label>
                <label>書けない期間・終了<input type="date" value={work.profile.newBlockedEnd || ''} onChange={e => onUpdateProfile(work.workId, { newBlockedEnd: e.target.value, title: work.title })} style={{ width: '100%' }} /></label>
              </div>
              <button
                disabled={!work.profile.newBlockedStart || !work.profile.newBlockedEnd}
                onClick={() => onUpdateProfile(work.workId, {
                  unavailablePeriods: [...(work.profile.unavailablePeriods || []), { start: work.profile.newBlockedStart, end: work.profile.newBlockedEnd }],
                  newBlockedStart: '', newBlockedEnd: '', title: work.title,
                })}
                style={{ marginTop: '5px', fontSize: '9px' }}
              >仕事・予定で書けない期間を追加</button>
              {(work.profile.unavailablePeriods || []).map((period, periodIndex) => (
                <div key={`${period.start}-${period.end}-${periodIndex}`} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', color: '#666' }}>
                  <span>🚫 {period.start}〜{period.end}</span>
                  <button onClick={() => onUpdateProfile(work.workId, { unavailablePeriods: work.profile.unavailablePeriods.filter((_, index) => index !== periodIndex), title: work.title })} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </details>
          </div>
        );
      })}
      {!visibleWorks.length && <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '11px' }}>作品フォルダまたは応募予定が見つかりません</div>}

      {prizePickerWork && (
        <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closePrizePicker(); }} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <section role="dialog" aria-modal="true" aria-label="応募先を選択" style={{ width: 'min(680px, 92vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-paper, #fff)', color: 'var(--text-primary, #222)', borderRadius: '12px', boxShadow: '0 18px 55px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <header style={{ padding: '16px 18px 10px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start' }}>
              <div><strong style={{ fontSize: '17px' }}>応募先を選ぶ</strong><div style={{ marginTop: '3px', fontSize: '13px', color: '#666' }}>{prizePickerWork.title}</div></div>
              <button onClick={closePrizePicker} aria-label="閉じる" style={{ border: 'none', background: 'transparent', fontSize: '22px', cursor: 'pointer', color: 'inherit' }}>×</button>
            </header>
            <div style={{ padding: '8px 18px 14px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: '10px' }}>
              <input autoFocus value={prizeQuery} onChange={event => setPrizeQuery(event.target.value)} placeholder="賞名・主催・ジャンルで検索" style={{ width: '100%', padding: '11px 13px', fontSize: '15px', border: '1px solid #aaa', borderRadius: '7px' }} />
              <select value={prizeGenre} onChange={event => setPrizeGenre(event.target.value)} style={{ padding: '10px', fontSize: '14px', borderRadius: '7px' }}>
                <option value="all">すべてのジャンル</option>
                {prizeGenres.map(genre => <option key={genre} value={genre}>{genre}</option>)}
              </select>
            </div>
            <div style={{ padding: '0 18px 8px', fontSize: '12px', color: '#777' }}>{filteredPrizes.length}件</div>
            <div style={{ overflowY: 'auto', padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredPrizes.map(prize => {
                const nextDeadline = getNextDeadlineInfo(prize);
                const followingDeadline = getFollowingDeadlineInfo(prize);
                const configuredDeadline = prizePickerWork.workSubmissions.find(item => item.prizeId === prize.id)?.deadline || '';
                return (
                  <div key={prize.id} style={{ padding: '12px 14px', textAlign: 'left', border: '1px solid var(--border-color, #ccc)', borderRadius: '8px', background: 'var(--bg-paper, #fff)', color: 'inherit' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}><strong style={{ fontSize: '15px' }}>{prize.name}</strong><span style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{prize.genre}</span></div>
                    <div style={{ marginTop: '4px', fontSize: '13px', color: '#666' }}>{prize.organizer}</div>
                    <div style={{ marginTop: '5px', fontSize: '13px', lineHeight: 1.45 }}>{nextDeadline ? `次回：${nextDeadline.dateString}${nextDeadline.isEstimated ? '（推定・要公式確認）' : '（公式確認済み）'}` : '通年または締切未設定'}</div>
                    {followingDeadline && <div style={{ marginTop: '2px', fontSize: '12px', color: '#777' }}>翌回目安：{followingDeadline.dateString}{followingDeadline.isEstimated ? '（推定）' : '（公式）'}</div>}
                    <div style={{ marginTop: '3px', fontSize: '12px', color: '#777' }}>{prize.deadlineNote || '締切情報なし'}</div>
                    {(prize.pageLimit || prize.charLimit) && <div style={{ marginTop: '4px', fontSize: '12px', color: '#777' }}>{prize.pageLimit ? `400字詰 ${prize.pageLimit.min || 0}〜${prize.pageLimit.max || '上限なし'}枚` : ''}{prize.charLimit?.max ? `・${prize.charLimit.max.toLocaleString()}字以内` : ''}</div>}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '9px' }}>
                      {nextDeadline && <button disabled={configuredDeadline === nextDeadline.dateString} onClick={() => { addPrizeToWork(prizePickerWork, prize.id, nextDeadline); closePrizePicker(); }} style={{ flex: 1, padding: '8px', cursor: configuredDeadline === nextDeadline.dateString ? 'default' : 'pointer' }}>{configuredDeadline === nextDeadline.dateString ? 'この回を設定済み' : `${nextDeadline.dateString.slice(0, 4)}年の回に設定`}</button>}
                      {followingDeadline && <button disabled={configuredDeadline === followingDeadline.dateString} onClick={() => { addPrizeToWork(prizePickerWork, prize.id, followingDeadline); closePrizePicker(); }} style={{ flex: 1, padding: '8px', cursor: configuredDeadline === followingDeadline.dateString ? 'default' : 'pointer' }}>{configuredDeadline === followingDeadline.dateString ? 'この回を設定済み' : `${followingDeadline.dateString.slice(0, 4)}年の回に設定`}</button>}
                    </div>
                  </div>
                );
              })}
              {!filteredPrizes.length && <div style={{ padding: '28px', textAlign: 'center', fontSize: '14px', color: '#777' }}>該当する賞がありません</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
