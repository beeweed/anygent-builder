import { useState, useEffect, useCallback, useRef } from 'react';
import { Menu, Code2 } from 'lucide-react';
import { useChats } from './hooks/useChats';
import { useModels } from './hooks/useModels';
import { loadSettings, saveSettings, generateId } from './utils/storage';
import { agentCompletion } from './utils/api';
import { executeToolCall, ToolExecutionContext } from './utils/tools';
import {
  createSandbox,
  destroySandbox,
  sandboxListFiles,
  sandboxReadFileForEditor,
  getActiveSandbox,
} from './utils/e2b';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import InputBox from './components/InputBox';
import SettingsModal from './components/SettingsModal';
import FileExplorer from './components/FileExplorer';
import CodeEditor from './components/CodeEditor';
import SandboxControl from './components/SandboxControl';
import { AppSettings, Message, ProviderId, SandboxState } from './types';
import { FSNode, FSFile } from './types/fs';
import { updateFileContent, mergeFileTrees } from './utils/fsOps';

const MAX_AGENT_ITERATIONS = 10;

// Persist sandbox ID across refreshes
const SANDBOX_ID_KEY = 'anygent_sandbox_id';

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
    addMessages,
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const [fsTree, setFsTree] = useState<FSNode[]>([]);
  const [activeFile, setActiveFile] = useState<FSFile | null>(null);
  const [mobileIdeOpen, setMobileIdeOpen] = useState(false);

  const [sandboxState, setSandboxState] = useState<SandboxState>({
    status: 'idle',
    sandboxId: null,
    error: null,
  });

  const fsTreeRef = useRef<FSNode[]>(fsTree);
  useEffect(() => {
    fsTreeRef.current = fsTree;
  }, [fsTree]);

  useEffect(() => {
    setSidebarOpen(isDesktop);
  }, [isDesktop]);

  // Restore sandbox on page load if we had one
  useEffect(() => {
    const savedId = localStorage.getItem(SANDBOX_ID_KEY);
    if (savedId && settings.e2bApiKey) {
      // Sandbox was running before refresh — mark as running
      // The actual sandbox is still alive on E2B servers (within timeout)
      setSandboxState({
        status: 'running',
        sandboxId: savedId,
        error: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist sandbox ID
  useEffect(() => {
    if (sandboxState.sandboxId) {
      localStorage.setItem(SANDBOX_ID_KEY, sandboxState.sandboxId);
    } else if (sandboxState.status === 'idle') {
      localStorage.removeItem(SANDBOX_ID_KEY);
    }
  }, [sandboxState.sandboxId, sandboxState.status]);

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
    (keys: Record<ProviderId, string>, e2bKey: string) => {
      const currentKey = keys[selectedProvider];
      const updated: AppSettings = {
        ...settings,
        apiKey: currentKey,
        providerKeys: keys,
        e2bApiKey: e2bKey,
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

  // ─── Sandbox Controls ───────────────────────────────────────────────────

  const refreshSandboxFiles = useCallback(async () => {
    try {
      const tree = await sandboxListFiles('/home/user');
      // Merge: keep any locally-tracked files that sandbox scan might have missed
      const merged = mergeFileTrees(fsTreeRef.current, tree);
      setFsTree(merged);
      fsTreeRef.current = merged;
    } catch {
      // Silently fail
    }
  }, []);

  const handleCreateSandbox = useCallback(async () => {
    if (!settings.e2bApiKey) {
      setSettingsOpen(true);
      return;
    }

    setSandboxState({ status: 'creating', sandboxId: null, error: null });

    try {
      const sandbox = await createSandbox(settings.e2bApiKey);
      setSandboxState({
        status: 'running',
        sandboxId: sandbox.sandboxId,
        error: null,
      });
      await refreshSandboxFiles();
    } catch (err) {
      setSandboxState({
        status: 'error',
        sandboxId: null,
        error: err instanceof Error ? err.message : 'Failed to create sandbox',
      });
    }
  }, [settings.e2bApiKey, refreshSandboxFiles]);

  const handleDestroySandbox = useCallback(async () => {
    setSandboxState({ status: 'destroying', sandboxId: null, error: null });
    try {
      await destroySandbox();
    } catch {
      // ignore
    }
    setSandboxState({ status: 'idle', sandboxId: null, error: null });
    setFsTree([]);
    setActiveFile(null);
  }, []);

  // ─── Stop Agent ───────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming(false);
    setStreamingMsgId(null);
    streamChatIdRef.current = null;
  }, []);

  // ─── Agent Send (ReAct Loop) ──────────────────────────────────────────────

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
      addMessage(chatId, userMsg);

      let history: Message[] = [...priorMessages, userMsg];

      // Create abort controller for this run
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setStreaming(true);
      streamChatIdRef.current = chatId;

      try {
        for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
          // Check if aborted
          if (abortController.signal.aborted) break;

          const assistantMsgId = generateId();
          const assistantMsg: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          };
          addMessage(chatId, assistantMsg);
          setStreamingMsgId(assistantMsgId);
          streamBufferRef.current = '';

          let hadError = false;

          const result = await agentCompletion(
            currentKey,
            selectedModel,
            history,
            {
              onToken: (token) => {
                if (abortController.signal.aborted) return;
                streamBufferRef.current += token;
                if (streamChatIdRef.current) {
                  updateLastAssistantMessage(streamChatIdRef.current, streamBufferRef.current);
                }
              },
              onToolCall: () => {},
              onDone: () => {},
              onError: (err) => {
                hadError = true;
                const errContent = `⚠️ ${err}`;
                if (streamChatIdRef.current) {
                  finalizeAssistantMessage(streamChatIdRef.current, errContent);
                }
              },
            },
            selectedProvider,
            true
          );

          if (hadError || abortController.signal.aborted) break;

          const { content: responseContent, toolCalls } = result;
          finalizeAssistantMessage(chatId, responseContent, toolCalls);

          if (!toolCalls || toolCalls.length === 0) break;

          const assistantHistoryMsg: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: responseContent,
            timestamp: Date.now(),
            tool_calls: toolCalls,
          };
          history = [...history, assistantHistoryMsg];

          const toolResultMessages: Message[] = [];
          for (const tc of toolCalls) {
            if (abortController.signal.aborted) break;

            const context: ToolExecutionContext = {
              fsTree: fsTreeRef.current,
              onTreeChange: (newTree) => {
                setFsTree(newTree);
                fsTreeRef.current = newTree;
              },
              onFileCreated: (file) => {
                setActiveFile(file);
              },
            };

            const toolResult = await executeToolCall(tc, context);

            const toolMsg: Message = {
              id: generateId(),
              role: 'tool',
              content: toolResult.result,
              timestamp: Date.now(),
              tool_call_id: tc.id,
              tool_name: toolResult.name,
              tool_result: toolResult,
            };

            toolResultMessages.push(toolMsg);
            history = [...history, toolMsg];
          }

          addMessages(chatId, toolResultMessages);

          // Refresh sandbox files after tool execution
          if (getActiveSandbox()) {
            await refreshSandboxFiles();
          }

          setStreamingMsgId(null);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          const errContent = `⚠️ ${err instanceof Error ? err.message : 'Unknown error'}`;
          if (streamChatIdRef.current) {
            finalizeAssistantMessage(streamChatIdRef.current, errContent);
          }
        }
      } finally {
        setStreaming(false);
        setStreamingMsgId(null);
        streamChatIdRef.current = null;
        abortControllerRef.current = null;
      }
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
      addMessages,
      updateLastAssistantMessage,
      finalizeAssistantMessage,
      refreshSandboxFiles,
    ]
  );

  const handleNewChat = useCallback(() => {
    createChat(selectedModel, selectedProvider);
    if (!isDesktop) setSidebarOpen(false);
  }, [createChat, selectedModel, selectedProvider, isDesktop]);

  const handleSelectChat = useCallback(
    (id: string) => {
      setActiveChatId(id);
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

  const handleOpenFile = useCallback(
    async (file: FSFile) => {
      if (getActiveSandbox() && !file.content) {
        try {
          const content = await sandboxReadFileForEditor(file.path);
          setActiveFile({ ...file, content });
          return;
        } catch {
          // Fall through
        }
      }
      setActiveFile(file);
    },
    []
  );

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

          <SandboxControl
            sandboxState={sandboxState}
            hasE2bKey={!!settings.e2bApiKey}
            onCreateSandbox={handleCreateSandbox}
            onDestroySandbox={handleDestroySandbox}
            onRefreshFiles={refreshSandboxFiles}
            onOpenSettings={() => setSettingsOpen(true)}
          />

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
              onStop={handleStop}
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
                onOpenFile={handleOpenFile}
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
          e2bApiKey={settings.e2bApiKey}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}