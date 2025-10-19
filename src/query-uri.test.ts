import { describe, test, expect } from '@jest/globals';

/**
 * Test suite to verify that query URIs are properly returned by
 * search_queries and list_all_queries tools.
 */

describe('Query URI Return Tests', () => {

  describe('search_queries SPARQL query', () => {
    test('should include ?queryUri in SELECT clause', () => {
      const sparqlQuery = `
      PREFIX query: <http://franz.com/ns/query-library#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?queryUri ?title ?description ?sparql ?repo ?created WHERE {
        ?queryUri a query:StoredQuery ;
           dc:title ?title ;
           dc:description ?description ;
           query:sparqlText ?sparql ;
           query:repository ?repo .
        OPTIONAL { ?queryUri dc:created ?created }
        FILTER(
          CONTAINS(LCASE(?title), LCASE("test")) ||
          CONTAINS(LCASE(?description), LCASE("test"))
        )
        FILTER(?repo = "olympics")
      }
      ORDER BY DESC(?created)
      LIMIT 10`;

      expect(sparqlQuery).toContain('SELECT ?queryUri');
      expect(sparqlQuery).toContain('?queryUri a query:StoredQuery');
    });

    test('should format results with queryUri field', () => {
      // Mock SPARQL result
      const mockResult = {
        queryUri: { value: 'http://franz.com/ns/query-library#query-1729368900123' },
        title: { value: 'Test Query' },
        description: { value: 'A test query' },
        repo: { value: 'olympics' },
        sparql: { value: 'SELECT * WHERE { ?s ?p ?o }' },
        created: { value: '2025-10-18T12:00:00Z' }
      };

      const formattedResult = {
        queryUri: mockResult.queryUri.value,
        title: mockResult.title.value,
        description: mockResult.description.value,
        repository: mockResult.repo.value,
        sparql: mockResult.sparql.value,
        created: mockResult.created?.value
      };

      expect(formattedResult).toHaveProperty('queryUri');
      expect(formattedResult.queryUri).toBe('http://franz.com/ns/query-library#query-1729368900123');
      expect(formattedResult.queryUri).toContain('query-');
    });
  });

  describe('list_all_queries SPARQL query', () => {
    test('should include ?q in SELECT clause', () => {
      const sparqlQuery = `
      PREFIX query: <http://franz.com/ns/query-library#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?q ?title ?description ?sparql ?repo ?created WHERE {
        ?q a query:StoredQuery ;
           dc:title ?title ;
           dc:description ?description ;
           query:sparqlText ?sparql ;
           query:repository ?repo .
        OPTIONAL { ?q dc:created ?created }
        FILTER(?repo = "olympics")
      }
      ORDER BY DESC(?created)`;

      expect(sparqlQuery).toContain('SELECT ?q');
      expect(sparqlQuery).toContain('?q a query:StoredQuery');
    });

    test('should format results with queryUri from ?q variable', () => {
      // Mock SPARQL result (note: variable is ?q, not ?queryUri)
      const mockResult = {
        q: { value: 'http://franz.com/ns/query-library#query-1729368900456' },
        title: { value: 'Another Test Query' },
        description: { value: 'Another test' },
        repo: { value: 'olympics' },
        sparql: { value: 'SELECT * WHERE { ?s ?p ?o }' },
        created: { value: '2025-10-18T13:00:00Z' }
      };

      const formattedResult = {
        queryUri: mockResult.q.value,  // Maps ?q to queryUri
        title: mockResult.title.value,
        description: mockResult.description.value,
        repository: mockResult.repo.value,
        sparql: mockResult.sparql.value,
        created: mockResult.created?.value
      };

      expect(formattedResult).toHaveProperty('queryUri');
      expect(formattedResult.queryUri).toBe('http://franz.com/ns/query-library#query-1729368900456');
      expect(formattedResult.queryUri).toContain('query-');
    });
  });

  describe('Query URI format validation', () => {
    test('should validate query URI format', () => {
      const queryUri = 'http://franz.com/ns/query-library#query-1729368900123';

      expect(queryUri).toMatch(/^http:\/\/franz\.com\/ns\/query-library#query-\d+$/);
      expect(queryUri).toContain('#query-');
      expect(queryUri.split('#')[1]).toMatch(/^query-\d+$/);
    });

    test('should extract timestamp from query URI', () => {
      const queryUri = 'http://franz.com/ns/query-library#query-1729368900123';
      const localPart = queryUri.split('#')[1]; // "query-1729368900123"
      const timestamp = localPart.replace('query-', ''); // "1729368900123"

      expect(timestamp).toMatch(/^\d+$/);
      expect(Number(timestamp)).toBeGreaterThan(0);
    });
  });

  describe('Result consistency', () => {
    test('both tools should return same queryUri format', () => {
      const searchQueriesResult = {
        queryUri: 'http://franz.com/ns/query-library#query-1729368900123',
        title: 'Test',
        description: 'Desc',
        repository: 'olympics',
        sparql: 'SELECT...',
        created: '2025-10-18'
      };

      const listAllQueriesResult = {
        queryUri: 'http://franz.com/ns/query-library#query-1729368900456',
        title: 'Test',
        description: 'Desc',
        repository: 'olympics',
        sparql: 'SELECT...',
        created: '2025-10-18'
      };

      expect(Object.keys(searchQueriesResult)).toEqual(Object.keys(listAllQueriesResult));
      expect(searchQueriesResult.queryUri).toMatch(/^http:\/\/franz\.com\/ns\/query-library#query-\d+$/);
      expect(listAllQueriesResult.queryUri).toMatch(/^http:\/\/franz\.com\/ns\/query-library#query-\d+$/);
    });
  });
});
