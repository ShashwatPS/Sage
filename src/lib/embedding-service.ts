    import { Pinecone } from "@pinecone-database/pinecone";
    import type { ChunkData } from "../interfaces/chunkData";
    import type { Results } from "../interfaces/results";

    export class EmbeddingService {
      private static pc = new Pinecone({ apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY! });

      static async queryByText(
        fileIds: string[],
        query: string,
        topK = 10,
      ): Promise<Results[]> {
        try {
          const index = EmbeddingService.pc.index("sage-vector-index");

          const results = await index.searchRecords({
            query: { 
                topK: topK,
                inputs: { text: query },
                filter: {
                  file_id: { $in: fileIds },
                },
             },
            fields: ["chunk_id", "file_id", "chunk_text"],
          });

          const chunkIds: Results[] = results.result.hits.map(
            (hit) => (hit as { fields: { chunk_id: string, chunk_text: string } }).fields
          );

          console.log("FileIds check: ", fileIds);
          console.log("Processed Array: ", chunkIds);

          return chunkIds;
        } catch (error) {
          console.error("Error querying index with text:", error);
          throw error;
        }
      }

      static async storeChunks(chunks: ChunkData[], fileId: string) {
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
