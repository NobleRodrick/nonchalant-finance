export function generateTempPassword() {
  return `Pass#${Math.floor(1000 + Math.random() * 9000)}`;
}
