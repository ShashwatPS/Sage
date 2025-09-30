"use client";

import { useRef, useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { ChatInput } from "./chat-input";
import { Streamdown } from "streamdown";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";

const DocumentViewer = dynamic(
  () => import("@/components/document/document-viewer"),
  { ssr: false, loading: () => <div>Loading...</div> },
);

interface ChatComponentProps {
  chatId?: string;
}
interface CitationData {
  chunkId: string;
  fileId: string;
}

export function ChatComponent({ chatId: initialChatId }: ChatComponentProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [citationData, setCitationData] = useState<CitationData | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(initialChatId ?? null);
  const utils = api.useUtils();

  const { data: session } = useSession();

  // For handling new chat creation
  const { data: newChatId } = api.chat.getChatID.useQuery(
    { userId: session?.user.id ?? "", title: "New Chat" },
    { 
      enabled: !!session?.user.id && !currentChatId,
    }
  );

  // Update currentChatId when new chatID is created
  useEffect(() => {
    if (newChatId && !currentChatId) {
      setCurrentChatId(newChatId);
      router.push(`/chat/${newChatId}`);
    }
  }, [newChatId, currentChatId, router]);

  // Use tRPC to fetch chat history only when we have a chatId
  const { data: chatData } = api.chat.getById.useQuery(
    { id: currentChatId! },
    { enabled: !!currentChatId },
  );

  useEffect(() => {
    if (chatData?.messages) {
      const uiMessages: UIMessage[] = chatData.messages.map((message) => ({
        id: message.id,
        role:
          message.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: message.content,
        createdAt: message.createdAt,
        parts: [{ type: "text", text: message.content }],
      }));
      setMessages(uiMessages);
    }
  }, [chatData?.messages]);

  const { data: fileId } = api.chat.getFileByChunk.useQuery(
    { chunkId: selectedChunkId ?? "" },
    { enabled: !!selectedChunkId },
  );

  useEffect(() => {
    if (selectedChunkId && fileId) {
      console.log("Setting citation data for chunk:", selectedChunkId, "fileId:", fileId);
      setCitationData({
        chunkId: selectedChunkId,
        fileId,
      });
    }
  }, [selectedChunkId, fileId]);

  const handleCitationClick = ({ chunkid }: { chunkid: string }) => {
    console.log("Citation clicked for chunk ID:", chunkid);
    setSelectedChunkId(chunkid);
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleMessageSubmit = async (
    messageText: string,
    fileIds?: string[],
  ) => {
    if (!messageText.trim() || isLoading) return;

    setIsLoading(true);

    const userMessage: UIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text: messageText }],
    };

    setMessages(prev => [...prev, userMessage]);

   // Empty content to start streaming
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: UIMessage = {
      id: assistantMessageId,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageText,
          chatId: currentChatId,
          fileIds,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setIsLoading(false)
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error("No reader available");
      }

      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        // Update the assistant message with the accumulated text
        setMessages(prev => 
          prev.map(msg => 
            msg.id === assistantMessageId 
              ? { 
                  ...msg, 
                  parts: [{ type: "text", text: accumulatedText }] 
                }
              : msg
          )
        );
      }

      await utils.chat.getById.invalidate();

    } catch (error) {
      console.error("Error sending message:", error);
      
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { 
                ...msg, 
                parts: [{ type: "text", text: "Sorry, there was an error processing your message. Please try again." }] 
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Main content area with resizable panels */}
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {/* Chat panel */}
        <ResizablePanel defaultSize={citationData ? 60 : 100} minSize={40}>
          <div className="flex h-full min-h-0 flex-col">
            {/* Chat Messages Area */}
            <ScrollArea className="min-h-0 flex-1 p-4" ref={scrollAreaRef}>
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                      <span className="text-primary-foreground text-sm font-bold">
                        S
                      </span>
                    </div>
                  </div>
                  <h2 className="mb-2 text-lg font-semibold">
                    Welcome to Sage Chat
                  </h2>
                  <p className="text-muted-foreground">
                    Start a conversation with your AI assistant
                  </p>
                </div>
              ) : (
                <div className="mx-auto max-w-4xl space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`flex space-x-2 ${
                          message.role === "user"
                            ? "max-w-[80%] flex-row-reverse space-x-reverse"
                            : ""
                        }`}
                      >
                        <div
                          className={`rounded-lg px-4 py-2 ${
                            message.role === "user" ? "bg-muted" : ""
                          }`}
                        >
                          <div className="whitespace-pre-wrap">
                            {message.parts
                              ?.filter((part) => part.type === "text")
                              .map((part, _index: number) => {
                                return (
                                  <Streamdown
                                    components={{
                                      // @ts-expect-error dynamic props
                                      citation: ({
                                        children,
                                        ...rest
                                      }: {
                                        children: string;
                                        "chunk-id": string;
                                      }) => (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span
                                              className="cursor-pointer text-blue-500"
                                              onClick={() =>
                                                handleCitationClick({
                                                  chunkid: rest["chunk-id"],
                                                })
                                              }
                                            >
                                              {children}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{"Checking a few things"}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      ),
                                    }}
                                    key={_index}
                                  >
                                    {part.text}
                                  </Streamdown>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-lg px-4 py-2">
                        <div className="flex items-center space-x-2">
                          <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce"></div>
                          <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Chat Input */}
            <ChatInput onSubmit={handleMessageSubmit} disabled={isLoading} />
          </div>
        </ResizablePanel>

        {/* PDF Viewer panel */}
        {citationData && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={30}>
              <div className="flex h-full flex-col border-l">
                <div className="bg-muted/50 flex items-center justify-between border-b p-4">
                  <h2 className="text-sm font-medium">PDF Viewer</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCitationData(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <DocumentViewer
                    fileId={citationData.fileId}
                    chunkId={citationData.chunkId}
                  />
                </div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
