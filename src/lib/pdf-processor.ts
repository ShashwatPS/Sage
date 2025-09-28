import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Document } from "langchain/document";
import { db } from "@/server/db"
import { v4 as uuidv4 } from 'uuid';
import type { ChunkData } from "./interfaces";

export class ChunkingService {
  static async extractTextAndChunk(filePath: string): Promise<ChunkData[]> {
    try {
      const publicURL = `https://${process.env.NEXT_PUBLIC_SUPABASE_ID}.supabase.co/storage/v1/object/public/files/${filePath}`;

      const response = await fetch(publicURL);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF from ${publicURL}`);
      }
      const blob = await response.blob();

      const loader = new WebPDFLoader(blob);
      const docs: Document[] = await loader.load();

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 150,
        separators: ["\n\n", "\n", ".", " "],
      });

      const langchainChunks: Document[] = await splitter.splitDocuments(docs);

      let startIndex = 0;
      return langchainChunks.map((chunk, index) => {
        const content = typeof chunk.pageContent === "string" ? chunk.pageContent : "";
        const endIndex = startIndex + content.length;

        const chunkData: ChunkData = {
          id: uuidv4(),
          content,
          position: index,
          startIndex,
          endIndex,
        };

        startIndex = endIndex - 150; 
        return chunkData;
      });
    } catch (e) {
      console.error("Error extracting text from PDF:", e);
      return [];
    }
  }

  static async processAndStoreChunks(filePath: string, fileId: string): Promise<void> {
    const chunks = await this.extractTextAndChunk(filePath);
    if (chunks.length === 0) return console.warn("No chunks extracted from PDF");

    await db.fileChunk.createMany({
      data: chunks.map((chunk) => ({
        id: chunk.id,
        fileId,
        content: chunk.content,
        startIndex: chunk.startIndex,
        endIndex: chunk.endIndex,
      }))
    });

    const Embedded = await import('./embedding-service');
    await Embedded.EmbeddingService.storeChunks(chunks, fileId);
  }

  static reconstructDocument(chunks: ChunkData[]): string {
    const sorted = chunks.sort((a, b) => a.startIndex - b.startIndex);
    let result = '';
    let lastEnd = 0;

    for (const chunk of sorted) {
      const uniqueStart = Math.max(chunk.startIndex, lastEnd);
      const uniqueText = chunk.content.slice(uniqueStart - chunk.startIndex);
      result += uniqueText;
      lastEnd = chunk.endIndex;
    }

    return result;
  }
}