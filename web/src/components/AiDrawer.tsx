import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { usePrefs } from '../lib/prefs';

interface Msg { role: 'me' | 'bot'; text: string; note?: string }

function Rich({ text }: { text: string }) {
  return <>{text.split('\n').map((l, i) => (l.startsWith('## ') ? <b key={i} className="h">{l.slice(3)}</b> : <span key={i}>{l}{'\n'}</span>))}</>;
}

export default function AiDrawer() {
  const { aiOpen, setAiOpen } = usePrefs();
  const loc = useLocation();
  const matchId = loc.pathname.startsWith('/partido/') ? decodeURIComponent(loc.pathname.slice(9)) : undefined;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  useEffect(() => { if (!aiOpen) return; const f = (e: KeyboardEvent) => e.key === 'Escape' && setAiOpen(false); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [aiOpen, setAiOpen]);
  if (!aiOpen) return null;

  const ask = async (q: string) => {
    const message = q.trim();
    if (!message || busy) return;
    setMsgs((m) => [...m, { role: 'me', text: message }]); setText(''); setBusy(true);
    try {
      const r = await api<{ reply: string; note?: string }>('/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, matchId }) });
      setMsgs((m) => [...m, { role: 'bot', text: r.reply, note: r.note }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', text: `No pude responder: ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  };
  const suggestions = matchId ? ['Analiza este partido', '¿Cómo llegan los dos equipos?', '¿Qué dice el modelo?'] : ['¿Qué partidos hay hoy?', 'Analiza el próximo partido del líder', 'Partidos en vivo'];

  return (
    <>
      <div className="drawer-bg" onClick={() => setAiOpen(false)} />
      <aside className="drawer" role="dialog" aria-label="Analista StatBet">
        <header>
          <div className="row"><Sparkles size={18} color="var(--accent)" /><h2>Analista StatBet</h2></div>
          <button className="iconbtn" onClick={() => setAiOpen(false)} aria-label="Cerrar"><X size={16} /></button>
        </header>
        <div className="msgs">
          <div className="bubble bot">Pregúntame por un equipo, un partido o una liga. Respondo solo con los datos guardados en la base; si algo no está, te lo digo.{matchId && '\n\nEstás viendo un partido: lo uso como contexto.'}</div>
          {msgs.length === 0 && <div className="sugg">{suggestions.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>}
          {msgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.role === 'bot' ? <Rich text={m.text} /> : m.text}{m.note && <span className="nt">{m.note}</span>}</div>)}
          {busy && <div className="bubble bot muted">Analizando datos…</div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: ¿Cómo va el Real Madrid?" maxLength={400} aria-label="Pregunta" autoFocus />
          <button className="btn primary" disabled={busy || !text.trim()} aria-label="Enviar"><Send size={16} /></button>
        </form>
      </aside>
    </>
  );
}
