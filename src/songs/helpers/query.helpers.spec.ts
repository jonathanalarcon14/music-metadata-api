import { escapeLucene } from './query.helpers';

describe('escapeLucene', () => {
  it('leaves plain alphanumeric strings untouched', () => {
    expect(escapeLucene('Bohemian Rhapsody')).toBe('Bohemian Rhapsody');
  });

  it('escapes every Lucene special character', () => {
    const specials = '+-&|!(){}[]^"~*?:\\';
    const escaped = escapeLucene(specials);
    // Each special char must be prefixed with a backslash.
    for (const ch of specials) {
      expect(escaped).toContain(`\\${ch}`);
    }
  });

  it('escapes characters inline within a real query', () => {
    expect(escapeLucene('AC/DC: Back in Black (Remastered)')).toBe(
      'AC/DC\\: Back in Black \\(Remastered\\)',
    );
  });

  it('escapes backslashes', () => {
    expect(escapeLucene('a\\b')).toBe('a\\\\b');
  });

  it('returns an empty string unchanged', () => {
    expect(escapeLucene('')).toBe('');
  });
});
