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
import { AppSettings, Message } from './types';
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
  } = useChats();

  const { models, loading: modelsLoading, loadModels } = useModels();
  const isDesktop = useIsDesktop();

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [selectedModel, setSelectedModel] = useState<string>(() => loadSettings().selectedModel);
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

  useEffect(() => {
    if (settings.apiKey) {
      loadModels(settings.apiKey);
    }
  }, [settings.apiKey, loadModels]);

  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      const defaultModel =
        models.find((m) => m.id.includes('gpt-4o-mini')) ||
        models.find((m) => m.id.includes('gpt-4o')) ||
        models.find((m) => m.id.includes('claude')) ||
        models[0];
      if (defaultModel) {
        setSelectedModel(defaultModel.id);
        const updated = { ...settings, selectedModel: defaultModel.id };
        setSettings(updated);
        saveSettings(updated);
      }
    }
  }, [models, selectedModel, settings]);

  const handleSaveSettings = useCallback(
    (apiKey: string) => {
      const updated = { ...settings, apiKey };
      setSettings(updated);
      saveSettings(updated);
      if (apiKey) loadModels(apiKey);
    },
    [settings, loadModels]
  );

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      const updated = { ...settings, selectedModel: modelId };
      setSettings(updated);
      saveSettings(updated);
      if (activeChatId) {
        updateChatModel(activeChatId, modelId);
      }
    },
    [settings, activeChatId, updateChatModel]
  );

  const handleSend = useCallback(
    async (content: string) => {
      if (!settings.apiKey || !selectedModel || streaming) return;

      const priorMessages: Message[] = activeChat?.messages ?? [];

      let chatId = activeChatId;
      if (!chatId) {
        chatId = createChat(selectedModel);
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
        settings.apiKey,
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
        }
      );
    },
    [
      settings.apiKey,
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
    createChat(selectedModel);
    if (!isDesktop) setSidebarOpen(false);
  }, [createChat, selectedModel, isDesktop]);

  const handleSelectChat = useCallback(
    (id: string) => {
      setActiveChatId(id);
      if (!isDesktop) setSidebarOpen(false);
    },
    [setActiveChatId, isDesktop]
  );

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
    setActiveFile((prev) => prev && prev.path === path ? { ...prev, content } : prev);
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
              onModelSelect={handleModelSelect}
              onSend={handleSend}
              onOpenSettings={() => setSettingsOpen(true)}
              disabled={streaming}
              apiKey={settings.apiKey}
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
            <CodeEditor
              file={activeFile}
              onSave={handleFileSave}
            />
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
              <CodeEditor
                file={activeFile}
                onSave={handleFileSave}
              />
            </div>
          </div>
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          apiKey={settings.apiKey}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
