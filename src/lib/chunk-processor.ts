import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { db } from "@/server/db";
import { v4 as uuidv4 } from "uuid";
import type { ChunkData } from "../interfaces/chunkData";
import { Mistral } from "@mistralai/mistralai";

export class ChunkingService {
  static async extractTextAndChunk(
    filePath: string,
    fileId: string,
  ): Promise<ChunkData[]> {
    try {
      const publicURL = `https://${process.env.NEXT_PUBLIC_SUPABASE_ID}.supabase.co/storage/v1/object/public/files/${filePath}`;

      const apiKey = process.env.NEXT_PUBLIC_MISTRAL_API_KEY!;
      const client = new Mistral({ apiKey: apiKey });

      const ocrResponse = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: `${publicURL}`,
        },
      });

      const markdownSplitter = RecursiveCharacterTextSplitter.fromLanguage(
        "markdown",
        {
          chunkSize: 1000,
          chunkOverlap: 100,
        },
      );

      console.log("OCR Response:", ocrResponse);

      const chunkData: ChunkData[] = [];

      await this.savepdfPages(fileId, ocrResponse.pages);

      for (const page of ocrResponse.pages) {
        try {
          const chunks = await markdownSplitter.createDocuments([
            page.markdown,
          ]);
          for (const chunk of chunks) {
            chunkData.push({
              id: uuidv4(),
              content: chunk.pageContent,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              startIndex: chunk.metadata?.loc?.lines?.from,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              endIndex: chunk.metadata?.loc?.lines?.to - 1,
              page: page.index + 1,
            });
          }
        } catch (error) {
          console.error(`Error splitting text for page ${page.index}:`, error);
        }
      }

      return chunkData;
    } catch (e) {
      console.error("Error extracting text from PDF:", e);
      return [];
    }
  }

  static async savepdfPages(
    fileId: string,
    pages: { index: number; markdown: string }[],
  ): Promise<void> {
    try {
      await db.pages.createMany({
        data: pages.map((page) => ({
          id: uuidv4(),
          pageNo: page.index + 1,
          pageContent: page.markdown,
          fileId: fileId,
        })),
      });
    } catch (e) {
      console.error("Error saving PDF pages:", e);
    }
  }

  static async processAndStoreChunks(
    filePath: string,
    fileId: string,
  ): Promise<void> {
    const chunks = await this.extractTextAndChunk(filePath, fileId);
    if (chunks.length === 0)
      return console.warn("No chunks extracted from PDF");

    await db.fileChunk.createMany({
      data: chunks.map((chunk) => ({
        id: chunk.id,
        fileId,
        content: chunk.content,
        page: chunk.page,
        startIndex: chunk.startIndex,
        endIndex: chunk.endIndex,
      })),
    });

    const Embedded = await import("./embedding-service");
    await Embedded.EmbeddingService.storeChunks(chunks, fileId);
  }

  static async reconstructDocument(
    fileID: string,
  ): Promise<{ pageNo: number; pageContent: string }[]> {
    const chunks = await db.pages.findMany({
      where: { fileId: fileID },
    });

    return chunks.map((chunk) => ({
      pageNo: chunk.pageNo,
      pageContent: chunk.pageContent,
    }));
  }
}
