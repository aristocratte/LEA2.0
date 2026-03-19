'use client';

import { useState, useRef } from 'react';
import { ArrowUp, Loader2, Plus, EyeOff } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  placeholder = "Start a pentest or ask a question...",
  disabled = false,
  loading = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [stealthMode, setStealthMode] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !loading) {
        onSend();
      }
    }
  };

  const handleSend = () => {
    if (value.trim() && !disabled && !loading) {
      onSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 focus-within:border-[#F5A623] focus-within:ring-2 focus-within:ring-[#F5A623]/10 transition-all">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || loading}
        className="w-full bg-transparent border-0 outline-none resize-none text-[15px] leading-relaxed text-gray-900 placeholder:text-gray-400 min-h-[44px] max-h-[200px] py-2 px-1 disabled:opacity-50"
        style={{ height: 'auto' }}
      />
      
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || loading}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
          
          <button
            type="button"
            onClick={() => setStealthMode(!stealthMode)}
            disabled={disabled || loading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50 ${
              stealthMode 
                ? 'bg-gray-100 text-gray-900' 
                : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Stealth</span>
          </button>
        </div>
        
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled || loading}
          type="button"
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all ${
            value.trim() && !disabled && !loading
              ? "bg-[#F5A623] text-white hover:bg-[#E09500] shadow-sm"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Send</span>
              <ArrowUp className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}