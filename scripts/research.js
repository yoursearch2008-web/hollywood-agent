const https = require('https');
const fs = require('fs');

const EXA_API_KEY = process.env.EXA_API_KEY || 'your-exa-api-key';
const researchTopics = [
  'website builder pricing 2026',
  'app builder open source 2026',
  'AI agent self improvement methods',
  'programmatic ad revenue optimization',
  'web builder security best practices 2026'
];

function searchExa(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, type: 'fast', numResults: 3 });
    const options = {
      hostname: 'api.exa.ai',
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runResearch() {
  const date = new Date().toISOString().split('T')[0];
  let report = `# Research Report ${date}\n\n`;
  for (const topic of researchTopics) {
    try {
      const result = await searchExa(topic);
      report += `## ${topic}\n`;
      result.results.forEach((item, i) => {
        report += `${i+1}. [${item.title}](${item.url})\n`;
        report += `   ${item.snippet}\n`;
      });
      report += '\n';
    } catch (e) {
      report += `## ${topic}\nError: ${e.message}\n\n`;
    }
  }
  const memPath = 'memory/' + date + '_research.md';
  fs.writeFileSync(memPath, report);
  console.log('Research saved to', memPath);
}

runResearch();
