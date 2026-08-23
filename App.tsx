import React, { useState, useEffect } from 'react';
import {
  ChatSession,
  ChatMessage,
  SupportedLanguage,
  AppSettings,
  UserProfile,
  ToolId,
  FileAttachment,
} from './types';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LandingPage } from './components/LandingPage';
import { ChatView } from './components/ChatView';
import { ToolsSuite } from './components/ToolsSuite';
import { WebsiteGeneratorPreview } from './components/WebsiteGeneratorPreview';
import { SettingsModal } from './components/Modals/SettingsModal';
import { ProfileModal } from './components/Modals/ProfileModal';
import { AuthModal } from './components/Modals/AuthModal';
import { SearchModal } from './components/Modals/SearchModal';
import { HelpModal } from './components/Modals/HelpModal';
import { importChatFromJson } from './lib/exportUtils';

const DEFAULT_SETTINGS: AppSettings = {
  language: 'tg',
  fontSize: 'normal',
  accent: 'blue',
  themeMode: 'dark',
  soundEffects: true,
  streamResponse: true,
  saveHistory: true,
  aiCreativity: 0.7,
  voiceVolume: 1,
  voiceRate: 1,
  voicePitch: 1,
};

const DEFAULT_USER: UserProfile = {
  name: 'Шодмеҳр (Корбари Tajik AI)',
  email: 'shodmehr314@gmail.com',
  avatar:
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  joinedDate: 'Август 2026',
  totalMessages: 24,
  toolsUsedCount: 12,
  streakDays: 5,
  preferredLanguage: 'tg',
};

export default function App() {
  // App Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('tajik_ai_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  // User Profile
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('tajik_ai_user');
    return saved ? JSON.parse(saved) : DEFAULT_USER;
  });

  // Chat Sessions
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('tajik_ai_sessions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      {
        id: 'welcome-session',
        title: 'Салом ва Муаррифӣ',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 3600000,
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: `Салом! Хуш омадед ба **Tajik AI** (Зеҳни сунъии тоҷикӣ).

Ман ёрдамчии ҳушманди шумо мебошам, ки аз ҷониби барномасози ҷавон **Шодмеҳр** сохта шудаам.

Дар кадом корҳо метавонам ба шумо кӯмак расонам:
- 💬 **Чати озоди AI**: Муколама бо забонҳои тоҷикӣ, русӣ ва англисӣ бо суръати баланд.
- 📎 **Таҳлили ҳуҷҷатҳо**: Боргузории файлҳои PDF, Word, Excel, CSV ва TXT барои таҳлили амиқ.
- 🖼️ **Шинохти тасвирҳо (Vision & OCR)**: Таҳлил ва хондани матни расмҳо.
- 🛠️ **25+ Асбоби тахассусӣ**: Барномасозӣ, риёзиёт, физика, химия, тарҷумаи адабӣ ва тиҷорат.
- 🌐 **Ҷустуҷӯи зиндаи интернет**: Дастрасӣ ба маълумоти тоза.
- ⚡ **Пешнамоиши зиндаи сомонаҳо**: Эҷоди кодҳои HTML/Tailwind бо санҷиши фаврӣ.

Чӣ саволе доред? Метавонед нависед ё овози худро сабт кунед!`,
            timestamp: Date.now() - 3600000,
          },
        ],
      },
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>('welcome-session');
  const [currentView, setCurrentView] = useState<'home' | 'chat' | 'tools'>('home');
  const [selectedToolId, setSelectedToolId] = useState<ToolId>('translator');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Modals state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [htmlPreviewCode, setHtmlPreviewCode] = useState<string | null>(null);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('tajik_ai_settings', JSON.stringify(settings));
  }, [settings]);

  // Persist user
  useEffect(() => {
    if (user) {
      localStorage.setItem('tajik_ai_user', JSON.stringify(user));
    }
  }, [user]);

  // Persist sessions
  useEffect(() => {
    if (settings.saveHistory) {
      localStorage.setItem('tajik_ai_sessions', JSON.stringify(sessions));
    }
  }, [sessions, settings.saveHistory]);

  // Global keyboard shortcuts (Ctrl+K for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsSettingsOpen(false);
        setIsProfileOpen(false);
        setIsHelpOpen(false);
        setAuthModalMode(null);
        setHtmlPreviewCode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;

  // Handlers
  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: `chat-${Date.now()}`,
      title: 'Чати нав',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setCurrentView('chat');
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setCurrentView('chat');
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleTogglePinSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isPinned: !s.isPinned } : s))
    );
  };

  const handleClearChat = () => {
    if (!activeSessionId) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, messages: [] } : s))
    );
  };

  const handleClearHistory = () => {
    setSessions([]);
    setActiveSessionId(null);
    localStorage.removeItem('tajik_ai_sessions');
  };

  // Import JSON chat sessions
  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await importChatFromJson(file);
      if (imported.length > 0) {
        setSessions((prev) => [...imported, ...prev]);
        setActiveSessionId(imported[0].id);
        setCurrentView('chat');
      }
    } catch (err) {
      console.error('Import failed:', err);
    }
    e.target.value = '';
  };

  // Send message in ChatView
  const handleSendMessage = async (
    text: string,
    options?: { image?: string; attachments?: FileAttachment[]; isWebSearch?: boolean }
  ) => {
    let currentId = activeSessionId;

    // If no active session, create one
    if (!currentId || !sessions.some((s) => s.id === currentId)) {
      const newSession: ChatSession = {
        id: `chat-${Date.now()}`,
        title: text.slice(0, 32) || 'Муколамаи нав',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      setSessions((prev) => [newSession, ...prev]);
      currentId = newSession.id;
      setActiveSessionId(currentId);
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      image: options?.image,
      attachments: options?.attachments,
    };

    // Update active session with user message
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === currentId) {
          const isFirstMessage = s.messages.length === 0;
          return {
            ...s,
            title: isFirstMessage ? (text ? text.slice(0, 32) : 'Таҳлили файл') : s.title,
            updatedAt: Date.now(),
            messages: [...s.messages, userMessage],
          };
        }
        return s;
      })
    );

    // Update user stats
    if (user) {
      setUser((prev) => (prev ? { ...prev, totalMessages: prev.totalMessages + 1 } : null));
    }

    setIsGenerating(true);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const currentHistory = activeSession ? activeSession.messages : [];
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: [...currentHistory, userMessage],
          language: settings.language,
          temperature: settings.aiCreativity,
          image: options?.image,
          attachments: options?.attachments,
          isWebSearch: options?.isWebSearch,
        }),
        signal: controller.signal,
      });

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.text || 'Узр, посух гирифта нашуд.',
        timestamp: Date.now(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentId
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, assistantMessage] }
            : s
        )
      );
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Generation aborted by user');
      } else {
        console.error(err);
        const errorMessage: ChatMessage = {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: 'Узр, дар пайвастшавӣ ба сервери Tajik AI хатогӣ рух дод.',
          timestamp: Date.now(),
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentId ? { ...s, messages: [...s.messages, errorMessage] } : s
          )
        );
      }
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleRegenerate = () => {
    if (!activeSession || activeSession.messages.length < 2) return;
    const lastUserMessage = [...activeSession.messages]
      .reverse()
      .find((m) => m.role === 'user');
    if (lastUserMessage) {
      // Remove last assistant message
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                messages: s.messages.filter(
                  (_, i) => i !== s.messages.length - 1 || s.messages[i].role !== 'assistant'
                ),
              }
            : s
        )
      );
      handleSendMessage(lastUserMessage.content, {
        image: lastUserMessage.image,
        attachments: lastUserMessage.attachments,
      });
    }
  };

  const handleSendToChat = (prompt: string, initialResult?: string) => {
    const newSession: ChatSession = {
      id: `tool-chat-${Date.now()}`,
      title: prompt.slice(0, 32),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: `msg-u-${Date.now()}`,
          role: 'user',
          content: prompt,
          timestamp: Date.now(),
        },
        ...(initialResult
          ? [
              {
                id: `msg-a-${Date.now() + 1}`,
                role: 'assistant' as const,
                content: initialResult,
                timestamp: Date.now() + 1,
              },
            ]
          : []),
      ],
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setCurrentView('chat');
  };

  // Font size class mapping
  const getFontSizeClass = () => {
    switch (settings.fontSize) {
      case 'small':
        return 'text-xs';
      case 'large':
        return 'text-lg';
      default:
        return 'text-sm';
    }
  };

  return (
    <div
      className={`min-h-screen bg-black text-white flex flex-col font-['Plus_Jakarta_Sans',sans-serif] ${getFontSizeClass()}`}
    >
      {/* Top Navigation */}
      <Navbar
        currentView={currentView}
        selectedToolId={selectedToolId}
        language={settings.language}
        user={user}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onNavigate={(view, toolId) => {
          setCurrentView(view);
          if (toolId) setSelectedToolId(toolId);
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenAuth={(mode) => setAuthModalMode(mode)}
        onLogout={() => setUser(null)}
        onSelectLanguage={(lng) => setSettings((s) => ({ ...s, language: lng }))}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          sessions={sessions}
          activeSessionId={activeSessionId}
          currentView={currentView}
          selectedToolId={selectedToolId}
          language={settings.language}
          user={user}
          onClose={() => setIsSidebarOpen(false)}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onTogglePinSession={handleTogglePinSession}
          onNavigate={(view, toolId) => {
            setCurrentView(view);
            if (toolId) setSelectedToolId(toolId);
          }}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
        />

        {/* Content View Area */}
        <main className="flex-1 overflow-y-auto lg:ml-72 xl:ml-80">
          {currentView === 'home' && (
            <LandingPage
              language={settings.language}
              onStartChat={(prompt) => {
                handleNewChat();
                if (prompt) {
                  setTimeout(() => handleSendMessage(prompt), 100);
                }
              }}
              onSelectTool={(toolId) => {
                setSelectedToolId(toolId);
                setCurrentView('tools');
              }}
              onOpenAuth={(mode) => setAuthModalMode(mode)}
            />
          )}

          {currentView === 'chat' && (
            <ChatView
              currentSession={activeSession}
              messages={activeSession ? activeSession.messages : []}
              isGenerating={isGenerating}
              language={settings.language}
              settings={settings}
              user={user}
              onSendMessage={handleSendMessage}
              onStopGeneration={handleStopGeneration}
              onRegenerate={handleRegenerate}
              onClearChat={handleClearChat}
              onOpenHtmlPreview={(html) => setHtmlPreviewCode(html)}
              onImportJson={handleImportJson}
            />
          )}

          {currentView === 'tools' && (
            <ToolsSuite
              selectedToolId={selectedToolId}
              language={settings.language}
              accent={settings.accent}
              fontSize={settings.fontSize}
              onSelectTool={(id) => setSelectedToolId(id)}
              onSendToChat={handleSendToChat}
              onOpenHtmlPreview={(html) => setHtmlPreviewCode(html)}
            />
          )}
        </main>
      </div>

      {/* Modals & Overlays */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdateSettings={(newS) => setSettings((s) => ({ ...s, ...newS }))}
          onClearHistory={handleClearHistory}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {isProfileOpen && user && (
        <ProfileModal
          profile={user}
          language={settings.language}
          onUpdateProfile={(updated) =>
            setUser((prev) => (prev ? { ...prev, ...updated } : null))
          }
          onClose={() => setIsProfileOpen(false)}
        />
      )}

      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          language={settings.language}
          onSuccess={(userData) => {
            setUser({
              name: userData.name,
              email: userData.email,
              avatar:
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
              joinedDate: 'Имрӯз',
              totalMessages: 1,
              toolsUsedCount: 1,
              streakDays: 1,
              preferredLanguage: settings.language,
            });
            setAuthModalMode(null);
          }}
          onClose={() => setAuthModalMode(null)}
        />
      )}

      {isSearchOpen && (
        <SearchModal
          sessions={sessions}
          language={settings.language}
          onSelectSession={(id) => {
            setActiveSessionId(id);
            setCurrentView('chat');
          }}
          onClose={() => setIsSearchOpen(false)}
        />
      )}

      {isHelpOpen && (
        <HelpModal
          language={settings.language}
          onClose={() => setIsHelpOpen(false)}
        />
      )}

      {htmlPreviewCode && (
        <WebsiteGeneratorPreview
          htmlCode={htmlPreviewCode}
          onClose={() => setHtmlPreviewCode(null)}
        />
      )}
    </div>
  );
}
