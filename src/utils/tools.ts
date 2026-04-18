import { ToolCall, ToolResult } from '../types';
import { FSNode, FSFile } from '../types/fs';
import { sandboxWriteFile, sandboxRunCommand, getActiveSandbox } from './e2b';

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
      name: 'shell_exec',
      description:
        'Execute a shell command in the sandbox. Use for installing packages, running builds, starting servers, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute. Example: npm install express',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command. Defaults to /home/user/project',
          },
        },
        required: ['command'],
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
  // Reject path traversal
  if (filePath.includes('..')) {
    return 'file_path must not contain "..".';
  }
  // Must have a filename after the prefix
  const relative = filePath.slice(SANDBOX_PREFIX.length);
  if (!relative || relative.endsWith('/')) {
    return 'file_path must point to a file, not a directory.';
  }
  return null; // valid
}

// ─── FS Tree helpers ────────────────────────────────────────────────────────

function buildPathParts(filePath: string): { folders: string[]; fileName: string } {
  const relative = filePath.slice(SANDBOX_PREFIX.length); // e.g. "project/src/App.tsx"
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
    // Insert/update file at this level
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
      path: '/' + buildFolderPath(filePath, folderParts.length - remaining.length),
      children: insertFileInTree([], remaining, fileName, filePath, content),
    };
    updated.push(newFolder);
  }

  return updated;
}

function buildFolderPath(filePath: string, depth: number): string {
  const relative = filePath.slice(SANDBOX_PREFIX.length);
  const segments = relative.split('/').filter(Boolean);
  return segments.slice(0, depth).join('/');
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

  if (fn.name === 'shell_exec') {
    return executeShellExec(toolCall);
  }

  return {
    tool_call_id: toolCall.id,
    name: fn.name,
    result: `Error: Unknown tool "${fn.name}".`,
    success: false,
  };
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

  // Validate path
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
    // Write to E2B sandbox if available, otherwise local only
    const sandbox = getActiveSandbox();
    if (sandbox) {
      await sandboxWriteFile(file_path!, content as string);
    }

    // Also update local FS tree for UI
    const { folders, fileName } = buildPathParts(file_path!);
    const newTree = insertFileInTree(
      context.fsTree,
      folders,
      fileName,
      file_path!,
      content as string
    );
    context.onTreeChange(newTree);

    // Notify about the created/updated file
    if (context.onFileCreated) {
      context.onFileCreated({
        kind: 'file',
        name: fileName,
        path: file_path!,
        content: content as string,
      });
    }

    const target = sandbox ? 'sandbox' : 'local';
    return {
      tool_call_id: id,
      name: 'file_write',
      result: `Successfully wrote ${(content as string).length} bytes to ${file_path} (${target})`,
      success: true,
      file_path: file_path,
    };
  } catch (err) {
    return {
      tool_call_id: id,
      name: 'file_write',
      result: `Error writing file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      success: false,
      file_path: file_path,
    };
  }
}

async function executeShellExec(toolCall: ToolCall): Promise<ToolResult> {
  const { id, function: fn } = toolCall;

  let args: { command?: string; cwd?: string };
  try {
    args = JSON.parse(fn.arguments);
  } catch {
    return {
      tool_call_id: id,
      name: 'shell_exec',
      result: 'Error: Invalid JSON in tool arguments.',
      success: false,
    };
  }

  const { command, cwd } = args;

  if (!command || typeof command !== 'string') {
    return {
      tool_call_id: id,
      name: 'shell_exec',
      result: 'Error: command is required and must be a non-empty string.',
      success: false,
    };
  }

  const sandbox = getActiveSandbox();
  if (!sandbox) {
    return {
      tool_call_id: id,
      name: 'shell_exec',
      result: 'Error: No active sandbox. Please create a sandbox first.',
      success: false,
    };
  }

  try {
    const result = await sandboxRunCommand(command, cwd);
    const output = [
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
      `exit code: ${result.exitCode}`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      tool_call_id: id,
      name: 'shell_exec',
      result: output.slice(0, 4000), // Truncate long output
      success: result.exitCode === 0,
    };
  } catch (err) {
    return {
      tool_call_id: id,
      name: 'shell_exec',
      result: `Error executing command: ${err instanceof Error ? err.message : 'Unknown error'}`,
      success: false,
    };
  }
}