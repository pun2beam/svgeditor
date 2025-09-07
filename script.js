const svg = document.getElementById('canvas');
const canvasContent = document.getElementById('canvasContent');
const toolSelect = document.getElementById('tool');
const startInput = document.getElementById('startTime');
const endInput = document.getElementById('endTime');
const textInput = document.getElementById('textInput');
const saveBtn = document.getElementById('saveBtn');
const loadInput = document.getElementById('loadInput');
const displayStartInput = document.getElementById('displayStart');
const displayEndInput = document.getElementById('displayEnd');
const deleteBtn = document.getElementById('deleteBtn');
const bringForwardBtn = document.getElementById('bringForwardBtn');
const sendBackwardBtn = document.getElementById('sendBackwardBtn');
const groupBtn = document.getElementById('groupBtn');
const ungroupBtn = document.getElementById('ungroupBtn');
const strokeInput = document.getElementById('strokeColor');
const fillInput = document.getElementById('fillColor');
const backgroundInput = document.getElementById('backgroundColor');
const strokeWidthInput = document.getElementById('strokeWidth');
const lineTypeSelect = document.getElementById('lineType');
const toolbar = document.getElementById('toolbar');
const activeLayerSelect = document.getElementById('activeLayer');
const displayLayerCheckboxes = document.querySelectorAll('.display-layer');
const moveLayerSelect = document.getElementById('moveLayer');
const moveLayerBtn = document.getElementById('moveLayerBtn');

svg.style.backgroundColor = backgroundInput.value;
backgroundInput.addEventListener('input', () => {
  svg.style.backgroundColor = backgroundInput.value;
});

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
let selectedElements = [];
let dragStart = null;
let elemStarts = [];
let dragging = false;
const SELECT_THRESHOLD = 10;
const MIN_SIZE = 1;

let resizeHandle = null;
let resizing = false;
let resizeStart = null;

let selectionStart = null;
let selectionRect = null;
let selectingArea = false;
let selectionAdditive = false;

let vertexHandles = [];
let draggingVertexIndex = null;
let polygonStart = null;

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

const layers = [];
function initLayers() {
  canvasContent.innerHTML = '';
  layers.length = 0;
  for (let i = 0; i < 4; i++) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.layer = i;
    canvasContent.appendChild(g);
    layers.push(g);
  }
}
initLayers();

let activeLayer = Number(activeLayerSelect.value);
updateVisibility();

toolSelect.addEventListener('change', () => {
  currentTool = toolSelect.value;
  polygonPoints = [];
  if (polyline) {
    polyline.remove();
    polyline = null;
  }
  deselect();
  dragging = false;
  // Bubble tool also relies on the text field; clear it only when switching away
  if (currentTool !== 'text' && currentTool !== 'bubble') {
    textInput.value = '';
  }
});

activeLayerSelect.addEventListener('change', () => {
  activeLayer = Number(activeLayerSelect.value);
  deselect();
});
displayLayerCheckboxes.forEach(cb =>
  cb.addEventListener('change', updateVisibility)
);
moveLayerBtn.addEventListener('click', () => {
  if (selectedElements.length) {
    const target = Number(moveLayerSelect.value);
    const layer = layers[target];
    selectedElements.forEach(el => {
      el.dataset.layer = target;
      layer.appendChild(el);
    });
    deselect();
    updateVisibility();
  }
});

svg.addEventListener('wheel', e => {
  e.preventDefault();
  const overSelected = selectedElements.some(
    el => e.target === el || el.contains(e.target)
  );
  if (overSelected && e.shiftKey) {
    const scale = e.deltaY < 0 ? 1.1 : 0.9;
    selectedElements.forEach(el => {
      scaleElement(el, scale);
      if (selectedElements.length === 1 && el.tagName === 'rect')
        positionResizeHandle(el);
    });
  } else {
    const pt = getMousePos(e);
    const prevZoom = zoomLevel;
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    zoomLevel = Math.max(0.1, Math.min(10, zoomLevel * delta));
    panX = pt.x * prevZoom + panX - zoomLevel * pt.x;
    panY = pt.y * prevZoom + panY - zoomLevel * pt.y;
    updateTransform();
  }
});

svg.addEventListener('contextmenu', e => e.preventDefault());

svg.addEventListener('mousedown', e => {
  e.preventDefault();
  if (e.button === 2) {
    isPanning = true;
    startDragX = e.clientX;
    startDragY = e.clientY;
    return;
  }
  const pt = getMousePos(e);
  if (
    selectedElements.length === 1 &&
    selectedElement &&
    (selectedElement.tagName === 'polygon' ||
      selectedElement.tagName === 'polyline' ||
      selectedElement.tagName === 'path') &&
    e.shiftKey &&
    e.target === selectedElement
  ) {
    return;
  }
  const selecting = currentTool === 'select' || e.ctrlKey;
  if (selecting) {
    const { element, distance } = getNearestElement(pt);
    if (element && distance <= SELECT_THRESHOLD) {
      if (e.shiftKey) {
        selectElement(element, true);
      } else {
        if (!selectedElements.includes(element)) {
          selectElement(element);
        }
        dragStart = pt;
        elemStarts = selectedElements.map(el => ({ el, start: getElementStart(el) }));
        dragging = true;
      }
    } else if (e.target === svg && e.button === 0) {
      selectionAdditive = e.shiftKey;
      if (!selectionAdditive) deselect();
      selectionStart = pt;
      selectingArea = true;
      selectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selectionRect.setAttribute('class', 'selection-rect');
      selectionRect.setAttribute('pointer-events', 'none');
      selectionRect.setAttribute('x', pt.x);
      selectionRect.setAttribute('y', pt.y);
      selectionRect.setAttribute('width', 0);
      selectionRect.setAttribute('height', 0);
      canvasContent.appendChild(selectionRect);
    } else {
      if (e.target !== svg) deselect();
    }
    return; // skip drawing when selecting
  }
  if (currentTool === 'text') {
    addText(pt);
    updateVisibility();
    return;
  }
  if (
    currentTool === 'polygon' ||
    currentTool === 'polyline' ||
    currentTool === 'path'
  ) {
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
  } else if (resizing && selectedElements.length === 1 && selectedElement) {
    const pt = getMousePos(e);
    const dx = pt.x - dragStart.x;
    const dy = pt.y - dragStart.y;
    const newW = Math.max(MIN_SIZE, resizeStart.width + dx);
    const newH = Math.max(MIN_SIZE, resizeStart.height + dy);
    selectedElement.setAttribute('width', newW);
    selectedElement.setAttribute('height', newH);
    positionResizeHandle(selectedElement);
  } else if (
    draggingVertexIndex !== null &&
    selectedElements.length === 1 &&
    selectedElement &&
    (selectedElement.tagName === 'polygon' ||
      selectedElement.tagName === 'polyline' ||
      selectedElement.tagName === 'path')
  ) {
    const pt = getMousePos(e);
    const dx = pt.x - dragStart.x;
    const dy = pt.y - dragStart.y;
    const newPts = polygonStart.points.map((p, i) =>
      i === draggingVertexIndex ? { x: p.x + dx, y: p.y + dy } : p
    );
    setPoints(selectedElement, newPts);
    updatePolyHandles(newPts);
  } else if (dragging && selectedElements.length) {
    const pt = getMousePos(e);
    const dx = pt.x - dragStart.x;
    const dy = pt.y - dragStart.y;
    elemStarts.forEach(({ el, start }) => moveElement(el, start, dx, dy));
    if (
      selectedElements.length === 1 &&
      selectedElement.tagName === 'rect'
    )
      positionResizeHandle(selectedElement);
  } else if (selectingArea && selectionRect) {
    const pt = getMousePos(e);
    const x = Math.min(selectionStart.x, pt.x);
    const y = Math.min(selectionStart.y, pt.y);
    const w = Math.abs(pt.x - selectionStart.x);
    const h = Math.abs(pt.y - selectionStart.y);
    selectionRect.setAttribute('x', x);
    selectionRect.setAttribute('y', y);
    selectionRect.setAttribute('width', w);
    selectionRect.setAttribute('height', h);
  }
});

svg.addEventListener('mouseup', e => {
  if (dragging) {
    dragging = false;
    return;
  }
  if (selectingArea) {
    const pt = getMousePos(e);
    const x1 = Math.min(selectionStart.x, pt.x);
    const y1 = Math.min(selectionStart.y, pt.y);
    const x2 = Math.max(selectionStart.x, pt.x);
    const y2 = Math.max(selectionStart.y, pt.y);
    if (selectionRect) {
      selectionRect.remove();
      selectionRect = null;
    }
    Array.from(layers[activeLayer].children).forEach(el => {
      if (
        el.tagName === 'defs' ||
        el.classList.contains('resize-handle') ||
        el.classList.contains('vertex-handle') ||
        typeof el.getBBox !== 'function'
      )
        return;
      const bbox = el.getBBox();
      if (
        bbox.x + bbox.width >= x1 &&
        bbox.x <= x2 &&
        bbox.y + bbox.height >= y1 &&
        bbox.y <= y2
      ) {
        if (selectionAdditive) {
          if (!selectedElements.includes(el)) selectElement(el, true);
        } else {
          selectElement(el, true);
        }
      }
    });
    selectingArea = false;
    return;
  }
  if (!drawing) return;
  drawing = false;
  const pt = getMousePos(e);
  if (currentTool === 'rect') addRect(startPoint, pt);
  else if (currentTool === 'circle') addCircle(startPoint, pt);
  else if (currentTool === 'line') addLine(startPoint, pt);
  else if (currentTool === 'arrow') addLine(startPoint, pt, true);
  else if (currentTool === 'bubble') addBubble(startPoint, pt);
  updateVisibility();
});

document.addEventListener('mouseup', () => {
  isPanning = false;
  resizing = false;
  draggingVertexIndex = null;
  if (selectingArea) {
    selectingArea = false;
    if (selectionRect) {
      selectionRect.remove();
      selectionRect = null;
    }
  }
});

svg.addEventListener('click', e => {
  if (
    currentTool !== 'polygon' &&
    currentTool !== 'polyline' &&
    currentTool !== 'path'
  )
    return;
  const pt = getMousePos(e);
  polygonPoints.push(pt);
  if (!polyline) {
    polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', strokeInput.value);
    polyline.setAttribute('stroke-width', strokeWidthInput.value);
    layers[activeLayer].appendChild(polyline);
  }
  polyline.setAttribute('points', polygonPoints.map(p => `${p.x},${p.y}`).join(' '));
});

svg.addEventListener('click', e => {
  if (
    selectedElements.length === 1 &&
    selectedElement &&
    (selectedElement.tagName === 'polygon' ||
      selectedElement.tagName === 'polyline' ||
      selectedElement.tagName === 'path') &&
    e.shiftKey &&
    e.target === selectedElement
  ) {
    const pt = getMousePos(e);
    addPointToShape(selectedElement, pt);
  }
});

svg.addEventListener('dblclick', e => {
  if (
    currentTool !== 'polygon' &&
    currentTool !== 'polyline' &&
    currentTool !== 'path'
  )
    return;
  const minPts = currentTool === 'polygon' ? 3 : 2;
  if (polygonPoints.length < minPts) return;
  if (polyline) {
    polyline.remove();
    polyline = null;
  }
  if (currentTool === 'polygon') finalizePolygon();
  else if (currentTool === 'polyline') finalizePolyline();
  else finalizePath();
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
  Array.from(layers[activeLayer].children).forEach(el => {
    if (
      el.tagName === 'defs' ||
      typeof el.getBBox !== 'function' ||
      el.classList.contains('resize-handle') ||
      el.classList.contains('vertex-handle')
    )
      return;
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
  if (w < MIN_SIZE || h < MIN_SIZE) return;
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', w);
  rect.setAttribute('height', h);
  rect.setAttribute('fill', fillInput.value);
  rect.setAttribute('stroke', strokeInput.value);
  rect.setAttribute('stroke-width', strokeWidthInput.value);
  if (lineTypeSelect.value) rect.setAttribute('stroke-dasharray', lineTypeSelect.value);
  setTime(rect);
  rect.dataset.layer = activeLayer;
  layers[activeLayer].appendChild(rect);
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
  circ.setAttribute('stroke-width', strokeWidthInput.value);
  if (lineTypeSelect.value) circ.setAttribute('stroke-dasharray', lineTypeSelect.value);
  setTime(circ);
  circ.dataset.layer = activeLayer;
  layers[activeLayer].appendChild(circ);
  selectElement(circ);
}

function addLine(p1, p2, isArrow) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', p1.x);
  line.setAttribute('y1', p1.y);
  line.setAttribute('x2', p2.x);
  line.setAttribute('y2', p2.y);
  line.setAttribute('stroke', strokeInput.value);
  line.setAttribute('stroke-width', strokeWidthInput.value);
  if (lineTypeSelect.value) line.setAttribute('stroke-dasharray', lineTypeSelect.value);
  if (isArrow) {
    line.setAttribute('marker-end', 'url(#arrow)');
    ensureArrowDef();
    const arrowPath = document.querySelector('#arrow path');
    if (arrowPath) arrowPath.setAttribute('fill', strokeInput.value);
  }
  setTime(line);
  line.dataset.layer = activeLayer;
  layers[activeLayer].appendChild(line);
  selectElement(line);
}

function addBubble(p1, p2) {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const w = Math.abs(p1.x - p2.x);
  const h = Math.abs(p1.y - p2.y);
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('stroke', strokeInput.value);
  g.setAttribute('fill', fillInput.value);
  g.setAttribute('stroke-width', strokeWidthInput.value);
  if (lineTypeSelect.value) g.setAttribute('stroke-dasharray', lineTypeSelect.value);

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', w);
  rect.setAttribute('height', h);

  const tail = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  const tailW = Math.min(20, w);
  const tailH = Math.min(20, h);
  const midX = x + w / 2;
  tail.setAttribute(
    'points',
    `${midX - tailW / 2},${y + h} ${midX + tailW / 2},${y + h} ${midX},${y + h + tailH}`
  );

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.textContent = textInput.value || 'text';
  text.setAttribute('x', x + w / 2);
  text.setAttribute('y', y + h / 2);
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '16');
  text.setAttribute('fill', strokeInput.value);
  text.setAttribute('stroke', 'none');

  g.appendChild(rect);
  g.appendChild(tail);
  g.appendChild(text);
  setTime(g);
  g.dataset.layer = activeLayer;
  rect.dataset.layer = activeLayer;
  tail.dataset.layer = activeLayer;
  text.dataset.layer = activeLayer;
  layers[activeLayer].appendChild(g);
  resizeBubbleToFitText(g);
  const finalW = parseFloat(rect.getAttribute('width'));
  const finalH = parseFloat(rect.getAttribute('height'));
  if (finalW < MIN_SIZE || finalH < MIN_SIZE) {
    g.remove();
    return;
  }
  selectElement(g);
}

function resizeBubbleToFitText(g) {
  const rect = g.querySelector('rect');
  const text = g.querySelector('text');
  const tail = g.querySelector('polygon');
  if (!rect || !text) return;
  const padding = 10;
  let w = parseFloat(rect.getAttribute('width'));
  let h = parseFloat(rect.getAttribute('height'));
  const cx = parseFloat(rect.getAttribute('x')) + w / 2;
  const cy = parseFloat(rect.getAttribute('y')) + h / 2;
  const bbox = text.getBBox();
  const neededW = bbox.width + padding * 2;
  const neededH = bbox.height + padding * 2;
  w = Math.max(w, neededW);
  h = Math.max(h, neededH);
  const x = cx - w / 2;
  const y = cy - h / 2;
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', w);
  rect.setAttribute('height', h);
  text.setAttribute('x', cx);
  text.setAttribute('y', cy);
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('text-anchor', 'middle');
  if (tail) {
    const tailW = Math.min(20, w);
    const tailH = Math.min(20, h);
    const midX = cx;
    tail.setAttribute(
      'points',
      `${midX - tailW / 2},${y + h} ${midX + tailW / 2},${y + h} ${midX},${y + h + tailH}`
    );
  }
}

function finalizePolygon() {
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', polygonPoints.map(p => `${p.x},${p.y}`).join(' '));
  poly.setAttribute('fill', fillInput.value);
  poly.setAttribute('stroke', strokeInput.value);
  poly.setAttribute('stroke-width', strokeWidthInput.value);
  if (lineTypeSelect.value) poly.setAttribute('stroke-dasharray', lineTypeSelect.value);
  setTime(poly);
  poly.dataset.layer = activeLayer;
  layers[activeLayer].appendChild(poly);
  selectElement(poly);
  polygonPoints = [];
}

function finalizePolyline() {
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', polygonPoints.map(p => `${p.x},${p.y}`).join(' '));
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', strokeInput.value);
  poly.setAttribute('stroke-width', strokeWidthInput.value);
  if (lineTypeSelect.value) poly.setAttribute('stroke-dasharray', lineTypeSelect.value);
  setTime(poly);
  poly.dataset.layer = activeLayer;
  layers[activeLayer].appendChild(poly);
  selectElement(poly);
  polygonPoints = [];
}

function getSmoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function finalizePath() {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = getSmoothPath(polygonPoints);
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', strokeInput.value);
  path.setAttribute('stroke-width', strokeWidthInput.value);
  if (lineTypeSelect.value) path.setAttribute('stroke-dasharray', lineTypeSelect.value);
  setTime(path);
  path.dataset.layer = activeLayer;
  layers[activeLayer].appendChild(path);
  selectElement(path);
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
  t.setAttribute('stroke-width', strokeWidthInput.value);
  if (lineTypeSelect.value) t.setAttribute('stroke-dasharray', lineTypeSelect.value);
  setTime(t);
  t.dataset.layer = activeLayer;
  layers[activeLayer].appendChild(t);
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

function selectElement(el, additive = false) {
  if (additive) {
    const idx = selectedElements.indexOf(el);
    if (idx !== -1) {
      el.classList.remove('selected');
      if (el.tagName === 'g') {
        el.querySelectorAll('*').forEach(c => c.classList.remove('selected'));
      }
      selectedElements.splice(idx, 1);
      if (selectedElement === el)
        selectedElement = selectedElements[selectedElements.length - 1] || null;
    } else {
      selectedElements.push(el);
      selectedElement = el;
      el.classList.add('selected');
      if (el.tagName === 'g') {
        el.querySelectorAll('*').forEach(c => c.classList.add('selected'));
      }
    }
  } else {
    selectedElements.forEach(sel => {
      sel.classList.remove('selected');
      if (sel.tagName === 'g')
        sel.querySelectorAll('*').forEach(c => c.classList.remove('selected'));
    });
    selectedElements = [el];
    selectedElement = el;
    el.classList.add('selected');
    if (el.tagName === 'g') {
      el.querySelectorAll('*').forEach(c => c.classList.add('selected'));
    }
  }
  removeResizeHandle();
  removeVertexHandles();
  if (selectedElements.length === 1) {
    startInput.value = el.dataset.start || 0;
    endInput.value = el.dataset.end || 0;
    if (el.tagName === 'text') {
      textInput.value = el.textContent;
    } else if (el.tagName === 'g') {
      const t = el.querySelector('text');
      textInput.value = t ? t.textContent : '';
    } else {
      textInput.value = '';
    }
    updateColorInputs(el);
    addResizeHandle(el);
    if (
      el.tagName === 'polygon' ||
      el.tagName === 'polyline' ||
      el.tagName === 'path'
    )
      addPolyHandles(el);
  } else {
    startInput.value = '';
    endInput.value = '';
    textInput.value = '';
  }
}

function deselect() {
  selectedElements.forEach(el => {
    el.classList.remove('selected');
    if (el.tagName === 'g')
      el.querySelectorAll('*').forEach(c => c.classList.remove('selected'));
  });
  selectedElements = [];
  selectedElement = null;
  removeResizeHandle();
  removeVertexHandles();
}

function positionResizeHandle(rect) {
  if (!resizeHandle || rect.tagName !== 'rect') return;
  const x = parseFloat(rect.getAttribute('x')) + parseFloat(rect.getAttribute('width'));
  const y = parseFloat(rect.getAttribute('y')) + parseFloat(rect.getAttribute('height'));
  const size = parseFloat(resizeHandle.getAttribute('width'));
  resizeHandle.setAttribute('x', x - size / 2);
  resizeHandle.setAttribute('y', y - size / 2);
}

function addResizeHandle(rect) {
  removeResizeHandle();
  if (rect.tagName !== 'rect') return;
  const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  handle.setAttribute('width', 8);
  handle.setAttribute('height', 8);
  handle.classList.add('resize-handle');
  canvasContent.appendChild(handle);
  resizeHandle = handle;
  positionResizeHandle(rect);
  handle.addEventListener('mousedown', e => {
    e.stopPropagation();
    resizing = true;
    dragStart = getMousePos(e);
    resizeStart = {
      x: parseFloat(rect.getAttribute('x')),
      y: parseFloat(rect.getAttribute('y')),
      width: parseFloat(rect.getAttribute('width')),
      height: parseFloat(rect.getAttribute('height'))
    };
  });
}

function removeResizeHandle() {
  if (resizeHandle) {
    resizeHandle.remove();
    resizeHandle = null;
  }
}

function getPoints(el) {
  if (el.tagName === 'path') {
    const d = el.getAttribute('d') || '';
    const cmds = d.match(/[MLC][^MLC]*/g) || [];
    const pts = [];
    cmds.forEach(cmd => {
      const type = cmd[0];
      const nums = cmd
        .slice(1)
        .trim()
        .split(/[ ,]+/)
        .map(Number);
      if (type === 'M' || type === 'L') {
        pts.push({ x: nums[0], y: nums[1] });
      } else if (type === 'C') {
        pts.push({ x: nums[4], y: nums[5] });
      }
    });
    return pts;
  }
  return (el.getAttribute('points') || '')
    .split(' ')
    .filter(s => s)
    .map(p => {
      const [x, y] = p.split(',').map(Number);
      return { x, y };
    });
}

function setPoints(el, pts) {
  if (el.tagName === 'path') {
    const d = pts.length ? getSmoothPath(pts) : '';
    el.setAttribute('d', d);
  } else {
    el.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
  }
}

function addPolyHandles(poly) {
  removeVertexHandles();
  const pts = getPoints(poly);
  pts.forEach((pt, i) => {
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    handle.setAttribute('r', 5);
    handle.classList.add('vertex-handle');
    handle.setAttribute('cx', pt.x);
    handle.setAttribute('cy', pt.y);
    handle.addEventListener('mousedown', e => {
      e.stopPropagation();
      draggingVertexIndex = i;
      dragStart = getMousePos(e);
      polygonStart = getElementStart(selectedElement);
    });
    handle.addEventListener('dblclick', e => {
      e.stopPropagation();
      removePoint(i);
    });
    canvasContent.appendChild(handle);
    vertexHandles.push(handle);
  });
}

function updatePolyHandles(points) {
  vertexHandles.forEach((h, i) => {
    if (!points[i]) return;
    h.setAttribute('cx', points[i].x);
    h.setAttribute('cy', points[i].y);
  });
}

function removeVertexHandles() {
  vertexHandles.forEach(h => h.remove());
  vertexHandles = [];
  draggingVertexIndex = null;
}

function removePoint(index) {
  if (
    selectedElements.length !== 1 ||
    !selectedElement ||
    (selectedElement.tagName !== 'polygon' &&
      selectedElement.tagName !== 'polyline' &&
      selectedElement.tagName !== 'path')
  )
    return;
  const pts = getPoints(selectedElement);
  const minPts = selectedElement.tagName === 'polygon' ? 3 : 2;
  if (pts.length <= minPts) return;
  pts.splice(index, 1);
  setPoints(selectedElement, pts);
  addPolyHandles(selectedElement);
}

function addPointToShape(poly, pt) {
  const pts = getPoints(poly);
  let index = 0;
  let minDist = Infinity;
  const limit = poly.tagName === 'polygon' ? pts.length : pts.length - 1;
  for (let i = 0; i < limit; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dist = distanceToSegment(pt, a, b);
    if (dist < minDist) {
      minDist = dist;
      index = i + 1;
    }
  }
  pts.splice(index, 0, pt);
  setPoints(poly, pts);
  addPolyHandles(poly);
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
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
    case 'polyline':
    case 'path':
      return {
        points: getPoints(el)
      };
    case 'text':
      return { x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')) };
    case 'g':
      return Array.from(el.children).map(child => ({
        el: child,
        start: getElementStart(child)
      }));
    default:
      return {};
  }
}

function updateColorInputs(el) {
  const stroke = getComputedStyle(el).stroke;
  strokeInput.value = stroke === 'none' ? '#000000' : rgbToHex(stroke);
  const fill = getComputedStyle(el).fill;
  fillInput.value = fill === 'none' ? '#ffffff' : rgbToHex(fill);
  const width = getComputedStyle(el).strokeWidth;
  strokeWidthInput.value = parseFloat(width) || 1;
  lineTypeSelect.value = el.getAttribute('stroke-dasharray') || '';
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
      case 'polyline':
      case 'path': {
        const pts = start.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        setPoints(el, pts);
        if (selectedElements.length === 1 && el === selectedElement)
          updatePolyHandles(pts);
        break;
      }
    case 'text':
      el.setAttribute('x', start.x + dx);
      el.setAttribute('y', start.y + dy);
      break;
    case 'g':
      start.forEach(obj => moveElement(obj.el, obj.start, dx, dy));
      break;
  }
}

function scaleElement(el, factor) {
  switch (el.tagName) {
    case 'rect': {
      const x = parseFloat(el.getAttribute('x'));
      const y = parseFloat(el.getAttribute('y'));
      const w = parseFloat(el.getAttribute('width'));
      const h = parseFloat(el.getAttribute('height'));
      const cx = x + w / 2;
      const cy = y + h / 2;
      const nw = Math.max(MIN_SIZE, w * factor);
      const nh = Math.max(MIN_SIZE, h * factor);
      el.setAttribute('x', cx - nw / 2);
      el.setAttribute('y', cy - nh / 2);
      el.setAttribute('width', nw);
      el.setAttribute('height', nh);
        if (selectedElements.length === 1 && el === selectedElement)
          positionResizeHandle(el);
        break;
      }
    case 'circle': {
      const r = parseFloat(el.getAttribute('r')) * factor;
      el.setAttribute('r', r);
      break;
    }
    case 'line': {
      const x1 = parseFloat(el.getAttribute('x1'));
      const y1 = parseFloat(el.getAttribute('y1'));
      const x2 = parseFloat(el.getAttribute('x2'));
      const y2 = parseFloat(el.getAttribute('y2'));
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      el.setAttribute('x1', cx + (x1 - cx) * factor);
      el.setAttribute('y1', cy + (y1 - cy) * factor);
      el.setAttribute('x2', cx + (x2 - cx) * factor);
      el.setAttribute('y2', cy + (y2 - cy) * factor);
      break;
    }
    case 'polygon':
    case 'polyline':
    case 'path': {
      const pts = getPoints(el);
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      pts.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const npts = pts.map(p => ({
        x: cx + (p.x - cx) * factor,
        y: cy + (p.y - cy) * factor
      }));
        setPoints(el, npts);
        if (selectedElements.length === 1 && el === selectedElement)
          updatePolyHandles(npts);
        break;
      }
    case 'text': {
      const size = (parseFloat(el.getAttribute('font-size')) || 16) * factor;
      el.setAttribute('font-size', size);
      break;
    }
    case 'g': {
      const children = Array.from(el.children);
      if (children.length === 0) break;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      children.forEach(ch => {
        const bb = ch.getBBox();
        minX = Math.min(minX, bb.x);
        minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.width);
        maxY = Math.max(maxY, bb.y + bb.height);
      });
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      children.forEach(ch => {
        const bb = ch.getBBox();
        const childCx = bb.x + bb.width / 2;
        const childCy = bb.y + bb.height / 2;
        const dx = (childCx - cx) * (factor - 1);
        const dy = (childCy - cy) * (factor - 1);
        const start = getElementStart(ch);
        moveElement(ch, start, dx, dy);
        scaleElement(ch, factor);
      });
      break;
    }
  }
}

function bringToFront(el) {
  const layer = layers[Number(el.dataset.layer)];
  layer.appendChild(el);
  if (resizeHandle) canvasContent.appendChild(resizeHandle);
  vertexHandles.forEach(h => canvasContent.appendChild(h));
}

function sendToBack(el) {
  const layer = layers[Number(el.dataset.layer)];
  layer.insertBefore(el, layer.firstChild);
  if (resizeHandle) canvasContent.appendChild(resizeHandle);
  vertexHandles.forEach(h => canvasContent.appendChild(h));
}

function serializeElement(el) {
  const obj = {
    type: el.tagName,
    attrs: [...el.attributes].reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {})
  };
  obj.start = el.dataset.start;
  obj.end = el.dataset.end;
  obj.layer = el.dataset.layer;
  if (el.tagName === 'text') obj.text = el.textContent;
  if (el.tagName === 'g') {
    obj.children = Array.from(el.children).map(serializeElement);
  }
  return obj;
}

function deserializeElement(obj) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', obj.type);
  Object.keys(obj.attrs).forEach(k => el.setAttribute(k, obj.attrs[k]));
  if (obj.start !== undefined) el.dataset.start = obj.start;
  if (obj.end !== undefined) el.dataset.end = obj.end;
  if (obj.layer !== undefined) el.dataset.layer = obj.layer;
  if (obj.type === 'text' && obj.text !== undefined) el.textContent = obj.text;
  if (obj.type === 'g' && Array.isArray(obj.children)) {
    obj.children.forEach(child => el.appendChild(deserializeElement(child)));
  }
  return el;
}

saveBtn.addEventListener('click', () => {
  const elements = layers.flatMap(layerEl =>
    Array.from(layerEl.children).map(serializeElement)
  );
  const exportData = {
    background: backgroundInput.value,
    elements
  };
  const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
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
    let elements;
    let background = '#ffffff';
    if (Array.isArray(data)) {
      elements = data;
    } else {
      elements = data.elements || [];
      if (data.background) background = data.background;
    }
    deselect();
    initLayers();
    elements.forEach(obj => {
      const el = deserializeElement(obj);
      const layerIdx = Number(obj.layer) || 0;
      layers[layerIdx].appendChild(el);
    });
    svg.style.backgroundColor = background;
    backgroundInput.value = background;
    updateVisibility();
  };
  reader.readAsText(file);
});

deleteBtn.addEventListener('click', () => {
  if (selectedElements.length) {
    selectedElements.forEach(el => el.parentNode && el.parentNode.removeChild(el));
    deselect();
  }
});

bringForwardBtn.addEventListener('click', () => {
  if (selectedElements.length) {
    selectedElements.forEach(el => bringToFront(el));
  }
});

sendBackwardBtn.addEventListener('click', () => {
  if (selectedElements.length) {
    selectedElements.forEach(el => sendToBack(el));
  }
});

groupBtn.addEventListener('click', () => {
  if (selectedElements.length > 1) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    let minStart = Infinity;
    let maxEnd = -Infinity;
    const elems = [...selectedElements];
    const indices = elems.map(el =>
      Array.from(layers[activeLayer].children).indexOf(el)
    );
    const minIndex = Math.min(...indices);
    elems.forEach(el => {
      const s = parseFloat(el.dataset.start);
      const e = parseFloat(el.dataset.end);
      if (!isNaN(s)) minStart = Math.min(minStart, s);
      if (!isNaN(e)) maxEnd = Math.max(maxEnd, e);
      g.appendChild(el);
    });
    if (minStart !== Infinity) g.dataset.start = minStart;
    if (maxEnd !== -Infinity) g.dataset.end = maxEnd;
    g.dataset.layer = activeLayer;
    const refNode = layers[activeLayer].children[minIndex] || null;
    layers[activeLayer].insertBefore(g, refNode);
    deselect();
    selectElement(g);
    updateVisibility();
  }
});

ungroupBtn.addEventListener('click', () => {
  if (selectedElements.length === 1 && selectedElement.tagName === 'g') {
    const g = selectedElement;
    const index = Array.from(layers[activeLayer].children).indexOf(g);
    const children = Array.from(g.children);
    layers[activeLayer].removeChild(g);
    children.forEach((child, i) => {
      child.dataset.layer = activeLayer;
      layers[activeLayer].insertBefore(
        child,
        layers[activeLayer].children[index + i] || null
      );
    });
    deselect();
    updateVisibility();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Delete' && selectedElements.length) {
    selectedElements.forEach(el => el.parentNode && el.parentNode.removeChild(el));
    deselect();
  }
});

displayStartInput.addEventListener('input', updateVisibility);
displayEndInput.addEventListener('input', updateVisibility);

startInput.addEventListener('input', () => {
  if (selectedElements.length) {
    selectedElements.forEach(el => (el.dataset.start = startInput.value));
    updateVisibility();
  }
});

endInput.addEventListener('input', () => {
  if (selectedElements.length) {
    selectedElements.forEach(el => (el.dataset.end = endInput.value));
    updateVisibility();
  }
});

textInput.addEventListener('input', () => {
  if (!selectedElements.length) return;
  selectedElements.forEach(el => {
    if (el.tagName === 'text') {
      el.textContent = textInput.value;
      const parent = el.parentNode;
      if (parent && parent.tagName === 'g') resizeBubbleToFitText(parent);
    } else if (el.tagName === 'g') {
      const text = el.querySelector('text');
      if (text) {
        text.textContent = textInput.value;
        resizeBubbleToFitText(el);
      }
    }
  });
});

strokeInput.addEventListener('input', () => {
  if (selectedElements.length) {
    selectedElements.forEach(el => el.setAttribute('stroke', strokeInput.value));
  }
});

fillInput.addEventListener('input', () => {
  if (selectedElements.length) {
    selectedElements.forEach(el => el.setAttribute('fill', fillInput.value));
  }
});

strokeWidthInput.addEventListener('input', () => {
  if (selectedElements.length) {
    selectedElements.forEach(el =>
      el.setAttribute('stroke-width', strokeWidthInput.value)
    );
  }
});

lineTypeSelect.addEventListener('change', () => {
  if (selectedElements.length) {
    const val = lineTypeSelect.value;
    selectedElements.forEach(el => {
      if (val) {
        el.setAttribute('stroke-dasharray', val);
      } else {
        el.removeAttribute('stroke-dasharray');
      }
    });
  }
});

function updateVisibility() {
  const start = Number(displayStartInput.value);
  const end = Number(displayEndInput.value);
  layers.forEach((layerEl, idx) => {
    const visible = displayLayerCheckboxes[idx].checked;
    layerEl.style.display = visible ? '' : 'none';
    if (!visible) return;
    Array.from(layerEl.children).forEach(el => {
      const s = Number(el.dataset.start);
      const e = Number(el.dataset.end);
      el.style.display = e >= start && s <= end ? '' : 'none';
    });
  });
  if (resizeHandle) resizeHandle.style.display = '';
  vertexHandles.forEach(h => (h.style.display = ''));
}
