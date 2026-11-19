import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3001);
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });
const conversationSchema = new mongoose.Schema({
  title: { type: String, default: 'New conversation' },
  tone: { type: String, enum: ['Professional', 'Casual', 'Concise'], default: 'Professional' },
  messages: { type: [messageSchema], default: [] },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
let dbReady = false;
let memoryConversations = [];
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).then(() => { dbReady = true; console.log('MongoDB connected'); })
    .catch((error) => console.error('MongoDB connection failed:', error.message));
}

const tones = {
  Professional: 'Use a polished, professional voice. Be clear, well structured, and courteous.',
  Casual: 'Use a warm, relaxed, conversational voice. Keep it natural and approachable.',
  Concise: 'Be concise and direct. Prefer the shortest complete answer, using bullets when useful.'
};
const listConversations = () => dbReady ? Conversation.find().sort({ updatedAt: -1 }).lean() : Promise.resolve([...memoryConversations].sort((a,b) => new Date(b.updatedAt)-new Date(a.updatedAt)));
const findConversation = async (id) => dbReady ? Conversation.findById(id) : memoryConversations.find((item) => item._id === id);
const saveConversation = async (doc) => {
  doc.updatedAt = new Date();
  if (dbReady) { await doc.save(); return doc.toObject(); }
  const index = memoryConversations.findIndex((item) => item._id === doc._id);
  if (index < 0) memoryConversations.push(doc); else memoryConversations[index] = doc;
  return doc;
};
const serialize = (doc) => ({ id: doc._id?.toString?.() || doc._id, title: doc.title, tone: doc.tone, messages: doc.messages, updatedAt: doc.updatedAt });

app.get('/api/health', (_req, res) => res.json({ ok: true, database: dbReady ? 'mongodb' : 'memory', model }));
app.get('/api/conversations', async (_req, res) => {
  try { res.json((await listConversations()).map(serialize)); } catch { res.status(500).json({ error: 'Could not load conversations.' }); }
});
app.post('/api/conversations', async (_req, res) => {
  try {
    const doc = dbReady ? new Conversation({}) : { _id: randomUUID(), title: 'New conversation', tone: 'Professional', messages: [], updatedAt: new Date() };
    res.status(201).json(serialize(await saveConversation(doc)));
  } catch { res.status(500).json({ error: 'Could not create a conversation.' }); }
});
app.get('/api/conversations/:id', async (req, res) => {
  try { const doc = await findConversation(req.params.id); if (!doc) return res.status(404).json({ error: 'Conversation not found.' }); res.json(serialize(doc)); }
  catch { res.status(400).json({ error: 'Invalid conversation id.' }); }
});
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    if (dbReady) await Conversation.findByIdAndDelete(req.params.id);
    else memoryConversations = memoryConversations.filter((item) => item._id !== req.params.id);
    res.status(204).end();
  } catch { res.status(400).json({ error: 'Could not delete conversation.' }); }
});

app.post('/api/conversations/:id/messages', async (req, res) => {
  const { prompt, tone = 'Professional' } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) return res.status(400).json({ error: 'Enter a message under 12,000 characters.' });
  if (!tones[tone]) return res.status(400).json({ error: 'Choose a valid response style.' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'Add GEMINI_API_KEY to .env to enable Gemini responses.' });
  try {
    const conversation = await findConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    conversation.tone = tone;
    conversation.messages.push({ role: 'user', content: prompt.trim(), createdAt: new Date() });
    if (conversation.messages.length === 1) conversation.title = prompt.trim().slice(0, 54) + (prompt.trim().length > 54 ? '…' : '');
    await saveConversation(conversation);
    const contents = conversation.messages.map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }] }));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: `You are a helpful AI assistant. ${tones[tone]}` }] }, contents, generationConfig: { temperature: tone === 'Concise' ? 0.5 : 0.75 } })
    });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status === 429 ? 429 : 502).json({ error: `Gemini request failed (${response.status}). ${detail.slice(0, 240)}` });
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    let answer = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim(); if (!data || data === '[DONE]') continue;
          try { const chunk = JSON.parse(data).candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''; if (chunk) { answer += chunk; res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`); } } catch { /* ignore malformed SSE frame */ }
        }
        if (done) break;
      }
      conversation.messages.push({ role: 'assistant', content: answer || 'I could not produce a response. Please try again.', createdAt: new Date() });
      await saveConversation(conversation);
      res.write(`data: ${JSON.stringify({ done: true, conversation: serialize(conversation) })}\n\n`);
      res.end();
    } catch (error) {
      if (!res.destroyed) { res.write(`data: ${JSON.stringify({ error: 'The response stream was interrupted.' })}\n\n`); res.end(); }
      console.error('Gemini stream error:', error.message);
    }
  } catch (error) { if (!res.headersSent) res.status(500).json({ error: 'Unable to send this message.' }); else res.end(); console.error(error); }
});

app.use(express.static(path.resolve(serverDir, '../dist')));
app.get('*', (_req, res) => res.sendFile(path.resolve(serverDir, '../dist/index.html')));

app.listen(port, () => console.log(`Kindred API listening on http://localhost:${port}`));
