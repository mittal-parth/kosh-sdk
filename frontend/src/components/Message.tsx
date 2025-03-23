
import React from 'react';
import { cn } from '@/lib/utils';

interface MessageProps {
  content: string;
  isUser?: boolean;
  timestamp?: string;
  status?: 'sending' | 'sent' | 'error';
}

const Message: React.FC<MessageProps> = ({
  content,
  isUser = false,
  timestamp,
  status = 'sent'
}) => {
  return (
    <div 
      className={cn(
        "message-appear flex w-full mb-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div 
        className={cn(
          "max-w-[80%] rounded-xl px-4 py-2 shadow-sm", 
          isUser 
            ? "bg-app-accent text-white rounded-tr-none" 
            : "bg-gray-100 text-gray-800 rounded-tl-none",
          status === 'sending' && "opacity-70"
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        <div className="flex items-center justify-end mt-1 space-x-1">
          {status === 'sending' && (
            <span className="text-xs opacity-70">Sending...</span>
          )}
          {status === 'error' && (
            <span className="text-xs text-red-500">Failed to send</span>
          )}
          {timestamp && (
            <span className="text-xs opacity-70">{timestamp}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default Message;
