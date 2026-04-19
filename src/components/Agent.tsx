import { ToolResult } from '../types';
import { FileCode, FileSearch, Check, X, Loader2 } from 'lucide-react';

// ─── Compact Tool Chip (single tiny inline block) ───────────────────────────

interface ToolChipProps {
  filePath?: string;
  toolName?: string;
  status: 'running' | 'success' | 'error';
}

export function ToolChip({ filePath, toolName, status }: ToolChipProps) {
  const shortPath = filePath
    ? filePath.replace(/^\/home\/user\//, '')
    : 'file';

  const isRead = toolName === 'file_read';
  const Icon = isRead ? FileSearch : FileCode;
  const label = isRead ? 'read' : shortPath;

  return (
    <span className={`tool-chip tool-chip--${status}`}>
      {status === 'running' && <Loader2 size={10} className="tool-chip-spin" />}
      {status === 'success' && <Check size={10} />}
      {status === 'error' && <X size={10} />}
      <Icon size={10} />
      <span className="tool-chip-path">{isRead ? shortPath : label}</span>
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
      toolName={toolResult.name}
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