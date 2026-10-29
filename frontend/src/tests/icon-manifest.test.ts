// R1-E05-T01: the generated icon manifest (DATA_MODEL_R1 §6).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AZURE_PACK, DATA_PACK, GCP_PACK } from '../canvas/ShapeRegistry';

interface ManifestIcon { id: string; set: string; name: string; keywords: string[]; kinds: string[]; src: string }
interface Manifest { version: number; sets: Record<string, { label: string; license: string; source: string }>; icons: ManifestIcon[] }

const PUBLIC = join(__dirname, '..', '..', 'public');
const manifest = JSON.parse(readFileSync(join(PUBLIC, 'icons', 'manifest.json'), 'utf8')) as Manifest;

describe('icon manifest', () => {
  it('every icon has unique id, name and existing src', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.icons.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const icon of manifest.icons) {
      expect(ids.has(icon.id), `duplicate id ${icon.id}`).toBe(false);
      ids.add(icon.id);
      const nameKey = `${icon.set}:${icon.name}`;
      expect(icon.name.trim().length, `empty name for ${icon.id}`).toBeGreaterThan(0);
      expect(names.has(nameKey), `duplicate name ${nameKey}`).toBe(false);
      names.add(nameKey);
      expect(manifest.sets[icon.set], `set ${icon.set} has no license entry`).toBeDefined();
      expect(icon.src.startsWith('/icons/')).toBe(true);
      expect(existsSync(join(PUBLIC, icon.src)), `missing file for ${icon.src}`).toBe(true);
    }
    for (const set of Object.values(manifest.sets)) expect(set.license.length).toBeGreaterThan(0);
  });

  it('no placeholder gcp/azure/data icons remain', () => {
    const placeholder = /^\/icons\/(gcp|azure|data)\//;
    expect(Object.keys(manifest.sets).filter((s) => s === 'gcp' || s === 'azure' || s === 'data')).toEqual([]);
    expect(manifest.icons.filter((i) => placeholder.test(i.src))).toEqual([]);
    const packSrcs = [GCP_PACK, AZURE_PACK, DATA_PACK].flatMap((p) => p.shapes.map((s) => s.iconSrc));
    expect(packSrcs.filter((src) => src !== undefined)).toEqual([]);
    // R1-E05-T06: the folders are gone and nothing in src/ points at them.
    for (const dir of ['gcp', 'azure', 'data']) expect(existsSync(join(PUBLIC, 'icons', dir))).toBe(false);
    const SRC = join(__dirname, '..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|css|json)$/.test(entry.name) && full !== __filename) {
          if (/\/icons\/(gcp|azure|data)\//.test(readFileSync(full, 'utf8'))) hits.push(full.slice(SRC.length + 1));
        }
      }
    };
    walk(SRC);
    expect(hits).toEqual([]);
  });

  it('rds maps to kind database', () => {
    const rds = manifest.icons.find((i) => i.id === 'aws/amazon-rds');
    expect(rds).toBeDefined();
    expect(rds?.name).toBe('Amazon RDS');
    expect(rds?.src).toBe('/icons/aws/amazon-rds.svg');
    expect(rds?.kinds).toContain('database');
    expect(rds?.keywords).toContain('postgres');
  });

  it('k8s set has license entry', () => {
    expect(manifest.sets.k8s).toMatchObject({ label: 'Kubernetes', license: 'Apache-2.0' });
    expect(manifest.sets.k8s?.source).toContain('kubernetes/community');
    expect(existsSync(join(__dirname, '..', '..', 'vendor', 'k8s-icons', 'LICENSE'))).toBe(true);
  });

  it('every k8s icon resolves to a file and maps to a kind where specified', () => {
    const k8s = manifest.icons.filter((i) => i.set === 'k8s');
    expect(k8s.length).toBeGreaterThan(0);
    for (const icon of k8s) {
      expect(icon.id.startsWith('k8s/')).toBe(true);
      expect(icon.src).toBe(`/icons/k8s/${icon.id.slice(4)}.svg`);
      expect(existsSync(join(PUBLIC, icon.src)), `missing file for ${icon.src}`).toBe(true);
    }
    const kindOf = (id: string) => k8s.find((i) => i.id === id)?.kinds;
    expect(kindOf('k8s/pod')).toEqual(['service']);
    expect(kindOf('k8s/svc')).toEqual(['gateway']);
    expect(kindOf('k8s/ing')).toEqual(['gateway']);
    expect(kindOf('k8s/pv')).toEqual(['object-storage']);
  });
});
