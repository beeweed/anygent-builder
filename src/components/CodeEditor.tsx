import { useEffect, useRef, useState } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Code2, Save, FileCode } from 'lucide-react';
import { FSFile } from '../types/fs';
import { getLanguage } from '../utils/fsOps';

interface Props {
  file: FSFile | null;
  onSave: (path: string, content: string) => void;
}

const DARK_THEME = 'anygent-dark';

export default function CodeEditor({ file, onSave }: Props) {
  const monaco = useMonaco();
  const [value, setValue] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const savedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme(DARK_THEME, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '7eb8da', fontStyle: 'bold' },
        { token: 'string', foreground: '98c98c' },
        { token: 'comment', foreground: '555555', fontStyle: 'italic' },
        { token: 'number', foreground: 'e5a868' },
        { token: 'type', foreground: 'd1a0e8' },
        { token: 'function', foreground: 'd1a0e8' },
        { token: 'variable', foreground: 'e8e8e8' },
        { token: 'operator', foreground: 'aaaaaa' },
      ],
      colors: {
        'editor.background': '#080808',
        'editor.foreground': '#d8d8d8',
        'editorLineNumber.foreground': '#333333',
        'editorLineNumber.activeForeground': '#666666',
        'editor.lineHighlightBackground': '#111111',
        'editor.selectionBackground': '#ffffff18',
        'editor.inactiveSelectionBackground': '#ffffff0d',
        'editorCursor.foreground': '#ffffff',
        'editorWhitespace.foreground': '#222222',
        'editor.findMatchBackground': '#ffffff22',
        'editor.findMatchHighlightBackground': '#ffffff11',
        'editorBracketMatch.background': '#ffffff14',
        'editorBracketMatch.border': '#ffffff30',
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#ffffff10',
        'scrollbarSlider.hoverBackground': '#ffffff1a',
        'scrollbarSlider.activeBackground': '#ffffff22',
        'editorGutter.background': '#080808',
        'minimap.background': '#080808',
      },
    });
    monaco.editor.setTheme(DARK_THEME);
  }, [monaco]);

  useEffect(() => {
    if (file) {
      if (savedPathRef.current !== file.path) {
        setValue(file.content);
        setIsDirty(false);
        savedPathRef.current = file.path;
      }
    } else {
      setValue('');
      setIsDirty(false);
      savedPathRef.current = null;
    }
  }, [file]);

  const handleChange = (val: string | undefined) => {
    const newVal = val ?? '';
    setValue(newVal);
    setIsDirty(newVal !== (file?.content ?? ''));
  };

  const handleSave = () => {
    if (file) {
      onSave(file.path, value);
      setIsDirty(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  if (!file) {
    return (
      <div className="ce-empty">
        <div className="ce-empty-icon">
          <FileCode size={32} />
        </div>
        <p className="ce-empty-title">No file open</p>
        <p className="ce-empty-sub">Select a file from the explorer to start editing</p>
      </div>
    );
  }

  return (
    <div className="ce-panel" onKeyDown={handleKeyDown}>
      <div className="ce-header">
        <div className="ce-file-info">
          <Code2 size={13} className="ce-file-icon" />
          <span className="ce-filename">{file.name}</span>
          {isDirty && <span className="ce-dirty-dot" title="Unsaved changes" />}
        </div>
        <button
          className={`ce-save-btn ${isDirty ? 'ce-save-btn--active' : ''}`}
          onClick={handleSave}
          disabled={!isDirty}
          title="Save (Ctrl+S)"
        >
          <Save size={12} />
          <span>Save</span>
        </button>
      </div>

      <div className="ce-editor-wrap">
        <Editor
          height="100%"
          language={getLanguage(file.name)}
          value={value}
          theme={DARK_THEME}
          onChange={handleChange}
          options={{
            fontSize: 13,
            fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            padding: { top: 12, bottom: 12 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderLineHighlight: 'line',
            occurrencesHighlight: 'off',
            selectionHighlight: true,
            roundedSelection: true,
            scrollbar: {
              verticalScrollbarSize: 4,
              horizontalScrollbarSize: 4,
              useShadows: false,
            },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            overviewRulerLanes: 0,
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
