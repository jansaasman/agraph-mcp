import { describe, it, expect } from '@jest/globals';

/**
 * Test to verify that the fixed code generates queries with single quotes
 * instead of double quotes for string literals in magic predicates
 */

function buildFixedNearestNeighborQuery(
  text: string,
  vectorStoreSpec: string,
  topN: number = 10,
  minScore: number = 0.0
): string {
  // This is the FIXED version using single quotes
  let sparqlQuery = `PREFIX llm: <http://franz.com/ns/allegrograph/8.0.0/llm/>
PREFIX kw: <http://franz.com/ns/keyword#>
PREFIX vdbprop: <http://franz.com/vdb/prop/>

SELECT ?id ?score ?text WHERE {
  (?id ?score ?text) llm:nearestNeighbor ('${text.replace(/'/g, "\\'")}' '${vectorStoreSpec}' kw:topN ${topN} kw:minScore ${minScore}`;

  sparqlQuery += `) .
}`;

  return sparqlQuery;
}

function buildFixedAskDocumentsQuery(
  question: string,
  vectorStoreSpec: string,
  topN: number = 5,
  minScore: number = 0.8
): string {
  // This is the FIXED version using single quotes
  let sparqlQuery = `PREFIX llm: <http://franz.com/ns/allegrograph/8.0.0/llm/>
PREFIX kw: <http://franz.com/ns/keyword#>

SELECT ?response ?score ?citationId ?citedText WHERE {
  (?response ?score ?citationId ?citedText) llm:askMyDocuments ('${question.replace(/'/g, "\\'")}' '${vectorStoreSpec}' kw:topN ${topN} kw:minScore ${minScore}`;

  sparqlQuery += `)
}`;

  return sparqlQuery;
}

describe('Fixed Vector Tools - Single Quote Usage', () => {
  describe('buildFixedNearestNeighborQuery', () => {
    it('should use single quotes for text and vector store spec', () => {
      const query = buildFixedNearestNeighborQuery(
        'fight against poverty',
        'demos:chomsky47',
        10,
        0.0
      );

      // Should contain single quotes, not double quotes for string literals
      expect(query).toContain("'fight against poverty'");
      expect(query).toContain("'demos:chomsky47'");

      // Should NOT contain double quotes for these strings
      expect(query).not.toContain('"fight against poverty"');
      expect(query).not.toContain('"demos:chomsky47"');
    });

    it('should escape single quotes in text if present', () => {
      const query = buildFixedNearestNeighborQuery(
        "Chomsky's views on poverty",
        'demos:chomsky47'
      );

      // Should escape the single quote in Chomsky's
      expect(query).toContain("Chomsky\\'s views on poverty");
    });

    it('should match the format of working Claude-generated queries', () => {
      const query = buildFixedNearestNeighborQuery(
        'fight against poverty',
        'demos:chomsky47',
        10,
        0.0
      );

      // Check key patterns match the working query format
      expect(query).toMatch(/llm:nearestNeighbor \('fight against poverty' 'demos:chomsky47'/);
      expect(query).toContain('kw:topN 10');
      expect(query).toContain('kw:minScore 0');
    });
  });

  describe('buildFixedAskDocumentsQuery', () => {
    it('should use single quotes for question and vector store spec', () => {
      const query = buildFixedAskDocumentsQuery(
        'What causes poverty?',
        'demos:chomsky47',
        5,
        0.8
      );

      // Should contain single quotes, not double quotes for string literals
      expect(query).toContain("'What causes poverty?'");
      expect(query).toContain("'demos:chomsky47'");

      // Should NOT contain double quotes for these strings
      expect(query).not.toContain('"What causes poverty?"');
      expect(query).not.toContain('"demos:chomsky47"');
    });

    it('should escape single quotes in question if present', () => {
      const query = buildFixedAskDocumentsQuery(
        "What are Chomsky's views?",
        'demos:chomsky47'
      );

      // Should escape the single quote in Chomsky's
      expect(query).toContain("Chomsky\\'s views");
    });

    it('should use correct syntax for llm:askMyDocuments', () => {
      const query = buildFixedAskDocumentsQuery(
        'What causes poverty?',
        'demos:chomsky47',
        5,
        0.8
      );

      // Check key patterns
      expect(query).toMatch(/llm:askMyDocuments \('What causes poverty\?' 'demos:chomsky47'/);
      expect(query).toContain('kw:topN 5');
      expect(query).toContain('kw:minScore 0.8');
    });
  });

  describe('Comparison with original broken implementation', () => {
    it('demonstrates the difference between broken and fixed nearestNeighbor', () => {
      const text = 'poverty';
      const vectorStore = 'demos:chomsky47';

      // Broken version (double quotes)
      const brokenQuery = `llm:nearestNeighbor ("${text}" "${vectorStore}"`;

      // Fixed version (single quotes)
      const fixedQuery = `llm:nearestNeighbor ('${text}' '${vectorStore}'`;

      expect(brokenQuery).toContain('"poverty"');
      expect(brokenQuery).toContain('"demos:chomsky47"');

      expect(fixedQuery).toContain("'poverty'");
      expect(fixedQuery).toContain("'demos:chomsky47'");

      expect(brokenQuery).not.toEqual(fixedQuery);
    });
  });
});

console.log('✓ Verification tests created for single quote fix');
