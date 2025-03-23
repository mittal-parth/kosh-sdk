import React, { useState } from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

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
                <div key={idx} className="text-sm markdown-content">
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => (
                        <p className="mb-4 last:mb-0" {...props} />
                      ),
                      h1: ({ node, ...props }) => (
                        <h1
                          className="text-2xl font-bold mb-4 mt-6"
                          {...props}
                        />
                      ),
                      h2: ({ node, ...props }) => (
                        <h2
                          className="text-xl font-bold mb-3 mt-5"
                          {...props}
                        />
                      ),
                      h3: ({ node, ...props }) => (
                        <h3
                          className="text-lg font-bold mb-3 mt-4"
                          {...props}
                        />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc pl-6 mb-4" {...props} />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol className="list-decimal pl-6 mb-4" {...props} />
                      ),
                      li: ({ node, ...props }) => (
                        <li className="mb-1" {...props} />
                      ),
                      blockquote: ({ node, ...props }) => (
                        <blockquote
                          className="border-l-4 border-gray-300 pl-4 italic mb-4"
                          {...props}
                        />
                      ),
                      a: ({ node, ...props }) => (
                        <a
                          className="text-blue-600 hover:underline"
                          {...props}
                        />
                      ),
                      em: ({ node, ...props }) => (
                        <em className="italic" {...props} />
                      ),
                      strong: ({ node, ...props }) => (
                        <strong className="font-bold" {...props} />
                      ),
                      code: ({ node, inline, ...props }: Components["code"]) =>
                        inline ? (
                          <code
                            className="bg-gray-100 px-1 py-0.5 rounded text-red-600 font-mono text-sm"
                            {...props}
                          />
                        ) : (
                          <code className="block" {...props} />
                        ),
                      pre: ({ node, ...props }) => (
                        <pre
                          className="bg-gray-800 text-gray-100 p-4 rounded-md mb-4 overflow-x-auto font-mono text-sm"
                          {...props}
                        />
                      ),
                      hr: ({ node, ...props }) => (
                        <hr className="my-4 border-gray-300" {...props} />
                      ),
                      table: ({ node, ...props }) => (
                        <div className="overflow-x-auto mb-4">
                          <table
                            className="min-w-full border-collapse"
                            {...props}
                          />
                        </div>
                      ),
                      thead: ({ node, ...props }) => (
                        <thead className="bg-gray-100" {...props} />
                      ),
                      tbody: ({ node, ...props }) => (
                        <tbody
                          className="divide-y divide-gray-200"
                          {...props}
                        />
                      ),
                      tr: ({ node, ...props }) => (
                        <tr className="even:bg-gray-50" {...props} />
                      ),
                      th: ({ node, ...props }) => (
                        <th
                          className="px-4 py-2 text-left font-medium text-gray-700"
                          {...props}
                        />
                      ),
                      td: ({ node, ...props }) => (
                        <td className="px-4 py-2 text-gray-700" {...props} />
                      ),
                    }}
                  >
                    {paragraph}
                  </ReactMarkdown>
                </div>
              );
            }
          })}
        </div>
      );
    }

    // For regular messages, render with Markdown
    return (
      <div className="text-sm markdown-content">
        <ReactMarkdown
          components={{
            p: ({ node, ...props }) => (
              <p className="mb-4 last:mb-0" {...props} />
            ),
            h1: ({ node, ...props }) => (
              <h1 className="text-2xl font-bold mb-4 mt-6" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-xl font-bold mb-3 mt-5" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-lg font-bold mb-3 mt-4" {...props} />
            ),
            ul: ({ node, ...props }) => (
              <ul className="list-disc pl-6 mb-4" {...props} />
            ),
            ol: ({ node, ...props }) => (
              <ol className="list-decimal pl-6 mb-4" {...props} />
            ),
            li: ({ node, ...props }) => <li className="mb-1" {...props} />,
            blockquote: ({ node, ...props }) => (
              <blockquote
                className="border-l-4 border-gray-300 pl-4 italic mb-4"
                {...props}
              />
            ),
            a: ({ node, ...props }) => (
              <a className="text-blue-600 hover:underline" {...props} />
            ),
            em: ({ node, ...props }) => <em className="italic" {...props} />,
            strong: ({ node, ...props }) => (
              <strong className="font-bold" {...props} />
            ),
            code: ({ node, inline, ...props }: Components["code"]) =>
              inline ? (
                <code
                  className="bg-gray-100 px-1 py-0.5 rounded text-red-600 font-mono text-sm"
                  {...props}
                />
              ) : (
                <code className="block" {...props} />
              ),
            pre: ({ node, ...props }) => (
              <pre
                className="bg-gray-800 text-gray-100 p-4 rounded-md mb-4 overflow-x-auto font-mono text-sm"
                {...props}
              />
            ),
            hr: ({ node, ...props }) => (
              <hr className="my-4 border-gray-300" {...props} />
            ),
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto mb-4">
                <table className="min-w-full border-collapse" {...props} />
              </div>
            ),
            thead: ({ node, ...props }) => (
              <thead className="bg-gray-100" {...props} />
            ),
            tbody: ({ node, ...props }) => (
              <tbody className="divide-y divide-gray-200" {...props} />
            ),
            tr: ({ node, ...props }) => (
              <tr className="even:bg-gray-50" {...props} />
            ),
            th: ({ node, ...props }) => (
              <th
                className="px-4 py-2 text-left font-medium text-gray-700"
                {...props}
              />
            ),
            td: ({ node, ...props }) => (
              <td className="px-4 py-2 text-gray-700" {...props} />
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
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
