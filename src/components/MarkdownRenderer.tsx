import React from 'react';

interface Props {
  content: string;
}

// ─── Syntax highlighter ────────────────────────────────────────────────────

const LANG_KEYWORDS: Record<string, string[]> = {
  js:   ['const','let','var','function','return','if','else','for','while','do','class','new','import','export','default','async','await','try','catch','finally','throw','typeof','instanceof','true','false','null','undefined','this','from','of','in','switch','case','break','continue','extends','super','static','yield','delete','void','debugger'],
  ts:   ['const','let','var','function','return','if','else','for','while','do','class','new','import','export','default','async','await','try','catch','finally','throw','typeof','instanceof','true','false','null','undefined','this','from','of','in','interface','type','enum','as','readonly','private','public','protected','extends','implements','switch','case','break','continue','super','static','abstract','namespace','declare','keyof','infer','never','any','unknown','void','never'],
  py:   ['def','class','import','from','return','if','elif','else','for','while','try','except','finally','with','as','pass','break','continue','and','or','not','in','is','True','False','None','lambda','yield','raise','del','global','nonlocal','async','await','print'],
  go:   ['func','var','const','type','struct','interface','import','package','return','if','else','for','range','switch','case','break','continue','go','chan','select','defer','map','make','new','nil','true','false','error','string','int','bool','byte','rune'],
  rust: ['fn','let','mut','const','type','struct','enum','impl','trait','use','mod','pub','return','if','else','for','while','loop','match','in','ref','self','Self','super','crate','true','false','None','Some','Ok','Err','async','await','move','where','dyn','box','unsafe','extern'],
  java: ['public','private','protected','class','interface','extends','implements','import','package','return','if','else','for','while','do','switch','case','break','continue','new','this','super','try','catch','finally','throw','throws','static','final','abstract','void','boolean','int','long','double','float','char','byte','short','null','true','false','instanceof'],
  cpp:  ['int','void','bool','char','float','double','long','short','unsigned','const','static','class','struct','public','private','protected','return','if','else','for','while','do','switch','case','break','continue','new','delete','nullptr','true','false','this','virtual','override','inline','template','typename','namespace','using','include','define'],
  css:  [],
};

const LANG_ALIASES: Record<string, string> = {
  javascript:'js', typescript:'ts', python:'py', golang:'go',
  jsx:'js', tsx:'ts', shell:'sh', bash:'sh', sh:'sh', zsh:'sh',
  json:'json', html:'html', xml:'html', css:'css', scss:'css', sass:'css',
  c:'cpp', 'c++':'cpp', 'c#':'java', csharp:'java',
};

function highlightCode(code: string, lang: string): string {
  const normalized = LANG_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  const kws = LANG_KEYWORDS[normalized] ?? [];

  let out = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Strings first (to avoid keyword-matching inside strings)
  out = out.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
    '<span class="hl-str">$1</span>');

  // Comments
  if (['js','ts','cpp','java','go','rust'].includes(normalized)) {
    out = out.replace(/(\/\/[^\n]*)/g, '<span class="hl-cmt">$1</span>');
    out = out.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-cmt">$1</span>');
  }
  if (['py','sh','rb'].includes(normalized)) {
    out = out.replace(/(#[^\n]*)/g, '<span class="hl-cmt">$1</span>');
  }
  if (normalized === 'css') {
    out = out.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-cmt">$1</span>');
    out = out.replace(/([.#]?[\w-]+)(\s*\{)/g, '<span class="hl-sel">$1</span>$2');
    out = out.replace(/([\w-]+)(\s*:)/g, '<span class="hl-prop">$1</span>$2');
  }

  // Keywords (only if not already inside a span)
  if (kws.length > 0) {
    const kwRx = new RegExp(`(?<!<[^>]*)\\b(${kws.join('|')})\\b`, 'g');
    out = out.replace(kwRx, (_m, kw) => `<span class="hl-kw">${kw}</span>`);
  }

  // Numbers
  out = out.replace(/\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="hl-num">$1</span>');

  // Function names
  out = out.replace(/\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, '<span class="hl-fn">$1</span>');

  return out;
}

// ─── Inline parser ──────────────────────────────────────────────────────────

type InlineNode = string | React.ReactElement;

function parseInline(text: string, baseKey = 0): InlineNode[] {
  const parts: InlineNode[] = [];
  // Order matters: bold+italic before bold before italic
  const rx = /(\*\*\*[^*]+\*\*\*|___[^_]+___|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = baseKey;

  while ((match = rx.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const t = match[0];

    if (t.startsWith('`')) {
      parts.push(<code key={k++} className="md-inline-code">{t.slice(1, -1)}</code>);
    } else if (t.startsWith('***') || t.startsWith('___')) {
      parts.push(<strong key={k++}><em>{t.slice(3, -3)}</em></strong>);
    } else if (t.startsWith('**') || t.startsWith('__')) {
      parts.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    } else if (t.startsWith('~~')) {
      parts.push(<del key={k++}>{t.slice(2, -2)}</del>);
    } else if (t.startsWith('*') || t.startsWith('_')) {
      parts.push(<em key={k++}>{t.slice(1, -1)}</em>);
    } else if (t.startsWith('[')) {
      const label = match[2];
      const href = match[3];
      parts.push(<a key={k++} href={href} target="_blank" rel="noopener noreferrer" className="md-link">{label}</a>);
    } else {
      parts.push(t);
    }

    last = match.index + t.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ─── Copy button ────────────────────────────────────────────────────────────

function CopyButton({ code }: { code: string }) {
  const [state, setState] = React.useState<'idle' | 'copied'>('idle');

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    });
  };

  return (
    <button onClick={copy} className={`md-copy-btn ${state === 'copied' ? 'md-copy-btn--copied' : ''}`}>
      {state === 'copied' ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

// ─── Lang badge ─────────────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  js: 'JavaScript', ts: 'TypeScript', py: 'Python', go: 'Go',
  rust: 'Rust', java: 'Java', cpp: 'C++', css: 'CSS', html: 'HTML',
  sh: 'Shell', bash: 'Bash', json: 'JSON', sql: 'SQL', md: 'Markdown',
  jsx: 'JSX', tsx: 'TSX',
};

function langLabel(lang: string): string {
  return LANG_LABELS[LANG_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()] ?? lang.toUpperCase();
}

// ─── Table parser ────────────────────────────────────────────────────────────

function parseTableRows(lines: string[]): { headers: string[]; rows: string[][] } {
  const headers = lines[0].split('|').map(c => c.trim()).filter(Boolean);
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const row = lines[i].split('|').map(c => c.trim()).filter(Boolean);
    if (row.length) rows.push(row);
  }
  return { headers, rows };
}

// ─── List parser (nested) ────────────────────────────────────────────────────

interface ListItem {
  text: string;
  children: ListItem[];
  ordered: boolean;
}

function parseList(lines: string[], startIdx: number, baseIndent: number): [ListItem[], number] {
  const items: ListItem[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    if (indent < baseIndent) break;

    const ulMatch = line.match(/^(\s*)[-*+] (.*)/);
    const olMatch = line.match(/^(\s*)\d+\. (.*)/);
    const match = ulMatch || olMatch;
    if (!match) break;

    const itemIndent = match[1].length;
    if (itemIndent < baseIndent) break;
    if (itemIndent > baseIndent) { i++; continue; }

    const text = match[2];
    i++;

    // Check for children
    let children: ListItem[] = [];
    if (i < lines.length) {
      const nextIndentMatch = lines[i].match(/^(\s*)/);
      const nextIndent = nextIndentMatch ? nextIndentMatch[1].length : 0;
      if (nextIndent > itemIndent) {
        [children, i] = parseList(lines, i, nextIndent);
      }
    }

    items.push({ text, children, ordered: !!olMatch });
  }

  return [items, i];
}

function renderListItems(items: ListItem[], key = 0): React.ReactNode[] {
  return items.map((item, idx) => (
    <li key={`${key}-${idx}`} className="md-li">
      <span className="md-li-content">{parseInline(item.text)}</span>
      {item.children.length > 0 && (
        item.children[0]?.ordered
          ? <ol className="md-ol md-ol--nested">{renderListItems(item.children, key * 100 + idx)}</ol>
          : <ul className="md-ul md-ul--nested">{renderListItems(item.children, key * 100 + idx)}</ul>
      )}
    </li>
  ));
}

// ─── Main renderer ───────────────────────────────────────────────────────────

export default function MarkdownRenderer({ content }: Props) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ──
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || 'text';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const raw = codeLines.join('\n');
      elements.push(
        <div key={k++} className="md-code-block">
          <div className="md-code-header">
            <div className="md-code-lang-badge">
              <span className="md-code-dot" />
              <span className="md-code-dot" />
              <span className="md-code-dot" />
              <span className="md-code-lang-name">{langLabel(lang)}</span>
            </div>
            <CopyButton code={raw} />
          </div>
          <div className="md-code-scroll">
            <pre className="md-code-pre">
              <code dangerouslySetInnerHTML={{ __html: highlightCode(raw, lang) }} />
            </pre>
          </div>
        </div>
      );
      continue;
    }

    // ── Table ──
    if (/^\|/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const { headers, rows } = parseTableRows(tableLines);
        elements.push(
          <div key={k++} className="md-table-wrapper">
            <table className="md-table">
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="md-th">{parseInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 1 ? 'md-tr-alt' : ''}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="md-td">{parseInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // ── Horizontal rule ──
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      elements.push(<hr key={k++} className="md-hr" />);
      i++;
      continue;
    }

    // ── Headings ──
    const h4m = line.match(/^#### (.+)/);
    const h3m = line.match(/^### (.+)/);
    const h2m = line.match(/^## (.+)/);
    const h1m = line.match(/^# (.+)/);
    if (h4m) { elements.push(<h4 key={k++} className="md-h4">{parseInline(h4m[1])}</h4>); i++; continue; }
    if (h3m) { elements.push(<h3 key={k++} className="md-h3">{parseInline(h3m[1])}</h3>); i++; continue; }
    if (h2m) { elements.push(<h2 key={k++} className="md-h2">{parseInline(h2m[1])}</h2>); i++; continue; }
    if (h1m) { elements.push(<h1 key={k++} className="md-h1">{parseInline(h1m[1])}</h1>); i++; continue; }

    // ── Blockquote ──
    if (/^> /.test(line)) {
      const qLines: string[] = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        qLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote key={k++} className="md-blockquote">
          <div className="md-blockquote-bar" />
          <div className="md-blockquote-content">
            {qLines.map((ql, qi) => <p key={qi}>{parseInline(ql)}</p>)}
          </div>
        </blockquote>
      );
      continue;
    }

    // ── Unordered list ──
    if (/^(\s*)[-*+] /.test(line)) {
      const [items, nextI] = parseList(lines, i, 0);
      i = nextI;
      elements.push(
        <ul key={k++} className="md-ul">
          {renderListItems(items)}
        </ul>
      );
      continue;
    }

    // ── Ordered list ──
    if (/^(\s*)\d+\. /.test(line)) {
      const [items, nextI] = parseList(lines, i, 0);
      i = nextI;
      elements.push(
        <ol key={k++} className="md-ol">
          {renderListItems(items)}
        </ol>
      );
      continue;
    }

    // ── Task list (- [ ] / - [x]) ──
    const taskMatch = line.match(/^[-*+] \[([ x])\] (.+)/i);
    if (taskMatch) {
      const done = taskMatch[1].toLowerCase() === 'x';
      const taskItems: Array<{ done: boolean; text: string }> = [];
      let ti = i;
      while (ti < lines.length) {
        const tm = lines[ti].match(/^[-*+] \[([ x])\] (.+)/i);
        if (!tm) break;
        taskItems.push({ done: tm[1].toLowerCase() === 'x', text: tm[2] });
        ti++;
      }
      void done;
      i = ti;
      elements.push(
        <ul key={k++} className="md-task-list">
          {taskItems.map((t, ti2) => (
            <li key={ti2} className={`md-task-item ${t.done ? 'md-task-item--done' : ''}`}>
              <span className={`md-task-check ${t.done ? 'md-task-check--done' : ''}`}>
                {t.done && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span className={t.done ? 'md-task-text--done' : ''}>{parseInline(t.text)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Empty line ──
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── Paragraph ──
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^[#>|`]/.test(lines[i]) &&
      !/^[-*+] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !/^[-*_]{3,}\s*$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={k++} className="md-p">
          {paraLines.flatMap((pl, pi) => [
            ...parseInline(pl),
            ...(pi < paraLines.length - 1 ? [<br key={`br-${pi}`} />] : []),
          ])}
        </p>
      );
    }
  }

  return <div className="md-root">{elements}</div>;
}
