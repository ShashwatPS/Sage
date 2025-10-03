import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import markdownToTxt from 'markdown-to-txt';

import { auth } from "@/server/auth";
import { db } from "@/server/db";

const PROMPT = `
### IMPERATIVE:  
Analyze the following QUESTION with absolute precision. Your analysis must meet the highest standards of Research.  

## CITATION RULES (STRICTLY APPLY):  
- Source-Citations with Chunk Reference:  
  <citation chunk-id="[Chunk ID]"></citation>  
- Always reference the specific chunk_id when citing information from document chunks
- Use the chunk_id provided in the <chunk chunk_id=[ID]></chunk> tags to create accurate citations
- Example citation: <citation chunk-id="abc123"></citation>  

## CHUNK PROCESSING INSTRUCTIONS:
- Each document chunk is provided with a unique chunk_id in the format <chunk chunk_id=[ID]></chunk>
- When referencing information from a chunk, always include the chunk_id in your citation
- Use chunk_id to maintain traceability between your response and the source material
- If multiple chunks contain relevant information, cite each chunk_id separately

## MANDATORY ANALYSIS CRITERIA:  
- Exclusively rely on the provided files and chunks
- Fully account for the chat history to ensure contextual continuity  
- Reference specific chunk_ids when making claims or providing information

If the facts are complete and the sources sufficient, answer the question without reservations or disclaimers.  
`;

const requestSchema = z.object({
  message: z.string(),
  chatId: z.string().optional(),
  fileIds: z.array(z.string()).optional(),
});

const validateChunk = async (id: string): Promise<{ content: string; page: number; startIndex: number; endIndex: number; fileId: string } | false> => {
  try {
    const data = await db.fileChunk.findUnique({
      where: { id },
      select: { content: true, page: true, startIndex: true, endIndex: true, fileId: true },
    });
    if (data) {
      return data;
    }
    return false;
  } catch (error) {
    console.error(`Database error for chunk ID: ${id}`, error);
    return false;
  }
};

const removeIncompleteCitations = (text: string): string => {
  const completeCitationRegex = /<citation\s+chunk-id="[^"]*"(?:\s+cited-text="[^"]*")?(?:\s+start-index="[^"]*")?(?:\s+end-index="[^"]*")?(?:\s+page="[^"]*")?(?:\s+file="[^"]*")?\>\[?\d*\]?<\/citation>/g;
  
  const lastCitationStart = text.lastIndexOf('<citation');
  
  if (lastCitationStart === -1) {
    return text;
  }
  
  const textFromLastCitation = text.substring(lastCitationStart);
  const hasCompleteCitation = completeCitationRegex.test(textFromLastCitation);
  
  if (!hasCompleteCitation) {
    return text.substring(0, lastCitationStart);
  }
  
  return text;
};


const processCitationsInText = async (text: string): Promise<string> => {
  const citationRegex =
    /<citation\s+chunk-id="([^"]+)">([\s\S]*?)<\/citation>/g;

  const chunkIds = new Set<string>();
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    chunkIds.add(match[1]!);
  }

  console.log("Citation regex matches:", Array.from(chunkIds));
  console.log("Unique chunk IDs found:", chunkIds);

  const validationResults = new Map<string, boolean | { content: string; page: number; startIndex: number; endIndex: number, fileId: string }>();
  const validationPromises = Array.from(chunkIds).map(async (chunkId) => {
    const isValid = await validateChunk(chunkId);
    validationResults.set(chunkId, isValid);
  });

  await Promise.all(validationPromises);

  let citationCount = 1;
  const citationMap = new Map<string, number>();
  const processedText = text.replace(
    citationRegex,
    (fullMatch, chunkId: string) => {
      if (!citationMap.has(chunkId)) {
        citationMap.set(chunkId, citationCount++);
      }
      const citationNumber = citationMap.get(chunkId);

      const isValid = validationResults.get(chunkId);

      if (typeof isValid === "object") {
        const escapedContent = markdownToTxt(isValid.content).replace(/\s+/g, ' ').trim().slice(0, 100) + (markdownToTxt(isValid.content).replace(/\s+/g, ' ').trim().length > 100 ? "..." : "");
        return `<citation chunk-id="${chunkId}" cited-text="${escapedContent}" start-index="${isValid.startIndex}" end-index="${isValid.endIndex}" page="${isValid.page}" file="${isValid.fileId}">[${citationNumber}]</citation>`;
      } else {
        console.warn(`Removing invalid citation: ${chunkId}`);
        return "";
      }
    },
  );

  return processedText;
};

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await req.json()) as unknown;
    console.log("abhijeet body", body);
    const { message, chatId, fileIds } = requestSchema.parse(body);

    const currentChatId = chatId;
    let messageHistory: Array<{ role: "user" | "assistant"; content: string }> =
      [];

    // If chatId exists, load message history from database
    if (currentChatId) {
      const existingMessages = await db.message.findMany({
        where: { chatId: currentChatId },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      });

      if (existingMessages.length === 0) {
        await db.chat.update({
          where: { id: currentChatId },
          data: {
            title: message.slice(0, 50) + (message.length > 50 ? "..." : ""),
          },
        });
      }

      messageHistory = existingMessages.map((msg) => ({
        role: msg.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      }));
    } else {
      throw new Error("Chat ID is required to send a message");
    }

    const oldFilesID = await db.chat.findMany({
      where: {
        id: chatId,
      },
      select: {
        messages: {
          select: {
            messageSources: {
              select: {
                fileId: true,
              },
            },
          },
        },
      },
    });

    const combinedFileIds = Array.from(
      new Set([
        ...(fileIds ?? []),
        ...(chatId
          ? oldFilesID
              .flatMap((chat) =>
                chat.messages.flatMap((message) =>
                  message.messageSources.map((source) => source.fileId),
                ),
              )
              .filter((fileId) => !(fileIds ?? []).includes(fileId))
          : []),
      ]),
    );

    console.log("Combined FileIds12", combinedFileIds);
    console.log("FileIds", fileIds);

    // Save user message to database
    await db.message.create({
      data: {
        chatId: currentChatId,
        role: "USER",
        content: message,
        messageFiles: {
          createMany: {
            data:
              fileIds?.map((fileId) => ({
                fileId,
              })) ?? [],
          },
        },
      },
    });

    const EmbeddedService = await import("../../../lib/embedding-service");

    const relevantChunks = await EmbeddedService.EmbeddingService.queryByText(
      combinedFileIds ?? [],
      message,
    );

    console.log("Relevant Chunks:", relevantChunks);

    const model = google("gemini-2.5-flash");

    const userPrompt =
      messageHistory
        .map((msg) => {
          return `${msg.role}: ${msg.content}`;
        })
        .join("\n") +
      "\n\n" +
      relevantChunks
        .map((chunk) => {
          return `<chunk chunk_id=[${chunk.chunk_id}]></chunk>`;
        })
        .join("\n") +
      "\n\n";

    console.log("\n\n User prompt \n\n", userPrompt);
    console.log("\n\n Relevant Chunks \n\n ", relevantChunks);

    // Non-streaming response from Gemini
    const result = await generateText({
      model,
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            ...relevantChunks.map((chunk) => ({
              type: "text" as const,
              chunk_id: chunk.chunk_id,
              text: chunk.chunk_text,
            })),
          ],
        },
      ],
      temperature: 0.7,
    });

    const fullText = result.text;

    const encoder = new TextEncoder();

    console.log("Full Text before processing:", fullText);
    const processedText = await processCitationsInText(fullText);
    console.log("Processed Text:", processedText);

    if (processedText) {
      await db.message.create({
        data: {
          chatId: currentChatId,
          role: "ASSISTANT",
          content: processedText,
          messageSources: {
            createMany: {
              data:
                combinedFileIds?.map((fileId) => ({
                  fileId,
                })) ?? [],
            },
          },
        },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        let cumulative = "";
        const chunkSize = 100;

        for (let i = 0; i < processedText.length; i += chunkSize) {
          cumulative = processedText.substring(0, i + chunkSize);
          const cleanedText = removeIncompleteCitations(cumulative);
          controller.enqueue(encoder.encode(cleanedText));
          await new Promise((res) => setTimeout(res, 100));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
