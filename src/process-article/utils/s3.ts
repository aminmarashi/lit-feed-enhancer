export function sanitizeUrlForS3Key(url: string) {
  return url.replace(/[^a-zA-Z0-9]/g, "-");
}
