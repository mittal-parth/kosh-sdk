import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface MessageProps {
  content: string;
  isUser?: boolean;
  timestamp?: string;
  status?: "sending" | "sent" | "error";
}

// Function to detect if a string is valid JSON
const isJsonString = (str: string): boolean => {
  try {
    const result = JSON.parse(str);
    return typeof result === "object" && result !== null;
  } catch (e) {
    return false;
  }
};

// Function to format and highlight JSON
const formatJson = (jsonString: string): string => {
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    return jsonString;
  }
};

const Message: React.FC<MessageProps> = ({
  content,
  isUser = false,
  timestamp,
  status = "sent",
}) => {
  const [copyStates, setCopyStates] = useState<Record<number, boolean>>({});

  // Process content to detect tool usage
  const renderContent = () => {
    if (
      content.includes("🔧 Using tool:") ||
      content.includes("📊 Tool result:") ||
      content.includes("❌ Error calling tool")
    ) {
      return (
        <div className="space-y-2">
          {content.split("\n\n").map((paragraph, idx) => {
            if (paragraph.startsWith("🔧 Using tool:")) {
              return (
                <div
                  key={idx}
                  className="bg-blue-50 p-2 rounded-md text-blue-700 text-sm font-mono"
                >
                  {paragraph}
                </div>
              );
            } else if (paragraph.startsWith("📊 Tool result:")) {
              // Split after the "Tool result:" label to extract the result content
              const [label, ...resultLines] = paragraph.split("\n");
              const resultContent = resultLines.join("\n");

              // Determine if the result is JSON and should be formatted
              const isJson = isJsonString(resultContent.trim());
              const formattedContent = isJson
                ? formatJson(resultContent.trim())
                : resultContent;

              // Copy to clipboard function
              const copyToClipboard = () => {
                navigator.clipboard.writeText(resultContent.trim());
                // Set copy state for this index
                setCopyStates((prev) => ({ ...prev, [idx]: true }));
                // Reset copy state after 2 seconds
                setTimeout(() => {
                  setCopyStates((prev) => ({ ...prev, [idx]: false }));
                }, 2000);
              };

              return (
                <div
                  key={idx}
                  className="bg-green-50 p-2 rounded-md text-green-700 text-sm font-mono"
                >
                  <div className="mb-1 flex justify-between items-center">
                    <span>{label}</span>
                    <button
                      onClick={copyToClipboard}
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-md transition-colors",
                        copyStates[idx]
                          ? "bg-green-500 text-white"
                          : "bg-green-200 hover:bg-green-300 text-green-800"
                      )}
                      title="Copy to clipboard"
                    >
                      {copyStates[idx] ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre
                    className={cn(
                      "p-2 rounded overflow-auto text-xs max-h-60",
                      isJson
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-800"
                    )}
                  >
                    {isJson && (
                      <code className="text-xs">
                        {formattedContent.split("\n").map((line, lineIdx) => {
                          // Basic syntax highlighting
                          const lineWithHighlight = line
                            .replace(
                              /("[^"]*"):/g,
                              '<span style="color: #9cdcfe;">$1</span>:'
                            ) // property names
                            .replace(
                              /: ("[^"]*")([,}]|$)/g,
                              ': <span style="color: #ce9178;">$1</span>$2'
                            ) // string values
                            .replace(
                              /: (true|false)([,}]|$)/g,
                              ': <span style="color: #569cd6;">$1</span>$2'
                            ) // boolean values
                            .replace(
                              /: (\d+)([,}]|$)/g,
                              ': <span style="color: #b5cea8;">$1</span>$2'
                            ); // number values

                          return (
                            <div
                              key={lineIdx}
                              dangerouslySetInnerHTML={{
                                __html: lineWithHighlight,
                              }}
                            />
                          );
                        })}
                      </code>
                    )}
                    {!isJson && formattedContent}
                  </pre>
                </div>
              );
            } else if (paragraph.startsWith("❌ Error calling tool")) {
              return (
                <div
                  key={idx}
                  className="bg-red-50 p-2 rounded-md text-red-700 text-sm font-mono"
                >
                  {paragraph}
                </div>
              );
            } else {
              return (
                <p
                  key={idx}
                  className="text-sm whitespace-pre-wrap break-words"
                >
                  {paragraph}
                </p>
              );
            }
          })}
        </div>
      );
    }

    return <p className="text-sm whitespace-pre-wrap break-words">{content}</p>;
  };

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
          status === "sending" && "opacity-70"
        )}
      >
        {renderContent()}
        <div className="flex items-center justify-end mt-1 space-x-1">
          {status === "sending" && (
            <span className="text-xs opacity-70">Sending...</span>
          )}
          {status === "error" && (
            <span className="text-xs text-red-500">Failed to send</span>
          )}
          {timestamp && <span className="text-xs opacity-70">{timestamp}</span>}
        </div>
      </div>
    </div>
  );
};

export default Message;
