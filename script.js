const svg = document.getElementById('canvas');
const canvasContent = document.getElementById('canvasContent');
const toolSelect = document.getElementById('tool');
const startInput = document.getElementById('startTime');
const endInput = document.getElementById('endTime');
const textInput = document.getElementById('textInput');
const saveBtn = document.getElementById('saveBtn');
const loadInput = document.getElementById('loadInput');
const timeSlider = document.getElementById('timeSlider');
const deleteBtn = document.getElementById('deleteBtn');
const bringForwardBtn = document.getElementById('bringForwardBtn');
const sendBackwardBtn = document.getElementById('sendBackwardBtn');
const strokeInput = document.getElementById('strokeColor');
const fillInput = document.getElementById('fillColor');
const toolbar = document.getElementById('toolbar');

function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight - toolbar.offsetHeight;
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

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

let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startDragX = 0;
let startDragY = 0;

function updateTransform() {
  canvasContent.setAttribute('transform', `translate(${panX} ${panY}) scale(${zoomLevel})`);
}
updateTransform();

toolSelect.addEventListener('change', () => {
  currentTool = toolSelect.value;
  polygonPoints = [];
  if (polyline) {
    canvasContent.removeChild(polyline);
    polyline = null;
  }
  if (selectedElement) {
    selectedElement.classList.remove('selected');
    selectedElement = null;
  }
  dragging = false;
});

svg.addEventListener('wheel', e => {
  e.preventDefault();
  const pt = getMousePos(e);
  const prevZoom = zoomLevel;
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  zoomLevel = Math.max(0.1, Math.min(10, zoomLevel * delta));
  panX = pt.x * prevZoom + panX - zoomLevel * pt.x;
  panY = pt.y * prevZoom + panY - zoomLevel * pt.y;
  updateTransform();
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
    } else if (e.target === svg) {
      deselect();
      isPanning = true;
      startDragX = e.clientX;
      startDragY = e.clientY;
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

document.addEventListener('mousemove', e => {
  if (isPanning) {
    const dx = e.clientX - startDragX;
    const dy = e.clientY - startDragY;
    panX += dx;
    panY += dy;
    startDragX = e.clientX;
    startDragY = e.clientY;
    updateTransform();
  } else if (dragging && selectedElement) {
    const pt = getMousePos(e);
    const dx = pt.x - dragStart.x;
    const dy = pt.y - dragStart.y;
    moveElement(selectedElement, elemStart, dx, dy);
  }
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

document.addEventListener('mouseup', () => {
  isPanning = false;
});

svg.addEventListener('click', e => {
  if (currentTool !== 'polygon') return;
  const pt = getMousePos(e);
  polygonPoints.push(pt);
  if (!polyline) {
    polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', strokeInput.value);
    canvasContent.appendChild(polyline);
  }
  polyline.setAttribute('points', polygonPoints.map(p => `${p.x},${p.y}`).join(' '));
});

svg.addEventListener('dblclick', e => {
  if (currentTool !== 'polygon') return;
  if (polygonPoints.length < 3) return;
  if (polyline) {
    canvasContent.removeChild(polyline);
    polyline = null;
  }
  finalizePolygon();
  updateVisibility();
});

function getMousePos(evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = canvasContent.getScreenCTM();
  return pt.matrixTransform(ctm.inverse());
}

function getNearestElement(pt) {
  let nearest = null;
  let minDist = Infinity;
  let minInnerDist = Infinity;
  Array.from(canvasContent.children).forEach(el => {
    if (el.tagName === 'defs' || typeof el.getBBox !== 'function') return;
    const box = el.getBBox();
    const dx = Math.max(box.x - pt.x, 0, pt.x - (box.x + box.width));
    const dy = Math.max(box.y - pt.y, 0, pt.y - (box.y + box.height));
    const dist = Math.hypot(dx, dy);
    if (dist <= minDist) {
      minDist = dist;

      if (dist == 0) {
        const dx = Math.max(box.x - pt.x, pt.x - (box.x + box.width));
        const dy = Math.max(box.y - pt.y, pt.y - (box.y + box.height));
        const innerDist = Math.hypot(dx, dy);
        if (innerDist <= minInnerDist) {
          minInnerDist = innerDist;
          nearest = el;
        }
      } else {
        nearest = el;
      }
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
  rect.setAttribute('fill', fillInput.value);
  rect.setAttribute('stroke', strokeInput.value);
  setTime(rect);
  canvasContent.appendChild(rect);
  selectElement(rect);
}

function addCircle(p1, p2) {
  const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circ.setAttribute('cx', p1.x);
  circ.setAttribute('cy', p1.y);
  circ.setAttribute('r', r);
  circ.setAttribute('fill', fillInput.value);
  circ.setAttribute('stroke', strokeInput.value);
  setTime(circ);
  canvasContent.appendChild(circ);
  selectElement(circ);
}

function addLine(p1, p2, isArrow) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', p1.x);
  line.setAttribute('y1', p1.y);
  line.setAttribute('x2', p2.x);
  line.setAttribute('y2', p2.y);
  line.setAttribute('stroke', strokeInput.value);
  if (isArrow) {
    line.setAttribute('marker-end', 'url(#arrow)');
    ensureArrowDef();
    const arrowPath = document.querySelector('#arrow path');
    if (arrowPath) arrowPath.setAttribute('fill', strokeInput.value);
  }
  setTime(line);
  canvasContent.appendChild(line);
  selectElement(line);
}

function finalizePolygon() {
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', polygonPoints.map(p => `${p.x},${p.y}`).join(' '));
  poly.setAttribute('fill', fillInput.value);
  poly.setAttribute('stroke', strokeInput.value);
  setTime(poly);
  canvasContent.appendChild(poly);
  selectElement(poly);
  polygonPoints = [];
}

function addText(p) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', p.x);
  t.setAttribute('y', p.y);
  t.textContent = textInput.value || 'text';
  t.setAttribute('font-size', '16');
  t.setAttribute('fill', fillInput.value);
  t.setAttribute('stroke', strokeInput.value);
  setTime(t);
  canvasContent.appendChild(t);
  selectElement(t);
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
  startInput.value = el.dataset.start || 0;
  endInput.value = el.dataset.end || 0;
  if (el.tagName === 'text') {
    textInput.value = el.textContent;
  }
  updateColorInputs(el);
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

function updateColorInputs(el) {
  const stroke = getComputedStyle(el).stroke;
  strokeInput.value = stroke === 'none' ? '#000000' : rgbToHex(stroke);
  const fill = getComputedStyle(el).fill;
  fillInput.value = fill === 'none' ? '#ffffff' : rgbToHex(fill);
}

function rgbToHex(rgb) {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return '#000000';
  return '#' + m.slice(1).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
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

function bringToFront(el) {
    canvasContent.appendChild(el);
}

function sendToBack(el) {
  canvasContent.insertBefore(el, canvasContent.firstChild);
}

saveBtn.addEventListener('click', () => {
  const data = Array.from(canvasContent.children).map(el => ({
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
    canvasContent.innerHTML = '';
    data.forEach(obj => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', obj.type);
      Object.keys(obj.attrs).forEach(k => el.setAttribute(k, obj.attrs[k]));
      el.dataset.start = obj.start;
      el.dataset.end = obj.end;
      if (obj.type === 'text') el.textContent = obj.text;
      canvasContent.appendChild(el);
    });
    updateVisibility();
  };
  reader.readAsText(file);
});

deleteBtn.addEventListener('click', () => {
  if (selectedElement) {
    canvasContent.removeChild(selectedElement);
    selectedElement = null;
  }
});

bringForwardBtn.addEventListener('click', () => {
  if (selectedElement) {
    bringToFront(selectedElement);
  }
});

sendBackwardBtn.addEventListener('click', () => {
  if (selectedElement) {
    sendToBack(selectedElement);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Delete' && selectedElement) {
    canvasContent.removeChild(selectedElement);
    selectedElement = null;
  }
});

timeSlider.addEventListener('input', updateVisibility);

startInput.addEventListener('input', () => {
  if (selectedElement) {
    selectedElement.dataset.start = startInput.value;
    updateVisibility();
  }
});

endInput.addEventListener('input', () => {
  if (selectedElement) {
    selectedElement.dataset.end = endInput.value;
    updateVisibility();
  }
});

textInput.addEventListener('input', () => {
  if (selectedElement && selectedElement.tagName === 'text') {
    selectedElement.textContent = textInput.value;
  }
});

strokeInput.addEventListener('input', () => {
  if (selectedElement) {
    selectedElement.setAttribute('stroke', strokeInput.value);
  }
});

fillInput.addEventListener('input', () => {
  if (selectedElement) {
    selectedElement.setAttribute('fill', fillInput.value);
  }
});

function updateVisibility() {
  const t = Number(timeSlider.value);
  Array.from(canvasContent.children).forEach(el => {
    const s = Number(el.dataset.start);
    const e = Number(el.dataset.end);
    el.style.display = t >= s && t <= e ? '' : 'none';
  });
}
