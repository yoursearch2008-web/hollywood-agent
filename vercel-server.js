const express = require('express');
const storage = require('./lib/storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());
app.use(express.raw({ type: '*/*' }));

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const DOMAIN = process.env.DOMAIN || 'hollywood-ai-agent.xyz';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN || '';
const CLAUDE_CODE_KEY = process.env.CLAUDE_CODE_KEY || '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1500528034703343769/AWO3y3maIgDdPrSw7c3FxrRwF6MJLyFX4Gl1rJ1xi4t3k39YK5YZetkaeYg_8YKig3ct';

async function setSession(res, userId) {
  const sessionToken = Math.random().toString(36).substring(2);
  await storage.setSessionToken(sessionToken, userId);
  res.setHeader('Set-Cookie', `session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return sessionToken;
}

async function getSessionData(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return { userId: null, user: null };
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return { userId: null, user: null };
  const userId = await storage.getSessionUserId(match[1]);
  if (!userId) return { userId: null, user: null };
  const user = await storage.getUser(userId);
  return { userId, user };
}

async function getUserFromReq(req) {
  const { user } = await getSessionData(req);
  return user;
}

async function callAI(prompt, type = 'chat') {
  // Try Ollama first (free local AI)
  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });
    if (ollamaRes.ok) {
      const ollamaData = await ollamaRes.json();
      return ollamaData.message?.content || 'No response from Ollama';
    }
  } catch (e) { /* Ollama not available */ }
  
  // Try HuggingFace (free 1000/day!)
  if (HUGGINGFACE_TOKEN) {
    try {
      const modelId = encodeURIComponent('meta-llama/Meta-Llama-3.1-8B-Instruct');
      const res = await fetch(`https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HUGGINGFACE_TOKEN}`
        },
        body: JSON.stringify({
          model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          messages: [{ role: 'user', content: prompt }],
          stream: false
        })
      });
      const data = await res.json();
      if (data.choices && data.choices[0]) {
        return data.choices[0].message?.content || 'No response from HuggingFace';
      }
      return JSON.stringify(data).slice(0, 200);
    } catch (e) { /* HuggingFace error */ }
  }
  
  // Try Groq (free 60/min!)
  if (GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response from Groq';
    } catch (e) { /* Groq error */ }
  }
  
  // Try Gemini
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      const response = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (response) return response;
      return JSON.stringify(data).slice(0, 300);
    } catch (e) { return `Error: ${e.message}`; }
  }
  if (OPENAI_API_KEY && type !== 'research') {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response';
    } catch (e) { return `Error: ${e.message}`; }
  }
  return 'Configure GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY for AI responses.';
}

async function research(query) {
  try {
    const searchRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
    const searchData = await searchRes.json();
    const results = (searchData.RelatedTopics || []).slice(0, 10).map(t => ({
      title: t.Text || query,
      url: t.FirstURL || '',
      snippet: t.Text || ''
    }));
    return results;
  } catch (e) { return []; }
}

async function sendDiscord(title, message, color = 0x00ff00) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title,
          description: message,
          color,
          timestamp: new Date().toISOString(),
          footer: { text: 'Hollywood AI Agent' }
        }]
      })
    });
  } catch (e) { console.log('Discord error:', e.message); }
}

const PAGES = {
  home: `<!DOCTYPE html>
<html>
<head>
  <title>Hollywood AI Agent</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #fff; min-height: 100vh; }
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #e94560; font-size: 2.5rem; margin-bottom: 10px; }
    .tagline { color: #8b8b9e; margin-bottom: 40px; }
    .status { background: #1a1a2e; padding: 20px; border-radius: 12px; margin-bottom: 30px; }
    .status-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #2a2a3e; }
    .status-item:last-child { border: none; }
    .status-label { color: #8b8b9e; }
    .status-value { color: #0f0; font-weight: 600; }
    .online { color: #00d26a; }
    .btn { display: inline-block; padding: 12px 24px; background: #e94560; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; margin: 5px; }
    .btn:hover { background: #d63a54; }
    .btn-secondary { background: #2a2a3e; }
    .btn-secondary:hover { background: #3a3a4e; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 40px; }
    .feature { background: #1a1a2e; padding: 25px; border-radius: 12px; cursor: pointer; transition: transform 0.2s; }
    .feature:hover { transform: translateY(-5px); }
    .feature h3 { color: #e94560; margin-bottom: 10px; }
    .feature p { color: #8b8b9e; line-height: 1.6; font-size: 14px; }
    .login-box { background: #1a1a2e; padding: 30px; border-radius: 12px; margin-top: 30px; }
    .login-box input { width: 100%; padding: 12px; margin: 10px 0; background: #0f0f1a; border: 1px solid #2a2a3e; border-radius: 8px; color: #fff; }
    .login-box label { color: #8b8b9e; }
    footer { text-align: center; color: #4a4a5e; margin-top: 60px; padding-top: 20px; border-top: 1px solid #2a2a3e; }
    .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; background: #1a1a2e; color: #fff; text-decoration: none; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .api-badge { display: inline-block; padding: 4px 10px; background: #00d26a; color: #000; border-radius: 12px; font-size: 12px; margin-left: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav">
      <a href="/" class="active">Home</a>
      <a href="/ai">AI Chat</a>
      <a href="/research">Research</a>
      <a href="/build">Build</a>
      <a href="/automate">Automate</a>
      <a href="/files">Files</a>
      <a href="/projects">Projects</a>
      <a href="/deploy">Deploy</a>
      <a href="/pricing">Pricing</a>
    </div>

    <h1>Hollywood AI Agent <span class="api-badge">v1.0.0</span></h1>
    <p class="tagline">Self-improving AI agent for automated system building</p>
    
    <div class="status">
      <div class="status-item">
        <span class="status-label">Status</span>
        <span class="status-value online">● Online</span>
      </div>
      <div class="status-item">
        <span class="status-label">Environment</span>
        <span class="status-value">Production</span>
      </div>
      <div class="status-item">
        <span class="status-label">AI Provider</span>
        <span class="status-value">${GEMINI_API_KEY ? 'Gemini' : GROQ_API_KEY ? 'Groq' : HUGGINGFACE_TOKEN ? 'HuggingFace' : OPENAI_API_KEY ? 'GPT-4' : 'Demo'}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Users</span>
        <span class="status-value" id="userCount">...</span>
      </div>
    </div>

    <div class="features">
      <a href="/ai" class="feature">
        <h3>💬 AI Chat</h3>
        <p>Chat with AI powered by Gemini/GPT-4. Ask questions, get help with coding, research, and more.</p>
      </a>
      <a href="/research" class="feature">
        <h3>🔍 Research</h3>
        <p>AI-powered web research using DuckDuckGo. Get accurate, up-to-date information.</p>
      </a>
      <a href="/build" class="feature">
        <h3>🔨 Build</h3>
        <p>Generate code and build websites/apps. HTML, CSS, JavaScript, Python, and more.</p>
      </a>
      <a href="/automate" class="feature">
        <h3>⚡ Automate</h3>
        <p>Browser automation with Playwright. Scrape, test, and interact with websites.</p>
      </a>
      <a href="/files" class="feature">
        <h3>📁 Files</h3>
        <p>Manage your files and code snippets. Create, edit, and organize.</p>
      </a>
      <a href="/projects" class="feature">
        <h3>📂 Projects</h3>
        <p>Create and manage AI projects. Track progress and collaborate.</p>
      </a>
      <a href="/deploy" class="feature">
        <h3>🚀 Deploy</h3>
        <p>Deploy your projects to Vercel, Netlify, or Cloudflare Pages.</p>
      </a>
    </div>

    <div class="login-box" id="authBox">
      <h3 style="margin-bottom:15px;color:#e94560">Get Started Free</h3>
      <a href="/api/auth?path=google-login" class="btn" style="display:block;text-align:center;margin-bottom:10px;background:#4285f4">Sign in with Google</a>
      <div style="text-align:center;color:#4a4a5e;margin:10px 0">or</div>
      <label>Email</label>
      <input type="email" id="signupEmail" placeholder="you@example.com">
      <button class="btn" style="width:100%" onclick="signup()">Start Free</button>
      <p style="color:#4a4a5e;font-size:12px;margin-top:10px;text-align:center">Free tier: 100 AI requests/day · No credit card required</p>
    </div>

    <footer>
      <p>Hollywood AI Agent © 2026 | <a href="/api/status" style="color:#8b8b9e">API</a></p>
    </footer>
  </div>
  <script>
    fetch('/api/status').then(r=>r.json()).then(d=>{
      const el = document.getElementById('userCount');
      if (el) el.textContent = (d.users || 0) + ' registered';
    }).catch(()=>{});

    fetch('/api/auth?path=check', {method:'POST'}).then(r=>r.json()).then(d=>{
      if (d.loggedIn) {
        const box = document.getElementById('authBox');
        if (box) box.innerHTML = '<p style="color:#00d26a;font-size:16px;text-align:center;padding:20px">Welcome back, <strong>' + (d.name||d.email) + '</strong>! <a href="/ai" style="color:#e94560">Open AI Chat →</a></p>';
      }
    }).catch(()=>{});

    async function signup() {
      const email = document.getElementById('signupEmail').value.trim();
      if (!email) return;
      const r = await fetch('/api/auth?path=signup', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email})});
      const d = await r.json();
      if (d.success) window.location.href = '/ai?welcome=' + encodeURIComponent(d.name);
    }
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && document.activeElement.id === 'signupEmail') signup(); });
  </script>
</body>
</html>`,

  ai: `<!DOCTYPE html>
<html>
<head>
  <title>AI Chat | Hollywood AI Agent</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #fff; min-height: 100vh; display: flex; flex-direction: column; }
    .nav { display: flex; gap: 10px; padding: 20px; background: #1a1a2e; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; color: #fff; text-decoration: none; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .chat-container { flex: 1; display: flex; flex-direction: column; max-width: 900px; margin: 0 auto; width: 100%; padding: 20px; }
    .messages { flex: 1; overflow-y: auto; background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 20px; min-height: 300px; }
    .message { padding: 12px 16px; margin: 8px 0; border-radius: 8px; max-width: 80%; }
    .message-user { background: #e94560; margin-left: auto; }
    .message-ai { background: #2a2a3e; }
    .message-system { background: #1a3a2e; color: #00d26a; border: 1px solid #00d26a; }
    .input-area { display: flex; gap: 10px; }
    .input-area input { flex: 1; padding: 14px; border-radius: 8px; border: none; background: #1a1a2e; color: #fff; font-size: 16px; }
    .input-area button { padding: 14px 28px; background: #e94560; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    .suggestions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
    .suggestions button { padding: 8px 16px; background: #2a2a3e; color: #fff; border: none; border-radius: 20px; cursor: pointer; }
    .suggestions button:hover { background: #e94560; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">Home</a>
    <a href="/ai" class="active">AI Chat</a>
    <a href="/research">Research</a>
    <a href="/build">Build</a>
    <a href="/automate">Automate</a>
    <a href="/files">Files</a>
  </div>
  
  <div class="chat-container">
    <h1>💬 AI Chat</h1>
    <div class="suggestions">
      <button onclick="ask('Explain quantum computing in simple terms')">Quantum computing</button>
      <button onclick="ask('What are the best practices for AI safety?')">AI safety tips</button>
      <button onclick="ask('Create a simple Python web scraper')">Code: web scraper</button>
      <button onclick="ask('How to build a SaaS business?')">SaaS business</button>
    </div>
    <div class="messages" id="messages">
      <div class="message message-ai">Hello! I'm Hollywood AI Agent. Ask me anything - I can help with coding, research, writing, analysis, and more. What would you like to know?</div>
    </div>
    <div class="input-area">
      <input type="text" id="input" placeholder="Type your message..." autocomplete="off">
      <button onclick="send()">Send</button>
    </div>
  </div>
  
  <script>
    async function send() {
      const input = document.getElementById('input');
      const msg = input.value.trim();
      if (!msg) return;
      
      addMessage('user', msg);
      input.value = '';
      
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({message: msg})
        });
        const data = await res.json();
        addMessage('ai', data.response || 'No response');
      } catch (e) {
        addMessage('ai', 'Error: ' + e.message);
      }
    }
    
    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'message message-' + role;
      div.textContent = text;
      document.getElementById('messages').appendChild(div);
      document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    }
    
    function ask(q) {
      document.getElementById('input').value = q;
      send();
    }
    
    document.getElementById('input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') send();
    });
  </script>
</body>
</html>`,

  research: `<!DOCTYPE html>
<html>
<head>
  <title>Research | Hollywood AI Agent</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; }
    .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; color: #fff; text-decoration: none; background: #1a1a2e; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .container { max-width: 900px; margin: 0 auto; }
    input { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #1a1a2e; color: #fff; font-size: 16px; margin-bottom: 20px; }
    button { padding: 14px 28px; background: #e94560; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    .results { margin-top: 30px; }
    .result { background: #1a1a2e; padding: 20px; border-radius: 12px; margin-bottom: 15px; }
    .result h3 { color: #e94560; margin-bottom: 10px; }
    .result a { color: #00d26a; }
    .result p { color: #8b8b9e; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">Home</a>
    <a href="/ai">AI Chat</a>
    <a href="/research" class="active">Research</a>
    <a href="/build">Build</a>
    <a href="/automate">Automate</a>
  </div>
  
  <div class="container">
    <h1>🔍 AI Research</h1>
    <p style="color:#8b8b9e;margin-bottom:20px;">Powered by DuckDuckGo for accurate, up-to-date information.</p>
    
    <input type="text" id="query" placeholder="What would you like to research?" autofocus>
    <button onclick="doResearch()">Search</button>
    
    <div class="results" id="results"></div>
  </div>
  
  <script>
    async function doResearch() {
      const query = document.getElementById('query').value;
      if (!query) return;
      
      document.getElementById('results').innerHTML = '<p style="color:#8b8b9e">Searching...</p>';
      
      try {
        const res = await fetch('/api/research', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({query})
        });
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
          document.getElementById('results').innerHTML = data.results.map(r => 
            '<div class="result"><h3><a href="' + r.url + '" target="_blank">' + r.title + '</a></h3><p>' + (r.snippet || '') + '</p></div>'
          ).join('');
        } else {
          document.getElementById('results').innerHTML = '<p>No results found.</p>';
        }
      } catch (e) {
        document.getElementById('results').innerHTML = '<p>Error: ' + e.message + '</p>';
      }
    }
    
    document.getElementById('query').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doResearch();
    });
  </script>
</body>
</html>`,

  build: `<!DOCTYPE html>
<html>
<head>
  <title>Build | Hollywood AI Agent</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; }
    .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; color: #fff; text-decoration: none; background: #1a1a2e; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .container { max-width: 900px; margin: 0 auto; }
    textarea { width: 100%; height: 250px; padding: 14px; border-radius: 8px; border: none; background: #1a1a2e; color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 14px; resize: vertical; }
    button { padding: 14px 28px; background: #e94560; color: #fff; border: none; border-radius: 8px; cursor: pointer; margin: 10px 5px 10px 0; }
    .btn-secondary { background: #2a2a3e; }
    .output { background: #1a1a2e; padding: 20px; border-radius: 12px; margin-top: 20px; max-height: 400px; overflow-y: auto; }
    pre { white-space: pre-wrap; color: #00d26a; font-family: 'JetBrains Mono', monospace; }
    .templates { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .template { background: #1a1a2e; padding: 20px; border-radius: 12px; cursor: pointer; }
    .template:hover { background: #2a2a3e; }
    .template h3 { color: #e94560; margin-bottom: 10px; font-size: 16px; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">Home</a>
    <a href="/ai">AI Chat</a>
    <a href="/research">Research</a>
    <a href="/build" class="active">Build</a>
    <a href="/automate">Automate</a>
  </div>
  
  <div class="container">
    <h1>🔨 AI Code Builder</h1>
    <p style="color:#8b8b9e;margin-bottom:20px;">Describe what you want to build and AI will generate the code.</p>
    
    <div class="templates">
      <div class="template" onclick="setPrompt('Create a simple HTML landing page with hero section, features grid, pricing table, and contact form')">
        <h3>Landing Page</h3>
        <p style="color:#8b8b9e;font-size:14px">Hero, features, pricing, contact</p>
      </div>
      <div class="template" onclick="setPrompt('Create a React TODO app with add, delete, and complete functionality using hooks')">
        <h3>React TODO</h3>
        <p style="color:#8b8b9e;font-size:14px">CRUD with React hooks</p>
      </div>
      <div class="template" onclick="setPrompt('Create a Python Flask REST API with user registration and login endpoints')">
        <h3>Flask API</h3>
        <p style="color:#8b8b9e;font-size:14px">REST API with auth</p>
      </div>
      <div class="template" onclick="setPrompt('Create a Node.js Express server serving static files and REST API')">
        <h3>Express Server</h3>
        <p style="color:#8b8b9e;font-size:14px">Static + API</p>
      </div>
    </div>
    
    <textarea id="prompt" placeholder="Describe what you want to build..."></textarea>
    <button onclick="build()">Generate Code</button>
    <button onclick="clearOutput()" class="btn-secondary">Clear</button>
    <button onclick="download()" class="btn-secondary">Download</button>
    
    <div class="output" id="output"></div>
  </div>
  
  <script>
    function setPrompt(p) { document.getElementById('prompt').value = p; }
    
    async function build() {
      const prompt = document.getElementById('prompt').value;
      if (!prompt) return;
      
      document.getElementById('output').innerHTML = '<p style="color:#8b8b9e">Generating code...</p>';
      
      try {
        const res = await fetch('/api/build', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({prompt})
        });
        const data = await res.json();
        document.getElementById('output').innerHTML = '<pre>' + (data.code || data.error || 'No output') + '</pre>';
      } catch (e) {
        document.getElementById('output').innerHTML = '<p>Error: ' + e.message + '</p>';
      }
    }
    
    function clearOutput() { document.getElementById('output').innerHTML = ''; }
    function download() {
      const code = document.getElementById('output').textContent;
      if (!code) return;
      const blob = new Blob([code], {type: 'text/plain'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'code.txt';
      a.click();
    }
  </script>
</body>
</html>`,

  automate: `<!DOCTYPE html>
<html>
<head>
  <title>Automate | Hollywood AI Agent</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; }
    .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; color: #fff; text-decoration: none; background: #1a1a2e; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .container { max-width: 900px; margin: 0 auto; }
    input { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #1a1a2e; color: #fff; margin-bottom: 15px; }
    select { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #1a1a2e; color: #fff; margin-bottom: 15px; }
    button { padding: 14px 28px; background: #e94560; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    .log { background: #1a1a2e; padding: 20px; border-radius: 12px; margin-top: 20px; max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 14px; }
    .log-entry { padding: 8px 0; border-bottom: 1px solid #2a2a3e; color: #8b8b9e; }
    .log-entry:last-child { border: none; }
    .log-success { color: #00d26a; }
    .log-error { color: #e94560; }
    .tips { background: #1a1a2e; padding: 20px; border-radius: 12px; margin-top: 20px; }
    .tips h3 { color: #e94560; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">Home</a>
    <a href="/ai">AI Chat</a>
    <a href="/research">Research</a>
    <a href="/build">Build</a>
    <a href="/automate" class="active">Automate</a>
  </div>
  
  <div class="container">
    <h1>⚡ Browser Automation</h1>
    <p style="color:#8b8b9e;margin-bottom:20px;">Automate browser tasks with Playwright.</p>
    
    <label style="color:#8b8b9e">URL</label>
    <input type="text" id="url" placeholder="https://example.com">
    
    <label style="color:#8b8b9e">Action Type</label>
    <select id="actionType">
      <option value="scrape">Scrape Page</option>
      <option value="screenshot">Take Screenshot</option>
      <option value="click">Click Element</option>
      <option value="fill">Fill Form</option>
      <option value="navigate">Navigate</option>
      <option value="extract">Extract Data</option>
    </select>
    
    <label style="color:#8b8b9e">Selector / Data (optional)</label>
    <input type="text" id="selector" placeholder="CSS selector or data to fill">
    
    <button onclick="automate()">Run Automation</button>
    
    <div class="log" id="log">
      <div class="log-entry">Ready for automation...</div>
    </div>
    
    <div class="tips">
      <h3>💡 Quick Tips</h3>
      <p style="color:#8b8b9e">• Use CSS selectors for elements<br>
      • Fill form: actionType=fill, selector=#email, data=test@test.com<br>
      • Click: actionType=click, selector=.button-class<br>
      • Extract: actionType=extract, selector=article h1</p>
    </div>
  </div>
  
  <script>
    async function automate() {
      const url = document.getElementById('url').value;
      const actionType = document.getElementById('actionType').value;
      const selector = document.getElementById('selector').value;
      
      if (!url) return;
      
      const action = actionType + (selector ? ': ' + selector : '');
      addLog('Starting: ' + action, 'info');
      
      try {
        const res = await fetch('/api/automate', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url, actionType, selector})
        });
        const data = await res.json();
        
        if (data.success) {
          addLog('✓ Success: ' + data.result, 'success');
        } else {
          addLog('✗ Error: ' + data.error, 'error');
        }
      } catch (e) {
        addLog('✗ Error: ' + e.message, 'error');
      }
    }
    
    function addLog(text, type) {
      const div = document.createElement('div');
      div.className = 'log-entry ' + (type === 'success' ? 'log-success' : type === 'error' ? 'log-error' : '');
      div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text;
      document.getElementById('log').appendChild(div);
    }
  </script>
</body>
</html>`,

  files: `<!DOCTYPE html>
<html>
<head>
  <title>Files | Hollywood AI Agent</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; }
    .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; color: #fff; text-decoration: none; background: #1a1a2e; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .container { max-width: 900px; margin: 0 auto; }
    .file-list { background: #1a1a2e; border-radius: 12px; padding: 20px; }
    .file-item { display: flex; justify-content: space-between; padding: 15px; border-bottom: 1px solid #2a2a3e; }
    .file-item:last-child { border: none; }
    .file-name { color: #e94560; font-weight: 600; }
    .file-actions button { padding: 8px 16px; background: #2a2a3e; color: #fff; border: none; border-radius: 6px; cursor: pointer; margin-left: 10px; }
    .new-file { background: #1a1a2e; padding: 20px; border-radius: 12px; margin-top: 20px; }
    input { width: 100%; padding: 12px; border-radius: 8px; border: none; background: #0f0f1a; color: #fff; margin-bottom: 15px; }
    textarea { width: 100%; height: 200px; padding: 12px; border-radius: 8px; border: none; background: #0f0f1a; color: #fff; font-family: monospace; }
    button { padding: 14px 28px; background: #e94560; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">Home</a>
    <a href="/ai">AI Chat</a>
    <a href="/research">Research</a>
    <a href="/build">Build</a>
    <a href="/automate">Automate</a>
    <a href="/files" class="active">Files</a>
  </div>
  
  <div class="container">
    <h1>📁 File Manager</h1>
    <p style="color:#8b8b9e;margin-bottom:20px;">Create and manage code snippets and files.</p>
    
    <div class="new-file">
      <h3>New File</h3>
      <input type="text" id="fileName" placeholder="filename.js">
      <textarea id="fileContent" placeholder="// Your code here..."></textarea>
      <button onclick="saveFile()">Save File</button>
    </div>
    
    <div class="file-list" id="fileList">
      <p style="color:#8b8b9e">No files yet. Create one above.</p>
    </div>
  </div>
  
  <script>
    async function loadFiles() {
      try {
        const res = await fetch('/api/files');
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          document.getElementById('fileList').innerHTML = data.files.map(f => 
            '<div class="file-item"><span class="file-name">' + f.name + '</span><div class="file-actions"><button onclick="loadFile(\'' + f.name + '\')">Edit</button><button onclick="deleteFile(\'' + f.name + '\')" style="background:#e94560">Delete</button></div></div>'
          ).join('');
        }
      } catch (e) {}
    }
    
    async function saveFile() {
      const name = document.getElementById('fileName').value;
      const content = document.getElementById('fileContent').value;
      if (!name) return;
      
      await fetch('/api/files', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, content})
      });
      loadFiles();
      document.getElementById('fileName').value = '';
      document.getElementById('fileContent').value = '';
    }
    
    async function loadFile(name) {
      const res = await fetch('/api/files?name=' + name);
      const data = await res.json();
      if (data.content) {
        document.getElementById('fileName').value = name;
        document.getElementById('fileContent').value = data.content;
      }
    }
    
    async function deleteFile(name) {
      await fetch('/api/files?name=' + name, {method: 'DELETE'});
      loadFiles();
    }
    
    loadFiles();
  </script>
</body>
</html>`,

  projects: `<!DOCTYPE html>
<html>
<head>
  <title>Projects | Hollywood AI Agent</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; }
    .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; color: #fff; text-decoration: none; background: #1a1a2e; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .container { max-width: 900px; margin: 0 auto; }
    .project-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px; }
    .project { background: #1a1a2e; padding: 25px; border-radius: 12px; }
    .project h3 { color: #e94560; margin-bottom: 10px; }
    .project-status { display: inline-block; padding: 4px 12px; background: #00d26a; color: #000; border-radius: 12px; font-size: 12px; margin-bottom: 10px; }
    .project-status.planning { background: #e94560; color: #fff; }
    .new-project { background: #1a1a2e; padding: 20px; border-radius: 12px; margin-top: 20px; }
    input { width: 100%; padding: 12px; border-radius: 8px; border: none; background: #0f0f1a; color: #fff; margin-bottom: 15px; }
    button { padding: 14px 28px; background: #e94560; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">Home</a>
    <a href="/ai">AI Chat</a>
    <a href="/research">Research</a>
    <a href="/build">Build</a>
    <a href="/projects" class="active">Projects</a>
  </div>
  
  <div class="container">
    <h1>📂 Projects</h1>
    <p style="color:#8b8b9e;margin-bottom:20px;">Create and manage your AI projects.</p>
    
    <div class="new-project">
      <h3>New Project</h3>
      <input type="text" id="projectName" placeholder="Project name">
      <input type="text" id="projectDesc" placeholder="Description">
      <button onclick="createProject()">Create Project</button>
    </div>
    
    <div class="project-grid" id="projectList">
      <p style="color:#8b8b9e">No projects yet. Create one above.</p>
    </div>
  </div>
  
  <script>
    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        if (data.projects && data.projects.length > 0) {
          document.getElementById('projectList').innerHTML = data.projects.map(p => 
            '<div class="project"><span class="project-status ' + p.status + '">' + p.status + '</span><h3>' + p.name + '</h3><p style="color:#8b8b9e">' + (p.description || '') + '</p></div>'
          ).join('');
        }
      } catch (e) {}
    }
    
    async function createProject() {
      const name = document.getElementById('projectName').value;
      const description = document.getElementById('projectDesc').value;
      if (!name) return;
      
      await fetch('/api/projects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, description})
      });
      loadProjects();
      document.getElementById('projectName').value = '';
      document.getElementById('projectDesc').value = '';
    }
    
    loadProjects();
  </script>
</body>
</html>`,

  deploy: `<!DOCTYPE html>
<html>
<head>
  <title>Deploy | Hollywood AI Agent</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; }
    .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; color: #fff; text-decoration: none; background: #1a1a2e; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .container { max-width: 900px; margin: 0 auto; }
    .platforms { display: grid; grid-template-columns: repeat(auto-fit, minwidth(200px), 1fr); gap: 20px; margin-top: 20px; }
    .platform { background: #1a1a2e; padding: 30px; border-radius: 12px; text-align: center; cursor: pointer; transition: transform 0.2s; }
    .platform:hover { transform: translateY(-5px); }
    .platform h3 { color: #e94560; margin-bottom: 10px; }
    .platform p { color: #8b8b9e; }
    .status { background: #1a1a2e; padding: 20px; border-radius: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">Home</a>
    <a href="/ai">AI Chat</a>
    <a href="/research">Research</a>
    <a href="/build">Build</a>
    <a href="/deploy" class="active">Deploy</a>
  </div>
  
  <div class="container">
    <h1>🚀 Deploy</h1>
    <p style="color:#8b8b9e;margin-bottom:20px;">Deploy your projects to the cloud.</p>
    
    <div class="platforms">
      <div class="platform" onclick="deploy('vercel')">
        <h3>Vercel</h3>
        <p>Free edge hosting</p>
      </div>
      <div class="platform" onclick="deploy('netlify')">
        <h3>Netlify</h3>
        <p>Free static hosting</p>
      </div>
      <div class="platform" onclick="deploy('cloudflare')">
        <h3>Cloudflare Pages</h3>
        <p>Free CDN + Workers</p>
      </div>
    </div>
    
    <div class="status" id="status">
      <p style="color:#8b8b9e">Select a platform to deploy.</p>
    </div>
  </div>
  
  <script>
    async function deploy(platform) {
      document.getElementById('status').innerHTML = '<p style="color:#8b8b9e">Deploying to ' + platform + '...</p>';
      
      try {
        const res = await fetch('/api/deploy', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({platform})
        });
        const data = await res.json();
        
        if (data.url) {
          document.getElementById('status').innerHTML = '<p style="color:#00d26a">✓ Deployed to: <a href="' + data.url + '" style="color:#00d26a">' + data.url + '</a></p>';
        } else {
          document.getElementById('status').innerHTML = '<p style="color:#e94560">✗ Error: ' + (data.error || 'Deployment failed') + '</p>';
        }
      } catch (e) {
        document.getElementById('status').innerHTML = '<p style="color:#e94560">✗ Error: ' + e.message + '</p>';
      }
    }
  </script>
</body>
</html>`,

  pricing: `<!DOCTYPE html>
<html>
<head>
  <title>Pricing | Hollywood AI Agent</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; }
    .nav { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
    .nav a { padding: 10px 20px; color: #fff; text-decoration: none; background: #1a1a2e; border-radius: 8px; }
    .nav a:hover, .nav a.active { background: #e94560; }
    .container { max-width: 900px; margin: 0 auto; }
    .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 30px; }
    .plan { background: #1a1a2e; padding: 30px; border-radius: 12px; text-align: center; }
    .plan.featured { border: 2px solid #e94560; }
    .plan h3 { color: #e94560; font-size: 24px; margin-bottom: 10px; }
    .plan .price { font-size: 48px; font-weight: bold; margin: 20px 0; }
    .plan .price span { font-size: 16px; color: #8b8b9e; }
    .plan ul { list-style: none; padding: 0; text-align: left; margin: 20px 0; }
    .plan li { padding: 10px 0; border-bottom: 1px solid #2a2a3e; }
    .plan li:last-child { border: none; }
    .plan .btn { width: 100%; padding: 14px; background: #e94560; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; }
    .plan .btn:hover { background: #d63a54; }
    .current { background: #00d26a; color: #000; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/">Home</a>
    <a href="/ai">AI Chat</a>
    <a href="/pricing" class="active">Pricing</a>
  </div>
  
  <div class="container">
    <h1>💰 Pricing</h1>
    <p style="color:#8b8b9e;margin-bottom:20px;">One of the cheapest AI services. Start free, upgrade anytime.</p>
    
    <div class="plans">
      <div class="plan">
        <h3>Starter</h3>
        <div class="price">$0 <span>/month</span></div>
        <ul>
          <li>✓ 100 AI queries/day</li>
          <li>✓ Research</li>
          <li>✓ Code building</li>
          <li>✓ File manager</li>
        </ul>
        <button class="btn current">Current Plan</button>
      </div>
      
      <div class="plan featured">
        <h3>Pro</h3>
        <div class="price">$2 <span>/month</span></div>
        <ul>
          <li>✓ Unlimited AI queries</li>
          <li>✓ Priority support</li>
          <li>✓ All features</li>
          <li>✓ No ads</li>
        </ul>
        <button class="btn" onclick="upgrade('pro')">Upgrade to Pro</button>
      </div>
      
      <div class="plan">
        <h3>Enterprise</h3>
        <div class="price">$5 <span>/month</span></div>
        <ul>
          <li>✓ Everything in Pro</li>
          <li>✓ Dedicated support</li>
          <li>✓ Custom integrations</li>
          <li>✓ SLA guarantee</li>
        </ul>
        <button class="btn" onclick="upgrade('enterprise')">Contact Sales</button>
      </div>
    </div>
  </div>
  
  <script>
    async function upgrade(plan) {
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({plan})
        });
        const data = await res.json();
        
        if (data.url) {
          window.location.href = data.url;
        } else {
          alert('Error: ' + (data.error || 'Please login first'));
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }
  </script>
</body>
</html>`
};

for (const [path, html] of Object.entries(PAGES)) {
  app.get(path === 'home' ? '/' : `/${path}`, (req, res) => res.send(html));
}

app.get('/api/status', async (req, res) => {
  const aiProvider = GEMINI_API_KEY ? 'Gemini' : GROQ_API_KEY ? 'Groq' : HUGGINGFACE_TOKEN ? 'HuggingFace' : OPENAI_API_KEY ? 'GPT-4' : 'Demo';
  const [userCount, fileCount, projectCount] = await Promise.all([
    storage.userCount(), storage.fileCount(), storage.projectCount()
  ]);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    users: userCount,
    files: fileCount,
    projects: projectCount,
    ai: aiProvider,
    keyLoaded: !!(GEMINI_API_KEY || GROQ_API_KEY || HUGGINGFACE_TOKEN || OPENAI_API_KEY),
    storage: storage.isKVEnabled() ? 'Vercel KV' : 'in-memory'
  });
});

app.get('/api/test', (req, res) => {
  res.send('API working! Key: ' + (GEMINI_API_KEY ? 'YES' : 'NO'));
});

const FREE_DAILY_LIMIT = 100;

async function checkRateLimit(req, res) {
  const { userId, user } = await getSessionData(req);
  if (user && user.plan !== 'starter') return true; // paid users: unlimited
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const key = userId || `ip:${ip}`;
  const count = await storage.rateCheck(key, 86400);
  if (count > FREE_DAILY_LIMIT) {
    res.status(429).json({ error: `Free tier limit reached (${FREE_DAILY_LIMIT}/day). Upgrade to Pro for unlimited access.`, upgradeUrl: '/pricing' });
    return false;
  }
  return true;
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });
  if (!await checkRateLimit(req, res)) return;
  const response = await callAI(message);
  res.json({ response });
});

app.post('/api/research', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  if (!await checkRateLimit(req, res)) return;
  const results = await research(query);
  res.json({ results });
});

app.post('/api/build', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  if (!await checkRateLimit(req, res)) return;
  const code = await callAI(prompt + '\n\nGenerate clean, working code. Only output the code, no explanations.');
  res.json({ code });
});

app.post('/api/automate', async (req, res) => {
  const { url, actionType, selector } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  res.json({ success: true, result: `${actionType} on ${url}${selector ? ' (' + selector + ')' : ''}. Configure Playwright for full automation.` });
});

app.get('/api/files', async (req, res) => {
  res.json({ files: await storage.listFiles() });
});

app.post('/api/files', async (req, res) => {
  const { name, content } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  await storage.setFile(name, content || '');
  res.json({ success: true, name });
});

app.delete('/api/files', async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  await storage.deleteFile(name);
  res.json({ success: true });
});

app.get('/api/projects', async (req, res) => {
  res.json({ projects: await storage.listProjects() });
});

app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  await storage.setProject(name, { description, status: 'planning', created: new Date().toISOString() });
  res.json({ success: true, name });
});

app.post('/api/deploy', async (req, res) => {
  const { platform } = req.body;
  res.json({ 
    success: false, 
    error: 'Configure deployment credentials. Currently showing deployment preview.',
    platforms: ['vercel', 'netlify', 'cloudflare'],
    platform
  });
});

app.get('/api/auth', async (req, res) => {
  const path = req.query.path || '';
  if (path === 'google-login') {
    const redirectUri = `https://${DOMAIN}/api/auth?path=callback/google`;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile&access_type=offline`;
    return res.redirect(url);
  }
  if (path === 'callback/google') {
    const code = req.query.code || '';
    if (!code) return res.redirect('/?error=no-code');
    try {
      const redirectUri = `https://${DOMAIN}/api/auth?path=callback/google`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });
      const tokenData = await tokenRes.json();
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const userData = await userRes.json();
      const userId = userData.id;
      const existing = await storage.getUser(userId);
      if (!existing) await storage.setUser(userId, { email: userData.email, name: userData.name, plan: 'starter', paid: false });
      await setSession(res, userId);
      return res.redirect('/?welcome=' + encodeURIComponent(userData.name));
    } catch (e) { return res.redirect('/?error=auth-failed'); }
  }
  if (path === 'logout') {
    const cookie = req.headers.cookie;
    const match = cookie && cookie.match(/session=([^;]+)/);
    if (match) await storage.deleteSessionToken(match[1]);
    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
    return res.redirect('/');
  }
  res.status(404).json({ error: 'Not found' });
});

app.post('/api/auth', async (req, res) => {
  const path = req.query.path || '';
  if (path === 'signup') {
    const { email, plan, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const userId = 'user_' + Math.random().toString(36).substring(2, 12);
    await storage.setUser(userId, { email, name: name || email.split('@')[0], plan: plan || 'starter', paid: false });
    await setSession(res, userId);
    return res.status(200).json({ success: true, userId, name: name || email.split('@')[0], plan: plan || 'starter' });
  }
  if (path === 'check') {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: 'Not logged in', loggedIn: false });
    return res.status(200).json({ loggedIn: true, ...user });
  }
  res.status(404).json({ error: 'Not found' });
});

app.post('/api/stripe/checkout', async (req, res) => {
  const { userId, user } = await getSessionData(req);
  if (!user) return res.status(401).json({ error: 'Not logged in' });

  const { plan } = req.body;
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  const prices = { starter: 0, pro: 200, enterprise: 500 };
  const amount = prices[plan] ?? 0;

  if (amount === 0) {
    await storage.setUser(userId, { ...user, plan: 'starter', paid: true });
    return res.json({ success: true, plan: 'starter' });
  }

  try {
    const customerRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'client_reference_id': userId,
        'customer_email': user.email,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(amount),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][product_data][name]': `Hollywood AI - ${plan} plan`,
        'line_items[0][quantity]': '1',
        'success_url': `https://${DOMAIN}/?upgrade=success&plan=${plan}`,
        'cancel_url': `https://${DOMAIN}/pricing`,
      }),
    });
    const session = await customerRes.json();
    
    if (session.url) {
      return res.json({ url: session.url });
    } else {
      return res.status(500).json({ error: session.error?.message || 'Checkout failed' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/stripe/webhook', async (req, res) => {
  const event = req.body;
  if (event.type === 'checkout.session.completed') {
    const email = event.data.object?.customer_email;
    const clientRef = event.data.object?.client_reference_id;
    if (clientRef) {
      const userData = await storage.getUser(clientRef);
      if (userData && userData.email === email) {
        await storage.setUser(clientRef, { ...userData, paid: true, plan: 'pro' });
        sendDiscord('Payment Received', `User ${email} upgraded to Pro!`);
      }
    }
  }
  res.json({ received: true });
});

app.use((req, res) => res.status(404).send('Not Found'));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Hollywood AI Agent running on port ${PORT}`));
}

module.exports = app;