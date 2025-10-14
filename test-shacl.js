import axios from 'axios';

// Test SHACL extraction from AllegroGraph
async function testShaclExtraction() {
  const config = {
    host: 'flux.franz.com',
    port: 10000,
    username: 'demos',
    password: 'demos',
    catalog: 'demos',
    repository: 'olympics',
    protocol: 'https'
  };

  const baseUrl = `${config.protocol}://${config.host}:${config.port}`;
  const url = `${baseUrl}/catalogs/${config.catalog}/repositories/${config.repository}/data-generator/shacl`;

  console.log('Testing SHACL extraction...');
  console.log('URL:', url);

  try {
    const response = await axios.get(url, {
      auth: {
        username: config.username,
        password: config.password
      },
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('\n✅ SHACL extraction successful!');
    console.log('Response status:', response.status);
    console.log('Response data preview:');
    console.log(JSON.stringify(response.data, null, 2).substring(0, 500) + '...');

    // Count shapes if data is an array
    if (Array.isArray(response.data)) {
      console.log(`\nTotal shapes: ${response.data.length}`);
    }
  } catch (error) {
    console.error('\n❌ Error extracting SHACL:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testShaclExtraction();
