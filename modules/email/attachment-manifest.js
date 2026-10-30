'use strict';
const MIME = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
function filename(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 &&
    !/[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value) && !['.', '..'].includes(value) ? value : null;
}
function manifest(parts) {
  if (!Array.isArray(parts) || parts.length > 50 || Array.from(parts).some(part => !part || typeof part !== 'object' || Array.isArray(part) ||
    !['filename', 'contentType', 'size', 'contentDisposition', 'content', 'related'].some(key => Object.hasOwn(part, key)))) {
    return { attachment_manifest: null, attachment_manifest_origin: null };
  }
  return { attachment_manifest_origin: 'parsed_mime_metadata', attachment_manifest: parts.map((part, index) => ({
    part_index: index,
    filename: filename(part.filename),
    content_type: typeof part.contentType === 'string' && part.contentType.length <= 127 && MIME.test(part.contentType) ? part.contentType : null,
    size_bytes: Number.isSafeInteger(part.size) && part.size >= 0 && part.size <= 2 * 1024 * 1024 ? part.size : null,
    disposition: ['attachment', 'inline'].includes(part.contentDisposition) ? part.contentDisposition : null,
    related: typeof part.related === 'boolean' ? part.related : null
  })) };
}
module.exports = { manifest };
