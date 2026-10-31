// SERVICES_SPEC §P9/P9a (2026-10-31): the composed CSP allows reCAPTCHA (Firebase on) and Google Fonts.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = readFileSync(resolve(__dirname, '../../docker/40-archflux-runtime.sh'), 'utf8');

function composePolicy(env: Record<string, string>): Map<string, string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'csp-'));
  const patched = script
    .replaceAll('/etc/nginx/archflux', join(dir, 'conf'))
    .replaceAll('/usr/share/nginx/html', dir);
  const file = join(dir, 'run.sh');
  writeFileSync(file, patched);
  execFileSync('sh', [file], { env: { PATH: process.env.PATH ?? '', ...env } });
  const conf = readFileSync(join(dir, 'conf', 'runtime.conf'), 'utf8');
  const m = /set \$archflux_csp "([^"]*)";/.exec(conf);
  expect(m).not.toBeNull();
  const out = new Map<string, string[]>();
  for (const part of m![1].split(';')) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) out.set(name, vals);
  }
  return out;
}

const firebase = {
  FIREBASE_API_KEY: 'test-key',
  FIREBASE_AUTH_DOMAIN: 'x.firebaseapp.com',
  FIREBASE_PROJECT_ID: 'x',
  FIREBASE_APP_ID: '1:2:web:3',
};

describe('content security policy', () => {
  it('base policy allows Google Fonts and nothing from reCAPTCHA', () => {
    const p = composePolicy({});
    expect(p.get('style-src')).toContain('https://fonts.googleapis.com');
    expect(p.get('style-src')).toContain("'unsafe-inline'");
    expect(p.get('font-src')).toContain('https://fonts.gstatic.com');
    expect(p.get('font-src')).toContain('data:');
    expect(p.get('style-src')?.join(' ')).not.toContain('gstatic.com/recaptcha');
    expect(p.get('connect-src')?.join(' ')).not.toContain('recaptcha');
  });

  it('Firebase on allows the reCAPTCHA style sheet, fallback script and connect origins', () => {
    const p = composePolicy(firebase);
    expect(p.get('style-src')).toContain('https://fonts.googleapis.com');
    expect(p.get('style-src')?.join(' ')).toContain('https://www.gstatic.com');
    expect(p.get('font-src')).toContain('https://fonts.gstatic.com');
    expect(p.get('connect-src')).toContain('https://www.recaptcha.net');
    expect(p.get('connect-src')).toContain('https://www.google.com/recaptcha/');
    expect(p.get('script-src')).toContain('https://www.recaptcha.net/recaptcha/');
  });

  it('keeps default-src self, object-src none and no unsafe-eval', () => {
    for (const env of [{}, firebase]) {
      const p = composePolicy(env);
      expect(p.get('default-src')).toEqual(["'self'"]);
      expect(p.get('object-src')).toEqual(["'none'"]);
      expect([...p.values()].flat()).not.toContain("'unsafe-eval'");
    }
  });
});
