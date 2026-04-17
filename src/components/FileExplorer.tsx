import { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, FolderPlus, Trash2, Pencil, Check, X } from 'lucide-react';
import { FSNode, FSFile } from '../types/fs';
import { findNode, deleteNode, renameNode, insertNode, buildUniquePath } from '../utils/fsOps';
import { getLanguage } from '../utils/fsOps';

interface Props {
  tree: FSNode[];
  activeFilePath: string | null;
  onOpenFile: (file: FSFile) => void;
  onTreeChange: (tree: FSNode[]) => void;
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const lang = getLanguage(name);
  const colors: Record<string, string> = {
    javascript: '#f0db4f', typescript: '#3178c6', json: '#cbcb41',
    html: '#e34c26', css: '#563d7c', python: '#3572a5',
    go: '#00add8', rust: '#dea584', markdown: '#fff',
    shell: '#89e051', yaml: '#cb171e', xml: '#e34c26', sql: '#e38c00',
  };
  void ext;
  return colors[lang] ?? 'rgba(255,255,255,0.4)';
}

interface NodeRowProps {
  node: FSNode;
  depth: number;
  activeFilePath: string | null;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (file: FSFile) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onAddFile: (parentPath: string) => void;
  onAddFolder: (parentPath: string) => void;
  renamingPath: string | null;
  setRenamingPath: (p: string | null) => void;
}

function NodeRow({
  node, depth, activeFilePath, expandedPaths, onToggle,
  onOpenFile, onDelete, onRename, onAddFile, onAddFolder,
  renamingPath, setRenamingPath,
}: NodeRowProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isActive = node.kind === 'file' && node.path === activeFilePath;
  const isRenaming = renamingPath === node.path;
  const [renameVal, setRenameVal] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setRenameVal(node.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [isRenaming, node.name]);

  const commitRename = () => {
    const val = renameVal.trim();
    if (val && val !== node.name) onRename(node.path, val);
    setRenamingPath(null);
  };

  const indentPx = depth * 14 + 8;

  return (
    <>
      <div
        className={`fe-node ${isActive ? 'fe-node--active' : ''}`}
        style={{ paddingLeft: indentPx }}
        onClick={() => {
          if (node.kind === 'folder') onToggle(node.path);
          else onOpenFile(node as FSFile);
        }}
      >
        {node.kind === 'folder' ? (
          <span className="fe-chevron">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="fe-chevron fe-chevron--file" />
        )}

        <span className="fe-node-icon">
          {node.kind === 'folder'
            ? isExpanded
              ? <FolderOpen size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
              : <Folder size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
            : <File size={13} style={{ color: fileIcon(node.name) }} />
          }
        </span>

        {isRenaming ? (
          <input
            ref={inputRef}
            className="fe-rename-input"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingPath(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="fe-node-name">{node.name}</span>
        )}

        <div className="fe-node-actions" onClick={(e) => e.stopPropagation()}>
          {node.kind === 'folder' && (
            <>
              <button className="fe-action-btn" title="New file" onClick={() => onAddFile(node.path)}>
                <Plus size={11} />
              </button>
              <button className="fe-action-btn" title="New folder" onClick={() => onAddFolder(node.path)}>
                <FolderPlus size={11} />
              </button>
            </>
          )}
          <button className="fe-action-btn" title="Rename" onClick={() => setRenamingPath(node.path)}>
            <Pencil size={11} />
          </button>
          <button className="fe-action-btn fe-action-btn--danger" title="Delete" onClick={() => onDelete(node.path)}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {node.kind === 'folder' && isExpanded && node.children.map((child) => (
        <NodeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          activeFilePath={activeFilePath}
          expandedPaths={expandedPaths}
          onToggle={onToggle}
          onOpenFile={onOpenFile}
          onDelete={onDelete}
          onRename={onRename}
          onAddFile={onAddFile}
          onAddFolder={onAddFolder}
          renamingPath={renamingPath}
          setRenamingPath={setRenamingPath}
        />
      ))}
    </>
  );
}

interface CreatingState {
  kind: 'file' | 'folder';
  parentPath: string;
}

export default function FileExplorer({ tree, activeFilePath, onOpenFile, onTreeChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/']));
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [createVal, setCreateVal] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) {
      setCreateVal(creating.kind === 'file' ? 'untitled.ts' : 'new-folder');
      setTimeout(() => {
        createInputRef.current?.focus();
        createInputRef.current?.select();
      }, 30);
    }
  }, [creating]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const handleDelete = (path: string) => {
    onTreeChange(deleteNode(tree, path));
  };

  const handleRename = (path: string, newName: string) => {
    onTreeChange(renameNode(tree, path, newName));
  };

  const startAddFile = (parentPath: string) => {
    setExpanded((prev) => new Set([...prev, parentPath]));
    setCreating({ kind: 'file', parentPath });
  };

  const startAddFolder = (parentPath: string) => {
    setExpanded((prev) => new Set([...prev, parentPath]));
    setCreating({ kind: 'folder', parentPath });
  };

  const commitCreate = () => {
    if (!creating) return;
    const name = createVal.trim();
    if (!name) { setCreating(null); return; }
    const path = buildUniquePath(tree, creating.parentPath, name);
    const node: FSNode = creating.kind === 'file'
      ? { kind: 'file', name: path.split('/').pop()!, path, content: '' }
      : { kind: 'folder', name: path.split('/').pop()!, path, children: [] };
    onTreeChange(insertNode(tree, creating.parentPath, node));
    setCreating(null);
    if (creating.kind === 'file') {
      onOpenFile(node as FSFile);
    }
  };

  return (
    <div className="fe-panel">
      <div className="fe-header">
        <span className="fe-title">Explorer</span>
        <div className="fe-header-actions">
          <button className="fe-action-btn" title="New file" onClick={() => startAddFile('/')}>
            <Plus size={13} />
          </button>
          <button className="fe-action-btn" title="New folder" onClick={() => startAddFolder('/')}>
            <FolderPlus size={13} />
          </button>
        </div>
      </div>

      <div className="fe-tree">
        {tree.length === 0 && !creating && (
          <div className="fe-empty">
            <p>No files yet</p>
            <button className="fe-empty-btn" onClick={() => startAddFile('/')}>
              <Plus size={12} /> Create file
            </button>
          </div>
        )}

        {tree.map((node) => (
          <NodeRow
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            expandedPaths={expanded}
            onToggle={toggle}
            onOpenFile={onOpenFile}
            onDelete={handleDelete}
            onRename={handleRename}
            onAddFile={startAddFile}
            onAddFolder={startAddFolder}
            renamingPath={renamingPath}
            setRenamingPath={setRenamingPath}
          />
        ))}

        {creating && (
          <div className="fe-create-row" style={{ paddingLeft: creating.parentPath === '/' ? 8 : 22 }}>
            {creating.kind === 'file'
              ? <File size={13} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
              : <Folder size={13} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
            }
            <input
              ref={createInputRef}
              className="fe-rename-input"
              value={createVal}
              onChange={(e) => setCreateVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate();
                if (e.key === 'Escape') setCreating(null);
              }}
            />
            <button className="fe-action-btn" onClick={commitCreate}><Check size={11} /></button>
            <button className="fe-action-btn" onClick={() => setCreating(null)}><X size={11} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
