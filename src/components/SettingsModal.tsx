import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Globe, Zap, Box } from 'lucide-react';
import { ProviderId } from '../types';
import { PROVIDERS } from '../utils/providers';

interface Props {
  providerKeys: Record<ProviderId, string>;
  e2bApiKey: string;
  onSave: (keys: Record<ProviderId, string>, e2bKey: string) => void;
  onClose: () => void;
}

const PROVIDER_ICONS: Record<ProviderId, React.ReactNode> = {
  openrouter: <Globe size={14} />,
  fireworks: <Zap size={14} />,
};

export default function SettingsModal({ providerKeys, e2bApiKey, onSave, onClose }: Props) {
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ ...providerKeys });
  const [e2bKey, setE2bKey] = useState(e2bApiKey);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    openrouter: false,
    fireworks: false,
    e2b: false,
  });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSave = () => {
    const trimmed: Record<ProviderId, string> = {
      openrouter: keys.openrouter.trim(),
      fireworks: keys.fireworks.trim(),
    };
    onSave(trimmed, e2bKey.trim());
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {PROVIDERS.map((provider) => (
            <div key={provider.id} className="provider-key-section">
              <label className="modal-label">
                {PROVIDER_ICONS[provider.id]}
                {provider.name} API Key
              </label>
              <p className="provider-desc">{provider.description}</p>
              <div className="modal-input-wrapper">
                <input
                  type={showKeys[provider.id] ? 'text' : 'password'}
                  value={keys[provider.id]}
                  onChange={(e) =>
                    setKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))
                  }
                  placeholder={provider.placeholder}
                  className="modal-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                  }}
                />
                <button
                  type="button"
                  className="modal-eye-btn"
                  onClick={() =>
                    setShowKeys((prev) => ({
                      ...prev,
                      [provider.id]: !prev[provider.id],
                    }))
                  }
                  title={showKeys[provider.id] ? 'Hide key' : 'Show key'}
                >
                  {showKeys[provider.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ))}

          {/* E2B API Key Section */}
          <div className="provider-key-section provider-key-section--e2b">
            <label className="modal-label">
              <Box size={14} />
              E2B Sandbox API Key
            </label>
            <p className="provider-desc">
              Cloud sandbox for code execution. Get your key at{' '}
              <a
                href="https://e2b.dev/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-link"
              >
                e2b.dev/dashboard
              </a>
            </p>
            <div className="modal-input-wrapper">
              <input
                type={showKeys.e2b ? 'text' : 'password'}
                value={e2bKey}
                onChange={(e) => setE2bKey(e.target.value)}
                placeholder="e2b_..."
                className="modal-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
              />
              <button
                type="button"
                className="modal-eye-btn"
                onClick={() =>
                  setShowKeys((prev) => ({
                    ...prev,
                    e2b: !prev.e2b,
                  }))
                }
                title={showKeys.e2b ? 'Hide key' : 'Show key'}
              >
                {showKeys.e2b ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <p className="modal-hint">
            Your API keys are stored locally in your browser and never sent anywhere except their
            respective providers.
          </p>
        </div>

        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-save-btn" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}