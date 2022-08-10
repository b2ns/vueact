export function isTextType(mimeType) {
  return /^text\/|^application\/(javascript|json)/.test(mimeType);
}
