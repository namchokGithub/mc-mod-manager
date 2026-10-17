// Minimal read-only ZIP reader for .jar metadata. It only inflates small text entries and never
// executes or uploads anything. ZIP64 and encrypted entries are reported as unsupported.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN = 22;
const EOCD_SEARCH = EOCD_MIN + 0xffff;

export const MAX_ENTRY_BYTES = 1024 * 1024;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
  encrypted: boolean;
};

async function bytes(
  blob: Blob,
  start: number,
  end: number,
): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

export async function listEntries(blob: Blob): Promise<ZipEntry[]> {
  if (blob.size < EOCD_MIN)
    throw new ZipError("The file is too small to be a JAR.");
  const tailStart = Math.max(0, blob.size - EOCD_SEARCH);
  const tail = await bytes(blob, tailStart, blob.size);
  let eocd = -1;
  for (let offset = tail.byteLength - EOCD_MIN; offset >= 0; offset -= 1) {
    if (tail.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0)
    throw new ZipError("The file is not a valid JAR (ZIP) archive.");
  const count = tail.getUint16(eocd + 10, true);
  const directorySize = tail.getUint32(eocd + 12, true);
  const directoryOffset = tail.getUint32(eocd + 16, true);
  if (
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  )
    throw new ZipError("ZIP64 archives are not supported.");
  if (directoryOffset + directorySize > blob.size)
    throw new ZipError("The JAR's file directory is damaged.");

  const directory = await bytes(
    blob,
    directoryOffset,
    directoryOffset + directorySize,
  );
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    if (
      cursor + 46 > directory.byteLength ||
      directory.getUint32(cursor, true) !== CENTRAL_SIGNATURE
    )
      throw new ZipError("The JAR's file directory is damaged.");
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    const nameBytes = new Uint8Array(
      directory.buffer,
      directory.byteOffset + cursor + 46,
      nameLength,
    );
    entries.push({
      name: decoder.decode(nameBytes),
      encrypted: (directory.getUint16(cursor + 8, true) & 1) === 1,
      method: directory.getUint16(cursor + 10, true),
      compressedSize: directory.getUint32(cursor + 20, true),
      size: directory.getUint32(cursor + 24, true),
      localOffset: directory.getUint32(cursor + 42, true),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    // Stop early on zip bombs instead of trusting the declared size.
    if (total > limit) {
      await reader.cancel();
      throw new ZipError(
        "A metadata file inside the JAR is unexpectedly large.",
      );
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readEntry(
  blob: Blob,
  entry: ZipEntry,
  limit = MAX_ENTRY_BYTES,
): Promise<Uint8Array> {
  if (entry.encrypted) throw new ZipError(`${entry.name} is encrypted.`);
  if (entry.size > limit || entry.compressedSize > limit)
    throw new ZipError(`${entry.name} is unexpectedly large.`);
  const header = await bytes(blob, entry.localOffset, entry.localOffset + 30);
  if (header.byteLength < 30 || header.getUint32(0, true) !== LOCAL_SIGNATURE)
    throw new ZipError(`${entry.name} could not be located in the JAR.`);
  const start =
    entry.localOffset +
    30 +
    header.getUint16(26, true) +
    header.getUint16(28, true);
  const raw = new Uint8Array(
    await blob.slice(start, start + entry.compressedSize).arrayBuffer(),
  );
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflate(raw, limit);
  throw new ZipError(`${entry.name} uses an unsupported compression method.`);
}

/** Reads the named text entries that exist; missing names are simply absent from the result. */
export async function readTextEntries(
  blob: Blob,
  names: string[],
): Promise<Map<string, string>> {
  const wanted = new Set(names);
  const decoder = new TextDecoder();
  const result = new Map<string, string>();
  for (const entry of await listEntries(blob)) {
    if (!wanted.has(entry.name)) continue;
    result.set(
      entry.name,
      decoder.decode(await readEntry(blob, entry)).replace(/^\uFEFF/, ""),
    );
  }
  return result;
}
