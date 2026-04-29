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

      const lines = (response.Blocks ?? [])
        .filter((block) => block.BlockType === "LINE" && block.Text)
        .map((block) => block.Text!.trim())
        .filter(Boolean);

      return cleanText(lines.join("\n"));
    })
  );

  return cleanText(pages.filter(Boolean).join("\n"));
}
