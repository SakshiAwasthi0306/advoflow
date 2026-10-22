import { promises as fs } from "node:fs";
import path from "node:path";
import { get as blobGet, put as blobPut } from "@vercel/blob";

/**
 * Private document storage on local disk (demo/dev). Files are written outside /public
 * and are only served through an authenticated route that checks the office.
 * For production, use BlobDocumentStorage (or another private object store).
 */
export interface DocumentStorage {
  put(officeId: string, sha: string, ext: string, bytes: Uint8Array): Promise<string>;
  get(key: string): Promise<Buffer>;
}

function documentKey(officeId: string, sha: string, ext: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(officeId) || !/^[a-f0-9]{64}$/.test(sha) || !/^[a-z]{2,4}$/.test(ext)) throw new Error("Invalid storage arguments");
  return `${officeId}/${sha}.${ext}`;
}

export class LocalDocumentStorage implements DocumentStorage {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(officeId: string, sha: string, ext: string, bytes: Uint8Array): Promise<string> {
    const key = documentKey(officeId, sha, ext);
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes, { mode: 0o600 });
    return key;
  }
  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }
}

/**
 * Private Vercel Blob store (used when BLOB_READ_WRITE_TOKEN is set). Blobs are private, so their URLs
 * are useless without the token; files are still served only through the authenticated documents route.
 * Keys are content-addressed, so re-uploading the same file overwrites identical bytes.
 */
export class BlobDocumentStorage implements DocumentStorage {
  async put(officeId: string, sha: string, ext: string, bytes: Uint8Array): Promise<string> {
    const key = documentKey(officeId, sha, ext);
    await blobPut(`documents/${key}`, Buffer.from(bytes), { access: "private", addRandomSuffix: false, allowOverwrite: true });
    return key;
  }
  async get(key: string): Promise<Buffer> {
    if (!/^[A-Za-z0-9_-]+\/[a-f0-9]{64}\.[a-z]{2,4}$/.test(key)) throw new Error("Invalid storage key");
    const res = await blobGet(`documents/${key}`, { access: "private" });
    if (!res || res.statusCode !== 200) throw new Error("Document not found in storage");
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
}
