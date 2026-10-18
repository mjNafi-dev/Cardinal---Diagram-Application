import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { sql, MySQL, PostgreSQL, SQLite, MSSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { Check, Copy, FileUp, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { keymap } from '@codemirror/view';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { download } from '../export/export';
import { useEditor } from '../store/editor';
import { usePrefs } from '../store/prefs';
import { useResolvedTheme } from '../theme/useTheme';
import { DIALECTS, applySql, generateSql, isBlankSql, parseSqlTolerant, referenceIssues, type Dialect, type SqlIssue } from '../sql/sql';
import { layoutRef } from '../diagram/layout';
import { nodeRect, unionRects } from '../geometry/geometry';
import { tidyPositions } from '../diagram/tidy';
import { toast } from '../ui/toast';

const DIALECT_LANG = { mysql: MySQL, postgres: PostgreSQL, sqlite: SQLite, sqlserver: MSSQL };
const LS = 'cardinal.sqlDialect';

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--panel-2)', color: 'var(--text-3)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--panel-2)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--panel-3)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
});

export function CodePanel() {
  const doc = useEditor((s) => s.doc);
  const theme = useResolvedTheme((s) => s.theme);
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());
  const programmatic = useRef(false);
  const dirty = useRef(false);
  const lastGood = useRef(true);
  const timer = useRef<number>();
  const [dialect, setDialect] = useState<Dialect>(() => (localStorage.getItem(LS) as Dialect) || 'mysql');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string }>({ kind: 'info', text: 'Paste or type SQL here and the diagram follows — and the other way round.' });
  const fileInput = useRef<HTMLInputElement>(null);

  const setText = (text: string) => {
    const v = viewRef.current;
    if (!v || v.state.doc.toString() === text) return;
    programmatic.current = true;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
    programmatic.current = false;
  };

  /** Show problems: underlined in the editor, triangles on the canvas, a line in the status bar. */
  const report = (issues: SqlIssue[]) => {
    useEditor.getState().setSqlIssues(issues);
    const v = viewRef.current;
    if (!v) return;
    const len = v.state.doc.length;
    v.dispatch(setDiagnostics(v.state, issues.map((i) => ({
      from: Math.min(i.from, len), to: Math.min(Math.max(i.to, i.from + 1), len), severity: i.broken ? 'error' as const : 'warning' as const, message: i.message,
    }))));
  };

  const applyCode = (text: string) => {
    const st0 = useEditor.getState();
    // all code deleted → the diagram has no tables either (Ctrl+Z brings them back)
    if (isBlankSql(text)) {
      const had = st0.doc.nodes.some((n) => n.kind === 'table');
      if (had) st0.commit((d) => {
        const gone = new Set(d.nodes.filter((n) => n.kind === 'table').map((n) => n.id));
        d.nodes = d.nodes.filter((n) => !gone.has(n.id));
        d.edges = d.edges.filter((e) => !gone.has(e.source.node ?? '') && !gone.has(e.target.node ?? ''));
      }, 'sql');
      report([]);
      lastGood.current = true;
      return setStatus({ kind: 'info', text: had ? 'Code is empty, so the tables were removed (Ctrl+Z to undo).' : 'Paste or type SQL here and the diagram follows.' });
    }
    const res = parseSqlTolerant(text);
    const others = st0.doc.nodes.filter((n) => n.kind === 'table' && n.variant).map((n) => n.text);
    const issues = [...res.broken, ...referenceIssues(text, res.tables, others)].sort((a, b) => a.from - b.from);
    report(issues);
    const note = issues.length
      ? `Line ${issues[0].line}: ${issues[0].message}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}`
      : '';
    // while something is wrong, keep the code exactly as typed (don't reformat it on blur)
    lastGood.current = !issues.length && !res.error;
    // tables named in broken statements stay as they were; a broken statement with no name keeps everything
    const keep: boolean | Set<string> = res.broken.some((b) => !b.table) ? true : res.broken.length ? new Set(res.broken.map((b) => b.table!.toLowerCase())) : false;
    const st = useEditor.getState();
    const prefs = usePrefs.getState().prefs;
    const wasEmpty = !st.doc.nodes.some((n) => n.kind === 'table');
    const box = unionRects(st.doc.nodes.map((n) => nodeRect(n, prefs)));
    const start = box ? { x: box.x + box.w + 100, y: box.y } : { x: 80, y: 80 };
    const next = applySql(st.doc, res.tables, (i) => ({ x: start.x + Math.floor(i / 3) * 300, y: start.y + (i % 3) * 230 }), keep);
    if (wasEmpty && next.nodes.length > 1) {
      const rects = new Map(next.nodes.map((n) => [n.id, nodeRect(n, prefs)]));
      const pos = tidyPositions(next, rects, prefs.canvas.gridSize);
      for (const n of next.nodes) { const p = pos.get(n.id); if (p) { n.x = p.x; n.y = p.y; } }
    }
    if (JSON.stringify(next.nodes) !== JSON.stringify(st.doc.nodes) || JSON.stringify(next.edges) !== JSON.stringify(st.doc.edges)) {
      st.commit((d) => { d.nodes = next.nodes; d.edges = next.edges; }, 'sql');
    }
    if (note) setStatus({ kind: 'err', text: note + (res.tables.length ? ' — the rest is applied' : '') });
    else if (!res.tables.length) setStatus({ kind: 'info', text: 'No CREATE TABLE statements yet.' });
    else setStatus({ kind: 'ok', text: `In sync · ${res.tables.length} table${res.tables.length === 1 ? '' : 's'}` });
  };
  /** Update button / Ctrl+Enter: apply right now. */
  const applyNow = () => {
    const v = viewRef.current;
    if (!v) return;
    clearTimeout(timer.current);
    applyCode(v.state.doc.toString());
    dirty.current = false;
  };
  const applyNowRef = useRef(applyNow);
  applyNowRef.current = applyNow;

  // mount CodeMirror
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        // a draft with problems survives switching tabs; otherwise start from the diagram
        doc: useEditor.getState().sqlDraft ?? generateSql(useEditor.getState().doc, dialect),
        extensions: [
          basicSetup,
          langComp.current.of(sql({ dialect: DIALECT_LANG[dialect] })),
          themeComp.current.of(theme === 'dark' ? oneDark : lightTheme),
          EditorView.lineWrapping,
          lintGutter(),
          keymap.of([{ key: 'Mod-Enter', run: () => { applyNowRef.current(); return true; } }]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || programmatic.current) return;
            dirty.current = true;
            setStatus((s) => (s.kind === 'ok' ? { kind: 'info', text: 'Updating…' } : s));
            clearTimeout(timer.current);
            timer.current = window.setTimeout(() => applyCode(u.state.doc.toString()), 250);
          }),
          EditorView.domEventHandlers({
            blur: () => {
              clearTimeout(timer.current);
              if (dirty.current) applyCode(view.state.doc.toString());
              dirty.current = false;
              if (lastGood.current) setText(generateSql(useEditor.getState().doc, (localStorage.getItem(LS) as Dialect) || 'mysql'));
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    const draft = useEditor.getState().sqlDraft;
    if (draft !== null) { lastGood.current = false; applyCode(draft); } else report([]);
    return () => {
      clearTimeout(timer.current);
      if (dirty.current) applyCode(view.state.doc.toString());
      useEditor.setState({ sqlDraft: lastGood.current ? null : view.state.doc.toString() });
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // diagram → code (unless you're typing in the editor, or the code has a problem you're still fixing)
  useEffect(() => {
    if (dirty.current || viewRef.current?.hasFocus || !lastGood.current) return;
    setText(generateSql(doc, dialect));
    report([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, dialect]);

  // undo / redo on the canvas: the diagram is the truth again, so rewrite the code from it
  const historyTick = useEditor((s) => s.historyTick);
  const firstTick = useRef(historyTick);
  useEffect(() => {
    if (historyTick === firstTick.current || viewRef.current?.hasFocus) return;
    clearTimeout(timer.current);
    dirty.current = false;
    lastGood.current = true;
    setText(generateSql(useEditor.getState().doc, dialect));
    report([]);
    setStatus({ kind: 'info', text: 'Code rewritten from the diagram after undo.' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTick]);

  // a warning triangle on the canvas was clicked → go to that line
  const jump = useEditor((s) => s.sqlJump);
  useEffect(() => {
    const v = viewRef.current;
    if (!jump || !v) return;
    // after the click on the canvas has finished (it would take the focus back)
    const t = window.setTimeout(() => {
      const line = v.state.doc.line(Math.max(1, Math.min(jump.line, v.state.doc.lines)));
      v.focus();
      v.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
    }, 60);
    return () => clearTimeout(t);
  }, [jump]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: langComp.current.reconfigure(sql({ dialect: DIALECT_LANG[dialect] })) });
    localStorage.setItem(LS, dialect);
  }, [dialect]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeComp.current.reconfigure(theme === 'dark' ? oneDark : lightTheme) });
  }, [theme]);

  const hasChen = doc.nodes.some((n) => n.kind !== 'table' && n.kind !== 'text' && n.kind !== 'note' && n.kind !== 'entity-simple');

  return (
    <div className="code-wrap">
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <select className="select sm" style={{ width: 'auto' }} value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)} title="SQL dialect">
          {DIALECTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" title="Update the diagram from this SQL now (Ctrl+Enter). It also updates by itself as you type." onClick={applyNow}><RefreshCw size={14} /> Update</button>
        <div className="spacer" />
        <button className="btn btn-sm" title="Import a .sql file (or just paste SQL into the editor)" onClick={() => fileInput.current?.click()}><FileUp size={14} /> Import</button>
        <button className="btn btn-sm btn-ghost" title="Download as .sql" onClick={() => {
          const name = (useEditor.getState().meta?.name || 'diagram').replace(/[\/:*?"<>|]+/g, '_');
          download(new Blob([viewRef.current?.state.doc.toString() ?? ''], { type: 'text/plain' }), `${name}.sql`);
        }}><Download size={14} /></button>
        <button className="btn btn-sm btn-ghost" title="Copy SQL" onClick={() => { navigator.clipboard.writeText(viewRef.current?.state.doc.toString() ?? ''); toast('SQL copied'); }}><Copy size={14} /></button>
        <input ref={fileInput} type="file" accept=".sql,.txt" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const text = await f.text();
          setText(text);
          applyCode(text);
        }} />
      </div>
      <div ref={host} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} />
      <div className={`code-status ${status.kind}`}>
        {status.kind === 'ok' ? <Check size={14} /> : status.kind === 'err' ? <AlertTriangle size={14} /> : null}
        <span>{hasChen && status.kind === 'info' ? 'SQL covers Crow\'s Foot tables. Chen shapes are left out.' : status.text}</span>
      </div>
    </div>
  );
}
