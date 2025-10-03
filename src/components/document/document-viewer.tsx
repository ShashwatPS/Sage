"use client";

import { useEffect, useState, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/trpc/react";
import ReactMarkdown from "react-markdown";

interface DocumentViewerProps {
  fileId: string;
  page: number;
  startIndex: number;
  endIndex: number;
}

const HighlightedContent = ({ 
  content, 
  startLine, 
  endLine,
  onHighlightedRef
}: { 
  content: string; 
  startLine: number; 
  endLine: number;
  onHighlightedRef: (ref: HTMLDivElement | null) => void;
}) => {
  const lines = content.split('\n');
  const highlightedRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (highlightedRef.current) {
      onHighlightedRef(highlightedRef.current);
    }
  }, [onHighlightedRef]);
  
  return (
    <div>
      {lines.map((line, index) => {
        const lineNumber = index + 1;
        const shouldHighlight = lineNumber >= startLine && lineNumber <= endLine;
        const isFirstHighlighted = shouldHighlight && lineNumber === startLine;
        
        if (shouldHighlight) {
          return (
            <div 
              key={index} 
              ref={isFirstHighlighted ? highlightedRef : null}
              className="bg-yellow-200 px-1 rounded my-1"
            >
              <ReactMarkdown>{line}</ReactMarkdown>
            </div>
          );
        }
        
        return (
          <div key={index}>
            <ReactMarkdown>{line}</ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
};

export default function DocumentViewer({
  fileId,
  page,
  startIndex,
  endIndex
}: DocumentViewerProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastFileId, setLastFileId] = useState<string>("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const highlightedElementRef = useRef<HTMLDivElement | null>(null);

  console.log("DocumentViewer props:", { fileId, page, startIndex, endIndex });

  const { data: reconstructedPages, isLoading } =
    api.chat.getDocByFileId.useQuery({ fileId }, { enabled: !!fileId });

  console.log("Reconstructed pages:", reconstructedPages);

  const scrollToHighlighted = () => {
    if (highlightedElementRef.current) {
      highlightedElementRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  };

  const handleHighlightedRef = (ref: HTMLDivElement | null) => {
    highlightedElementRef.current = ref;
    setTimeout(() => {
      scrollToHighlighted();
    }, 100);
  };

  useEffect(() => {
    if (reconstructedPages && (!isInitialized || fileId !== lastFileId)) {
      setIsInitialized(true);
      setLastFileId(fileId);
    }
  }, [reconstructedPages, isInitialized, fileId, lastFileId]);

  useEffect(() => {
    if (isInitialized && reconstructedPages && startIndex && endIndex) {
      const timer = setTimeout(() => {
        scrollToHighlighted();
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [fileId, page, startIndex, endIndex, isInitialized, reconstructedPages]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading document...</div>
      </div>
    );
  }

  if (!reconstructedPages || reconstructedPages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground text-sm">
          No document content available
        </div>
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollAreaRef} className="h-full p-6">
      <div className="mx-auto max-w-4xl">
        {reconstructedPages
          .sort((a, b) => a.pageNo - b.pageNo)
          .map((pageData) => (
            <div key={pageData.pageNo} className="page-container mb-8">
              <div className="markdown-content leading-relaxed text-gray-900 [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800 [&_blockquote]:mb-4 [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:bg-blue-50 [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:text-gray-600 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-2 [&_code]:py-1 [&_code]:font-mono [&_code]:text-sm [&_code]:text-gray-800 [&_em]:text-gray-700 [&_em]:italic [&_h1]:mt-8 [&_h1]:mb-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h2]:mt-6 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mt-5 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-medium [&_h3]:text-gray-900 [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-medium [&_h4]:text-gray-900 [&_hr]:my-8 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-gray-300 [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:shadow-sm [&_li]:leading-6 [&_li]:text-gray-700 [&_ol]:mb-4 [&_ol]:space-y-2 [&_ol]:pl-6 [&_ol_li]:list-decimal [&_p]:mb-4 [&_p]:leading-7 [&_p]:text-gray-700 [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-gray-100 [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-sm [&_strong]:font-semibold [&_strong]:text-gray-900 [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-gray-300 [&_td]:border [&_td]:border-gray-300 [&_td]:p-3 [&_td]:text-gray-700 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:p-3 [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-900 [&_ul]:mb-4 [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul_li]:list-disc">
                {pageData.pageNo === page ? (
                  <HighlightedContent 
                    content={pageData.pageContent}
                    startLine={startIndex}
                    endLine={endIndex}
                    onHighlightedRef={handleHighlightedRef}
                  />
                ) : (
                  <ReactMarkdown>{pageData.pageContent}</ReactMarkdown>
                )}
              </div>
            </div>
          ))}
      </div>
    </ScrollArea>
  );
}
