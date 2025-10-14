import axios from 'axios';

// Test a simple SPARQL query directly (not through MCP yet)
const client = axios.create({
  baseURL: 'http://localhost:10035',
  auth: { username: 'test', password: 'xyzzy' },
});

async function testSparql() {
  try {
    // Simple query to get first 5 triples
    const query = 'SELECT * WHERE { ?s ?p ?o } LIMIT 5';
    
    const response = await client.get('/repositories/olympics', {
      params: { query },
      headers: { Accept: 'application/sparql-results+json' },
    });
    
    console.log('✅ SPARQL query successful!');
    console.log('Sample data from your olympics repository:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ SPARQL query failed:', error.message);
  }
}

testSparql();
