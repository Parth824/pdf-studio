// Small, standards-compliant stored ZIP writer. Files remain in the browser.
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size: number) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}
export async function zipDownloads(files: { name: string; blob: Blob }[]) {
  if (files.reduce((sum, f) => sum + f.blob.size, 0) > 200 * 1024 * 1024)
    throw new Error(
      "Download files individually when the combined output exceeds 200 MB.",
    );
  const chunks: BlobPart[] = [],
    central: BlobPart[] = [];
  let offset = 0,
    centralSize = 0;
  for (const [i, file] of files.entries()) {
    const name = new TextEncoder().encode(`${i + 1}-${file.name}`),
      data = new Uint8Array(await file.blob.arrayBuffer()),
      crc = crc32(data);
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x800, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    chunks.push(local.bytes, name, data);
    const entry = header(46);
    entry.view.setUint32(0, 0x02014b50, true);
    entry.view.setUint16(4, 20, true);
    entry.view.setUint16(6, 20, true);
    entry.view.setUint16(8, 0x800, true);
    entry.view.setUint32(16, crc, true);
    entry.view.setUint32(20, data.length, true);
    entry.view.setUint32(24, data.length, true);
    entry.view.setUint16(28, name.length, true);
    entry.view.setUint32(42, offset, true);
    central.push(entry.bytes, name);
    centralSize += 46 + name.length;
    offset += 30 + name.length + data.length;
  }
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end.bytes], {
    type: "application/zip",
  });
}
