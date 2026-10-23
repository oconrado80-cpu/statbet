import { Component, type ReactNode } from 'react';

/** Evita la "pantalla negra": si una página falla, se muestra el aviso y el resto de la web sigue viva. */
export default class Boundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(p: { resetKey?: string }, s: { error: Error | null; key?: string }) { return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null; }
  componentDidCatch(e: Error) { console.error('Error de interfaz:', e); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card stack" role="alert" style={{ margin: '24px 0' }}>
        <h2>Algo salió mal al mostrar esta página</h2>
        <p className="muted">Los datos no se han perdido. Prueba a recargar; si se repite, copia este texto y envíalo para corregirlo:</p>
        <pre className="small" style={{ whiteSpace: 'pre-wrap', color: 'var(--live)' }}>{String(this.state.error.message)}</pre>
        <div className="row"><button className="btn primary" onClick={() => location.reload()}>Recargar</button><a className="btn" href="/">Ir al inicio</a></div>
      </div>
    );
  }
}
