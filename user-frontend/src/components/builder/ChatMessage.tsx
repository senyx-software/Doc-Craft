import React, { useState } from 'react';
import type { ChatMessage as ChatMessageType } from '../../types';
import { Bot, User, Check, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useChatStore } from '../../store/chatStore';
import { useDocumentStore } from '../../store/documentStore';

interface ChatMessageProps {
  message: ChatMessageType;
}

interface SuggestionChoice {
  id: string;
  number: number;
  title: string;
  text: string;
}

function extractSuggestionChoices(content: string): SuggestionChoice[] {
  if (!content) return [];
  const choices: SuggestionChoice[] = [];
  
  // Match patterns like: 1. **Standard 30-Day Net**\n*"Payment is due..."*
  const regex = /(?:^|\n)(\d+)\.\s+\*\*(.*?)\*\*\s*\n\s*\*["“]?([^"”*\n]+(?:\n[^"”*\n]+)*)["”]?\*/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const num = parseInt(match[1], 10);
    const title = match[2].trim();
    const text = match[3].trim().replace(/^["“]|["”]$/g, '');
    if (title && text) {
      choices.push({
        id: `choice_${num}_${title.replace(/\s+/g, '_')}`,
        number: num,
        title,
        text,
      });
    }
  }

  if (choices.length === 0) {
    // Match patterns like: 1. **Title**: Text
    const fallbackRegex = /(?:^|\n)(\d+)\.\s+\*\*(.*?)\*\*[:\s]*([^\n]+)/gi;
    while ((match = fallbackRegex.exec(content)) !== null) {
      const num = parseInt(match[1], 10);
      const title = match[2].trim();
      const text = match[3].trim().replace(/^["“]|["”]$/g, '');
      if (title && text && text.length > 5 && !text.startsWith('http')) {
        choices.push({
          id: `choice_${num}_${title.replace(/\s+/g, '_')}`,
          number: num,
          title,
          text,
        });
      }
    }
  }

  return choices;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isAi = message.role === 'assistant';
  const { sendMessage, collectedSlots } = useChatStore();
  const { refreshCanvasElements } = useDocumentStore();
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);

  const choices = isAi ? extractSuggestionChoices(message.content) : [];

  const handleSelectChoice = async (choice: SuggestionChoice) => {
    setSelectedChoiceId(choice.id);
    
    // 1. Live refresh canvas immediately with selected note
    refreshCanvasElements({
      ...collectedSlots,
      notesAndTerms: choice.text,
    });

    // 2. Send selection prompt to chat assistant
    await sendMessage(`Use note option ${choice.number}: "${choice.text}"`);
  };

  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const innerText = part.slice(2, -2);
        return (
          <strong key={index} className="font-extrabold text-appTextPrimary">
            {innerText}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`flex gap-2.5 ${isAi ? 'justify-start' : 'justify-end'}`}
    >
      {isAi && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-accent-purple-500 flex items-center justify-center flex-shrink-0 mt-1 shadow-md">
          <Bot size={14} className="text-white" />
        </div>
      )}

      <div className={`${isAi ? 'chat-bubble-ai' : 'chat-bubble-user'} max-w-full`}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{renderFormattedText(message.content)}</p>

        {/* Interactive Clickable Choice Cards when LLM outputs suggestions */}
        {choices.length > 0 && (
          <div className="mt-4 pt-3 border-t border-appBorder/40 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-brand-500 uppercase tracking-wider mb-1">
              <Sparkles size={13} />
              <span>Click to Select & Apply:</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {choices.map((choice) => {
                const isSelected = selectedChoiceId === choice.id;
                return (
                  <button
                    key={choice.id}
                    onClick={() => handleSelectChoice(choice)}
                    className={`text-left p-3 rounded-xl border transition-all duration-200 flex flex-col gap-1 group ${
                      isSelected
                        ? 'bg-brand-500/10 border-brand-500 shadow-md ring-1 ring-brand-500/50'
                        : 'bg-appBg/60 hover:bg-brand-500/5 border-appBorder/60 hover:border-brand-400/50 text-appTextPrimary'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-brand-600 dark:text-brand-400 group-hover:text-brand-500 transition-colors flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-brand-500/20 text-brand-600 dark:text-brand-400 flex items-center justify-center text-[10px] font-mono">
                          {choice.number}
                        </span>
                        {choice.title}
                      </span>
                      {isSelected ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-500/20 px-2 py-0.5 rounded-full">
                          <Check size={12} /> Applied
                        </span>
                      ) : (
                        <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity font-semibold text-brand-500">
                          Select →
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-appTextSecondary line-clamp-2 italic font-sans pl-5">
                      "{choice.text}"
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!isAi && (
        <div className="w-7 h-7 rounded-full bg-surface-600 flex items-center justify-center flex-shrink-0 mt-1">
          <User size={14} className="text-surface-light-300" />
        </div>
      )}
    </motion.div>
  );
};

export default ChatMessage;
