import { useDocumentStore } from '../../store/documentStore';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  Plus,
  RotateCcw,
  FileCheck,
  Loader2,
  ChevronLeft,
  History,
  Trash2,
  Search,
  X,
  Clock,
  MessageSquare
} from 'lucide-react';
import { useChatStore, type ChatSessionMeta } from '../../store/chatStore';
import ChatMessage from './ChatMessage';
import SpellCorrectionBanner from './SpellCorrectionBanner';
import chatBg from '../../assets/svg/chat-bg.svg';
import ChatAttachments from './ChatAttachments';

interface ChatPanelProps {
  onCollapse?: () => void;
}

const PLACEHOLDER_EXAMPLES = [
  'My business name is...',
  'Contact number is...',
  'Can you do the calculation...',
  'Add a line item for design work...',
  'Client name is Acme Corp...',
];

function useTypewriterPlaceholder(active: boolean): string {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!active) return;
    let sentenceIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const full = PLACEHOLDER_EXAMPLES[sentenceIndex];
      if (!deleting) {
        charIndex += 1;
        setText(full.slice(0, charIndex));
        if (charIndex === full.length) {
          deleting = true;
          timeoutId = setTimeout(tick, 1400);
          return;
        }
        timeoutId = setTimeout(tick, 45);
      } else {
        charIndex -= 1;
        setText(full.slice(0, charIndex));
        if (charIndex === 0) {
          deleting = false;
          sentenceIndex = (sentenceIndex + 1) % PLACEHOLDER_EXAMPLES.length;
          timeoutId = setTimeout(tick, 400);
          return;
        }
        timeoutId = setTimeout(tick, 25);
      }
    };

    timeoutId = setTimeout(tick, 45);
    return () => clearTimeout(timeoutId);
  }, [active]);

  return active ? text : '';
}

function formatSessionTime(dateStr?: string): string {
  if (!dateStr) return 'Recent chat';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Recent chat';

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupSessionsByDate(sessions: ChatSessionMeta[]) {
  const groups: Record<string, ChatSessionMeta[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 6 * 86400000;

  sessions.forEach((sess) => {
    const time = sess.updatedAt ? new Date(sess.updatedAt).getTime() : Date.now();
    if (time >= startOfToday) {
      groups['Today'].push(sess);
    } else if (time >= startOfYesterday) {
      groups['Yesterday'].push(sess);
    } else if (time >= startOf7Days) {
      groups['Previous 7 Days'].push(sess);
    } else {
      groups['Older'].push(sess);
    }
  });

  return Object.entries(groups).filter(([, items]) => items.length > 0);
}

const ChatPanel: React.FC<ChatPanelProps> = ({ onCollapse }) => {
  const {
    messages,
    documentType,
    collectedSlots,
    summary,
    currentField,
    readyToGenerate,
    canGenerate,
    confirmDocument,
    pendingCorrection,
    isLoading,
    isLoadingSessions,
    readOnly,
    lifecycle,
    pendingTurn,
    retryMessage,
    error,
    sessionId,
    userSessions,
    sendMessage,
    confirmCorrection,
    fetchSummary,
    resetChat,
    fetchUserSessions,
    loadSessionFromDb,
    deleteSessionById,
    startSession,
  } = useChatStore();

  const {generationStatus,documentId,pollGeneration,error:documentError}=useDocumentStore();
  useEffect(()=>{
    if(!documentId||!['queued','pending','processing'].includes(generationStatus||''))return;
    let checks=0;const timer=setInterval(()=>{if(++checks>30){clearInterval(timer);return;}void pollGeneration();},2000);
    return ()=>clearInterval(timer);
  },[documentId,generationStatus,pollGeneration]);

  const [input, setInput] = useState('');
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchUserSessions();
  }, [fetchUserSessions]);

  const filteredSessions = userSessions.filter((sess) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const title = (sess.title || '').toLowerCase();
    const docType = (sess.documentTypeId || '').toLowerCase();
    return title.includes(q) || docType.includes(q);
  });

  const groupedSessions = groupSessionsByDate(filteredSessions);

  const showTypewriter = !readyToGenerate && !pendingCorrection && input === '';
  const typedPlaceholder = useTypewriterPlaceholder(showTypewriter);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingCorrection]);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentField, isLoading]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput('');
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    // Shift+Enter inserts a newline — browser default handles it
  };

  // Auto-resize the textarea as content grows
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const isChatMode = messages.length > 1;
  const greeting = messages.length === 1 ? messages[0] : null;

  const inputBar = (autoFocus: boolean) => (
    <form onSubmit={handleSubmit} className={autoFocus ? 'w-full max-w-md' : ''}>
      <div className="flex items-center gap-1 rounded-full p-0.5 bg-appBg border border-brand-300">
        <ChatAttachments key={sessionId} />
        <div className="relative flex-1 min-w-0">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={
              readyToGenerate
                ? 'Add optional details or review...'
                : pendingCorrection
                  ? 'Accept or reject the suggestion above'
                  : ''
            }
            disabled={isLoading || readOnly && lifecycle !== 'COMPLETED' || !!pendingTurn || !!pendingCorrection}
            className="w-full bg-transparent text-sm text-appTextPrimary placeholder:text-appTextSecondary focus:outline-none px-1 py-1 resize-none overflow-hidden leading-5"
            id={autoFocus ? 'chat-input-center' : 'chat-input'}
            style={{ minHeight: '20px', maxHeight: '120px' }}
          />
          {showTypewriter && input === '' && (
            <span className="pointer-events-none absolute inset-y-0 left-1 flex items-center text-sm text-appTextSecondary">
              {typedPlaceholder}
              <span className="inline-block w-px h-4 bg-appTextSecondary ml-0.5 animate-pulse" />
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !input.trim() || !!pendingCorrection}
          id={autoFocus ? 'chat-send-center' : 'chat-send'}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-brand-400 text-white hover:bg-brand-500 transition-colors flex-shrink-0 disabled:opacity-40"
        >
          <ArrowRight size={13} />
        </button>
      </div>
    </form>
  );

  return (
    <div className="relative isolate flex flex-col h-full bg-appSurface overflow-hidden" id="chat-panel">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.2]"
        style={{ backgroundImage: `url(${chatBg})`, backgroundSize: '350px 233px', backgroundRepeat: 'repeat', backgroundPosition: 'center' }}
      />

      {/* Header bar with Chat History toggle */}
      <div className="flex items-center justify-between px-3 pt-2 gap-1.5 flex-shrink-0 border-b border-appBorder/40 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-appTextPrimary">AI Assistant</span>
          <button
            onClick={() => {
              const next = !showHistoryPanel;
              setShowHistoryPanel(next);
              if (next) {
                fetchUserSessions();
              }
            }}
            className={`p-1 rounded flex items-center gap-1 text-xs transition-colors ${showHistoryPanel ? 'bg-brand-100 text-brand-600 font-medium' : 'text-appTextSecondary hover:text-appTextPrimary'}`}
            title="Chat History"
          >
            <History size={13} />
            <span>History</span>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {sessionId && (
            <button
              onClick={() => fetchSummary()}
              id="btn-summary"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-green-500 text-white text-xs font-medium rounded-full hover:bg-accent-green-600 transition-colors"
            >
              <FileCheck size={13} />
              Review
            </button>
          )}
          <button
            onClick={resetChat}
            id="btn-reset-chat"
            className="p-1.5 rounded-full text-appTextSecondary hover:text-appTextPrimary hover:bg-appSurface transition-colors"
            title="Start over"
          >
            <RotateCcw size={14} />
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded text-appTextSecondary hover:text-appTextPrimary hover:bg-appSurface transition-colors"
              title="Collapse panel"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </div>

      {/* User-friendly Chat History Overlay Sidebar */}
      {showHistoryPanel && (
        <div
          className="absolute inset-x-0 top-[41px] bottom-0 z-50 bg-white dark:bg-[#1a1915] flex flex-col border-t border-appBorder/50 shadow-2xl overflow-hidden animate-fade-in"
          style={{ backgroundColor: 'var(--surface, #ffffff)' }}
        >
          {/* History Header */}
          <div className="p-3 border-b border-appBorder/40 flex items-center justify-between gap-2 bg-gray-50/90 dark:bg-[#22211d] shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-appTextPrimary">Chat History</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-brand-500/10 text-brand-500 rounded-full border border-brand-500/20 flex items-center gap-1">
                {isLoadingSessions ? (
                  <Loader2 size={10} className="animate-spin text-brand-500" />
                ) : (
                  userSessions.length
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  resetChat();
                  startSession('invoice');
                  setShowHistoryPanel(false);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-500 text-white text-xs font-semibold rounded-lg hover:bg-brand-600 transition-all shadow-sm"
              >
                <Plus size={13} />
                <span>New Chat</span>
              </button>
              <button
                onClick={() => setShowHistoryPanel(false)}
                className="p-1 rounded-lg text-appTextSecondary hover:text-appTextPrimary hover:bg-gray-200/50 dark:hover:bg-white/10 transition-colors"
                title="Close History"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="px-3 pt-3 pb-1 shrink-0 bg-white dark:bg-[#1a1915]">
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-appTextSecondary pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-7 py-1.5 bg-gray-100/80 dark:bg-[#2c2b26] border border-gray-200 dark:border-white/10 rounded-lg text-xs text-appTextPrimary placeholder:text-appTextSecondary/60 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-appTextSecondary hover:text-appTextPrimary p-0.5 rounded-full"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Session List with Date Grouping */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 bg-white dark:bg-[#1a1915]">
            {isLoadingSessions ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-appTextSecondary space-y-3">
                <Loader2 size={24} className="animate-spin text-brand-500" />
                <p className="text-xs font-semibold text-appTextPrimary">Loading chat history...</p>
                <p className="text-[11px] text-appTextSecondary">Fetching your past AI conversations</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-10 px-4 text-appTextSecondary">
                <Clock size={28} className="mx-auto mb-2 text-appTextSecondary/40" />
                <p className="text-xs font-semibold text-appTextPrimary mb-1">
                  {searchQuery ? 'No matching history' : 'No chat history'}
                </p>
                <p className="text-[11px] text-appTextSecondary">
                  {searchQuery
                    ? `No conversations match "${searchQuery}"`
                    : 'Your past AI chat conversations will appear here.'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => {
                      resetChat();
                      startSession('invoice');
                      setShowHistoryPanel(false);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Plus size={13} />
                    Start New Chat
                  </button>
                )}
              </div>
            ) : (
              groupedSessions.map(([groupName, sessions]) => (
                <div key={groupName} className="space-y-1">
                  <div className="px-1 text-[10px] font-bold tracking-wider text-appTextSecondary uppercase">
                    {groupName}
                  </div>
                  {sessions.map((sess) => {
                    const isActive = sess.id === sessionId;
                    const formattedDate = formatSessionTime(sess.updatedAt);
                    return (
                      <div
                        key={sess.id}
                        onClick={() => {
                          loadSessionFromDb(sess.id);
                          setShowHistoryPanel(false);
                        }}
                        className={`group relative flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer shadow-sm ${
                          isActive
                            ? 'bg-brand-500/10 border-brand-500/40 text-appTextPrimary'
                            : 'bg-white dark:bg-[#22211d] border-gray-200 dark:border-white/10 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-[#2c2b26]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isActive ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#2c2b26] border border-gray-200 dark:border-white/10 text-appTextSecondary group-hover:text-brand-500 group-hover:border-brand-300'
                            }`}
                          >
                            <MessageSquare size={13} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className={`text-xs truncate ${isActive ? 'font-bold text-brand-600 dark:text-brand-300' : 'font-semibold text-appTextPrimary'}`}>
                                {sess.title || `${(sess.documentTypeId || 'invoice').toUpperCase()} Draft`}
                              </p>
                              {isActive && (
                                <span className="px-1.5 py-0.2 text-[9px] font-bold bg-brand-500 text-white rounded-full shrink-0">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-appTextSecondary/80 mt-0.5">
                              {formattedDate}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSessionById(sess.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-appTextSecondary hover:text-danger hover:bg-danger/10 transition-all ml-1 shrink-0"
                          title="Delete conversation"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Messages area — centered hero until the user's first reply, then a scrolling chat list */}
      {isChatMode ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg, idx) => (
            <ChatMessage key={idx} message={msg} />
          ))}

          {/* Spell correction banner */}
          {pendingCorrection && (
            <SpellCorrectionBanner
              correction={pendingCorrection}
              onAccept={() => confirmCorrection(true)}
              onReject={() => confirmCorrection(false)}
              isLoading={isLoading}
            />
          )}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 text-appTextSecondary text-xs px-1 animate-fade-in">
              <Loader2 size={13} className="animate-spin" />
              AI is thinking...
            </div>
          )}

          {/* Error */}
          {generationStatus && <div className="p-3 text-sm" role="status">Document generation: {generationStatus}. {['queued','pending','processing'].includes(generationStatus) && <button type="button" onClick={()=>void pollGeneration()} className="underline">Check status</button>}</div>}
          {documentError && <div className="p-3 text-sm text-danger" role="alert">{documentError}</div>}
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger animate-fade-in">
              {error}
            {pendingTurn && <button type="button" onClick={() => void retryMessage()} disabled={isLoading} className="ml-2 underline">Retry response</button>}
          </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      ) : (
        /* Hero state — vertically centered, but nudged up from dead-center
           (pb bias instead of true justify-center) so it doesn't sit too
           low in a tall panel. */
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 gap-4 overflow-y-auto">
          <div className="text-center space-y-2">
            <p className="text-base font-semibold text-appTextPrimary">
              {greeting ? greeting.content : 'What are we building today?'}
            </p>
            {!greeting && (
              <p className="text-xs text-appTextSecondary">
                Answer a few quick questions and your document will be ready.
              </p>
            )}
          </div>

          {/* Centered input form */}
          {inputBar(true)}
        </div>
      )}

      {summary && <div className="mx-4 my-2 p-3 rounded-lg border border-appBorder text-sm whitespace-pre-wrap max-h-64 overflow-y-auto" aria-label="Document summary">{summary}{readyToGenerate&&!canGenerate&&<button type="button" onClick={()=>void confirmDocument()} disabled={isLoading} className="block mt-3 px-3 py-2 rounded bg-accent-green-500 text-white">Confirm document details</button>}{canGenerate&&<p className="mt-2 text-accent-green-500">Details confirmed. You can generate or download this document.</p>}</div>}
      {sessionId && collectedSlots.businessName != null && !isLoading && (
        <button type="button" className="mx-4 my-2 text-xs underline text-appTextSecondary"
          onClick={() => void startSession(documentType || 'invoice', { reuseFromSessionId: sessionId })}>
          New document with this business
        </button>
      )}

      {/* Bottom input — once the conversation has moved into chat mode */}
      {isChatMode && (
        <div className="px-4 pb-3 pt-2 flex-shrink-0">
          {inputBar(false)}
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
