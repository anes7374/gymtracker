// Einfache Linien-Icons (24×24, eigene Pfade).

const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  back: ['M15 18l-6-6 6-6'],
  chevron: ['M9 18l6-6-6-6'],
  plus: ['M12 5v14M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  close: ['M6 6l12 12M18 6L6 18'],
  up: ['M6 15l6-6 6 6'],
  down: ['M6 9l6 6 6-6'],
  trash: ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  dumbbell: ['M3 9v6M6.5 6v12M17.5 6v12M21 9v6M6.5 12h11'],
  history: ['M12 7v5l3 3', { circle: [12, 12, 9] }],
  list: ['M9 6h12M9 12h12M9 18h12', { dot: [4, 6] }, { dot: [4, 12] }, { dot: [4, 18] }],
  sliders: ['M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1', { circle: [15, 6, 2] }, { circle: [9, 12, 2] }, { circle: [17, 18, 2] }],
  trophy: ['M8 4h8v5a4 4 0 0 1-8 0V4z', 'M12 13v4M8.5 20h7M10 17h4', 'M16 5.5h3v1.5a3 3 0 0 1-3 3M8 5.5H5v1.5a3 3 0 0 0 3 3'],
  share: ['M12 3v12M8 7l4-4 4 4', 'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'],
  import: ['M12 3v12M8 11l4 4 4-4', 'M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4'],
  timer: ['M12 9v4l2.5 2.5M9.5 2.5h5', { circle: [12, 13.5, 8] }],
  search: ['M20 20l-4.5-4.5', { circle: [11, 11, 6.5] }],
  more: [{ dot: [5, 12] }, { dot: [12, 12] }, { dot: [19, 12] }],
  play: [{ fill: 'M8 5.5v13l10.5-6.5z' }],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  note: ['M5 4h14v16H5z', 'M9 9h6M9 13h6M9 17h3'],
  restart: ['M4 12a8 8 0 1 0 2.5-5.8', 'M4 4v4h4'],
};

export function icon(name, { size = 24, cls = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', ('icon ' + cls).trim());
  for (const p of PATHS[name] || []) {
    let el;
    if (typeof p === 'string') {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', p);
    } else if (p.circle) {
      el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', p.circle[0]); el.setAttribute('cy', p.circle[1]); el.setAttribute('r', p.circle[2]);
    } else if (p.dot) {
      el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', p.dot[0]); el.setAttribute('cy', p.dot[1]); el.setAttribute('r', 1.6);
      el.setAttribute('class', 'icon-fill');
    } else if (p.fill) {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', p.fill);
      el.setAttribute('class', 'icon-fill');
    }
    svg.append(el);
  }
  return svg;
}
