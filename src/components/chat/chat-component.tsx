"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
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

export function ChatComponent({ chatId }: ChatComponentProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [citationData, setCitationData] = useState<CitationData | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const utils = api.useUtils();

  // Use tRPC to fetch chat history
  const { data: chatData } = api.chat.getById.useQuery(
    { id: chatId! },
    { enabled: !!chatId },
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

  // Initialize useChat with AI SDK 5.0 API
  const { messages, status, sendMessage, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages, id, body }) => {
        return {
          body: {
            message: messages.at(-1)?.parts.find((part) => part.type === "text")
              ?.text,
            chatId,
            ...body,
          },
        };
      },
    }),
    onData: (data) => {
      console.log("abhijeet data", data);

      if (data.type === "data-chatId") {
        const chatId = (data.data as { chatId: string }).chatId;
        utils.chat.getById
          .prefetch({ id: chatId })
          .then(() => {
            router.push(`/chat/${chatId}`);
          })
          .catch((e) => {
            console.log("error in prefetch", e);
          });
      }
    },
    onFinish: () => {
      console.log("abhijeet onFinish");
      void utils.chat.getById.invalidate();
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  
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

    // Send message using AI SDK 5.0 API
    await sendMessage({ text: messageText }, { body: { fileIds } });

    // Note: Chat ID management will be handled by the API route
    // and should automatically redirect if needed
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
                        {/* <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          {message.role === 'user' ? (
                            <User className="w-4 h-4" />
                          ) : (
                            <Bot className="w-4 h-4" />
                          )}
                        </div> */}
                        <div
                          className={`rounded-lg px-4 py-2 ${
                            message.role === "user" ? "bg-muted" : ""
                          }`}
                        >
                          <p className="whitespace-pre-wrap">
                            {message.parts
                              ?.filter((part) => part.type === "text")
                              .map((part, _index: number) => {
                                // return part.text;
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
                                            <p>{"Chekcing a few things"}</p>
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
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
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
