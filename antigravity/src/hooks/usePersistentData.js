import { useEffect, useRef } from 'react';
import { loadProjectHandle } from '../utils/indexedDBUtils';

export function usePersistentData({
  isWindowMode,
  isElectron,
  isNative,
  isTauri,
  setText,
  setSettings,
  setIsDarkMode,
  setProjectHandle,
  setFileTree,
  setIsProjectMode,
  handleOpenFile,
  setShowSemanticGraph,
  setShowMatrixOutliner,
  setPresets,
  setSavedProjectHandle,
  setIsSidebarVisible,
  setActiveTab,
  setActiveFileHandle,
  setPendingFileSelect,
  fileSystem
}) {
  const restoredActiveFileRef = useRef(null);

  useEffect(() => {
    // ウィンドウモードでファイル指定がある場合、保存テキストの復元をスキップ
    // （対象ファイルはプロジェクト読み込み後に pendingFileSelect で開く）
    const urlParams = new URLSearchParams(window.location.search);
    const isWindowWithFile = urlParams.get('mode') === 'window' && urlParams.get('file');

    const savedText = localStorage.getItem('novel-editor-text');
    if (savedText && !isWindowWithFile) setText(savedText);

    const settingsKey = isWindowMode ? 'novel-editor-settings-window' : 'novel-editor-settings';
    let savedSettings = localStorage.getItem(settingsKey);

    if (!savedSettings && isWindowMode) {
      // 別窓モードで専用設定がない場合、本体の設定をコピーして初期値とする
      savedSettings = localStorage.getItem('novel-editor-settings');
      if (savedSettings) {
        localStorage.setItem(settingsKey, savedSettings);
      }
    }

    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);

        // 本文とルビの書体はメイン画面を正とする。別窓専用設定に古い
        // フォントが残っていても、画面ごとに書体が食い違わないようにする。
        if (isWindowMode) {
          try {
            const mainSettings = JSON.parse(localStorage.getItem('novel-editor-settings') || '{}');
            if (mainSettings.fontFamily) parsed.fontFamily = mainSettings.fontFamily;
            if (mainSettings.rubyFontFamily) parsed.rubyFontFamily = mainSettings.rubyFontFamily;
          } catch (error) {
            console.warn('[settings] main window fonts could not be restored:', error);
          }
        }

        // 1. Theme/Style Migration
        if (!parsed.colorTheme) {
          if (parsed.theme === 'blackboard') parsed.colorTheme = 'blackboard';
          else if (parsed.theme === 'dark') parsed.colorTheme = 'dark';
          else parsed.colorTheme = 'light';
        }
        if (!parsed.paperStyle) {
          if (parsed.theme === 'notebook') parsed.paperStyle = 'lined';
          else if (parsed.mode === 'manuscript') parsed.paperStyle = 'grid';
          else parsed.paperStyle = 'plain';
        }

        // 2. Default Syntax Colors Migration (V24/V25 Update)
        if (!parsed.syntaxColors) {
          parsed.syntaxColors = {
            conversation: '#e8f6f3',
            link: '#2980b9',
            ruby: '#e67e22',
            comment: '#7f8c8d',
            emphasis: '#2c3e50'
          };
        } else {
          if (!parsed.syntaxColors.conversation || parsed.syntaxColors.conversation === '#2c3e50' || parsed.syntaxColors.conversation === '#f0f0f0') {
            parsed.syntaxColors.conversation = '#e8f6f3';
          }
          if (!parsed.syntaxColors.ruby || parsed.syntaxColors.ruby === '#3498db' || parsed.syntaxColors.ruby === '#e67e22') {
            parsed.syntaxColors.ruby = '#e67e22';
          }
          if (!parsed.syntaxColors.emphasis || parsed.syntaxColors.emphasis === '#000000' || parsed.syntaxColors.emphasis === '#2c3e50') {
            parsed.syntaxColors.emphasis = '#c0392b';
          }
          if (!parsed.syntaxColors.comment || parsed.syntaxColors.comment === '#888888') {
            parsed.syntaxColors.comment = '#7f8c8d';
          }
          if (!parsed.syntaxColors.aozora) {
            parsed.syntaxColors.aozora = '#27ae60';
          }
        }

        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }

    // --- Persistent Data Loading (Electron) ---
    if (isElectron && window.api) {
      window.api.invoke('app:getSettings').then(async (data) => {
        if (!data) return;

        // ウィンドウモードでは Electron 永続設定でメイン設定を上書きしない
        if (isWindowMode) return;

        // Restore Settings
        if (data.settings) {
          setSettings(prev => ({ ...prev, ...data.settings }));
        }

        // Restore Dark Mode
        if (data.isDarkMode !== undefined) {
          setIsDarkMode(data.isDarkMode);
        }

        // Restore Project
        if (data.projectPath && !isWindowMode) {
          try {
            setProjectHandle(data.projectPath);
            const tree = await fileSystem.readDirectory({ handle: data.projectPath });
            setFileTree(tree);
            setIsProjectMode(true);

            // Restore last active file AFTER project is ready
            if (data.activeFile && restoredActiveFileRef.current !== data.activeFile) {
              restoredActiveFileRef.current = data.activeFile;
              // Wait slightly for useMaterials to settle
              setTimeout(() => {
                handleOpenFile(data.activeFile, data.activeFile.split(/[/\\]/).pop());
              }, 500);
            }
          } catch (e) {
            console.error("Failed to restore project:", e);
          }
        }
      });
    }

    // Live Sync for Window Mode - Prevent infinite loop by checking for changes
    const handleStorageChange = (e) => {
      // 別窓モード（isWindowMode）の場合は、他タブからの設定同期を無視する
      if (isWindowMode) return;

      if (e.key === 'novel-editor-settings' && e.newValue) {
        try {
          const newSettings = JSON.parse(e.newValue);
          setSettings(prev => {
            if (JSON.stringify(prev) === JSON.stringify(newSettings)) return prev;
            return { ...prev, ...newSettings };
          });
        } catch (err) { console.error('Failed to sync settings:', err); }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleOpenGraph = () => setShowSemanticGraph(true);
    const handleOpenOutliner = () => setShowMatrixOutliner(true);
    window.addEventListener('openSemanticGraph', handleOpenGraph);
    window.addEventListener('openMatrixOutliner', handleOpenOutliner);

    const savedPresets = localStorage.getItem('novel-editor-presets');
    if (savedPresets) {
      try { setPresets(JSON.parse(savedPresets)); } catch (err) { console.error('Failed to parse presets', err); setPresets([]); }
    }

    const savedDarkMode = localStorage.getItem('novel-editor-dark-mode');
    if (savedDarkMode) setIsDarkMode(savedDarkMode === 'true');

    loadProjectHandle().then((handle) => { if (handle) setSavedProjectHandle(handle); });

    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'window') {
      setIsSidebarVisible(false);
      const targetTab = params.get('tab');
      if (targetTab) setActiveTab(targetTab);

      // Native: filepath パラメータがあればファイルを直接読み込む
      const filePath = params.get('filepath');
      if (filePath && isNative) {
        (async () => {
          try {
            const fileName = filePath.split('/').pop().split('\\').pop();
            await handleOpenFile(filePath, fileName);
            document.title = `${fileName} - NEXUS`;
          } catch (err) {
            console.error('Failed to read file in window mode:', err);
          }
        })();
        // プロジェクトも読み込む（サイドバー表示用）
        const projectPath = params.get('project');
        if (projectPath) {
          (async () => {
            try {
              setProjectHandle(projectPath);
              const tree = await fileSystem.readDirectory(projectPath);
              setFileTree(tree);
              setIsProjectMode(true);
            } catch (err) {
              console.error('Failed to load project in window mode:', err);
            }
          })();
        }
      } else {
        // Browser fallback: pendingFileSelect + project auto-resume
        const targetFile = params.get('file');
        if (targetFile) setPendingFileSelect(targetFile);
        loadProjectHandle().then(async (handle) => {
          if (!handle) return;
          try {
            if (isElectron || isTauri) {
              // Electron/Tauri: Path based
              setProjectHandle(handle);
              const tree = await fileSystem.readDirectory(handle);
              setFileTree(tree);
              setIsProjectMode(true);
            } else if (handle.requestPermission) {
              // Browser: File System Access API handle based
              const permission = await handle.requestPermission({ mode: 'readwrite' });
              if (permission === 'granted') {
                setProjectHandle(handle);
                const tree = await fileSystem.readDirectory(handle);
                setFileTree(tree);
                setIsProjectMode(true);
              }
            }
          } catch (err) {
            console.error('Failed to auto-resume project in window mode:', err);
          }
        });
      }

      document.body.classList.add('window-mode');
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('openSemanticGraph', handleOpenGraph);
      window.removeEventListener('openMatrixOutliner', handleOpenOutliner);
    };
  }, [isWindowMode]);
}
