    import { Pinecone } from "@pinecone-database/pinecone";
    import type { ChunkData } from "./interfaces";

    interface Results {
      chunk_id: string,
      chunk_text: string,
    }

    export class EmbeddingService {
      private static pc = new Pinecone({ apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY! });

      static async queryByText(
        fileIds: string[],
        query: string,
        topK: number,
      ): Promise<Results[]> {
        try {
          const index = EmbeddingService.pc.index("sage-vector-index");

          const results = await index.searchRecords({
            query: { 
                topK: topK,
                inputs: { text: query },
             },
            fields: ["chunk_id", "file_id", "chunk_text"],
          });

          const processdArray: { chunk_id: string, file_id: string, chunk_text: string }[] = results.result.hits.map(
            (hit) => (hit as { fields: { chunk_id: string, file_id: string, chunk_text: string } }).fields
          );

          const chunkIds: Results[] = processdArray.filter(item => fileIds.includes(item.file_id)).map(item =>  ({ chunk_id: item.chunk_id, chunk_text: item.chunk_text }));

          return chunkIds;
        } catch (error) {
          console.error("Error querying index with text:", error);
          throw error;
        }
      }

      static  async storeChunks(chunks: ChunkData[], fileId: string) {
        try {
          const index = EmbeddingService.pc.index("sage-vector-index");
          
          const records = chunks.map((chunk) => ({
              _id: chunk.id,
              chunk_id: chunk.id,
              file_id: fileId,
              chunk_text: chunk.content,
          }));

          const batchSize = 96; 
          for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            await index.upsertRecords(batch);
          }
        } catch (error) {
          console.error("Error storing chunks:", error);
          throw error;
        }
      }
    }
