export function escapeLucene(str: string): string {
  return str.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, '\\$&');
}
