import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, Check, ChevronDown, Clipboard, Command, Menu, MessageSquare, Plus, Search, Sparkles, SquarePen, Trash2, X } from 'lucide-react';
import { Button } from './components/ui/button.jsx';
import { Input } from './components/ui/input.jsx';
import { Textarea } from './components/ui/textarea.jsx';
import './style.css';

const api = '/api';
const starters = [
  { title: 'Plan a thoughtful week', sub: 'Make room for what matters', prompt: 'Help me plan a thoughtful week with time for focused work, movement, and rest.' },
  { title: 'Make this clearer', sub: 'Edit a note or rough draft', prompt: 'Can you help me make a piece of writing clearer and more engaging?' },
  { title: 'Learn something new', sub: 'Get a gentle explanation', prompt: 'Explain a complex idea simply, with a useful example.' }
];
const timeLabel = (date) => { const value = new Date(date); const now = new Date(); return value.toDateString() === now.toDateString() ? 'Today' : value.toDateString() === new Date(now - 86400000).toDateString() ? 'Yesterday' : value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

function App() {
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [tone, setTone] = useState('Professional');
  const [prompt, setPrompt] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(-1);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [status, setStatus] = useState('checking');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const loadThreads = async () => {
    try { const response = await fetch(`${api}/conversations`); if (!response.ok) throw new Error(); setThreads(await response.json()); }
    catch { setStatus('offline'); }
  };
  useEffect(() => { loadThreads(); fetch(`${api}/health`).then((r) => r.json()).then((d) => setStatus(d.database === 'mongodb' ? 'connected' : 'local')).catch(() => setStatus('offline')); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending]);
  useEffect(() => { const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector('#thread-search')?.focus(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); newConversation(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); });

  const newConversation = async () => {
    setError(''); setMessages([]); setTone('Professional'); setSidebarOpen(false);
    try { const response = await fetch(`${api}/conversations`, { method: 'POST' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setActive(data.id); loadThreads(); }
    catch { setActive(null); setError('The chat service is unavailable. Start the server, then try again.'); }
  };
  const openConversation = async (id) => {
    setError(''); setSidebarOpen(false);
    try { const response = await fetch(`${api}/conversations/${id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setActive(id); setMessages(data.messages || []); setTone(data.tone || 'Professional'); }
    catch { setError('Could not open this conversation.'); }
  };
  const deleteConversation = async (id) => {
    try { await fetch(`${api}/conversations/${id}`, { method: 'DELETE' }); if (id === active) { setActive(null); setMessages([]); } loadThreads(); }
    catch { setError('Could not delete this conversation.'); }
  };
  const sendMessage = async (value = prompt) => {
    const content = value.trim(); if (!content || sending) return;
    setError(''); setPrompt(''); setSending(true);
    let conversationId = active;
    try {
      if (!conversationId) { const created = await fetch(`${api}/conversations`, { method: 'POST' }); const thread = await created.json(); if (!created.ok) throw new Error(thread.error); conversationId = thread.id; setActive(conversationId); }
      const nextMessages = [...messages, { role: 'user', content }, { role: 'assistant', content: '' }];
      setMessages(nextMessages);
      const response = await fetch(`${api}/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: content, tone }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Could not get a response.'); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split('\n\n'); buffer = events.pop() || '';
        for (const event of events) { const line = event.split('\n').find((item) => item.startsWith('data:')); if (!line) continue; const payload = JSON.parse(line.slice(5).trim()); if (payload.error) throw new Error(payload.error); if (payload.text) setMessages((current) => { const copy = [...current]; const last = copy.length - 1; copy[last] = { ...copy[last], content: copy[last].content + payload.text }; return copy; }); }
        if (done) break;
      }
      loadThreads();
    } catch (err) { setMessages((current) => current.at(-1)?.role === 'assistant' && !current.at(-1)?.content ? current.slice(0, -1) : current); setError(err.message || 'Something went wrong. Please try again.'); }
    finally { setSending(false); }
  };
  const copyMessage = async (text, index) => { await navigator.clipboard.writeText(text); setCopied(index); setTimeout(() => setCopied(-1), 1500); };
  const groupedThreads = threads.filter((thread) => thread.title.toLowerCase().includes(search.toLowerCase())).reduce((groups, item) => { const label = timeLabel(item.updatedAt); (groups[label] ||= []).push(item); return groups; }, {});

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="side-top"><a className="brand" href="#" onClick={(e) => e.preventDefault()}><span className="brand-mark"><Sparkles size={16} /></span><span>kindred</span></a><button className="icon-button mobile-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
      <Button variant="outline" className="new-chat" onClick={newConversation}><SquarePen size={17} /><span>New conversation</span><kbd>⌘ J</kbd></Button>
      <label className="search-box"><Search size={15} /><Input id="thread-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a conversation" /><kbd>⌘ K</kbd></label>
      <div className="thread-list">{Object.keys(groupedThreads).length ? Object.entries(groupedThreads).map(([label, entries]) => <section className="thread-group" key={label}><h2>{label}</h2>{entries.map((thread) => <div className={`thread-row ${active === thread.id ? 'selected' : ''}`} key={thread.id}><button className="thread-button" onClick={() => openConversation(thread.id)}><MessageSquare size={15} /><span>{thread.title}</span></button><button className="thread-delete icon-button" aria-label={`Delete ${thread.title}`} onClick={() => deleteConversation(thread.id)}><Trash2 size={14} /></button></div>)}</section>) : <p className="no-threads">{search ? 'No conversations match.' : 'Your conversations will appear here.'}</p>}</div>
      <div className="sidebar-bottom"><span className={`status-orb ${status === 'connected' ? 'good' : status === 'offline' ? 'bad' : ''}`}></span><div><strong>{status === 'connected' ? 'MongoDB connected' : status === 'local' ? 'Temporary memory storage' : status === 'offline' ? 'Service unavailable' : 'Connecting'}</strong><small>Gemini 2.5 Flash</small></div><button className="icon-button account-button" title="Settings"><ChevronDown size={16} /></button></div>
    </aside>
    {sidebarOpen && <button className="scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button menu-button" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div className="model-name"><span className="model-spark"><Sparkles size={15} /></span><span>Gemini</span><span className="model-divider">/</span><span className="model-version">2.5 Flash</span></div><div className="topbar-right"><span className="secure-label"><span></span> Conversation workspace</span></div></header>
      <div className="conversation-scroll">
        {messages.length === 0 ? <div className="welcome"><div className="welcome-glyph"><Sparkles size={21} strokeWidth={1.7} /></div><h1>A clear place<br />to think things through.</h1><p>Bring a question, a half formed thought, or a plan worth shaping.</p><div className="starter-list">{starters.map((item) => <button className="starter" key={item.title} onClick={() => sendMessage(item.prompt)}><span><strong>{item.title}</strong><small>{item.sub}</small></span><ArrowUp size={16} className="starter-arrow" /></button>)}</div><div className="welcome-foot"><span>Made for the messy middle of an idea.</span><span>⌘ J <span className="foot-separator">to start fresh</span></span></div></div> : <div className="message-list">{messages.map((message, index) => <article className={`message ${message.role}`} key={index}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : <span>Y</span>}</div><div className="message-content"><div className="message-byline">{message.role === 'assistant' ? 'Kindred' : 'You'}{message.role === 'assistant' && <span className="tone-note">{tone.toLowerCase()}</span>}</div><div className="message-text">{message.content || (sending ? <span className="thinking"><i></i><i></i><i></i></span> : '')}</div>{message.role === 'assistant' && message.content && <button className="copy-button" onClick={() => copyMessage(message.content, index)}>{copied === index ? <Check size={14} /> : <Clipboard size={14} />}{copied === index ? 'Copied' : 'Copy'}</button>}</div></article>)}<div ref={endRef} /></div>}
      </div>
      <div className="composer-wrap"><div className="composer-shell"><Textarea ref={inputRef} rows={1} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ask anything, or start with a thought…" aria-label="Your message" /><div className="composer-controls"><label className="tone-select"><span>Respond</span><select value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Response tone"><option>Professional</option><option>Casual</option><option>Concise</option></select><ChevronDown size={13} /></label><div className="composer-right"><span className="enter-hint">Shift + Enter for a new line</span><Button className="send-button" onClick={() => sendMessage()} aria-label="Send message" disabled={!prompt.trim() || sending}>{sending ? <span className="send-loading"></span> : <ArrowUp size={18} />}</Button></div></div></div><p className="disclaimer">Kindred can make mistakes. Check important details.</p>{error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}</div>
      <div className="mobile-new"><button onClick={newConversation} aria-label="New conversation"><Plus size={20} /></button></div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
