import axios from 'axios';

const config = {
  baseURL: 'http://localhost:10035',
  auth: {
    username: 'test',
    password: 'xyzzy',
  },
};

const client = axios.create(config);

async function testConnection() {
  try {
    console.log('Testing AllegroGraph connection...');
    
    // Test basic connection
    const versionResponse = await client.get('/version');
    console.log('✅ Version:', versionResponse.data);
    
    // Test repository access with correct URL (from the catalogs output)
    const repoResponse = await client.get('/repositories/olympics/size');
    console.log('✅ Repository "olympics" size:', repoResponse.data, 'triples');
    
    console.log('🎉 Connection test successful!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testConnection();
