import { ToolResult } from '../types';
import { FileCode, CheckCircle, XCircle, Loader2 } from 'lucide-react';

// ─── Tool Call Block (shown when the agent invokes a tool) ──────────────────

interface ToolCallBlockProps {
  toolName: string;
  filePath?: string;
  status: 'running' | 'success' | 'error';
  result?: string;
}

export function ToolCallBlock({ toolName, filePath, status, result }: ToolCallBlockProps) {
  return (
    <div className={`agent-tool-block agent-tool-block--${status}`}>
      <div className="agent-tool-header">
        <div className="agent-tool-icon-wrapper">
          {status === 'running' && (
            <Loader2 size={14} className="agent-tool-spinner" />
          )}
          {status === 'success' && (
            <CheckCircle size={14} className="agent-tool-icon-success" />
          )}
          {status === 'error' && (
            <XCircle size={14} className="agent-tool-icon-error" />
          )}
        </div>
        <div className="agent-tool-info">
          <span className="agent-tool-name">{formatToolName(toolName)}</span>
          {filePath && (
            <span className="agent-tool-path">
              <FileCode size={11} />
              {filePath}
            </span>
          )}
        </div>
        <span className={`agent-tool-badge agent-tool-badge--${status}`}>
          {status === 'running' ? 'Running' : status === 'success' ? 'Done' : 'Failed'}
        </span>
      </div>
      {result && status !== 'running' && (
        <div className="agent-tool-result">
          <span className="agent-tool-result-text">{result}</span>
        </div>
      )}
    </div>
  );
}

// ─── Tool Result Display ────────────────────────────────────────────────────

interface ToolResultDisplayProps {
  toolResult: ToolResult;
}

export function ToolResultDisplay({ toolResult }: ToolResultDisplayProps) {
  return (
    <ToolCallBlock
      toolName={toolResult.name}
      filePath={toolResult.file_path}
      status={toolResult.success ? 'success' : 'error'}
      result={toolResult.result}
    />
  );
}

// ─── Pending Tool Call (animated, shown while executing) ────────────────────

interface PendingToolCallProps {
  toolName: string;
  filePath?: string;
}

export function PendingToolCall({ toolName, filePath }: PendingToolCallProps) {
  return (
    <ToolCallBlock
      toolName={toolName}
      filePath={filePath}
      status="running"
    />
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}