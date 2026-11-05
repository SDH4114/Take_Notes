import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function fixtureHtml(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');
}

export function fixtureDoc(name: string): Document {
  return new DOMParser().parseFromString(fixtureHtml(name), 'text/html');
}
