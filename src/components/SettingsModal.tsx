import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Globe, Zap } from 'lucide-react';
import { ProviderId } from '../types';
import { PROVIDERS } from '../utils/providers';

interface Props {
  providerKeys: Record<ProviderId, string>;
  onSave: (keys: Record<ProviderId, string>) => void;
  onClose: () => void;
}

const PROVIDER_ICONS: Record<ProviderId, React.ReactNode> = {
  openrouter: <Globe size={14} />,
  fireworks: <Zap size={14} />,
};

export default function SettingsModal({ providerKeys, onSave, onClose }: Props) {
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ ...providerKeys });
  const [showKeys, setShowKeys] = useState<Record<ProviderId, boolean>>({
    openrouter: false,
    fireworks: false,
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
    onSave(trimmed);
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