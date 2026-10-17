// Pequeno helper para criar DOM sem framework.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function eur(n: number, decimals = false): string {
  const neg = n < 0;
  const v = Math.abs(n);
  const s = decimals && !Number.isInteger(v)
    ? v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(v).toLocaleString('pt-PT');
  return `${neg ? '−' : ''}€${s}`;
}

export function signedEur(n: number): string {
  return n >= 0 ? `+${eur(n)}` : eur(n);
}

export function meter(value: number, max: number, cls = ''): HTMLElement {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return h('div', { class: `meter ${cls}` }, h('i', { style: { width: `${p * 100}%` } }));
}

export function stars(n: number, max = 5): string {
  return '★'.repeat(Math.max(0, Math.min(max, n))) + '☆'.repeat(Math.max(0, max - n));
}
