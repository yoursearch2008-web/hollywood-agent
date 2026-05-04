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
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
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

// â”€â”€â”€ Responsive Layout System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const _CSS = `
:root{--bg:#0f0f1a;--nav:#13132a;--surf:#1a1a2e;--surf2:#242438;--bdr:#2a2a3e;--acc:#e94560;--acc2:#c73550;--grn:#00d26a;--mut:#8b8b9e;--r:12px;--nh:58px}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:#fff;min-height:100dvh;font-size:16px}
a{color:inherit;text-decoration:none}
.nav{position:sticky;top:0;z-index:200;background:var(--nav);border-bottom:1px solid var(--bdr)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;height:var(--nh);padding:0 16px;max-width:1100px;margin:0 auto}
.nav-brand{color:var(--acc);font-weight:700;font-size:18px}
.nav-links{display:flex;gap:4px;align-items:center}
.nav-links a{padding:8px 12px;border-radius:8px;font-size:14px;white-space:nowrap;transition:background .15s}
.nav-links a:hover,.nav-links a.active{background:var(--acc)}
.hbg{display:none;align-items:center;justify-content:center;width:44px;height:44px;background:none;border:none;color:#fff;cursor:pointer;border-radius:8px}
.hbg:hover{background:var(--surf)}
@media(max-width:768px){
  .hbg{display:flex}
  .nav-links{display:none;flex-direction:column;align-items:stretch;gap:4px;position:absolute;top:var(--nh);left:0;right:0;background:var(--nav);padding:8px 12px 12px;border-bottom:1px solid var(--bdr)}
  .nav-links.open{display:flex}
  .nav-links a{padding:14px 16px;font-size:16px;border-radius:8px}
}
.page{max-width:1100px;margin:0 auto;padding:24px 16px;padding-bottom:calc(32px + env(safe-area-inset-bottom,0px))}
.ph{margin-bottom:24px}
.ph h1{font-size:clamp(1.4rem,4vw,2.2rem)}
.ph p{color:var(--mut);margin-top:8px;line-height:1.5}
.card{background:var(--surf);border-radius:var(--r);padding:22px}
.card+.card{margin-top:16px}
.card h3{color:var(--acc);margin-bottom:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 22px;border-radius:8px;border:none;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s;text-decoration:none;line-height:1}
.btn-p{background:var(--acc);color:#fff}
.btn-p:hover{background:var(--acc2)}
.btn-s{background:var(--surf2);color:#fff}
.btn-s:hover{background:var(--bdr)}
.btn-g{background:#4285f4;color:#fff}
.btn-g:hover{background:#3367d6}
.btn-w{width:100%}
.btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
input[type=text],input[type=email],input[type=password],input[type=url],select,textarea{width:100%;padding:12px 14px;background:var(--bg);border:1px solid var(--bdr);border-radius:8px;color:#fff;font-size:16px;outline:none;transition:border-color .15s;-webkit-appearance:none;appearance:none}
input:focus,select:focus,textarea:focus{border-color:var(--acc)}
select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238b8b9e' stroke-width='2' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px}
textarea{font-family:inherit;resize:vertical}
.fg{margin-bottom:14px}
.fg label{display:block;color:var(--mut);font-size:14px;margin-bottom:6px}
.grid{display:grid;gap:16px}
.g3{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.g2{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.status-grid{background:var(--bdr);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column;gap:1px}
.sr{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:var(--surf)}
.sr-l{color:var(--mut)}
.sr-v{font-weight:600}
.online{color:var(--grn)}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}
.bg-g{background:var(--grn);color:#000}
.bg-r{background:var(--acc);color:#fff}
a.fcard{display:block;background:var(--surf);border-radius:var(--r);padding:22px;transition:transform .2s,background .15s}
a.fcard:hover{transform:translateY(-4px);background:var(--surf2)}
a.fcard h3{color:var(--acc);margin-bottom:8px;font-size:17px}
a.fcard p{color:var(--mut);font-size:14px;line-height:1.6}
.chat-wrap{display:flex;flex-direction:column;height:calc(100dvh - var(--nh))}
.chat-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.msg{padding:12px 16px;border-radius:10px;max-width:85%;font-size:15px;line-height:1.5;word-break:break-word}
.msg-u{background:var(--acc);align-self:flex-end}
.msg-a{background:var(--surf);align-self:flex-start}
.chips{padding:8px 16px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;flex-shrink:0;border-bottom:1px solid var(--bdr)}
.chips::-webkit-scrollbar{display:none}
.chip{flex-shrink:0;padding:9px 14px;background:var(--surf2);color:#fff;border:none;border-radius:20px;cursor:pointer;font-size:13px;white-space:nowrap;min-height:36px}
.chip:hover{background:var(--acc)}
.chat-in{display:flex;gap:8px;padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));background:var(--nav);border-top:1px solid var(--bdr);flex-shrink:0}
.chat-in input{flex:1;min-height:44px}
.outbox{background:var(--surf);border-radius:var(--r);padding:16px;margin-top:16px;max-height:380px;overflow-y:auto}
pre{white-space:pre-wrap;word-break:break-word;color:var(--grn);font-family:'Courier New',monospace;font-size:14px}
.le{padding:8px 0;border-bottom:1px solid var(--bdr);color:var(--mut);font-family:monospace;font-size:13px}
.le:last-child{border:none}
.le-ok{color:var(--grn)}
.le-err{color:var(--acc)}
.fi{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--bdr);flex-wrap:wrap;gap:8px}
.fi:last-child{border:none}
.fn{color:var(--acc);font-weight:600;word-break:break-all}
.fa{display:flex;gap:6px;flex-shrink:0}
.plan{background:var(--surf);border-radius:var(--r);padding:28px;text-align:center;border:2px solid transparent}
.plan.feat{border-color:var(--acc)}
.pname{color:var(--acc);font-size:22px;font-weight:700;margin-bottom:6px}
.pprice{font-size:48px;font-weight:800;margin:14px 0}
.pprice small{font-size:16px;color:var(--mut);font-weight:400}
.plist{list-style:none;text-align:left;margin:14px 0 20px}
.plist li{padding:10px 0;border-bottom:1px solid var(--bdr);font-size:15px}
.plist li:last-child{border:none}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:3px}
`;

function _nav(active) {
  const L=[['/',  'home','Home'],['/ai','ai','AI Chat'],['/research','research','Research'],['/build','build','Build'],['/automate','automate','Automate'],['/files','files','Files'],['/projects','projects','Projects'],['/deploy','deploy','Deploy'],['/pricing','pricing','Pricing']];
  return `<nav class="nav"><div class="nav-inner"><a href="/" class="nav-brand">Hollywood AI</a><button class="hbg" onclick="document.getElementById('nl').classList.toggle('open')" aria-label="Menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button><div class="nav-links" id="nl">${L.map(([h,k,l])=>`<a href="${h}"${active===k?' class="active"':''} onclick="document.getElementById('nl').classList.remove('open')">${l}</a>`).join('')}</div></div></nav><script>document.addEventListener('click',e=>{if(!e.target.closest('.nav-inner'))document.getElementById('nl').classList.remove('open');});<\/script>`;
}

function _page(title, active, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0f0f1a"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><title>${title} | Hollywood AI</title><style>${_CSS}</style></head><body>${_nav(active)}${body}</body></html>`;
}

// â”€â”€â”€ Pages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PAGES = {

home: _page('Home', 'home', `
<main class="page">
  <div class="ph">
    <h1>Hollywood AI Agent <span class="badge bg-r" style="font-size:12px;vertical-align:middle;margin-left:8px">v1.0</span></h1>
    <p>Self-improving AI agent for automated system building</p>
  </div>
  <div class="status-grid">
    <div class="sr"><span class="sr-l">Status</span><span class="sr-v online">â— Online</span></div>
    <div class="sr"><span class="sr-l">Environment</span><span class="sr-v">Production</span></div>
    <div class="sr"><span class="sr-l">AI Provider</span><span class="sr-v">${GEMINI_API_KEY ? 'Gemini' : GROQ_API_KEY ? 'Groq' : HUGGINGFACE_TOKEN ? 'HuggingFace' : OPENAI_API_KEY ? 'GPT-4' : 'Demo'}</span></div>
    <div class="sr"><span class="sr-l">Users</span><span class="sr-v" id="uc">â€¦</span></div>
  </div>
  <div class="grid g3" style="margin-top:20px">
    <a href="/ai" class="fcard"><h3>ðŸ’¬ AI Chat</h3><p>Chat with AI. Coding, research, writing, analysis.</p></a>
    <a href="/research" class="fcard"><h3>ðŸ” Research</h3><p>AI-powered web research using DuckDuckGo.</p></a>
    <a href="/build" class="fcard"><h3>ðŸ”¨ Build</h3><p>Generate code and build websites/apps in any language.</p></a>
    <a href="/automate" class="fcard"><h3>âš¡ Automate</h3><p>Browser automation with Playwright.</p></a>
    <a href="/files" class="fcard"><h3>ðŸ“ Files</h3><p>Manage code snippets and files.</p></a>
    <a href="/projects" class="fcard"><h3>ðŸ“‚ Projects</h3><p>Create and manage AI projects.</p></a>
    <a href="/deploy" class="fcard"><h3>ðŸš€ Deploy</h3><p>Deploy to Vercel, Netlify, or Cloudflare.</p></a>
    <a href="/pricing" class="fcard"><h3>ðŸ’° Pricing</h3><p>Free tier Â· Pro $2/mo Â· Enterprise $5/mo.</p></a>
  </div>
  <div class="card" style="margin-top:20px" id="authBox">
    <h3>Get Started Free</h3>
    <a href="/api/auth?path=google-login" class="btn btn-g btn-w" style="margin-bottom:14px">Sign in with Google</a>
    <div style="text-align:center;color:var(--mut);font-size:14px;margin-bottom:14px">or</div>
    <div class="fg"><label>Email</label><input type="email" id="se" placeholder="you@example.com"></div>
    <button class="btn btn-p btn-w" onclick="signup()">Start Free</button>
    <p style="color:var(--mut);font-size:12px;margin-top:10px;text-align:center">100 AI requests/day Â· No credit card required</p>
  </div>
  <footer style="text-align:center;color:var(--mut);margin-top:40px;padding-top:16px;border-top:1px solid var(--bdr);font-size:14px">
    Hollywood AI Agent Â© 2026 Â· <a href="/api/status" style="color:var(--mut)">API</a>
  </footer>
</main>
<script>
fetch('/api/status').then(r=>r.json()).then(d=>{const e=document.getElementById('uc');if(e)e.textContent=(d.users||0)+' registered';}).catch(()=>{});
fetch('/api/auth?path=check',{method:'POST'}).then(r=>r.json()).then(d=>{if(d.loggedIn){const b=document.getElementById('authBox');if(b)b.innerHTML='<p style="color:var(--grn);font-size:16px;text-align:center;padding:16px">Welcome back, <strong>'+(d.name||d.email)+'</strong>! <a href="/ai" style="color:var(--acc)">Open AI Chat â†’</a></p>';}}).catch(()=>{});
async function signup(){const e=document.getElementById('se').value.trim();if(!e)return;const r=await fetch('/api/auth?path=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e})});const d=await r.json();if(d.success)window.location.href='/ai?welcome='+encodeURIComponent(d.name);}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.activeElement.id==='se')signup();});
</script>
`),

ai: _page('AI Chat', 'ai', `
<div class="chat-wrap">
  <div class="chips">
    <button class="chip" onclick="ask('Explain quantum computing in simple terms')">Quantum computing</button>
    <button class="chip" onclick="ask('Best practices for AI safety')">AI safety</button>
    <button class="chip" onclick="ask('Create a Python web scraper')">Web scraper</button>
    <button class="chip" onclick="ask('How to build a SaaS business?')">SaaS tips</button>
    <button class="chip" onclick="ask('Write a REST API in Node.js')">REST API</button>
    <button class="chip" onclick="ask('Explain machine learning algorithms')">ML algorithms</button>
  </div>
  <div class="chat-msgs" id="msgs">
    <div class="msg msg-a">Hello! I'm Hollywood AI Agent. Ask me anything â€” coding, research, writing, analysis. What would you like to know?</div>
  </div>
  <div class="chat-in">
    <input type="text" id="inp" placeholder="Type a messageâ€¦" autocomplete="off">
    <button class="btn btn-p" onclick="send()">Send</button>
  </div>
</div>
<script>
async function send(){const i=document.getElementById('inp');const m=i.value.trim();if(!m)return;addMsg('u',m);i.value='';try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m})});const d=await r.json();addMsg('a',d.response||'No response');}catch(e){addMsg('a','Error: '+e.message);}}
function addMsg(r,t){const d=document.createElement('div');d.className='msg msg-'+r;d.textContent=t;const c=document.getElementById('msgs');c.appendChild(d);c.scrollTop=c.scrollHeight;}
function ask(q){document.getElementById('inp').value=q;send();}
document.getElementById('inp').addEventListener('keypress',e=>{if(e.key==='Enter')send();});
</script>
`),

research: _page('Research', 'research', `
<main class="page">
  <div class="ph"><h1>ðŸ” AI Research</h1><p>Powered by DuckDuckGo for accurate, up-to-date results.</p></div>
  <div style="display:flex;gap:8px;margin-bottom:20px;align-items:flex-start">
    <input type="text" id="q" placeholder="What would you like to research?" style="flex:1">
    <button class="btn btn-p" style="flex-shrink:0" onclick="doR()">Search</button>
  </div>
  <div id="res"></div>
</main>
<script>
async function doR(){const q=document.getElementById('q').value;if(!q)return;document.getElementById('res').innerHTML='<p style="color:var(--mut)">Searchingâ€¦</p>';try{const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})});const d=await r.json();if(d.results&&d.results.length){document.getElementById('res').innerHTML=d.results.map(r=>'<div class="card" style="margin-bottom:12px"><h3 style="margin-bottom:8px"><a href="'+r.url+'" target="_blank" style="color:var(--acc)">'+r.title+'</a></h3><p style="color:var(--mut);line-height:1.6;font-size:15px">'+r.snippet+'</p></div>').join('');}else{document.getElementById('res').innerHTML='<p>No results found.</p>';}}catch(e){document.getElementById('res').innerHTML='<p style="color:var(--acc)">Error: '+e.message+'</p>';}}
document.getElementById('q').addEventListener('keypress',e=>{if(e.key==='Enter')doR();});
</script>
`),

build: _page('Build', 'build', `
<main class="page">
  <div class="ph"><h1>ðŸ”¨ AI Code Builder</h1><p>Describe what you want and AI generates the code.</p></div>
  <div class="grid g2" style="margin-bottom:20px">
    <div class="card" style="cursor:pointer" onclick="setP('Create a simple HTML landing page with hero section, features grid, pricing table and contact form')"><h3>Landing Page</h3><p style="color:var(--mut);font-size:14px">Hero Â· Features Â· Pricing Â· Contact</p></div>
    <div class="card" style="cursor:pointer" onclick="setP('Create a React TODO app with add, delete and complete functionality using hooks')"><h3>React TODO</h3><p style="color:var(--mut);font-size:14px">CRUD with React hooks</p></div>
    <div class="card" style="cursor:pointer" onclick="setP('Create a Python Flask REST API with user registration and login endpoints')"><h3>Flask API</h3><p style="color:var(--mut);font-size:14px">REST API with auth</p></div>
    <div class="card" style="cursor:pointer" onclick="setP('Create a Node.js Express server serving static files and REST API')"><h3>Express Server</h3><p style="color:var(--mut);font-size:14px">Static + API</p></div>
  </div>
  <div class="fg"><textarea id="pr" rows="5" placeholder="Describe what you want to buildâ€¦" style="min-height:140px"></textarea></div>
  <div class="btn-row">
    <button class="btn btn-p" onclick="build()">Generate Code</button>
    <button class="btn btn-s" onclick="document.getElementById('out').innerHTML=''">Clear</button>
    <button class="btn btn-s" onclick="dl()">Download</button>
  </div>
  <div class="outbox" id="out"></div>
</main>
<script>
function setP(p){document.getElementById('pr').value=p;window.scrollTo(0,document.getElementById('pr').getBoundingClientRect().top+window.scrollY-80);}
async function build(){const p=document.getElementById('pr').value;if(!p)return;document.getElementById('out').innerHTML='<p style="color:var(--mut)">Generating codeâ€¦</p>';try{const r=await fetch('/api/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:p})});const d=await r.json();document.getElementById('out').innerHTML='<pre>'+(d.code||d.error||'No output')+'</pre>';}catch(e){document.getElementById('out').innerHTML='<p style="color:var(--acc)">Error: '+e.message+'</p>';}}
function dl(){const c=document.getElementById('out').textContent;if(!c)return;const b=new Blob([c],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='code.txt';a.click();}
</script>
`),

automate: _page('Automate', 'automate', `
<main class="page">
  <div class="ph"><h1>âš¡ Browser Automation</h1><p>Automate browser tasks with Playwright.</p></div>
  <div class="card">
    <div class="fg"><label>URL</label><input type="url" id="url" placeholder="https://example.com"></div>
    <div class="fg"><label>Action Type</label><select id="act"><option value="scrape">Scrape Page</option><option value="screenshot">Screenshot</option><option value="click">Click Element</option><option value="fill">Fill Form</option><option value="navigate">Navigate</option><option value="extract">Extract Data</option></select></div>
    <div class="fg"><label>Selector / Data (optional)</label><input type="text" id="sel" placeholder="CSS selector or fill data"></div>
    <button class="btn btn-p" onclick="run()">Run Automation</button>
  </div>
  <div class="outbox" id="log"><div class="le">Readyâ€¦</div></div>
  <div class="card" style="margin-top:16px">
    <h3>ðŸ’¡ Tips</h3>
    <p style="color:var(--mut);font-size:14px;line-height:1.8">
      â€¢ Use CSS selectors: <code style="color:var(--grn)">.button</code>, <code style="color:var(--grn)">#email</code><br>
      â€¢ Fill form: action=fill, selector=#field, data=value<br>
      â€¢ Click: action=click, selector=.btn<br>
      â€¢ Extract: action=extract, selector=article h1
    </p>
  </div>
</main>
<script>
async function run(){const url=document.getElementById('url').value;if(!url)return;const act=document.getElementById('act').value;const sel=document.getElementById('sel').value;log('Starting: '+act+(sel?' â†’ '+sel:''),'');try{const r=await fetch('/api/automate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,actionType:act,selector:sel})});const d=await r.json();if(d.success)log('âœ“ '+d.result,'le-ok');else log('âœ— '+d.error,'le-err');}catch(e){log('âœ— '+e.message,'le-err');}}
function log(t,cls){const d=document.createElement('div');d.className='le '+(cls||'');d.textContent='['+new Date().toLocaleTimeString()+'] '+t;const box=document.getElementById('log');box.appendChild(d);box.scrollTop=box.scrollHeight;}
</script>
`),

files: _page('Files', 'files', `
<main class="page">
  <div class="ph"><h1>ðŸ“ File Manager</h1><p>Create and manage code snippets and files.</p></div>
  <div class="card">
    <h3>New File</h3>
    <div class="fg"><label>Filename</label><input type="text" id="fn" placeholder="script.js"></div>
    <div class="fg"><label>Content</label><textarea id="fc" rows="8" placeholder="// Your code hereâ€¦" style="font-family:monospace;font-size:14px"></textarea></div>
    <button class="btn btn-p" onclick="save()">Save File</button>
  </div>
  <div class="card" style="margin-top:16px" id="fl"><p style="color:var(--mut)">No files yet. Create one above.</p></div>
</main>
<script>
async function load(){try{const r=await fetch('/api/files');const d=await r.json();const el=document.getElementById('fl');if(d.files&&d.files.length){el.innerHTML=d.files.map(f=>'<div class="fi"><span class="fn">'+f.name+'</span><div class="fa"><button class="btn btn-s" style="min-height:36px;padding:6px 14px;font-size:13px" onclick="edit(\''+f.name+'\')">Edit</button><button class="btn btn-p" style="min-height:36px;padding:6px 14px;font-size:13px" onclick="del(\''+f.name+'\')">Delete</button></div></div>').join('');}else{el.innerHTML='<p style="color:var(--mut)">No files yet.</p>';}}catch(e){}}
async function save(){const n=document.getElementById('fn').value;const c=document.getElementById('fc').value;if(!n)return;await fetch('/api/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,content:c})});document.getElementById('fn').value='';document.getElementById('fc').value='';load();}
async function edit(n){const r=await fetch('/api/files?name='+n);const d=await r.json();if(d.content){document.getElementById('fn').value=n;document.getElementById('fc').value=d.content;window.scrollTo({top:0,behavior:'smooth'});}}
async function del(n){if(!confirm('Delete '+n+'?'))return;await fetch('/api/files?name='+n,{method:'DELETE'});load();}
load();
</script>
`),

projects: _page('Projects', 'projects', `
<main class="page">
  <div class="ph"><h1>ðŸ“‚ Projects</h1><p>Create and manage your AI projects.</p></div>
  <div class="card">
    <h3>New Project</h3>
    <div class="fg"><label>Name</label><input type="text" id="pn" placeholder="My AI project"></div>
    <div class="fg"><label>Description</label><input type="text" id="pd" placeholder="What does this project do?"></div>
    <button class="btn btn-p" onclick="create()">Create Project</button>
  </div>
  <div class="grid g2" style="margin-top:16px" id="pl"><p style="color:var(--mut)">No projects yet.</p></div>
</main>
<script>
async function load(){try{const r=await fetch('/api/projects');const d=await r.json();const el=document.getElementById('pl');if(d.projects&&d.projects.length){el.innerHTML=d.projects.map(p=>'<div class="card"><span class="badge '+(p.status==='active'?'bg-g':'bg-r')+'" style="margin-bottom:8px;display:inline-block">'+p.status+'</span><h3>'+p.name+'</h3><p style="color:var(--mut);font-size:14px;margin-top:4px">'+(p.description||'')+'</p></div>').join('');}else{el.innerHTML='<p style="color:var(--mut)">No projects yet.</p>';}}catch(e){}}
async function create(){const n=document.getElementById('pn').value;const d=document.getElementById('pd').value;if(!n)return;await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,description:d})});document.getElementById('pn').value='';document.getElementById('pd').value='';load();}
load();
</script>
`),

deploy: _page('Deploy', 'deploy', `
<main class="page">
  <div class="ph"><h1>ðŸš€ Deploy</h1><p>Deploy your projects to the cloud for free.</p></div>
  <div class="grid g3">
    <div class="card" style="cursor:pointer;text-align:center" onclick="dep('vercel')">
      <div style="font-size:2.5rem;margin-bottom:10px">â–²</div>
      <h3>Vercel</h3><p style="color:var(--mut);font-size:14px">Free edge hosting</p>
    </div>
    <div class="card" style="cursor:pointer;text-align:center" onclick="dep('netlify')">
      <div style="font-size:2.5rem;margin-bottom:10px">ðŸŒ</div>
      <h3>Netlify</h3><p style="color:var(--mut);font-size:14px">Free static hosting</p>
    </div>
    <div class="card" style="cursor:pointer;text-align:center" onclick="dep('cloudflare')">
      <div style="font-size:2.5rem;margin-bottom:10px">â˜ï¸</div>
      <h3>Cloudflare Pages</h3><p style="color:var(--mut);font-size:14px">Free CDN + Workers</p>
    </div>
  </div>
  <div class="card" style="margin-top:16px" id="st"><p style="color:var(--mut)">Select a platform to deploy.</p></div>
</main>
<script>
async function dep(p){document.getElementById('st').innerHTML='<p style="color:var(--mut)">Deploying to '+p+'â€¦</p>';try{const r=await fetch('/api/deploy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:p})});const d=await r.json();if(d.url){document.getElementById('st').innerHTML='<p style="color:var(--grn)">âœ“ Deployed: <a href="'+d.url+'" target="_blank" style="color:var(--grn)">'+d.url+'</a></p>';}else{document.getElementById('st').innerHTML='<p style="color:var(--acc)">âœ— '+(d.error||'Deployment failed')+'</p>';}}catch(e){document.getElementById('st').innerHTML='<p style="color:var(--acc)">âœ— '+e.message+'</p>';}}
</script>
`),

pricing: _page('Pricing', 'pricing', `
<main class="page">
  <div class="ph"><h1>ðŸ’° Pricing</h1><p>Start free â€” one of the cheapest AI services available.</p></div>
  <div class="grid g3">
    <div class="plan">
      <div class="pname">Starter</div>
      <div class="pprice">$0 <small>/mo</small></div>
      <ul class="plist">
        <li>âœ“ 100 AI queries/day</li>
        <li>âœ“ Research</li>
        <li>âœ“ Code builder</li>
        <li>âœ“ File manager</li>
      </ul>
      <button class="btn btn-s btn-w" disabled style="opacity:.6;cursor:default">Current Plan</button>
    </div>
    <div class="plan feat">
      <div class="pname">Pro</div>
      <div class="pprice">$2 <small>/mo</small></div>
      <ul class="plist">
        <li>âœ“ Unlimited AI queries</li>
        <li>âœ“ Priority support</li>
        <li>âœ“ All features</li>
        <li>âœ“ No ads</li>
      </ul>
      <button class="btn btn-p btn-w" onclick="up('pro')">Upgrade to Pro</button>
    </div>
    <div class="plan">
      <div class="pname">Enterprise</div>
      <div class="pprice">$5 <small>/mo</small></div>
      <ul class="plist">
        <li>âœ“ Everything in Pro</li>
        <li>âœ“ Dedicated support</li>
        <li>âœ“ Custom integrations</li>
        <li>âœ“ SLA guarantee</li>
      </ul>
      <button class="btn btn-p btn-w" onclick="up('enterprise')">Contact Sales</button>
    </div>
  </div>
</main>
<script>
async function up(p){try{const r=await fetch('/api/stripe/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:p})});const d=await r.json();if(d.url){window.location.href=d.url;}else{alert('Error: '+(d.error||'Please login first'));}}catch(e){alert('Error: '+e.message);}}
</script>
`),

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
  // Verify Stripe signature to prevent spoofed webhook calls
  if (STRIPE_WEBHOOK_SECRET) {
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });
    try {
      // Manual HMAC verification (avoids needing the stripe npm package)
      const crypto = require('crypto');
      const parts = sig.split(',').reduce((acc, p) => { const [k,v] = p.split('='); acc[k] = v; return acc; }, {});
      const timestamp = parts.t;
      const payload = `${timestamp}.${req.body.toString()}`;
      const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(payload).digest('hex');
      if (expected !== parts.v1) return res.status(400).json({ error: 'Invalid signature' });
    } catch (e) {
      return res.status(400).json({ error: 'Signature verification failed' });
    }
  }

  let event;
  try {
    event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (event.type === 'checkout.session.completed') {
    const email = event.data.object?.customer_email;
    const clientRef = event.data.object?.client_reference_id;
    const stripeCustomerId = event.data.object?.customer;
    if (clientRef) {
      const userData = await storage.getUser(clientRef);
      if (userData && userData.email === email) {
        await storage.setUser(clientRef, { ...userData, paid: true, plan: 'pro', stripeCustomerId });
        if (stripeCustomerId) await storage.setStripeCustomer(stripeCustomerId, clientRef);
        sendDiscord('Payment Received', `User ${email} upgraded to Pro!`);
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const stripeCustomerId = event.data.object?.customer;
    if (stripeCustomerId) {
      const userId = await storage.getUserIdByStripeCustomer(stripeCustomerId);
      if (userId) {
        const userData = await storage.getUser(userId);
        if (userData) {
          await storage.setUser(userId, { ...userData, paid: false, plan: 'starter', stripeCustomerId: null });
          sendDiscord('Subscription Cancelled', `User ${userData.email} downgraded to Starter.`);
        }
      } else {
        sendDiscord('Subscription Cancelled', `Customer ${stripeCustomerId} cancelled (user not found).`);
      }
    }
  }

  res.json({ received: true });
});

// â”€â”€â”€ Research Cron Job â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/jobs/research', async (req, res) => {
  const secret = process.env.JOBS_SECRET || '';
  const key = req.query.key || req.headers['x-jobs-secret'] || '';
  if (secret && key !== secret) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { runResearch } = require('./jobs/research');
    const result = await runResearch({
      groqKey: GROQ_API_KEY,
      hfToken: HUGGINGFACE_TOKEN,
      discordWebhook: DISCORD_WEBHOOK_URL,
      memoryPath: null, // read-only filesystem on Vercel
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use((req, res) => res.status(404).send('Not Found'));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Hollywood AI Agent running on port ${PORT}`));
}

module.exports = app;