export function redirect(url) {
  throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;${url}` });
}
export function notFound() {
  throw new Error("NEXT_NOT_FOUND");
}
