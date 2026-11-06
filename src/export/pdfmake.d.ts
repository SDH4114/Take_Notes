// Minimal types for the browser builds we use (no official types for pdfmake 0.3 / html-to-pdfmake 2.x).
declare module 'pdfmake/build/pdfmake' {
  interface OutputDocument { getBlob(): Promise<Blob> }
  interface PdfMake {
    createPdf(doc: Record<string, unknown>, options?: Record<string, unknown>): OutputDocument;
    addVirtualFileSystem(vfs: Record<string, string>): void;
    setUrlAccessPolicy(cb: (url: string) => boolean): void;
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}
declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}
declare module 'html-to-pdfmake' {
  function htmlToPdfmake(html: string, options?: Record<string, unknown>): unknown;
  export default htmlToPdfmake;
}
