import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Image as ImageIcon, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SUGGESTIONS = [
  "How is NVDA doing?",
  "What is the theoretical edge of the COIN setup?",
  "Why did TSLA trigger a signal?",
  "Summarize the dark pool activity.",
];

type Message = { role: 'user' | 'assistant'; content: string; type?: 'text' | 'chart'; ticker?: string };

export default function AssistantInput() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendQuery = async (text: string) => {
    if (!text.trim() || loading) return;
    const newMsgs: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMsgs);
    setQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs })
      });
      const data = await res.json();
      setMessages([...newMsgs, { role: 'assistant', content: data.text, type: data.type, ticker: data.ticker }]);
    } catch (e) {
      setMessages([...newMsgs, { role: 'assistant', content: "I can't answer" }]);
    }
    setLoading(false);
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: 800,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>
      {messages.length > 0 && (
        <div className="glass" style={{ 
          borderRadius: 16, padding: 20, maxHeight: 400, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.05)'
        }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                padding: '12px 16px', borderRadius: 12, maxWidth: '90%', fontSize: 14, lineHeight: 1.5,
                boxShadow: m.role === 'user' ? '0 4px 12px rgba(0, 122, 255, 0.2)' : 'none'
              }}>
                {m.type === 'chart' && m.ticker && (
                   <div style={{ width: '100%', height: 320, minWidth: 400, marginBottom: 16, borderRadius: 8, overflow: 'hidden' }}>
                     <iframe 
                       src={`https://s.tradingview.com/widgetembed/?symbol=${m.ticker}&interval=D&hidesidetoolbar=1&hide_legend=1&save_image=0&toolbarbg=f1f3f6&studies=%5B%5D&theme=light&style=1&timezone=Etc%2FUTC&withdateranges=1&show_popup_button=1&popup_width=1000&popup_height=650`}
                       width="100%" height="100%" frameBorder="0"
                     />
                   </div>
                )}
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>
              <Sparkles size={14} style={{ display: 'inline', marginRight: 6, marginBottom: -2 }} /> Parsing quantitative streams...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <AnimatePresence>
        {focused && messages.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}
          >
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => sendQuery(s)}
                className="glass"
                style={{
                  color: 'var(--text-secondary)',
                  padding: '6px 12px',
                  borderRadius: 100,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
                onMouseOver={e => {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 122, 255, 0.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{
        position: 'relative',
        borderRadius: 16,
        padding: '2px',
        backgroundClip: 'padding-box',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: focused ? 'var(--accent-grad)' : 'var(--border)',
          zIndex: 0,
          opacity: focused ? 1 : 0.5,
          transition: 'opacity 0.3s'
        }} />
        
        <div style={{
          position: 'relative',
          zIndex: 1,
          background: 'var(--bg-surface)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          gap: 12
        }}>
          <Sparkles color="var(--accent)" size={20} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendQuery(query); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Ask Orevix AI about quantitative edge..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 15,
              padding: '8px 0'
            }}
          />
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><ImageIcon size={18} /></button>
            <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Mic size={18} /></button>
            <button 
              onClick={() => sendQuery(query)}
              disabled={!query}
              style={{
              background: query ? 'var(--accent)' : 'var(--bg-card2)',
              border: query ? 'none' : '1px solid var(--border)',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: query ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              color: query ? '#fff' : 'var(--text-muted)'
            }}>
              <Send size={14} style={{ marginLeft: 2 }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
