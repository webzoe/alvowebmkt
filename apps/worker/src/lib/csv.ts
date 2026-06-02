export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  separator: ',' | ';';
  rowCount: number;
}

export interface ColumnMapping {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  /** Column whose value will be auto-split into first_name + last_name */
  full_name?: string | null;
}

export interface AutoDetectResult {
  mapping: ColumnMapping;
  /** Columns not mapped to any standard field — will be saved in custom_fields */
  extra_columns: string[];
}

export interface MappedContact {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  custom_fields: Record<string, string>;
}

// ─── Header synonym dictionaries ─────────────────────────────────────────────

const EMAIL_SYN = [
  'email', 'e-mail', 'mail', 'e_mail',
  'endereço de email', 'endereço de e-mail',
  'email_address', 'endereco', 'endereço',
];
const FIRST_NAME_SYN = [
  'nome', 'first_name', 'firstname', 'primeiro_nome',
  'primeiro nome', 'name', 'given_name', 'given name',
];
const LAST_NAME_SYN = [
  'sobrenome', 'last_name', 'lastname', 'ultimo_nome',
  'último_nome', 'último nome', 'surname', 'family_name',
];
const FULL_NAME_SYN = [
  'nome completo', 'full_name', 'fullname', 'nome_completo', 'full name',
];
const PHONE_SYN = [
  'telefone', 'phone', 'celular', 'whatsapp', 'whats', 'mobile', 'tel', 'fone',
];

function normalize(h: string): string {
  return h.toLowerCase().trim();
}

// ─── Auto-detect ─────────────────────────────────────────────────────────────

export function autoDetectMapping(headers: string[]): AutoDetectResult {
  const mapping: ColumnMapping = {
    email: null, first_name: null, last_name: null, phone: null, full_name: null,
  };
  const mapped = new Set<string>();

  for (const header of headers) {
    const n = normalize(header);

    if (!mapping.email && EMAIL_SYN.includes(n)) {
      mapping.email = header; mapped.add(header); continue;
    }
    if (!mapping.full_name && FULL_NAME_SYN.includes(n)) {
      mapping.full_name = header; mapped.add(header); continue;
    }
    if (!mapping.first_name && FIRST_NAME_SYN.includes(n)) {
      mapping.first_name = header; mapped.add(header); continue;
    }
    if (!mapping.last_name && LAST_NAME_SYN.includes(n)) {
      mapping.last_name = header; mapped.add(header); continue;
    }
    if (!mapping.phone && PHONE_SYN.includes(n)) {
      mapping.phone = header; mapped.add(header); continue;
    }
  }

  const extra_columns = headers.filter(h => !mapped.has(h));
  return { mapping, extra_columns };
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseRow(line: string, sep: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      fields.push(current.trim()); current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseCsv(raw: string): CsvParseResult {
  const content = raw.startsWith('﻿') ? raw.slice(1) : raw;
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());

  if (lines.length === 0) return { headers: [], rows: [], separator: ',', rowCount: 0 };

  const first = lines[0];
  const commas = (first.match(/,/g) ?? []).length;
  const semis  = (first.match(/;/g) ?? []).length;
  const separator: ',' | ';' = semis > commas ? ';' : ',';

  const headers = parseRow(first, separator);
  const rows    = lines.slice(1).map(l => parseRow(l, separator));

  return { headers, rows, separator, rowCount: rows.length };
}

// ─── Contact builder ──────────────────────────────────────────────────────────

export function buildContacts(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
): MappedContact[] {
  // All mapped column names (email, first_name, last_name, phone, full_name)
  const mappedCols = new Set(Object.values(mapping).filter(Boolean) as string[]);

  const idxOf = (col: string | null | undefined): number =>
    col ? headers.indexOf(col) : -1;

  const emailIdx    = idxOf(mapping.email);
  const fnIdx       = idxOf(mapping.first_name);
  const lnIdx       = idxOf(mapping.last_name);
  const phoneIdx    = idxOf(mapping.phone);
  const fullNameIdx = idxOf(mapping.full_name);

  return rows
    .map(row => {
      const get = (i: number): string | null =>
        i >= 0 ? (row[i]?.trim().replace(/\s+/g, ' ') || null) : null;

      const rawEmail = get(emailIdx);
      if (!rawEmail) return null;

      const email = rawEmail.toLowerCase().trim();
      if (!isValidEmail(email)) return null;

      // Build first/last from dedicated columns
      let first_name = get(fnIdx);
      let last_name  = get(lnIdx);

      // If a full_name column is explicitly mapped, split it
      if (!first_name && !last_name) {
        const full = get(fullNameIdx);
        if (full) {
          const parts = full.split(' ').filter(Boolean);
          first_name = parts[0] ?? null;
          last_name  = parts.length > 1 ? parts.slice(1).join(' ') : null;
        }
      }

      // Auto-split if first_name looks like a full name (has space) and last_name absent
      if (first_name && first_name.includes(' ') && !last_name) {
        const parts = first_name.split(' ').filter(Boolean);
        first_name = parts[0];
        last_name  = parts.slice(1).join(' ') || null;
      }

      const phone = get(phoneIdx)
        ? get(phoneIdx)!.replace(/\s+/g, '').replace(/[^\d+\-()]/g, '')
        : null;

      // Extra columns → custom_fields
      const custom_fields: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (!mappedCols.has(h)) {
          const val = row[i]?.trim();
          if (val) custom_fields[h] = val;
        }
      });

      return { email, first_name, last_name, phone, custom_fields } satisfies MappedContact;
    })
    .filter((c): c is MappedContact => c !== null);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
