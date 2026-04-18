import { FSNode, FSFile, FSFolder } from '../types/fs';

export function findNode(tree: FSNode[], path: string): FSNode | null {
  for (const node of tree) {
    if (node.path === path) return node;
    if (node.kind === 'folder') {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

export function parentPath(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

function applyToTree(
  tree: FSNode[],
  targetPath: string,
  fn: (children: FSNode[], idx: number) => FSNode[]
): FSNode[] {
  const idx = tree.findIndex((n) => n.path === targetPath);
  if (idx !== -1) return fn(tree, idx);
  return tree.map((n) => {
    if (n.kind === 'folder') {
      return { ...n, children: applyToTree(n.children, targetPath, fn) };
    }
    return n;
  });
}

export function insertNode(tree: FSNode[], parentFolderPath: string, node: FSNode): FSNode[] {
  if (parentFolderPath === '/') {
    return [...tree, node].sort(sortNodes);
  }
  return tree.map((n) => {
    if (n.kind === 'folder' && n.path === parentFolderPath) {
      return { ...n, children: [...n.children, node].sort(sortNodes) };
    }
    if (n.kind === 'folder') {
      return { ...n, children: insertNode(n.children, parentFolderPath, node) };
    }
    return n;
  });
}

export function deleteNode(tree: FSNode[], path: string): FSNode[] {
  return tree
    .filter((n) => n.path !== path)
    .map((n) => {
      if (n.kind === 'folder') {
        return { ...n, children: deleteNode(n.children, path) };
      }
      return n;
    });
}

export function renameNode(tree: FSNode[], oldPath: string, newName: string): FSNode[] {
  return tree.map((n) => {
    if (n.path === oldPath) {
      const newPath = parentPath(oldPath) === '/'
        ? '/' + newName
        : parentPath(oldPath) + '/' + newName;
      if (n.kind === 'file') {
        return { ...n, name: newName, path: newPath } as FSFile;
      }
      return {
        ...n,
        name: newName,
        path: newPath,
        children: rebaseChildren(n.children, oldPath, newPath),
      } as FSFolder;
    }
    if (n.kind === 'folder') {
      return { ...n, children: renameNode(n.children, oldPath, newName) };
    }
    return n;
  });
}

function rebaseChildren(children: FSNode[], oldBase: string, newBase: string): FSNode[] {
  return children.map((n) => {
    const newPath = newBase + n.path.slice(oldBase.length);
    if (n.kind === 'file') return { ...n, path: newPath };
    return { ...n, path: newPath, children: rebaseChildren(n.children, n.path, newPath) };
  });
}

export function updateFileContent(tree: FSNode[], path: string, content: string): FSNode[] {
  return tree.map((n) => {
    if (n.kind === 'file' && n.path === path) return { ...n, content };
    if (n.kind === 'folder') return { ...n, children: updateFileContent(n.children, path, content) };
    return n;
  });
}

export function flattenFiles(tree: FSNode[]): FSFile[] {
  const files: FSFile[] = [];
  for (const n of tree) {
    if (n.kind === 'file') files.push(n);
    else files.push(...flattenFiles(n.children));
  }
  return files;
}

function sortNodes(a: FSNode, b: FSNode): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', html: 'html', htm: 'html',
    css: 'css', scss: 'css', sass: 'css',
    md: 'markdown', txt: 'plaintext',
    py: 'python', go: 'go', rs: 'rust',
    sh: 'shell', bash: 'shell',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml', svg: 'xml',
    sql: 'sql',
  };
  return map[ext] ?? 'plaintext';
}

export function buildUniquePath(tree: FSNode[], parentFolder: string, name: string): string {
  const base = parentFolder === '/' ? '/' + name : parentFolder + '/' + name;
  if (!findNode(tree, base)) return base;
  let i = 1;
  while (findNode(tree, base + ` (${i})`)) i++;
  return base + ` (${i})`;
}

/**
 * Merge two file trees: sandbox (remote) is the primary source,
 * but any files in `local` that are missing from `remote` are preserved.
 * This prevents files from disappearing when the sandbox scan hasn't
 * caught up with recently written files.
 */
export function mergeFileTrees(local: FSNode[], remote: FSNode[]): FSNode[] {
  if (local.length === 0) return remote;
  if (remote.length === 0) return local;

  const remoteMap = new Map<string, FSNode>();
  for (const n of remote) {
    remoteMap.set(n.path, n);
  }

  const merged: FSNode[] = [...remote];

  for (const localNode of local) {
    const remoteNode = remoteMap.get(localNode.path);

    if (!remoteNode) {
      // Local node not in remote — keep it (file was just created locally)
      merged.push(localNode);
    } else if (localNode.kind === 'folder' && remoteNode.kind === 'folder') {
      // Both are folders — recursively merge children
      const idx = merged.findIndex((n) => n.path === localNode.path);
      if (idx !== -1) {
        merged[idx] = {
          ...remoteNode,
          children: mergeFileTrees(localNode.children, remoteNode.children),
        };
      }
    }
    // If both are files, remote wins (it has the latest from sandbox)
  }

  return merged.sort(sortNodes);
}

void applyToTree;
