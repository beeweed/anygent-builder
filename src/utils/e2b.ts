import { Sandbox } from 'e2b';
import { FSNode, FSFile } from '../types/fs';

/**
 * E2B Sandbox Manager
 * Manages per-chat sandbox instances.
 */

// Map of chatId -> Sandbox instance
const sandboxMap = new Map<string, Sandbox>();

// Currently active chat's sandbox
let activeChatId: string | null = null;

export function getActiveSandbox(): Sandbox | null {
  if (!activeChatId) return null;
  return sandboxMap.get(activeChatId) || null;
}

export function getSandboxForChat(chatId: string): Sandbox | null {
  return sandboxMap.get(chatId) || null;
}

export function setActiveChatId(chatId: string | null): void {
  activeChatId = chatId;
}

export function getActiveChatId(): string | null {
  return activeChatId;
}

/**
 * Create a new sandbox for a specific chat.
 * If a template is provided, the sandbox is created with that template.
 */
export async function createSandboxForChat(
  apiKey: string,
  chatId: string,
  template?: string
): Promise<Sandbox> {
  // Kill existing sandbox for this chat if any
  const existing = sandboxMap.get(chatId);
  if (existing) {
    try {
      await existing.kill();
    } catch {
      // ignore cleanup errors
    }
  }

  const trimmedTemplate = template?.trim();

  const sandbox = trimmedTemplate
    ? await Sandbox.create(trimmedTemplate, {
        apiKey,
        timeoutMs: 60 * 60 * 1000, // 1 hour
      })
    : await Sandbox.create({
        apiKey,
        timeoutMs: 60 * 60 * 1000, // 1 hour
      });

  sandboxMap.set(chatId, sandbox);
  activeChatId = chatId;

  return sandbox;
}

/**
 * Legacy: create sandbox without chat association
 */
export async function createSandbox(apiKey: string, template?: string): Promise<Sandbox> {
  const trimmedTemplate = template?.trim();
  const sandbox = trimmedTemplate
    ? await Sandbox.create(trimmedTemplate, {
        apiKey,
        timeoutMs: 60 * 60 * 1000,
      })
    : await Sandbox.create({
        apiKey,
        timeoutMs: 60 * 60 * 1000,
      });
  return sandbox;
}

/**
 * Destroy sandbox for a specific chat
 */
export async function destroySandboxForChat(chatId: string): Promise<void> {
  const sandbox = sandboxMap.get(chatId);
  if (sandbox) {
    try {
      await sandbox.kill();
    } catch {
      // ignore
    }
    sandboxMap.delete(chatId);
  }
  if (activeChatId === chatId) {
    activeChatId = null;
  }
}

export async function destroySandbox(): Promise<void> {
  if (activeChatId) {
    await destroySandboxForChat(activeChatId);
  }
}

/**
 * Destroy all sandboxes (cleanup)
 */
export async function destroyAllSandboxes(): Promise<void> {
  const promises = Array.from(sandboxMap.entries()).map(async ([chatId, sandbox]) => {
    try {
      await sandbox.kill();
    } catch {
      // ignore
    }
    sandboxMap.delete(chatId);
  });
  await Promise.all(promises);
  activeChatId = null;
}

/**
 * Check if a chat has an active sandbox
 */
export function hasSandbox(chatId: string): boolean {
  return sandboxMap.has(chatId);
}

/**
 * Write a file to the active sandbox filesystem
 */
export async function sandboxWriteFile(
  filePath: string,
  content: string
): Promise<void> {
  const sandbox = getActiveSandbox();
  if (!sandbox) throw new Error('No active sandbox');
  await sandbox.files.write(filePath, content);
}

/**
 * Read a file from the active sandbox filesystem
 */
export async function sandboxReadFile(filePath: string): Promise<string> {
  const sandbox = getActiveSandbox();
  if (!sandbox) throw new Error('No active sandbox');
  const content = await sandbox.files.read(filePath);
  return content;
}

/**
 * Run a command in the active sandbox
 */
export async function sandboxRunCommand(
  cmd: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const sandbox = getActiveSandbox();
  if (!sandbox) throw new Error('No active sandbox');
  const result = await sandbox.commands.run(cmd, {
    cwd: cwd || '/home/user',
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
 * List ONLY user files in the sandbox (no system files).
 */
export async function sandboxListFiles(
  basePath: string = '/home/user'
): Promise<FSNode[]> {
  const sandbox = getActiveSandbox();
  if (!sandbox) return [];

  try {
    const result = await sandbox.commands.run(
      `find ${basePath} -maxdepth 6 ${EXCLUDE_FIND_ARGS} 2>/dev/null | head -500`,
      { timeoutMs: 10000 }
    );

    const lines = result.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l !== basePath);

    if (lines.length === 0) return [];

    const dirResult = await sandbox.commands.run(
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
  const sandbox = getActiveSandbox();
  if (!sandbox) return '';
  try {
    return await sandbox.files.read(filePath);
  } catch {
    return '';
  }
}