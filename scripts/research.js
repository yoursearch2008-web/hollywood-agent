const https = require('https');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const researchTopics = [
  'website builder open source 2026',
  'app builder free open source 2026',
  'AI agent self improvement open source',
  'open source ad server 2026',
  'web builder security best practices 2026'
];

function searchDuckDuckGo(query) {
  return new Promise((resolve, reject) => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const dom = new JSDOM(body);
          const results = [...dom.window.document.querySelectorAll('.result')].slice(0, 3).map((el, i) => {
            const titleEl = el.querySelector('.result__title');
            const linkEl = el.querySelector('.result__url');
            const snippetEl = el.querySelector('.result__snippet');
            return {
              title: titleEl?.textContent || `Result ${i+1}`,
              url: linkEl?.textContent || '',
              snippet: snippetEl?.textContent || ''
            };
          });
          resolve({ results });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function runResearch() {
  const date = new Date().toISOString().split('T')[0];
  let report = `# Research Report ${open source only) ${date}\n\n`;
  for (const topic of researchTopics) {
    try {
      const result = await searchDuckDuckGo(topic);
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
