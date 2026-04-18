import { Sandbox } from 'e2b';
import { FSNode, FSFile } from '../types/fs';

/**
 * E2B Sandbox Manager
 * Manages the lifecycle of an E2B cloud sandbox and provides
 * file system operations that bridge the sandbox with the local UI state.
 */

let activeSandbox: Sandbox | null = null;

export function getActiveSandbox(): Sandbox | null {
  return activeSandbox;
}

export async function createSandbox(apiKey: string): Promise<Sandbox> {
  if (activeSandbox) {
    try {
      await activeSandbox.kill();
    } catch {
      // ignore cleanup errors
    }
  }

  const sandbox = await Sandbox.create({
    apiKey,
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  });

  activeSandbox = sandbox;

  // Create default project directory
  await sandbox.files.write('/home/user/project/.gitkeep', '');

  return sandbox;
}

export async function destroySandbox(): Promise<void> {
  if (activeSandbox) {
    try {
      await activeSandbox.kill();
    } catch {
      // ignore
    }
    activeSandbox = null;
  }
}

/**
 * Write a file to the sandbox filesystem
 */
export async function sandboxWriteFile(
  filePath: string,
  content: string
): Promise<void> {
  if (!activeSandbox) throw new Error('No active sandbox');
  await activeSandbox.files.write(filePath, content);
}

/**
 * Read a file from the sandbox filesystem
 */
export async function sandboxReadFile(filePath: string): Promise<string> {
  if (!activeSandbox) throw new Error('No active sandbox');
  const content = await activeSandbox.files.read(filePath);
  return content;
}

/**
 * Run a command in the sandbox
 */
export async function sandboxRunCommand(
  cmd: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!activeSandbox) throw new Error('No active sandbox');
  const result = await activeSandbox.commands.run(cmd, {
    cwd: cwd || '/home/user/project',
    timeoutMs: 30000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

/**
 * List files in the sandbox and build an FSNode tree.
 * Uses `find` command to get a flat list, then builds the tree structure.
 */
export async function sandboxListFiles(
  basePath: string = '/home/user'
): Promise<FSNode[]> {
  if (!activeSandbox) return [];

  try {
    const result = await activeSandbox.commands.run(
      `find ${basePath} -maxdepth 6 -not -path '*/node_modules/*' -not -path '*/.git/*' -not -name '.gitkeep' 2>/dev/null | head -500`,
      { timeoutMs: 10000 }
    );

    const lines = result.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l !== basePath);

    if (lines.length === 0) return [];

    // Determine which paths are directories
    const dirResult = await activeSandbox.commands.run(
      `find ${basePath} -maxdepth 6 -type d -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -500`,
      { timeoutMs: 10000 }
    );

    const dirs = new Set(
      dirResult.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    );

    return buildTreeFromPaths(lines, dirs, basePath);
  } catch {
    return [];
  }
}

/**
 * Build FSNode tree from flat path list
 */
function buildTreeFromPaths(
  paths: string[],
  dirs: Set<string>,
  basePath: string
): FSNode[] {
  const root: FSNode[] = [];

  // Sort paths so parent directories come before children
  const sorted = [...paths].sort();

  // Map from path -> FSFolder node for quick lookup
  const folderMap = new Map<string, FSNode[]>();
  folderMap.set(basePath, root);

  for (const fullPath of sorted) {
    const isDir = dirs.has(fullPath);
    const name = fullPath.split('/').pop() || '';
    if (!name) continue;

    // Find parent path
    const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    const parentChildren = folderMap.get(parentPath);

    if (!parentChildren) {
      // Parent not in map yet, skip (shouldn't happen with sorted paths)
      continue;
    }

    if (isDir) {
      const folderNode: FSNode = {
        kind: 'folder',
        name,
        path: fullPath,
        children: [],
      };
      parentChildren.push(folderNode);
      folderMap.set(fullPath, (folderNode as { children: FSNode[] }).children);
    } else {
      const fileNode: FSFile = {
        kind: 'file',
        name,
        path: fullPath,
        content: '', // Content loaded on demand
      };
      parentChildren.push(fileNode);
    }
  }

  return root;
}

/**
 * Read file content from sandbox for the code editor
 */
export async function sandboxReadFileForEditor(
  filePath: string
): Promise<string> {
  if (!activeSandbox) return '';
  try {
    return await activeSandbox.files.read(filePath);
  } catch {
    return '';
  }
}