# Kindred chat

A responsive Gemini chat workbench with streaming answers, tone controls, searchable conversation history, and MongoDB persistence.

## Requirements

- Node.js 20 or newer
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- MongoDB connection string (local MongoDB works too)

## Run locally

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` and `MONGODB_URI`.
2. Install packages: `npm install`
3. Start both servers: `npm run dev`
4. Open `http://localhost:5173`

The Express API runs on port 3001. For a production build, run `npm run build`, then `npm start` and open `http://localhost:3001`.

## Environment

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini API key, used by the server only |
| `GEMINI_MODEL` | Gemini model name; defaults to `gemini-2.5-flash` |
| `MONGODB_URI` | MongoDB connection URI |
| `PORT` | Express port; defaults to `3001` |

When MongoDB is unreachable or not configured, the API uses temporary in-memory storage for local UI development. Conversations in that mode are lost when the server restarts.

## Included

- Professional, Casual, and Concise tone modifiers sent as Gemini system instructions
- SSE streamed response rendering
- Conversation history saved with message timestamps and a first-message title
- Conversation search and assistant response copy controls
- Responsive sidebar, keyboard shortcuts (`Ctrl/Cmd+J` and `Ctrl/Cmd+K`), empty/loading/error states
