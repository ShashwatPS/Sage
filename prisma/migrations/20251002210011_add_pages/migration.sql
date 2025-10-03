/*
  Warnings:

  - Added the required column `page` to the `FileChunk` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."FileChunk" ADD COLUMN     "page" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "public"."Pages" (
    "id" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "pageContent" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "Pages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Pages" ADD CONSTRAINT "Pages_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
