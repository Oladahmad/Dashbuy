declare module "pdf-parse" {
  type PdfParseResult = {
    text: string;
    numpages: number;
  };

  export default function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
}

declare module "pdf2pic" {
  export function fromPath(
    filePath: string,
    options?: Record<string, unknown>
  ): (page: number, options?: Record<string, unknown>) => Promise<{ path?: string }>;
}
