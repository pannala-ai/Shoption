import { useState } from 'react';
import { Send, Sparkles, Image as ImageIcon, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SUGGESTIONS = [
  "Why did NVDA trigger a signal?",
  "Analyze the GEX regime for SPY today.",
  "What is the theoretical edge of the COIN setup?",
  "Summarize the dark pool activity.",
];

export default function AssistantInput() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  return (
    <div style={{
      width: '100%',
      maxWidth: 800,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>
      <AnimatePresence>
        {focused && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}
          >
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => setQuery(s)}
                style={{
                  background: '#09264A',
                  border: '1px solid #142E4A',
                  color: '#94A3B8',
                  padding: '6px 12px',
                  borderRadius: 100,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
                onMouseOver={e => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.borderColor = '#604CC3';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(96, 76, 195, 0.2)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.color = '#94A3B8';
                  e.currentTarget.style.borderColor = '#142E4A';
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
        background: '#0B192C',
        borderRadius: 16,
        padding: '2px',
        backgroundClip: 'padding-box',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: focused ? 'linear-gradient(90deg, #2081F9, #604CC3)' : '#142E4A',
          zIndex: 0,
          opacity: focused ? 1 : 0.5,
          transition: 'opacity 0.3s'
        }} />
        
        <div style={{
          position: 'relative',
          zIndex: 1,
          background: '#0B192C',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          gap: 12
        }}>
          <Sparkles color="#604CC3" size={20} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Ask Orevix AI about quantitative edge..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: 15,
              padding: '8px 0'
            }}
          />
          
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer' }}><ImageIcon size={18} /></button>
            <button style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer' }}><Mic size={18} /></button>
            <button style={{
              background: query ? '#604CC3' : '#142E4A',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: query ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
              color: '#fff'
            }}>
              <Send size={14} style={{ marginLeft: 2 }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
