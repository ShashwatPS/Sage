"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/trpc/react";
import ReactMarkdown from 'react-markdown';

interface DocumentViewerProps {
  fileId: string;
  chunkId?: string;
}

export default function DocumentViewer({ fileId }: DocumentViewerProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastFileId, setLastFileId] = useState<string>("");
  
  const { data: reconstructedPages, isLoading } = api.chat.getDocByFileId.useQuery(
    { fileId },
    { enabled: !!fileId }
  );

  useEffect(() => {
    if (reconstructedPages && (!isInitialized || fileId !== lastFileId)) {
      setIsInitialized(true);
      setLastFileId(fileId);
    }
  }, [reconstructedPages, isInitialized, fileId, lastFileId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading document...</div>
      </div>
    );
  }

  if (!reconstructedPages || reconstructedPages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">No document content available</div>
      </div>
    );
  }
  
  return (
    <ScrollArea className="h-full p-6">
      <div className="max-w-4xl mx-auto">
        {reconstructedPages
          .sort((a, b) => a.pageNo - b.pageNo)
          .map((page) => (
            <div key={page.pageNo} className="page-container mb-8">
              <div className="markdown-content text-gray-900 leading-relaxed
                [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-6 [&_h1]:mt-8 [&_h1]:text-gray-900
                [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-4 [&_h2]:mt-6 [&_h2]:text-gray-900
                [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mb-3 [&_h3]:mt-5 [&_h3]:text-gray-900
                [&_h4]:text-lg [&_h4]:font-medium [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-gray-900
                [&_p]:mb-4 [&_p]:leading-7 [&_p]:text-gray-700
                [&_ul]:mb-4 [&_ul]:pl-6 [&_ul]:space-y-2
                [&_ol]:mb-4 [&_ol]:pl-6 [&_ol]:space-y-2
                [&_li]:text-gray-700 [&_li]:leading-6
                [&_ul_li]:list-disc
                [&_ol_li]:list-decimal
                [&_strong]:font-semibold [&_strong]:text-gray-900
                [&_em]:italic [&_em]:text-gray-700
                [&_code]:bg-gray-100 [&_code]:px-2 [&_code]:py-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-gray-800
                [&_pre]:bg-gray-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-4
                [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-sm
                [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:pl-4 [&_blockquote]:py-2 [&_blockquote]:mb-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_blockquote]:bg-blue-50
                [&_table]:border-collapse [&_table]:w-full [&_table]:mb-4 [&_table]:border [&_table]:border-gray-300
                [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:p-3 [&_th]:font-semibold [&_th]:text-left [&_th]:text-gray-900
                [&_td]:border [&_td]:border-gray-300 [&_td]:p-3 [&_td]:text-gray-700
                [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800
                [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-gray-300 [&_hr]:my-8
                [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:shadow-sm [&_img]:my-4
              ">
                <ReactMarkdown>{page.pageContent}</ReactMarkdown>
              </div>
            </div>
          ))}
      </div>
    </ScrollArea>
  );
}