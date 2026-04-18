import { ToolResult } from '../types';
import { FileCode, Check, X, Loader2 } from 'lucide-react';

// ─── Compact Tool Chip (single tiny inline block) ───────────────────────────

interface ToolChipProps {
  filePath?: string;
  status: 'running' | 'success' | 'error';
}

export function ToolChip({ filePath, status }: ToolChipProps) {
  const shortPath = filePath
    ? filePath.replace(/^\/home\/user\//, '')
    : 'file';

  return (
    <span className={`tool-chip tool-chip--${status}`}>
      {status === 'running' && <Loader2 size={10} className="tool-chip-spin" />}
      {status === 'success' && <Check size={10} />}
      {status === 'error' && <X size={10} />}
      <FileCode size={10} />
      <span className="tool-chip-path">{shortPath}</span>
    </span>
  );
}

// ─── Tool Result Display (used for tool messages in chat) ───────────────────

interface ToolResultChipProps {
  toolResult: ToolResult;
}

export function ToolResultChip({ toolResult }: ToolResultChipProps) {
  return (
    <ToolChip
      filePath={toolResult.file_path}
      status={toolResult.success ? 'success' : 'error'}
    />
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function extractFilePath(args: string): string | undefined {
  try {
    const parsed = JSON.parse(args);
    return parsed.file_path;
  } catch {
    return undefined;
  }
}