import { draftInput } from './domain';

export function versionPath(id, tail = '') {
  return `versions/${encodeURIComponent(id)}${tail}`;
}

export function fileUrl(version, fileId = 'pdf', download = false) {
  return `/api/${versionPath(version.id, `/files/${encodeURIComponent(fileId)}`)}${download ? '?download=1' : ''}`;
}

export async function api(url, method = 'GET', body, options = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['X-JDIH-State'] = options.snapshot === false ? '0' : '1';
    if (method !== 'PUT') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      headers['Idempotency-Key'] = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  }
  if (body instanceof Blob) {
    headers['Upload-Offset'] = String(options.offset);
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch(`/api/${url}`, { method, body, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Permintaan gagal diproses.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function uploadChunkedFile({ version, file, kind, onProgress, onState }) {
  if (!file) return null;
  if (kind === 'PDF') {
    if (!/\.pdf$/i.test(file.name)) {
      throw new Error('Berkas utama harus PDF');
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('Ukuran berkas maksimal 20 MB.');
    }
  }
  const base = versionPath(version.id, '/files');
  const draft = draftInput(version);
  onProgress?.(0);

  const { uploadId, chunkSize } = await api(base, 'POST', { name: file.name, size: file.size, kind }, { snapshot: false });
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    let result;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await api(`${base}/${uploadId}`, 'PUT', chunk, { offset, snapshot: false });
        break;
      } catch (error) {
        if (attempt || (error.status && error.status < 500)) throw error;
      }
    }
    if (result.offset <= offset) {
      throw new Error('Kemajuan unggahan tidak valid.');
    }
    offset = result.offset;
    onProgress?.(Math.round((offset / file.size) * 100));
  }

  const fresh = await api(versionPath(version.id));
  if (fresh.edit_version !== draft.edit_version) {
    throw new Error('Berkas tersimpan. Salin perubahan yang belum disimpan, lalu muat ulang draf yang sudah berubah.');
  }
  const merged = { ...fresh, ...draft };
  onState?.((prev) => ({
    ...prev,
    versions: prev.versions.map((item) => (item.id === version.id ? merged : item)),
  }));
  return merged;
}
