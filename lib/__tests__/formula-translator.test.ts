import { describe, it, expect } from 'vitest';
import { translateFormula, splitTopLevel, quoteIdent } from '../db/records';

// ═══════════════════════════════════════════════════════════════
// splitTopLevel
// ═══════════════════════════════════════════════════════════════
describe('splitTopLevel', () => {
  it('splits simple comma-separated expressions', () => {
    expect(splitTopLevel('{A} = "1", {B} = "2"')).toEqual(['{A} = "1"', '{B} = "2"']);
  });

  it('ignores commas inside parentheses', () => {
    expect(splitTopLevel('OR({A} = "1", {B} = "2"), {C} = "3"'))
      .toEqual(['OR({A} = "1", {B} = "2")', '{C} = "3"']);
  });

  it('ignores commas inside double quotes', () => {
    expect(splitTopLevel('{A} = "hello, world", {B} = "2"'))
      .toEqual(['{A} = "hello, world"', '{B} = "2"']);
  });

  it('ignores commas inside single quotes', () => {
    expect(splitTopLevel("{A} = 'hello, world', {B} = '2'"))
      .toEqual(["{A} = 'hello, world'", "{B} = '2'"]);
  });

  it('handles single expression (no commas)', () => {
    expect(splitTopLevel('{Status} = "Open"')).toEqual(['{Status} = "Open"']);
  });

  it('trims whitespace around parts', () => {
    expect(splitTopLevel('  {A} = "1" ,  {B} = "2"  ')).toEqual(['{A} = "1"', '{B} = "2"']);
  });

  it('handles deeply nested parentheses', () => {
    expect(splitTopLevel('AND(OR({A} = "1", {B} = "2"), {C} = "3"), {D} = "4"'))
      .toEqual(['AND(OR({A} = "1", {B} = "2"), {C} = "3")', '{D} = "4"']);
  });

  it('handles empty trailing part', () => {
    expect(splitTopLevel('{A} = "1",')).toEqual(['{A} = "1"']);
  });
});

// ═══════════════════════════════════════════════════════════════
// translateFormula — field equality
// ═══════════════════════════════════════════════════════════════
describe('translateFormula — field = value', () => {
  it('translates {Field} = "value" with double quotes', () => {
    const params: unknown[] = [];
    const sql = translateFormula('{Status} = "Open"', params);
    expect(sql).toBe('"Status" = $1');
    expect(params).toEqual(['Open']);
  });

  it("translates {Field} = 'value' with single quotes", () => {
    const params: unknown[] = [];
    const sql = translateFormula("{Status} = 'Closed'", params);
    expect(sql).toBe('"Status" = $1');
    expect(params).toEqual(['Closed']);
  });

  it('handles fields with spaces', () => {
    const params: unknown[] = [];
    const sql = translateFormula('{Invoice number} = "INV-001"', params);
    expect(sql).toBe('"Invoice number" = $1');
    expect(params).toEqual(['INV-001']);
  });

  it('increments param index correctly', () => {
    const params: unknown[] = ['existing'];
    const sql = translateFormula('{Field} = "val"', params);
    expect(sql).toBe('"Field" = $2');
    expect(params).toEqual(['existing', 'val']);
  });

  it('handles empty string value', () => {
    const params: unknown[] = [];
    const sql = translateFormula('{Field} = ""', params);
    expect(sql).toBe('"Field" = $1');
    expect(params).toEqual(['']);
  });
});

// ═══════════════════════════════════════════════════════════════
// translateFormula — RECORD_ID()
// ═══════════════════════════════════════════════════════════════
describe('translateFormula — RECORD_ID()', () => {
  it('translates RECORD_ID() = "recXXX"', () => {
    const params: unknown[] = [];
    const sql = translateFormula('RECORD_ID() = "rec123abc"', params);
    expect(sql).toBe('id = $1');
    expect(params).toEqual(['rec123abc']);
  });

  it("handles single quotes", () => {
    const params: unknown[] = [];
    const sql = translateFormula("RECORD_ID() = 'rec456'", params);
    expect(sql).toBe('id = $1');
    expect(params).toEqual(['rec456']);
  });
});

// ═══════════════════════════════════════════════════════════════
// translateFormula — FIND / ARRAYJOIN (linked-record membership)
// Backward compat: FIND/ARRAYJOIN still works for legacy array columns
// ═══════════════════════════════════════════════════════════════
describe('translateFormula — FIND/ARRAYJOIN (backward compat)', () => {
  it('translates FIND("id", ARRAYJOIN({Link}))', () => {
    const params: unknown[] = [];
    const sql = translateFormula('FIND("rec123", ARRAYJOIN({Clients}))', params);
    expect(sql).toBe('$1 = ANY("Clients")');
    expect(params).toEqual(['rec123']);
  });

  it('handles single quotes in FIND', () => {
    const params: unknown[] = [];
    const sql = translateFormula("FIND('rec456', ARRAYJOIN({Invoice}))", params);
    expect(sql).toBe('$1 = ANY("Invoice")');
    expect(params).toEqual(['rec456']);
  });

  it('handles field names with spaces', () => {
    const params: unknown[] = [];
    const sql = translateFormula('FIND("c1", ARRAYJOIN({Audit result}))', params);
    expect(sql).toBe('$1 = ANY("Audit result")');
    expect(params).toEqual(['c1']);
  });
});

// ═══════════════════════════════════════════════════════════════
// translateFormula — scalar client_id mapping (ADR 0006)
// ═══════════════════════════════════════════════════════════════
describe('translateFormula — scalar client_id', () => {
  it('maps {Client} = "id" to client_id column', () => {
    const params: unknown[] = [];
    const sql = translateFormula('{Client} = "rec123"', params);
    expect(sql).toBe('"client_id" = $1');
    expect(params).toEqual(['rec123']);
  });

  it('maps {Clients} = "id" to client_id column', () => {
    const params: unknown[] = [];
    const sql = translateFormula('{Clients} = "rec456"', params);
    expect(sql).toBe('"client_id" = $1');
    expect(params).toEqual(['rec456']);
  });

  it('does not map other fields', () => {
    const params: unknown[] = [];
    const sql = translateFormula('{Status} = "Open"', params);
    expect(sql).toBe('"Status" = $1');
    expect(params).toEqual(['Open']);
  });
});

// ═══════════════════════════════════════════════════════════════
// translateFormula — OR / AND
// ═══════════════════════════════════════════════════════════════
describe('translateFormula — logical operators', () => {
  it('translates OR with two expressions', () => {
    const params: unknown[] = [];
    const sql = translateFormula('OR({Status} = "Open", {Status} = "Pending")', params);
    expect(sql).toBe('("Status" = $1 OR "Status" = $2)');
    expect(params).toEqual(['Open', 'Pending']);
  });

  it('translates AND with two expressions', () => {
    const params: unknown[] = [];
    const sql = translateFormula('AND({Status} = "Open", {Carrier} = "UPSN")', params);
    expect(sql).toBe('("Status" = $1 AND "Carrier" = $2)');
    expect(params).toEqual(['Open', 'UPSN']);
  });

  it('handles nested logical operators', () => {
    const params: unknown[] = [];
    const sql = translateFormula(
      'AND({Carrier} = "UPSN", OR({Status} = "Open", {Status} = "Pending"))',
      params
    );
    expect(sql).toBe('("Carrier" = $1 AND ("Status" = $2 OR "Status" = $3))');
    expect(params).toEqual(['UPSN', 'Open', 'Pending']);
  });

  it('handles OR with FIND inside (backward compat)', () => {
    const params: unknown[] = [];
    const sql = translateFormula(
      'OR(FIND("c1", ARRAYJOIN({Clients})), FIND("c2", ARRAYJOIN({Clients})))',
      params
    );
    expect(sql).toBe('($1 = ANY("Clients") OR $2 = ANY("Clients"))');
    expect(params).toEqual(['c1', 'c2']);
  });

  it('is case-insensitive for OR/AND keywords', () => {
    const params: unknown[] = [];
    const sql = translateFormula('or({A} = "1", {B} = "2")', params);
    expect(sql).toBe('("A" = $1 OR "B" = $2)');
  });

  it('handles three arguments in OR', () => {
    const params: unknown[] = [];
    const sql = translateFormula('OR({A} = "1", {B} = "2", {C} = "3")', params);
    expect(sql).toBe('("A" = $1 OR "B" = $2 OR "C" = $3)');
    expect(params).toEqual(['1', '2', '3']);
  });
});

// ═══════════════════════════════════════════════════════════════
// translateFormula — error cases
// ═══════════════════════════════════════════════════════════════
describe('translateFormula — unsupported expressions', () => {
  it('throws on unsupported expression', () => {
    const params: unknown[] = [];
    expect(() => translateFormula('SUM({Amount})', params)).toThrow('Unsupported filterByFormula');
  });

  it('throws on bare field reference', () => {
    const params: unknown[] = [];
    expect(() => translateFormula('{Status}', params)).toThrow('Unsupported');
  });

  it('throws on numeric comparison', () => {
    const params: unknown[] = [];
    expect(() => translateFormula('{Amount} > 100', params)).toThrow('Unsupported');
  });

  it('throws on empty string', () => {
    const params: unknown[] = [];
    expect(() => translateFormula('', params)).toThrow('Unsupported');
  });
});

// ═══════════════════════════════════════════════════════════════
// quoteIdent
// ═══════════════════════════════════════════════════════════════
describe('quoteIdent', () => {
  it('wraps name in double quotes', () => {
    expect(quoteIdent('Status')).toBe('"Status"');
  });

  it('handles spaces in names', () => {
    expect(quoteIdent('Invoice number')).toBe('"Invoice number"');
  });

  it('escapes embedded double quotes', () => {
    expect(quoteIdent('field"name')).toBe('"field""name"');
  });

  it('handles empty string', () => {
    expect(quoteIdent('')).toBe('""');
  });
});
