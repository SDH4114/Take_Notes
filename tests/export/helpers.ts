import { unzipSync } from 'fflate';

// jsdom's Blob lacks arrayBuffer()/stream(); FileReader works everywhere.
export const readBlob = (b: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });

export const readText = async (b: Blob) => new TextDecoder().decode(await readBlob(b));
export const unzipBlob = async (b: Blob) => unzipSync(new Uint8Array(await readBlob(b)));
