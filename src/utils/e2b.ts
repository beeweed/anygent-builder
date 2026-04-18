import { Sandbox } from 'e2b';
import { FSNode, FSFile } from '../types/fs';

/**
 * E2B Sandbox Manager
 * Manages the lifecycle of an E2B cloud sandbox.
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
    timeoutMs: 60 * 60 * 1000, // 1 hour
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

// System paths to exclude from file listing
const SYSTEM_EXCLUDES = [
  'node_modules',
  '.git',
  '.gitkeep',
  '.cache',
  '.npm',
  '.config',
  '.local',
  '.bashrc',
  '.bash_history',
  '.bash_logout',
  '.profile',
  '.sudo_as_admin_successful',
  '.wget-hsts',
  'snap',
  '.gnupg',
  '.ssh',
];

const EXCLUDE_FIND_ARGS = SYSTEM_EXCLUDES.map(
  (name) => `-not -path '*/${name}' -not -path '*/${name}/*' -not -name '${name}'`
).join(' ');

/**
 * List ONLY user project files in the sandbox (no system files).
 * Scans /home/user by default to catch all user-created files.
 */
export async function sandboxListFiles(
  basePath: string = '/home/user'
): Promise<FSNode[]> {
  if (!activeSandbox) return [];

  try {
    const result = await activeSandbox.commands.run(
      `find ${basePath} -maxdepth 6 ${EXCLUDE_FIND_ARGS} 2>/dev/null | head -500`,
      { timeoutMs: 10000 }
    );

    const lines = result.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l !== basePath);

    if (lines.length === 0) return [];

    const dirResult = await activeSandbox.commands.run(
      `find ${basePath} -maxdepth 6 -type d ${EXCLUDE_FIND_ARGS} 2>/dev/null | head -500`,
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
  const sorted = [...paths].sort();
  const folderMap = new Map<string, FSNode[]>();
  folderMap.set(basePath, root);

  for (const fullPath of sorted) {
    const isDir = dirs.has(fullPath);
    const name = fullPath.split('/').pop() || '';
    if (!name) continue;

    const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    const parentChildren = folderMap.get(parentPath);

    if (!parentChildren) continue;

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
        content: '',
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