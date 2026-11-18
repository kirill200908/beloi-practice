const iconLines = {
  grid: [[3, 3, 7, 7], [11, 3, 15, 7], [3, 11, 7, 15], [11, 11, 15, 15]],
  bookmark: [[5, 3, 13, 3, 13, 15, 9, 12, 5, 15, 5, 3]],
  chart: [[3, 14, 15, 14], [5, 11, 5, 8], [9, 11, 9, 5], [13, 11, 13, 3]],
  "arrow-down": [[9, 3, 9, 14], [5, 10, 9, 14, 13, 10]],
  "arrow-left": [[15, 9, 4, 9], [8, 5, 4, 9, 8, 13]],
  "chevron-right": [[7, 4, 12, 9, 7, 14]],
  "chevron-down": [[4, 7, 9, 12, 14, 7]],
  external: [[10, 3, 15, 3, 15, 8], [15, 3, 8, 10], [7, 4, 4, 4, 4, 14, 14, 14, 14, 11]],
  calendar: [[3, 5, 15, 5, 15, 15, 3, 15, 3, 5], [3, 8, 15, 8], [6, 3, 6, 6], [12, 3, 12, 6]],
  layers: [[2, 6, 9, 2.5, 16, 6, 9, 9.5, 2, 6], [2, 9, 9, 12.5, 16, 9], [2, 12, 9, 15.5, 16, 12]],
  help: [[7, 7, 7, 6.3, 8, 5.5, 10, 5.5, 11, 6.6, 11, 7.6, 9, 9.3, 9, 10], [9, 12.3, 9, 12.5]],
  search: [[11.6, 11.6, 15.2, 15.2]],
  menu: [[3, 5, 15, 5], [3, 9, 15, 9], [3, 13, 15, 13]],
  x: [[4, 4, 14, 14], [14, 4, 4, 14]],
  clock: [[9, 5, 9, 9, 12, 10]],
  memory: [[5, 5, 13, 5, 13, 13, 5, 13, 5, 5], [7, 3, 7, 5], [11, 3, 11, 5], [7, 13, 7, 15], [11, 13, 11, 15], [3, 7, 5, 7], [3, 11, 5, 11], [13, 7, 15, 7], [13, 11, 15, 11]],
  copy: [[6, 6, 14, 6, 14, 15, 6, 15, 6, 6], [4, 12, 3, 12, 3, 3, 11, 3, 11, 4]],
  upload: [[9, 12, 9, 3], [5, 7, 9, 3, 13, 7], [3, 11, 3, 15, 15, 15, 15, 11]],
  download: [[9, 3, 9, 12], [5, 8, 9, 12, 13, 8], [3, 13, 3, 15, 15, 15, 15, 13]],
  check: [[3.5, 9, 7, 12.5, 14.5, 5.5]],
};
const iconCircles = { help: [[9, 9, 6.6]], clock: [[9, 9, 6.6]], search: [[7.7, 7.7, 4.8]], target: [[9, 9, 6.6], [9, 9, 3.4], [9, 9, 0.65]] };

export function paintIcons(root = document) {
  for (const element of root.querySelectorAll("[data-icon]")) {
    const key = element.dataset.icon;
    const canvas = element.firstElementChild?.tagName === "CANVAS" ? element.firstElementChild : document.createElement("canvas");
    const size = 36;
    canvas.width = canvas.height = size;
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.strokeStyle = ctx.fillStyle = getComputedStyle(element).color;
    ctx.lineWidth = 1.45;
    ctx.lineCap = ctx.lineJoin = "round";
    for (const line of iconLines[key] || []) {
      ctx.beginPath();
      ctx.moveTo(line[0], line[1]);
      if (key === "grid") {
        ctx.rect(line[0], line[1], line[2] - line[0], line[3] - line[1]);
      } else {
        for (let i = 2; i < line.length; i += 2) ctx.lineTo(line[i], line[i + 1]);
      }
      if (key === "bookmark" && element.getAttribute("aria-pressed") === "true") ctx.fill();
      ctx.stroke();
    }
    for (const [x, y, r] of iconCircles[key] || []) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.stroke();
    }
    if (!canvas.parentElement) element.append(canvas);
  }
}

export function paintHero(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const density = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * density;
  canvas.height = height * density;
  const ctx = canvas.getContext("2d");
  ctx.scale(density, density);
  const background = ctx.createLinearGradient(0, height, width, 0);
  background.addColorStop(0, "#233ec7");
  background.addColorStop(.5, "#2f4be2");
  background.addColorStop(1, "#4561f2");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const cx = width * .78;
  const cy = height * .49;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * .84);
  glow.addColorStop(0, "#8aa8ff60");
  glow.addColorStop(1, "#8aa8ff00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  for (let x = Math.round(width * .43); x < width; x += 19) {
    for (let y = 10; y < height; y += 19) {
      ctx.fillStyle = `rgba(222,233,255,${.36 * (x / width - .43)})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }
  const mobile = width < 600;
  const scale = Math.min(height / 304, width / 870) * (mobile ? 1.13 : 1);
  ctx.save();
  ctx.translate(cx + (mobile ? width * .12 : 0), cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha = mobile ? .42 : 1;
  ctx.strokeStyle = "#c8daff46";
  ctx.lineWidth = 1;
  for (const radius of [46, 83, 119, 151]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.18, radius * .73, -.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  const points = [
    [-150, 41], [-119, -62], [-96, 77], [-70, -18], [-43, -88], [-36, 41], [0, 0],
    [38, -48], [55, 56], [91, -86], [99, 13], [119, 77], [140, -41], [158, 27],
  ];
  const edges = [[0,1],[0,2],[0,3],[1,3],[1,4],[2,3],[2,5],[3,4],[3,5],[3,6],[4,6],[4,7],
    [5,6],[5,8],[6,7],[6,8],[6,10],[7,9],[7,10],[8,10],[8,11],[9,10],[9,12],[10,11],[10,12],[10,13],[11,13],[12,13]];
  const selected = [1, 3, 6, 7, 10, 13];
  for (const [a, b] of edges) {
    const bright = selected.indexOf(b) === selected.indexOf(a) + 1 && selected.includes(a);
    ctx.strokeStyle = bright ? "#a7f9d5" : "#c3d2ff76";
    ctx.lineWidth = bright ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(...points[a]);
    ctx.lineTo(...points[b]);
    ctx.stroke();
  }
  for (const [index, [x, y]] of points.entries()) {
    const bright = selected.includes(index);
    ctx.fillStyle = bright ? "#a9fadb" : "#a9bcff";
    ctx.beginPath();
    ctx.arc(x, y, index === 6 ? 6.5 : bright ? 4.2 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (index === 6 || index === 13) {
      ctx.strokeStyle = "#bbffe1a0";
      ctx.beginPath();
      ctx.arc(x, y, index === 6 ? 12 : 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.font = "13px Consolas, monospace";
  ctx.fillStyle = "#d5e0ffb0";
  ctx.fillText("{ }", -149, -90);
  ctx.fillText("</>", 112, 107);
  ctx.fillText("01", 128, -91);
  ctx.restore();
}
