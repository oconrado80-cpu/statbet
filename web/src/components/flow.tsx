import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const minuteOf = (clock: string | null): number | null => {
  const m = clock?.match(/^(\d+)'(?:\+(\d+))?/);
  return m ? Number(m[1]) + Number(m[2] ?? 0) : null;
};

/** Diferencia de marcador a lo largo del partido, calculada solo con los eventos de gol/anotación guardados. */
export function FlowChart({ events, homeId, homeName, awayName, football }: { events: any[]; homeId: string; homeName: string; awayName: string; football: boolean }) {
  const data = useMemo(() => {
    const sc = events.filter((e) => e.scoring && e.teamId);
    if (sc.length < 1) return [] as any[];
    let h = 0, a = 0;
    const pts: any[] = [{ x: 0, diff: 0, label: 'Inicio' }];
    sc.forEach((e, i) => {
      const pts1 = e.homeScore != null && e.awayScore != null ? null : 1;
      if (pts1) { if (e.teamId === homeId) h += 1; else a += 1; } else { h = e.homeScore; a = e.awayScore; }
      const min = football ? minuteOf(e.clock) : null;
      pts.push({ x: min ?? i + 1, diff: h - a, label: `${e.clock ?? ''} ${e.playerName ?? ''} ${h}-${a}`.trim() });
    });
    return pts;
  }, [events, homeId, football]);
  if (data.length < 2) return <p className="muted small">Aún no hay goles/anotaciones registrados para dibujar el flujo del partido.</p>;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.diff)));
  const off = (() => { const mx = Math.max(...data.map((d) => d.diff)), mn = Math.min(...data.map((d) => d.diff)); return mx <= 0 ? 0 : mn >= 0 ? 1 : mx / (mx - mn); })();
  return (
    <div>
      <div className="row between small" style={{ fontWeight: 700 }}><span style={{ color: 'var(--home)' }}>▲ Ventaja {homeName}</span><span style={{ color: 'var(--away)' }}>Ventaja {awayName} ▼</span></div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: -20, right: 6, top: 6, bottom: 0 }}>
            <defs><linearGradient id="flowg" x1="0" y1="0" x2="0" y2="1"><stop offset={off} stopColor="#00e0ff" stopOpacity={0.55} /><stop offset={off} stopColor="#f59e0b" stopOpacity={0.55} /></linearGradient></defs>
            <CartesianGrid stroke="#24242f" vertical={false} />
            <XAxis dataKey="x" type="number" domain={[0, 'dataMax']} stroke="#8d8da3" fontSize={11} tickFormatter={(v) => (football ? `${v}'` : `#${v}`)} />
            <YAxis domain={[-max, max]} allowDecimals={false} stroke="#8d8da3" fontSize={11} />
            <ReferenceLine y={0} stroke="#8d8da3" />
            <Tooltip contentStyle={{ background: '#15151d', border: '1px solid #24242f', borderRadius: 10, color: '#f2f2f7' }} formatter={(v: any) => [v > 0 ? `+${v} ${homeName}` : v < 0 ? `+${-v} ${awayName}` : 'Empate', 'Diferencia']} labelFormatter={(_, p: any) => p?.[0]?.payload?.label ?? ''} />
            <Area type="stepAfter" dataKey="diff" stroke="#f2f2f7" strokeWidth={2} fill="url(#flowg)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
