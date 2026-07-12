import { toCsv, escapeCsvField, exportFilename } from './export.service';

describe('export utilities', () => {
  describe('escapeCsvField', () => {
    it('should pass through a plain string unchanged', () => {
      expect(escapeCsvField('hello')).toBe('hello');
    });

    it('should pass through a number unchanged', () => {
      expect(escapeCsvField(42)).toBe('42');
    });

    it('should wrap a field containing a comma in double-quotes', () => {
      expect(escapeCsvField('hello, world')).toBe('"hello, world"');
    });

    it('should wrap and double internal double-quotes', () => {
      expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('should wrap a field containing a newline', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should wrap a field containing a carriage return', () => {
      expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
    });

    it('should handle a field with both comma and quotes', () => {
      expect(escapeCsvField('"yes", he said')).toBe('"""yes"", he said"');
    });
  });

  describe('toCsv', () => {
    it('should produce a valid CSV with headers and rows', () => {
      const csv = toCsv(['a', 'b'], [[1, 2], [3, 4]]);
      // Starts with BOM
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
      // Strip BOM for content checks
      const content = csv.slice(1);
      const lines = content.trimEnd().split('\r\n');
      expect(lines.length).toBe(3);
      expect(lines[0]).toBe('a,b');
      expect(lines[1]).toBe('1,2');
      expect(lines[2]).toBe('3,4');
    });

    it('should start with a UTF-8 BOM', () => {
      const csv = toCsv(['x'], [['y']]);
      expect(csv.startsWith('\uFEFF')).toBe(true);
    });

    it('should end with CRLF', () => {
      const csv = toCsv(['x'], [['y']]);
      expect(csv.endsWith('\r\n')).toBe(true);
    });

    it('should have consistent column count across all rows', () => {
      const headers = ['age', 'balance', 'tax'];
      const rows: (string | number)[][] = [
        [60, 1000000, 25000],
        [61, 1050000, 26000],
        [62, 1100000, 27000],
      ];
      const csv = toCsv(headers, rows);
      const lines = csv.slice(1).trimEnd().split('\r\n');
      const headerCount = lines[0].split(',').length;
      for (const line of lines.slice(1)) {
        expect(line.split(',').length).toBe(headerCount);
      }
    });

    it('should escape fields that contain special characters', () => {
      const csv = toCsv(['name', 'note'], [['Alice', 'has a "quote"']]);
      const lines = csv.slice(1).trimEnd().split('\r\n');
      expect(lines[1]).toBe('Alice,"has a ""quote"""');
    });

    it('should handle an empty row array', () => {
      const csv = toCsv(['a', 'b'], []);
      const lines = csv.slice(1).trimEnd().split('\r\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe('a,b');
    });
  });

  describe('exportFilename', () => {
    it('should slugify the scenario name', () => {
      const name = exportFilename('Smooth Income Target', 'csv');
      expect(name).toMatch(/^smooth-income-target_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should strip leading/trailing hyphens from the slug', () => {
      const name = exportFilename('  Test  ', 'json');
      expect(name).toMatch(/^test_\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should collapse consecutive non-alphanumeric chars into one hyphen', () => {
      const name = exportFilename('A---B___C', 'csv');
      expect(name).toMatch(/^a-b-c_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should include the correct file extension', () => {
      expect(exportFilename('test', 'json').endsWith('.json')).toBe(true);
      expect(exportFilename('test', 'csv').endsWith('.csv')).toBe(true);
    });
  });
});
