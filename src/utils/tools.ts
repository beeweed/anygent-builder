import { ToolCall, ToolResult } from '../types';
import { FSNode, FSFile } from '../types/fs';
import { sandboxWriteFile, sandboxReadFile, getActiveSandbox } from './e2b';

// ─── Tool Definitions (sent to the LLM API) ────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'file_write',
      description:
        'Create or overwrite a file at the given path inside the sandbox. Use for creating new files or fully rewriting existing ones.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description:
              'Absolute path starting with /home/user/. Example: /home/user/project/src/App.tsx',
          },
          content: {
            type: 'string',
            description: 'The full content to write to the file.',
          },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'file_read',
      description:
        'Read the content of an existing file from the sandbox. Returns content with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description:
              'Absolute path starting with /home/user/. Example: /home/user/project/src/main.py',
          },
        },
        required: ['file_path'],
      },
    },
  },
];

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

  if (fn.name === 'file_read') {
    return executeFileRead(toolCall);
  }

  return {
    tool_call_id: toolCall.id,
    name: fn.name,
    result: `Error: Unknown tool "${fn.name}".`,
    success: false,
  };
}

async function executeFileRead(
  toolCall: ToolCall
): Promise<ToolResult> {
  const { id, function: fn } = toolCall;

  let args: { file_path?: string };
  try {
    args = JSON.parse(fn.arguments);
  } catch {
    return {
      tool_call_id: id,
      name: 'file_read',
      result: 'Error: Invalid JSON in tool arguments.',
      success: false,
    };
  }

  const { file_path } = args;

  const pathError = validateFilePath(file_path ?? '');
  if (pathError) {
    return {
      tool_call_id: id,
      name: 'file_read',
      result: `Error: ${pathError}`,
      success: false,
      file_path: file_path,
    };
  }

  try {
    const sandbox = getActiveSandbox();
    if (!sandbox) {
      return {
        tool_call_id: id,
        name: 'file_read',
        result: 'Error: No active sandbox. Cannot read files without a running sandbox.',
        success: false,
        file_path: file_path,
      };
    }

    const content = await sandboxReadFile(file_path!);

    // Add line numbers to the content
    const lines = content.split('\n');
    const numberedLines = lines.map((line, idx) => `${idx + 1} | ${line}`);
    const numberedContent = numberedLines.join('\n');

    return {
      tool_call_id: id,
      name: 'file_read',
      result: `File: ${file_path}\nLines: ${lines.length}\n---\n${numberedContent}`,
      success: true,
      file_path: file_path,
    };
  } catch (err) {
    return {
      tool_call_id: id,
      name: 'file_read',
      result: `Error: ${err instanceof Error ? err.message : 'Failed to read file'}`,
      success: false,
      file_path: file_path,
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
      file_path: file_path,
    };
  }

  if (content === undefined || content === null) {
    return {
      tool_call_id: id,
      name: 'file_write',
      result: 'Error: content is required.',
      success: false,
      file_path: file_path,
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

    return {
      tool_call_id: id,
      name: 'file_write',
      result: `Wrote ${(content as string).length}B → ${file_path}`,
      success: true,
      file_path: file_path,
    };
  } catch (err) {
    return {
      tool_call_id: id,
      name: 'file_write',
      result: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      success: false,
      file_path: file_path,
    };
  }
}