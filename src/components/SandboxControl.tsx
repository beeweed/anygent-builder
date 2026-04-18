import { Box, Power, PowerOff, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { SandboxState } from '../types';

interface Props {
  sandboxState: SandboxState;
  hasE2bKey: boolean;
  onCreateSandbox: () => void;
  onDestroySandbox: () => void;
  onRefreshFiles: () => void;
  onOpenSettings: () => void;
}

export default function SandboxControl({
  sandboxState,
  hasE2bKey,
  onCreateSandbox,
  onDestroySandbox,
  onRefreshFiles,
  onOpenSettings,
}: Props) {
  const { status, sandboxId, error } = sandboxState;

  if (!hasE2bKey) {
    return (
      <div className="sandbox-bar">
        <div className="sandbox-bar-inner">
          <Box size={13} className="sandbox-icon sandbox-icon--idle" />
          <span className="sandbox-label sandbox-label--dim">No E2B key</span>
          <button className="sandbox-action-btn" onClick={onOpenSettings} title="Add E2B API key">
            <span>Add Key</span>
          </button>
        </div>
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className="sandbox-bar">
        <div className="sandbox-bar-inner">
          <Box size={13} className="sandbox-icon sandbox-icon--idle" />
          <span className="sandbox-label sandbox-label--dim">Sandbox offline</span>
          <button className="sandbox-action-btn sandbox-action-btn--create" onClick={onCreateSandbox}>
            <Power size={12} />
            <span>Create Sandbox</span>
          </button>
        </div>
      </div>
    );
  }

  if (status === 'creating') {
    return (
      <div className="sandbox-bar sandbox-bar--creating">
        <div className="sandbox-bar-inner">
          <Loader2 size={13} className="sandbox-icon sandbox-icon--spin" />
          <span className="sandbox-label sandbox-label--creating">Creating sandbox...</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="sandbox-bar sandbox-bar--error">
        <div className="sandbox-bar-inner">
          <AlertCircle size={13} className="sandbox-icon sandbox-icon--error" />
          <span className="sandbox-label sandbox-label--error" title={error || ''}>
            {error ? error.slice(0, 50) : 'Sandbox error'}
          </span>
          <button className="sandbox-action-btn sandbox-action-btn--create" onClick={onCreateSandbox}>
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  if (status === 'destroying') {
    return (
      <div className="sandbox-bar sandbox-bar--destroying">
        <div className="sandbox-bar-inner">
          <Loader2 size={13} className="sandbox-icon sandbox-icon--spin" />
          <span className="sandbox-label">Destroying sandbox...</span>
        </div>
      </div>
    );
  }

  // Running
  return (
    <div className="sandbox-bar sandbox-bar--running">
      <div className="sandbox-bar-inner">
        <div className="sandbox-status-dot" />
        <span className="sandbox-label sandbox-label--running">
          Sandbox
        </span>
        <span className="sandbox-id">{sandboxId?.slice(0, 12)}</span>
        <div className="sandbox-actions-group">
          <button
            className="sandbox-action-btn sandbox-action-btn--small"
            onClick={onRefreshFiles}
            title="Refresh file tree"
          >
            <RefreshCw size={11} />
          </button>
          <button
            className="sandbox-action-btn sandbox-action-btn--destroy"
            onClick={onDestroySandbox}
            title="Destroy sandbox"
          >
            <PowerOff size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}