import { useState, useEffect, useCallback, useRef } from 'react';
import { Menu, Code2 } from 'lucide-react';
import { useChats } from './hooks/useChats';
import { useModels } from './hooks/useModels';
import { loadSettings, saveSettings, generateId } from './utils/storage';
import { streamCompletion } from './utils/api';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import InputBox from './components/InputBox';
import SettingsModal from './components/SettingsModal';
import FileExplorer from './components/FileExplorer';
import CodeEditor from './components/CodeEditor';
import { AppSettings, Message, ProviderId } from './types';
import { FSNode, FSFile } from './types/fs';
import { updateFileContent } from './utils/fsOps';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export default function App() {
  const {
    chats,
    activeChat,
    activeChatId,
    setActiveChatId,
    createChat,
    deleteChat,
    renameChat,
    addMessage,
    updateLastAssistantMessage,
    finalizeAssistantMessage,
    updateChatModel,
    updateChatProvider,
  } = useChats();

  const { models, loading: modelsLoading, loadModels, clearModels } = useModels();
  const isDesktop = useIsDesktop();

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [selectedModel, setSelectedModel] = useState<string>(() => loadSettings().selectedModel);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
    () => loadSettings().selectedProvider || 'openrouter'
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const streamBufferRef = useRef('');
  const streamChatIdRef = useRef<string | null>(null);

  const [fsTree, setFsTree] = useState<FSNode[]>([]);
  const [activeFile, setActiveFile] = useState<FSFile | null>(null);
  const [mobileIdeOpen, setMobileIdeOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(isDesktop);
  }, [isDesktop]);

  // Load models when provider or key changes
  useEffect(() => {
    const currentKey = settings.providerKeys[selectedProvider];
    if (currentKey) {
      loadModels(currentKey, selectedProvider);
    } else {
      clearModels();
    }
  }, [selectedProvider, settings.providerKeys, loadModels, clearModels]);

  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      let defaultModel;
      if (selectedProvider === 'openrouter') {
        defaultModel =
          models.find((m) => m.id.includes('gpt-4o-mini')) ||
          models.find((m) => m.id.includes('gpt-4o')) ||
          models.find((m) => m.id.includes('claude')) ||
          models[0];
      } else {
        defaultModel =
          models.find((m) => m.id.includes('llama')) ||
          models.find((m) => m.id.includes('deepseek')) ||
          models[0];
      }
      if (defaultModel) {
        setSelectedModel(defaultModel.id);
        const updated = { ...settings, selectedModel: defaultModel.id };
        setSettings(updated);
        saveSettings(updated);
      }
    }
  }, [models, selectedModel, settings, selectedProvider]);

  const handleSaveSettings = useCallback(
    (keys: Record<ProviderId, string>) => {
      const currentKey = keys[selectedProvider];
      const updated: AppSettings = {
        ...settings,
        apiKey: currentKey,
        providerKeys: keys,
      };
      setSettings(updated);
      saveSettings(updated);
      if (currentKey) {
        loadModels(currentKey, selectedProvider);
      }
    },
    [settings, selectedProvider, loadModels]
  );

  const handleProviderChange = useCallback(
    (providerId: ProviderId) => {
      setSelectedProvider(providerId);
      setSelectedModel('');
      const currentKey = settings.providerKeys[providerId];
      const updated: AppSettings = {
        ...settings,
        selectedProvider: providerId,
        selectedModel: '',
        apiKey: currentKey,
      };
      setSettings(updated);
      saveSettings(updated);
      if (activeChatId) {
        updateChatProvider(activeChatId, providerId);
      }
    },
    [settings, activeChatId, updateChatProvider]
  );

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      const updated = { ...settings, selectedModel: modelId };
      setSettings(updated);
      saveSettings(updated);
      if (activeChatId) {
        updateChatModel(activeChatId, modelId);
        updateChatProvider(activeChatId, selectedProvider);
      }
    },
    [settings, activeChatId, updateChatModel, updateChatProvider, selectedProvider]
  );

  const handleCustomModelChange = useCallback(
    (value: string) => {
      const updated = { ...settings, fireworksCustomModel: value };
      setSettings(updated);
      saveSettings(updated);
    },
    [settings]
  );

  const handleSend = useCallback(
    async (content: string) => {
      const currentKey = settings.providerKeys[selectedProvider];
      if (!currentKey || !selectedModel || streaming) return;

      const priorMessages: Message[] = activeChat?.messages ?? [];

      let chatId = activeChatId;
      if (!chatId) {
        chatId = createChat(selectedModel, selectedProvider);
      }

      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      const assistantMsgId = generateId();
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      addMessage(chatId, userMsg);
      addMessage(chatId, assistantMsg);

      setStreamingMsgId(assistantMsgId);
      streamChatIdRef.current = chatId;
      streamBufferRef.current = '';
      setStreaming(true);

      const history: Message[] = [...priorMessages, userMsg];

      await streamCompletion(
        currentKey,
        selectedModel,
        history,
        (token) => {
          streamBufferRef.current += token;
          if (streamChatIdRef.current) {
            updateLastAssistantMessage(streamChatIdRef.current, streamBufferRef.current);
          }
        },
        () => {
          if (streamChatIdRef.current) {
            finalizeAssistantMessage(streamChatIdRef.current, streamBufferRef.current);
          }
          setStreaming(false);
          setStreamingMsgId(null);
          streamChatIdRef.current = null;
        },
        (err) => {
          const errContent = `Error: ${err}`;
          if (streamChatIdRef.current) {
            finalizeAssistantMessage(streamChatIdRef.current, errContent);
          }
          setStreaming(false);
          setStreamingMsgId(null);
          streamChatIdRef.current = null;
        },
        selectedProvider
      );
    },
    [
      settings.providerKeys,
      selectedProvider,
      selectedModel,
      streaming,
      activeChatId,
      activeChat,
      createChat,
      addMessage,
      updateLastAssistantMessage,
      finalizeAssistantMessage,
    ]
  );

  const handleNewChat = useCallback(() => {
    createChat(selectedModel, selectedProvider);
    if (!isDesktop) setSidebarOpen(false);
  }, [createChat, selectedModel, selectedProvider, isDesktop]);

  const handleSelectChat = useCallback(
    (id: string) => {
      setActiveChatId(id);
      // When switching to a chat, load its provider and model
      const chat = chats.find((c) => c.id === id);
      if (chat) {
        if (chat.provider && chat.provider !== selectedProvider) {
          setSelectedProvider(chat.provider);
          const key = settings.providerKeys[chat.provider];
          const updated: AppSettings = {
            ...settings,
            selectedProvider: chat.provider,
            selectedModel: chat.model,
            apiKey: key,
          };
          setSettings(updated);
          saveSettings(updated);
        }
        if (chat.model) {
          setSelectedModel(chat.model);
        }
      }
      if (!isDesktop) setSidebarOpen(false);
    },
    [setActiveChatId, isDesktop, chats, selectedProvider, settings]
  );

  const currentApiKey = settings.providerKeys[selectedProvider];
  const effectiveModel = activeChat?.model || selectedModel;

  const handleOpenFile = useCallback((file: FSFile) => {
    setActiveFile(file);
  }, []);

  const handleMobileOpenFile = useCallback((file: FSFile) => {
    setActiveFile(file);
  }, []);

  const handleTreeChange = useCallback((tree: FSNode[]) => {
    setFsTree(tree);
    setActiveFile((prev) => {
      if (!prev) return null;
      const stillExists = (nodes: FSNode[]): FSFile | null => {
        for (const n of nodes) {
          if (n.kind === 'file' && n.path === prev.path) return n;
          if (n.kind === 'folder') {
            const found = stillExists(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      return stillExists(tree);
    });
  }, []);

  const handleFileSave = useCallback((path: string, content: string) => {
    setFsTree((prev) => {
      const updated = updateFileContent(prev, path, content);
      return updated;
    });
    setActiveFile((prev) => (prev && prev.path === path ? { ...prev, content } : prev));
  }, []);

  return (
    <div className="app-root">
      <div className="bg-noise" />

      {sidebarOpen && !isDesktop && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={deleteChat}
          onRenameChat={renameChat}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="main-content">
        <header className="app-header">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
          <span className="app-logo">anygent builder</span>
          <div className="header-spacer" />
          <button
            className={`mobile-ide-btn${mobileIdeOpen ? ' mobile-ide-btn--active' : ''}`}
            onClick={() => setMobileIdeOpen((v) => !v)}
            title="Toggle IDE"
          >
            <Code2 size={15} />
            <span>IDE</span>
          </button>
        </header>

        <div className="workspace">
          <div className="chat-panel">
            <div className="chat-container">
              <ChatArea chat={activeChat} streamingMessageId={streamingMsgId} />
            </div>

            <InputBox
              models={models}
              modelsLoading={modelsLoading}
              selectedModel={effectiveModel}
              selectedProvider={selectedProvider}
              fireworksCustomModel={settings.fireworksCustomModel}
              onModelSelect={handleModelSelect}
              onProviderChange={handleProviderChange}
              onCustomModelChange={handleCustomModelChange}
              onSend={handleSend}
              onOpenSettings={() => setSettingsOpen(true)}
              disabled={streaming}
              apiKey={currentApiKey}
            />
          </div>

          <div className="fe-column">
            <FileExplorer
              tree={fsTree}
              activeFilePath={activeFile?.path ?? null}
              onOpenFile={handleOpenFile}
              onTreeChange={handleTreeChange}
            />
          </div>

          <div className="ce-column">
            <CodeEditor file={activeFile} onSave={handleFileSave} />
          </div>
        </div>

        {mobileIdeOpen && (
          <div className="mobile-ide-overlay">
            <div className="mobile-ide-pane mobile-ide-fe">
              <FileExplorer
                tree={fsTree}
                activeFilePath={activeFile?.path ?? null}
                onOpenFile={handleMobileOpenFile}
                onTreeChange={handleTreeChange}
              />
            </div>
            <div className="mobile-ide-divider" />
            <div className="mobile-ide-pane mobile-ide-ce">
              <CodeEditor file={activeFile} onSave={handleFileSave} />
            </div>
          </div>
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          providerKeys={settings.providerKeys}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}