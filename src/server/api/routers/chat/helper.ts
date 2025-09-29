import { supabase } from "@/lib/supabase";
import { db } from "@/server/db";
import { ChunkingService } from "@/lib/chunk-processor";

interface FileUploadResponse {
    id: string;
    name: string;
    type: string;
    size: number;
    path: string;
    url?: string;
  }
export async function uploadToSupabase(
    file: File,
    userId: string,
  ): Promise<FileUploadResponse> {
    const safeFileName = file.name.replace(/[^\w.]/gi, "_");
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const key = `${new Date().getTime()}-${randomSuffix}-${safeFileName}`;
  
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("files")
      .upload(key, file);
  
    if (uploadError || !uploadData) {
      console.error("Error uploading file to Supabase:", uploadError);
      throw new Error("Failed to upload file");
    }

    const dbFile = await db.file.create({
      data: {
        name: safeFileName,
        fileType: file.type || "application/octet-stream",
        supabaseFileId: uploadData.id,
        supabasePath: uploadData.path,
        size: file.size,
        userId,
      },
    });

    const ChunkService = await import('../../../../lib/chunk-processor');
    await ChunkService.ChunkingService.processAndStoreChunks(uploadData.path, dbFile.id);
  
    return {
      name: dbFile.name,
      size: dbFile.size,
      type: dbFile.fileType,
      path: dbFile.supabasePath,
      id: dbFile.id,
    };
  }

  export async function getDocByFileId(fileId: string): Promise<{ chunkId: string; text: string; startIndex: number; endIndex: number }[]> {
    const reconstructed = await ChunkingService.reconstructDocument(fileId);

    if (!reconstructed) {
      throw new Error("Failed to reconstruct document");
    }

    return reconstructed;
}
  