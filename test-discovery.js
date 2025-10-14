import axios from 'axios';

// Test dynamic repository discovery
async function testDiscovery() {
  const host = 'flux.franz.com';
  const port = 10000;
  const username = 'demos';
  const password = 'demos';
  const catalog = 'demos';
  const protocol = 'https';

  const baseUrl = `${protocol}://${host}:${port}`;
  const url = catalog === 'root'
    ? `${baseUrl}/repositories`
    : `${baseUrl}/catalogs/${catalog}/repositories`;

  console.log('Testing repository discovery...');
  console.log('URL:', url);
  console.log('Catalog:', catalog);

  try {
    const response = await axios.get(url, {
      auth: { username, password },
      headers: { Accept: 'application/json' }
    });

    console.log('\n✅ Repository discovery successful!');
    console.log('Response status:', response.status);
    console.log('\nRepositories found:');

    const repoList = response.data;
    for (const repo of repoList) {
      const repoId = repo.id.replace(/"/g, '');
      console.log(`  - ${repoId}`);
      console.log(`    Title: ${repo.title}`);
      console.log(`    Readable: ${repo.readable}`);
      console.log(`    Writable: ${repo.writable || repo.writeable}`);
    }

    console.log(`\nTotal repositories: ${repoList.length}`);
  } catch (error) {
    console.error('\n❌ Error discovering repositories:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testDiscovery();
