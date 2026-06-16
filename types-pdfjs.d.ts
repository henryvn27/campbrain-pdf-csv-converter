declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };

  export function getDocument(source: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(options?: { includeMarkedContent?: boolean }): Promise<{ items: unknown[] }>;
      }>;
    }>;
  };
}
