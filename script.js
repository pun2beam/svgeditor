const svg = document.getElementById('canvas');
const toolSelect = document.getElementById('tool');
const startInput = document.getElementById('startTime');
const endInput = document.getElementById('endTime');
const textInput = document.getElementById('textInput');
const saveBtn = document.getElementById('saveBtn');
const loadInput = document.getElementById('loadInput');
const timeSlider = document.getElementById('timeSlider');
const deleteBtn = document.getElementById('deleteBtn');

let currentTool = toolSelect.value;
let drawing = false;
let startPoint = null;
let polygonPoints = [];
let polyline = null;
let selectedElement = null;
let dragStart = null;
let elemStart = null;
let dragging = false;
const SELECT_THRESHOLD = 10;

toolSelect.addEventListener('change', () => {
  currentTool = toolSelect.value;
  polygonPoints = [];
  if (polyline) {
    svg.removeChild(polyline);
    polyline = null;
  }
  if (selectedElement) {
    selectedElement.classList.remove('selected');
    selectedElement = null;
  }
  dragging = false;
});

svg.addEventListener('mousedown', e => {
  const pt = getMousePos(e);
  const selecting = currentTool === 'select' || e.ctrlKey;
  if (selecting) {
    const { element, distance } = getNearestElement(pt);
    if (element && distance <= SELECT_THRESHOLD) {
      selectElement(element);
      dragStart = pt;
      elemStart = getElementStart(selectedElement);
      dragging = true;
    } else {
      deselect();
    }
    return; // skip drawing when selecting
  }
  if (currentTool === 'text') {
    addText(pt);
    updateVisibility();
    return;
  }
  if (currentTool === 'polygon') {
    return; // handled in click events
  }
  startPoint = pt;
  drawing = true;
});

svg.addEventListener('mousemove', e => {
  if (!dragging || !selectedElement) return;
  const pt = getMousePos(e);
  const dx = pt.x - dragStart.x;
  const dy = pt.y - dragStart.y;
  moveElement(selectedElement, elemStart, dx, dy);
});

svg.addEventListener('mouseup', e => {
  if (dragging) {
    dragging = false;
    return;
  }
  if (!drawing) return;
  drawing = false;
  const pt = getMousePos(e);
  if (currentTool === 'rect') addRect(startPoint, pt);
  else if (currentTool === 'circle') addCircle(startPoint, pt);
  else if (currentTool === 'line') addLine(startPoint, pt);
  else if (currentTool === 'arrow') addLine(startPoint, pt, true);
  updateVisibility();
});

svg.addEventListener('click', e => {
  if (currentTool !== 'polygon') return;
  const pt = getMousePos(e);
  polygonPoints.push(pt);
  if (!polyline) {
    polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'black');
    svg.appendChild(polyline);
  }
  polyline.setAttribute('points', polygonPoints.map(p => `${p.x},${p.y}`).join(' '));
});

svg.addEventListener('dblclick', e => {
  if (currentTool !== 'polygon') return;
  if (polygonPoints.length < 3) return;
  if (polyline) {
    svg.removeChild(polyline);
    polyline = null;
  }
  finalizePolygon();
  updateVisibility();
});

function getMousePos(evt) {
  const rect = svg.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function getNearestElement(pt) {
  let nearest = null;
  let minDist = Infinity;
  Array.from(svg.children).forEach(el => {
    if (el.tagName === 'defs' || typeof el.getBBox !== 'function') return;
    const box = el.getBBox();
    const dx = Math.max(box.x - pt.x, 0, pt.x - (box.x + box.width));
    const dy = Math.max(box.y - pt.y, 0, pt.y - (box.y + box.height));
    const dist = Math.hypot(dx, dy);
    if (dist < minDist) {
      minDist = dist;
      nearest = el;
    }
  });
  return { element: nearest, distance: minDist };
}

function setTime(el) {
  el.dataset.start = startInput.value;
  el.dataset.end = endInput.value;
}

function addRect(p1, p2) {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const w = Math.abs(p1.x - p2.x);
  const h = Math.abs(p1.y - p2.y);
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', w);
  rect.setAttribute('height', h);
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', 'black');
  setTime(rect);
  svg.appendChild(rect);
}

function addCircle(p1, p2) {
  const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circ.setAttribute('cx', p1.x);
  circ.setAttribute('cy', p1.y);
  circ.setAttribute('r', r);
  circ.setAttribute('fill', 'none');
  circ.setAttribute('stroke', 'black');
  setTime(circ);
  svg.appendChild(circ);
}

function addLine(p1, p2, isArrow) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', p1.x);
  line.setAttribute('y1', p1.y);
  line.setAttribute('x2', p2.x);
  line.setAttribute('y2', p2.y);
  line.setAttribute('stroke', 'black');
  if (isArrow) {
    line.setAttribute('marker-end', 'url(#arrow)');
    ensureArrowDef();
  }
  setTime(line);
  svg.appendChild(line);
}

function finalizePolygon() {
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', polygonPoints.map(p => `${p.x},${p.y}`).join(' '));
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', 'black');
  setTime(poly);
  svg.appendChild(poly);
  polygonPoints = [];
}

function addText(p) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', p.x);
  t.setAttribute('y', p.y);
  t.textContent = textInput.value || 'text';
  t.setAttribute('font-size', '16');
  t.setAttribute('fill', 'black');
  setTime(t);
  svg.appendChild(t);
}

function ensureArrowDef() {
  if (document.getElementById('arrow')) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  path.setAttribute('fill', 'black');
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.insertBefore(defs, svg.firstChild);
}

function selectElement(el) {
  if (selectedElement) selectedElement.classList.remove('selected');
  selectedElement = el;
  selectedElement.classList.add('selected');
}

function deselect() {
  if (selectedElement) selectedElement.classList.remove('selected');
  selectedElement = null;
}

function getElementStart(el) {
  switch (el.tagName) {
    case 'rect':
      return { x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')) };
    case 'circle':
      return { cx: parseFloat(el.getAttribute('cx')), cy: parseFloat(el.getAttribute('cy')) };
    case 'line':
      return {
        x1: parseFloat(el.getAttribute('x1')),
        y1: parseFloat(el.getAttribute('y1')),
        x2: parseFloat(el.getAttribute('x2')),
        y2: parseFloat(el.getAttribute('y2'))
      };
    case 'polygon':
      return {
        points: el.getAttribute('points').split(' ').map(p => {
          const [x, y] = p.split(',');
          return { x: parseFloat(x), y: parseFloat(y) };
        })
      };
    case 'text':
      return { x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')) };
    default:
      return {};
  }
}

function moveElement(el, start, dx, dy) {
  switch (el.tagName) {
    case 'rect':
      el.setAttribute('x', start.x + dx);
      el.setAttribute('y', start.y + dy);
      break;
    case 'circle':
      el.setAttribute('cx', start.cx + dx);
      el.setAttribute('cy', start.cy + dy);
      break;
    case 'line':
      el.setAttribute('x1', start.x1 + dx);
      el.setAttribute('y1', start.y1 + dy);
      el.setAttribute('x2', start.x2 + dx);
      el.setAttribute('y2', start.y2 + dy);
      break;
    case 'polygon':
      const pts = start.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      el.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
      break;
    case 'text':
      el.setAttribute('x', start.x + dx);
      el.setAttribute('y', start.y + dy);
      break;
  }
}

saveBtn.addEventListener('click', () => {
  const data = Array.from(svg.children).map(el => ({
    type: el.tagName,
    attrs: [...el.attributes].reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {}),
    start: el.dataset.start,
    end: el.dataset.end,
    text: el.tagName === 'text' ? el.textContent : undefined
  }));
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'drawing.json';
  a.click();
});

loadInput.addEventListener('change', () => {
  const file = loadInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const data = JSON.parse(e.target.result);
    svg.innerHTML = '';
    data.forEach(obj => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', obj.type);
      Object.keys(obj.attrs).forEach(k => el.setAttribute(k, obj.attrs[k]));
      el.dataset.start = obj.start;
      el.dataset.end = obj.end;
      if (obj.type === 'text') el.textContent = obj.text;
      svg.appendChild(el);
    });
    updateVisibility();
  };
  reader.readAsText(file);
});

deleteBtn.addEventListener('click', () => {
  if (selectedElement) {
    svg.removeChild(selectedElement);
    selectedElement = null;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Delete' && selectedElement) {
    svg.removeChild(selectedElement);
    selectedElement = null;
  }
});

timeSlider.addEventListener('input', updateVisibility);

function updateVisibility() {
  const t = Number(timeSlider.value);
  Array.from(svg.children).forEach(el => {
    const s = Number(el.dataset.start);
    const e = Number(el.dataset.end);
    el.style.display = t >= s && t <= e ? '' : 'none';
  });
}
