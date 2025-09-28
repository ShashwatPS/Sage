import { google } from "@ai-sdk/google";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  streamText,
} from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/server/auth";
import { db } from "@/server/db";

const PROMPT = `
### IMPERATIVE:  
Analyze the following QUESTION with absolute precision. Your analysis must meet the highest standards of Research.  

## CITATION RULES (STRICTLY APPLY):  
- Source-Citations with Chunk Reference:  
  <citation chunk-id="[Chunk ID]">Finish</citation>  
- Always reference the specific chunk_id when citing information from document chunks
- Use the chunk_id provided in the <chunk chunk_id=[ID]></chunk> tags to create accurate citations
- Example citation: <citation chunk-id="abc123">Finish</citation>  

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

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await req.json()) as unknown;

    console.log("abhijeet body", body);
    const { message, chatId, fileIds } = requestSchema.parse(body);

    let currentChatId = chatId;
    let messageHistory: Array<{ role: "user" | "assistant"; content: string }> =
      [];

    // If chatId exists, load message history from database
    if (currentChatId) {
      const existingMessages = await db.message.findMany({
        where: { chatId: currentChatId },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      });

      messageHistory = existingMessages.map((msg) => ({
        role: msg.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      }));
    } else {
      // Create new chat for first message
      const chat = await db.chat.create({
        data: {
          userId: session.user.id,
          title: message.slice(0, 50) + (message.length > 50 ? "..." : ""),
        },
      });
      currentChatId = chat.id;
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

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Initialize Gemini model
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

        // Stream response from Gemini
        const result = streamText({
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
          experimental_transform: smoothStream(),
          onFinish: (e) => {
            console.log("finished streaming");
          },
        });

        writer.merge(result.toUIMessageStream());
        const fullText = await result.text;
        console.log("abhijeet fullText", fullText);
        writer.write({
          type: "data-chatId",
          data: {
            chatId: currentChatId,
          },
          transient: true,
        });

        if (fullText) {
          await db.message.create({
            data: {
              chatId: currentChatId,
              role: "ASSISTANT",
              content: fullText,
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
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
