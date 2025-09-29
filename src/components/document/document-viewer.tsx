"use client";

import { useRef, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/trpc/react";

interface DocumentViewerProps {
  fileId: string;
  chunkId?: string;
}

const renderChunksWithHighlight = (
  chunks: { chunkId: string; text: string; startIndex: number; endIndex: number }[],
  targetChunkId?: string
): string => {
  return chunks
    .map((chunk) => {
      if (chunk.chunkId === targetChunkId) {
        return `<span class="chunk-highlight bg-yellow-200 p-2 rounded-md border-l-4 border-yellow-400 my-2" data-chunk-id="${chunk.chunkId}">${chunk.text}</span>`;
      } else {
        return `<span class="chunk-normal" data-chunk-id="${chunk.chunkId}">${chunk.text}</span>`;
      }
    })
    .join('');
};

export default function DocumentViewer({ fileId, chunkId }: DocumentViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastFileId, setLastFileId] = useState<string>("");
  
  const { data: reconstructedChunks, isLoading } = api.chat.getDocByFileId.useQuery(
    { fileId },
    { enabled: !!fileId }
  );

  useEffect(() => {
    if (reconstructedChunks && contentRef.current && (!isInitialized || fileId !== lastFileId)) {
      setIsInitialized(true);
      setLastFileId(fileId);
    }
  }, [reconstructedChunks, isInitialized, fileId, lastFileId]);

  useEffect(() => {
    if (!contentRef.current || !isInitialized || !reconstructedChunks) {
      return;
    }

    const element = contentRef.current;
    
    const highlightedContent = renderChunksWithHighlight(reconstructedChunks, chunkId);
    element.innerHTML = highlightedContent;
    
    if (chunkId) {
      setTimeout(() => {
        const highlightedChunk = element.querySelector(`[data-chunk-id="${chunkId}"]`);
        if (highlightedChunk) {
          highlightedChunk.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 100);
    }
  }, [reconstructedChunks, isInitialized, chunkId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading document...</div>
      </div>
    );
  }

  if (!reconstructedChunks || reconstructedChunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">No document content available</div>
      </div>
    );
  }
  
  return (
    <ScrollArea className="h-full p-6">
      <div className="max-w-4xl mx-auto">
        <div className="prose prose-sm max-w-none">
          <div 
            ref={contentRef}
            className="whitespace-pre-wrap leading-relaxed text-gray-800"
          />
        </div>
      </div>
    </ScrollArea>
  );
}
