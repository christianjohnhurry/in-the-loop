export function greet(name: string): string {
  if (!name) return 'Hello, stranger!';
  return `Hello, ${name}!`;
}

export function shout(name: string): string {
  return greet(name).toUpperCase();
}
