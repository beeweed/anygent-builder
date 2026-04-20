import { tool } from 'ai';
import { z } from 'zod';
import { ToolCall, ToolResult } from '../types';
import { FSNode, FSFile } from '../types/fs';
import {
  sandboxWriteFile,
  sandboxReadFile,
  getActiveSandbox,
} from './e2b';

// ─── Read-Before-Edit Tracking ──────────────────────────────────────────────
//
// The `file_editor` tool must refuse to run against a file that has not first
// been read via the `Read` (or legacy `file_read`) tool in the current
// conversation. We keep that set of read file paths at module scope so that
// every tool invocation in the ReAct loop sees the same state.
//
// The set is keyed per active chat so switching chats doesn't leak state.

const readFilesByChat: Map<string, Set<string>> = new Map();
let currentChatIdForTools: string | null = null;

export function setActiveToolChatId(chatId: string | null): void {
  currentChatIdForTools = chatId;
  if (chatId && !readFilesByChat.has(chatId)) {
    readFilesByChat.set(chatId, new Set());
  }
}

export function resetReadFilesForChat(chatId: string): void {
  readFilesByChat.set(chatId, new Set());
}

function markFileRead(filePath: string): void {
  if (!currentChatIdForTools) return;
  let set = readFilesByChat.get(currentChatIdForTools);
  if (!set) {
    set = new Set();
    readFilesByChat.set(currentChatIdForTools, set);
  }
  set.add(filePath);
}

function hasFileBeenRead(filePath: string): boolean {
  if (!currentChatIdForTools) return false;
  const set = readFilesByChat.get(currentChatIdForTools);
  return !!set && set.has(filePath);
}

// ─── Tool Definitions (Vercel AI SDK format, Zod-validated) ────────────────
//
// The Vercel AI SDK automatically converts these into the JSON Schema that
// Fireworks (and every other OpenAI-compatible provider) expects, so we no
// longer have to hand-craft the `parameters` object.
//
// We intentionally leave `execute` undefined on every tool: tool execution
// runs on the client side (via `executeToolCall` below) so the UI and the
// E2B sandbox can both be updated within the same ReAct turn.

export const TOOL_DEFINITIONS = {
  file_write: tool({
    description:
      'Create or overwrite a file at the given path inside the sandbox. Use for creating brand-new files or fully rewriting existing ones. For small, targeted edits to an existing file, prefer the `file_editor` tool.',
    inputSchema: z.object({
      file_path: z
        .string()
        .describe(
          'Absolute path starting with /home/user/. Example: /home/user/project/src/App.tsx'
        ),
      content: z.string().describe('The full content to write to the file.'),
    }),
  }),

  Read: tool({
    description:
      'Read the content of an existing file from the sandbox. Returns the file content with line-number prefixes in the form: spaces + line number + tab + content. You MUST use this tool on a file at least once in the conversation before editing it with `file_editor`.',
    inputSchema: z.object({
      file_path: z
        .string()
        .describe(
          'Absolute path starting with /home/user/. Example: /home/user/project/src/main.py'
        ),
    }),
  }),

  file_editor: tool({
    description:
      'file editor tool for editing any type of files use this tool when you required to edit file and if you want to update application',
    inputSchema: z.object({
      file_path: z
        .string()
        .describe('The absolute path to the file to modify'),
      old_string: z
        .string()
        .describe('The text to replace'),
      new_string: z
        .string()
        .describe('The text to replace it with (must be different from old_string)'),
      replace_all: z
        .boolean()
        .optional()
        .describe('Replace all occurences of old_string (default false)'),
    }),
  }),
};

// ─── Path Validation ────────────────────────────────────────────────────────

const SANDBOX_PREFIX = '/home/user/';

function validateFilePath(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') {
    return 'file_path is required and must be a non-empty string.';
  }
  if (!filePath.startsWith(SANDBOX_PREFIX)) {
    return `file_path must start with "${SANDBOX_PREFIX}". Got: "${filePath}"`;
  }
  if (filePath.includes('..')) {
    return 'file_path must not contain "..".';
  }
  const relative = filePath.slice(SANDBOX_PREFIX.length);
  if (!relative || relative.endsWith('/')) {
    return 'file_path must point to a file, not a directory.';
  }
  return null;
}

// ─── FS Tree helpers ────────────────────────────────────────────────────────

function buildPathParts(filePath: string): { folders: string[]; fileName: string } {
  const relative = filePath.slice(SANDBOX_PREFIX.length);
  const segments = relative.split('/').filter(Boolean);
  const fileName = segments.pop()!;
  return { folders: segments, fileName };
}

function insertFileInTree(
  tree: FSNode[],
  folderParts: string[],
  fileName: string,
  filePath: string,
  content: string
): FSNode[] {
  if (folderParts.length === 0) {
    const existingIdx = tree.findIndex(
      (n) => n.kind === 'file' && n.name === fileName
    );
    const fileNode: FSFile = {
      kind: 'file',
      name: fileName,
      path: filePath,
      content,
    };
    if (existingIdx !== -1) {
      const updated = [...tree];
      updated[existingIdx] = fileNode;
      return updated;
    }
    return [...tree, fileNode];
  }

  const folderName = folderParts[0];
  const remaining = folderParts.slice(1);

  let found = false;
  const updated = tree.map((n) => {
    if (n.kind === 'folder' && n.name === folderName) {
      found = true;
      return {
        ...n,
        children: insertFileInTree(n.children, remaining, fileName, filePath, content),
      };
    }
    return n;
  });

  if (!found) {
    const newFolder: FSNode = {
      kind: 'folder',
      name: folderName,
      path: buildFolderFullPath(filePath, folderParts.length - remaining.length),
      children: insertFileInTree([], remaining, fileName, filePath, content),
    };
    updated.push(newFolder);
  }

  return updated;
}

function buildFolderFullPath(filePath: string, depth: number): string {
  const parts = filePath.split('/');
  return parts.slice(0, 3 + depth).join('/');
}

// ─── Tool Execution ─────────────────────────────────────────────────────────

export interface ToolExecutionContext {
  fsTree: FSNode[];
  onTreeChange: (tree: FSNode[]) => void;
  onFileCreated?: (file: FSFile) => void;
}

export async function executeToolCall(
  toolCall: ToolCall,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { function: fn } = toolCall;

  if (fn.name === 'file_write') {
    return executeFileWrite(toolCall, context);
  }

  // Support both the new `Read` tool name and the legacy `file_read` alias.
  if (fn.name === 'Read' || fn.name === 'file_read') {
    return executeFileRead(toolCall);
  }

  if (fn.name === 'file_editor') {
    return executeFileEditor(toolCall, context);
  }

  return {
    tool_call_id: toolCall.id,
    name: fn.name,
    result: `Error: Unknown tool "${fn.name}".`,
    success: false,
  };
}

async function executeFileRead(toolCall: ToolCall): Promise<ToolResult> {
  const { id, function: fn } = toolCall;

  let args: { file_path?: string };
  try {
    args = JSON.parse(fn.arguments);
  } catch {
    return {
      tool_call_id: id,
      name: fn.name,
      result: 'Error: Invalid JSON in tool arguments.',
      success: false,
    };
  }

  const { file_path } = args;

  const pathError = validateFilePath(file_path ?? '');
  if (pathError) {
    return {
      tool_call_id: id,
      name: fn.name,
      result: `Error: ${pathError}`,
      success: false,
      file_path,
    };
  }

  try {
    const sandbox = getActiveSandbox();
    if (!sandbox) {
      return {
        tool_call_id: id,
        name: fn.name,
        result: 'Error: No active sandbox. Cannot read files without a running sandbox.',
        success: false,
        file_path,
      };
    }

    const content = await sandboxReadFile(file_path!);

    // Line-number prefix format required by the editor contract:
    //   "<padded spaces><line number><TAB><line content>"
    // We left-pad line numbers so columns align visually.
    const lines = content.split('\n');
    const width = String(lines.length).length;
    const numberedContent = lines
      .map((line, idx) => {
        const lineNo = String(idx + 1).padStart(width, ' ');
        return `${lineNo}\t${line}`;
      })
      .join('\n');

    // Mark this file as read so `file_editor` is allowed to edit it.
    markFileRead(file_path!);

    return {
      tool_call_id: id,
      name: fn.name,
      result: `File: ${file_path}\nLines: ${lines.length}\n---\n${numberedContent}`,
      success: true,
      file_path,
    };
  } catch (err) {
    return {
      tool_call_id: id,
      name: fn.name,
      result: `Error: ${err instanceof Error ? err.message : 'Failed to read file'}`,
      success: false,
      file_path,
    };
  }
}

async function executeFileWrite(
  toolCall: ToolCall,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { id, function: fn } = toolCall;

  let args: { file_path?: string; content?: string };
  try {
    args = JSON.parse(fn.arguments);
  } catch {
    return {
      tool_call_id: id,
      name: 'file_write',
      result: 'Error: Invalid JSON in tool arguments.',
      success: false,
    };
  }

  const { file_path, content } = args;

  const pathError = validateFilePath(file_path ?? '');
  if (pathError) {
    return {
      tool_call_id: id,
      name: 'file_write',
      result: `Error: ${pathError}`,
      success: false,
      file_path,
    };
  }

  if (content === undefined || content === null) {
    return {
      tool_call_id: id,
      name: 'file_write',
      result: 'Error: content is required.',
      success: false,
      file_path,
    };
  }

  try {
    const sandbox = getActiveSandbox();
    if (sandbox) {
      await sandboxWriteFile(file_path!, content as string);
    }

    const { folders, fileName } = buildPathParts(file_path!);
    const newTree = insertFileInTree(
      context.fsTree,
      folders,
      fileName,
      file_path!,
      content as string
    );
    context.onTreeChange(newTree);

    if (context.onFileCreated) {
      context.onFileCreated({
        kind: 'file',
        name: fileName,
        path: file_path!,
        content: content as string,
      });
    }

    // A fresh write replaces the file contents → user/agent must Read again
    // before the next edit, so clear the "read" marker for this path.
    if (currentChatIdForTools) {
      const set = readFilesByChat.get(currentChatIdForTools);
      set?.delete(file_path!);
    }

    return {
      tool_call_id: id,
      name: 'file_write',
      result: `Wrote ${(content as string).length}B → ${file_path}`,
      success: true,
      file_path,
    };
  } catch (err) {
    return {
      tool_call_id: id,
      name: 'file_write',
      result: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      success: false,
      file_path,
    };
  }
}

/**
 * Execute the `file_editor` tool: exact-string replacement on a sandbox file.
 *
 * Semantics:
 *   • The file MUST have been read via `Read` earlier in the conversation.
 *   • `old_string` must differ from `new_string`.
 *   • If `old_string` is not unique and `replace_all` is false → error, ask
 *     the model to provide more surrounding context or set `replace_all`.
 *   • On success we write the new contents back to the sandbox AND update
 *     the in-memory FS tree so the UI reflects the change instantly.
 */
async function executeFileEditor(
  toolCall: ToolCall,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { id, function: fn } = toolCall;

  let args: {
    file_path?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
  };
  try {
    args = JSON.parse(fn.arguments);
  } catch {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result: 'Error: Invalid JSON in tool arguments.',
      success: false,
    };
  }

  const { file_path, old_string, new_string, replace_all = false } = args;

  const pathError = validateFilePath(file_path ?? '');
  if (pathError) {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result: `Error: ${pathError}`,
      success: false,
      file_path,
    };
  }

  if (typeof old_string !== 'string') {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result: 'Error: old_string is required and must be a string.',
      success: false,
      file_path,
    };
  }

  if (typeof new_string !== 'string') {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result: 'Error: new_string is required and must be a string.',
      success: false,
      file_path,
    };
  }

  if (old_string === new_string) {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result: 'Error: new_string must be different from old_string.',
      success: false,
      file_path,
    };
  }

  if (!hasFileBeenRead(file_path!)) {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result:
        `Error: You must use the Read tool on ${file_path} before editing it. ` +
        `Call Read with file_path="${file_path}" first, then retry the edit.`,
      success: false,
      file_path,
    };
  }

  const sandbox = getActiveSandbox();
  if (!sandbox) {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result: 'Error: No active sandbox. Cannot edit files without a running sandbox.',
      success: false,
      file_path,
    };
  }

  let original: string;
  try {
    original = await sandboxReadFile(file_path!);
  } catch (err) {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result: `Error: Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      success: false,
      file_path,
    };
  }

  // Count occurrences of old_string in the file (non-overlapping).
  const occurrences = countOccurrences(original, old_string);

  if (occurrences === 0) {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result:
        `Error: old_string not found in ${file_path}. ` +
        `Re-read the file and make sure old_string matches EXACTLY (whitespace, ` +
        `indentation, and line breaks). Remember: do NOT include the line-number ` +
        `prefix (spaces + number + tab) from Read output in old_string.`,
      success: false,
      file_path,
    };
  }

  if (occurrences > 1 && !replace_all) {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result:
        `Error: old_string is not unique in ${file_path} (found ${occurrences} occurrences). ` +
        `Either (a) provide a larger old_string with more surrounding context so it uniquely ` +
        `matches one location, or (b) set replace_all=true to replace every occurrence.`,
      success: false,
      file_path,
    };
  }

  const updated = replace_all
    ? replaceAll(original, old_string, new_string)
    : replaceFirst(original, old_string, new_string);

  const replacementCount = replace_all ? occurrences : 1;

  try {
    await sandboxWriteFile(file_path!, updated);
  } catch (err) {
    return {
      tool_call_id: id,
      name: 'file_editor',
      result: `Error: Failed to write file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      success: false,
      file_path,
    };
  }

  // Mirror the update into the in-memory FS tree so the UI + CodeEditor
  // reflect the edit immediately without a full sandbox re-listing.
  const { folders, fileName } = buildPathParts(file_path!);
  const newTree = insertFileInTree(
    context.fsTree,
    folders,
    fileName,
    file_path!,
    updated
  );
  context.onTreeChange(newTree);

  if (context.onFileCreated) {
    context.onFileCreated({
      kind: 'file',
      name: fileName,
      path: file_path!,
      content: updated,
    });
  }

  return {
    tool_call_id: id,
    name: 'file_editor',
    result:
      `Edited ${file_path}: replaced ${replacementCount} occurrence` +
      `${replacementCount === 1 ? '' : 's'} of old_string ` +
      `(${old_string.length}B → ${new_string.length}B each). ` +
      `File is now ${updated.length}B.`,
    success: true,
    file_path,
  };
}

// ─── String helpers (no regex, so special chars in old_string are safe) ─────

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    count++;
    idx = found + needle.length;
  }
  return count;
}

function replaceFirst(haystack: string, needle: string, replacement: string): string {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return haystack;
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  if (needle.length === 0) return haystack;
  let out = '';
  let idx = 0;
  while (idx < haystack.length) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) {
      out += haystack.slice(idx);
      break;
    }
    out += haystack.slice(idx, found) + replacement;
    idx = found + needle.length;
  }
  return out;
}