import { DetectDocumentTextCommand, TextractClient } from "@aws-sdk/client-textract";
import type { IngestedMenuUpload } from "./types";
import { cleanText } from "./utils";

let textractClient: TextractClient | null = null;

function getTextractConfig() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
  const sessionToken = process.env.AWS_SESSION_TOKEN || "";

  if (!region || !accessKeyId || !secretAccessKey) return null;

  return {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  };
}

function getTextractClient() {
  if (textractClient) return textractClient;
  const config = getTextractConfig();
  if (!config) return null;
  textractClient = new TextractClient(config);
  return textractClient;
}

function sortByReadingOrder<T extends { top: number; left: number }>(entries: T[]) {
  return [...entries].sort((a, b) => {
    if (Math.abs(a.top - b.top) > 0.012) return a.top - b.top;
    return a.left - b.left;
  });
}

export async function extractMenuTextWithAwsTextract(upload: IngestedMenuUpload) {
  if (upload.pageImages.length === 0) return "";

  const client = getTextractClient();
  if (!client) return "";

  const pages = await Promise.all(
    upload.pageImages.map(async (image) => {
      const response = await client.send(
        new DetectDocumentTextCommand({
          Document: {
            Bytes: new Uint8Array(image.buffer),
          },
        })
      );

      const blocks = response.Blocks ?? [];

      const lines = sortByReadingOrder(
        blocks
          .filter((block) => block.BlockType === "LINE" && block.Text)
          .map((block) => ({
            text: block.Text!.trim(),
            top: block.Geometry?.BoundingBox?.Top ?? 0,
            left: block.Geometry?.BoundingBox?.Left ?? 0,
          }))
      )
        .map((block) => block.text)
        .filter(Boolean);

      const words = sortByReadingOrder(
        blocks
          .filter((block) => block.BlockType === "WORD" && block.Text)
          .map((block) => ({
            text: block.Text!.trim(),
            top: block.Geometry?.BoundingBox?.Top ?? 0,
            left: block.Geometry?.BoundingBox?.Left ?? 0,
          }))
      );

      const reconstructedRows: string[] = [];
      let activeRow: { top: number; words: string[] } | null = null;
      for (const word of words) {
        if (!word.text) continue;
        if (!activeRow || Math.abs(activeRow.top - word.top) > 0.012) {
          if (activeRow?.words.length) reconstructedRows.push(activeRow.words.join(" "));
          activeRow = { top: word.top, words: [word.text] };
          continue;
        }
        activeRow.words.push(word.text);
      }
      if (activeRow?.words.length) reconstructedRows.push(activeRow.words.join(" "));

      return cleanText([...lines, ...reconstructedRows].filter(Boolean).join("\n"));
    })
  );

  return cleanText(pages.filter(Boolean).join("\n"));
}
