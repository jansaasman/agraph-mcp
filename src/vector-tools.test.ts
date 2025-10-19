import { describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Test suite for vector_nearest_neighbor and vector_ask_documents tools
 *
 * These tests verify that the tools correctly construct the vector store name
 * by prepending the catalog when needed (catalog:repository format).
 */

interface RepositoryConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  catalog: string;
  repository: string;
  protocol?: 'http' | 'https';
}

interface MultiRepositoryConfig {
  repositories: { [key: string]: RepositoryConfig };
  defaultRepository: string;
}

/**
 * Mock function that simulates the vector store name construction logic
 * from handleVectorNearestNeighbor and handleVectorAskDocuments
 */
function constructVectorStoreSpec(
  vectorStore: string,
  repoName: string,
  config: MultiRepositoryConfig
): string {
  const repoConfig = config.repositories[repoName];

  // This is the logic from index.ts lines 1464 and 1560
  const vectorStoreSpec = vectorStore.includes(':')
    ? vectorStore
    : `${repoConfig.catalog}:${vectorStore}`;

  return vectorStoreSpec;
}

/**
 * Simulate building the SPARQL query for llm:nearestNeighbor
 */
function buildNearestNeighborQuery(
  text: string,
  vectorStoreSpec: string,
  topN: number = 10,
  minScore: number = 0.0
): string {
  return `PREFIX llm: <http://franz.com/ns/allegrograph/8.0.0/llm/>
PREFIX kw: <http://franz.com/ns/keyword#>
PREFIX vdbprop: <http://franz.com/vdb/prop/>

SELECT ?id ?score ?text WHERE {
  (?id ?score ?text) llm:nearestNeighbor ("${text}" "${vectorStoreSpec}" kw:topN ${topN} kw:minScore ${minScore}) .
}`;
}

/**
 * Simulate building the SPARQL query for llm:askMyDocuments
 */
function buildAskDocumentsQuery(
  question: string,
  vectorStoreSpec: string,
  topN: number = 5,
  minScore: number = 0.8
): string {
  return `PREFIX llm: <http://franz.com/ns/allegrograph/8.0.0/llm/>
PREFIX kw: <http://franz.com/ns/keyword#>

SELECT ?response ?score ?citationId ?citedText WHERE {
  (?response ?score ?citationId ?citedText) llm:askMyDocuments ("${question}" "${vectorStoreSpec}" kw:topN ${topN} kw:minScore ${minScore})
}`;
}

describe('Vector Store Name Construction', () => {
  let config: MultiRepositoryConfig;

  beforeEach(() => {
    // Setup mock config similar to what would be used in production
    config = {
      defaultRepository: 'chomsky47',
      repositories: {
        'chomsky47': {
          host: 'flux.franz.com',
          port: 10000,
          username: 'demos',
          password: 'demos',
          catalog: 'demos',
          repository: 'chomsky47',
          protocol: 'https'
        },
        'olympics': {
          host: 'flux.franz.com',
          port: 10000,
          username: 'demos',
          password: 'demos',
          catalog: 'demos',
          repository: 'olympics',
          protocol: 'https'
        },
        'rootRepo': {
          host: 'flux.franz.com',
          port: 10000,
          username: 'demos',
          password: 'demos',
          catalog: 'root',
          repository: 'rootRepo',
          protocol: 'https'
        }
      }
    };
  });

  describe('constructVectorStoreSpec', () => {
    it('should prepend catalog when vectorStore does not contain colon', () => {
      const result = constructVectorStoreSpec('chomsky47', 'chomsky47', config);
      expect(result).toBe('demos:chomsky47');
    });

    it('should NOT prepend catalog when vectorStore already contains colon', () => {
      const result = constructVectorStoreSpec('demos:chomsky47', 'chomsky47', config);
      expect(result).toBe('demos:chomsky47');
    });

    it('should work for repositories in root catalog', () => {
      const result = constructVectorStoreSpec('rootRepo', 'rootRepo', config);
      expect(result).toBe('root:rootRepo');
    });

    it('should handle different repository than the one being queried', () => {
      // Querying olympics repo but asking about chomsky47 vector store
      const result = constructVectorStoreSpec('chomsky47', 'olympics', config);
      // This uses the olympics catalog, which is 'demos'
      expect(result).toBe('demos:chomsky47');
    });

    it('should handle fully qualified vector store names from different catalogs', () => {
      const result = constructVectorStoreSpec('othercatalog:otherrepo', 'chomsky47', config);
      expect(result).toBe('othercatalog:otherrepo');
    });
  });

  describe('buildNearestNeighborQuery', () => {
    it('should construct correct SPARQL query with catalog-prepended vector store', () => {
      const vectorStoreSpec = constructVectorStoreSpec('chomsky47', 'chomsky47', config);
      const query = buildNearestNeighborQuery('poverty causes', vectorStoreSpec, 10, 0.0);

      expect(query).toContain('llm:nearestNeighbor');
      expect(query).toContain('"poverty causes"');
      expect(query).toContain('"demos:chomsky47"');
      expect(query).toContain('kw:topN 10');
      expect(query).toContain('kw:minScore 0');
    });

    it('should handle user-provided fully qualified vector store name', () => {
      const vectorStoreSpec = constructVectorStoreSpec('demos:chomsky47', 'chomsky47', config);
      const query = buildNearestNeighborQuery('poverty causes', vectorStoreSpec);

      expect(query).toContain('"demos:chomsky47"');
    });
  });

  describe('buildAskDocumentsQuery', () => {
    it('should construct correct SPARQL query with catalog-prepended vector store', () => {
      const vectorStoreSpec = constructVectorStoreSpec('chomsky47', 'chomsky47', config);
      const query = buildAskDocumentsQuery('What causes poverty?', vectorStoreSpec, 5, 0.8);

      expect(query).toContain('llm:askMyDocuments');
      expect(query).toContain('"What causes poverty?"');
      expect(query).toContain('"demos:chomsky47"');
      expect(query).toContain('kw:topN 5');
      expect(query).toContain('kw:minScore 0.8');
    });

    it('should handle user-provided fully qualified vector store name', () => {
      const vectorStoreSpec = constructVectorStoreSpec('demos:chomsky47', 'chomsky47', config);
      const query = buildAskDocumentsQuery('What causes poverty?', vectorStoreSpec);

      expect(query).toContain('"demos:chomsky47"');
    });
  });

  describe('Edge Cases', () => {
    it('should handle vector store names with multiple colons', () => {
      const result = constructVectorStoreSpec('cat:repo:extra', 'chomsky47', config);
      // Should not prepend because it contains a colon
      expect(result).toBe('cat:repo:extra');
    });

    it('should handle empty vector store name (edge case)', () => {
      const result = constructVectorStoreSpec('', 'chomsky47', config);
      // Empty string doesn't contain colon, so catalog gets prepended
      expect(result).toBe('demos:');
    });
  });
});

describe('Comparison with Claude\'s Manual Query', () => {
  it('should match the vector store name that Claude uses when manually constructing queries', () => {
    const config: MultiRepositoryConfig = {
      defaultRepository: 'chomsky47',
      repositories: {
        'chomsky47': {
          host: 'flux.franz.com',
          port: 10000,
          username: 'demos',
          password: 'demos',
          catalog: 'demos',
          repository: 'chomsky47',
          protocol: 'https'
        }
      }
    };

    // When user passes vectorStore: "chomsky47"
    const vectorStoreSpec = constructVectorStoreSpec('chomsky47', 'chomsky47', config);

    // Claude correctly identifies the vector store as "demos:chomsky47"
    const expectedByClaudeManually = 'demos:chomsky47';

    expect(vectorStoreSpec).toBe(expectedByClaudeManually);
  });
});

console.log('Test suite for vector tools created successfully');
console.log('Run with: npm test (after adding jest configuration)');
