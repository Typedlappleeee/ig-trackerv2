// Générateur de photos de profil (fourni par l'équipe, « generateur-pfp-rose.html ») : dégradé rose unique par
// graine + paillettes, étoiles et cœurs, 1080×1080, entièrement dessiné dans le navigateur (aucun service externe).
/* eslint-disable */
// @ts-nocheck
const SIZE = 1080, LOW = 160
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function jitter(c, r, amt) {
    return c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v + (r() - 0.5) * amt))); });
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    function f(n) {
      var k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    }
    return [f(0), f(8), f(4)];
  }
  // Couleurs d'accompagnement, toujours mêlées au rose
  // Tons doux et poudrés : pastels, nude, lilas, pêche…
  var ACCENTS = [
    { name: "pêche", h: 18, s: 75 }, { name: "corail doux", h: 6, s: 70 }, { name: "nude", h: 14, s: 45 },
    { name: "champagne", h: 30, s: 55 }, { name: "framboise", h: 345, s: 70 }, { name: "lilas", h: 285, s: 55 },
    { name: "lavande", h: 265, s: 50 }, { name: "orchidée", h: 300, s: 55 }, { name: "mauve", h: 320, s: 35 },
    { name: "rose gold", h: 12, s: 50 }, { name: "pivoine", h: 340, s: 60 }, { name: "lilas", h: 285, s: 55 }
  ];
  // Palette propre à chaque dégradé : le rose domine, 1 ou 2 accents varient
  function makePalette(r) {
    var pinkH = 326 + r() * 22;
    var light = [], vivid = [];
    vivid.push(hsl(pinkH, 68 + r() * 16, 64 + r() * 9));
    vivid.push(hsl(pinkH + (r() - 0.5) * 14, 60 + r() * 18, 70 + r() * 7));
    light.push(hsl(pinkH + (r() - 0.5) * 10, 72 + r() * 20, 82 + r() * 7));
    light.push(hsl(pinkH + (r() - 0.5) * 16, 65 + r() * 25, 89 + r() * 5));
    light.push(hsl(pinkH + 8, 60, 95)); // reflet presque blanc, effet lumineux
    var n = r() < 0.75 ? 1 : 2, used = [];
    for (var i = 0; i < n; i++) {
      var acc = ACCENTS[Math.floor(r() * ACCENTS.length)];
      if (used.indexOf(acc) >= 0) continue;
      used.push(acc);
      var h = acc.h + (r() - 0.5) * 10;
      // accent doux et poudré, jamais criard
      vivid.push(hsl(h, acc.s + r() * 15, 70 + r() * 8));
      light.push(hsl(h, acc.s + r() * 20, 84 + r() * 7));
    }
    return { pinkBase: vivid[0], light: light, vivid: vivid, all: light.concat(vivid), names: used.map(function (a) { return a.name; }) };
  }

  function render(seed) {
    var r = rng(seed);
    // 1) dessin en basse résolution : les blobs se fondent naturellement
    var lo = document.createElement("canvas");
    lo.width = lo.height = LOW;
    var g = lo.getContext("2d");
    var pal = makePalette(r);
    var pickAll = function () { return pal.all[Math.floor(r() * pal.all.length)]; };
    var base = r() < 0.5 ? pal.pinkBase : pal.light[Math.floor(r() * 2)];
    g.fillStyle = rgba(base, 1);
    g.fillRect(0, 0, LOW, LOW);

    // Bandes diagonales douces
    var ang = r() * Math.PI * 2;
    var lin = g.createLinearGradient(
      LOW / 2 - Math.cos(ang) * LOW, LOW / 2 - Math.sin(ang) * LOW,
      LOW / 2 + Math.cos(ang) * LOW, LOW / 2 + Math.sin(ang) * LOW);
    var stops = 4 + Math.floor(r() * 3);
    for (var s = 0; s <= stops; s++) {
      lin.addColorStop(s / stops, rgba(jitter(pickAll(), r, 16), 0.55));
    }
    g.fillStyle = lin;
    g.fillRect(0, 0, LOW, LOW);

    // Taches de lumière et zones plus intenses
    var blobs = 6 + Math.floor(r() * 5);
    for (var i = 0; i < blobs; i++) {
      var pool = i % 2 ? pal.light : pal.vivid;
      var c = jitter(pool[Math.floor(r() * pool.length)], r, 16);
      var x = (r() * 1.4 - 0.2) * LOW, y = (r() * 1.4 - 0.2) * LOW;
      var rad = (0.25 + r() * 0.45) * LOW;
      var sx = 0.6 + r() * 0.9, rot = r() * Math.PI;
      g.save();
      g.translate(x, y); g.rotate(rot); g.scale(sx, 1);
      var rg = g.createRadialGradient(0, 0, 0, 0, 0, rad);
      var a = 0.55 + r() * 0.4;
      rg.addColorStop(0, rgba(c, a));
      rg.addColorStop(0.45, rgba(c, a * 0.55));
      rg.addColorStop(1, rgba(c, 0));
      g.fillStyle = rg;
      g.fillRect(-rad, -rad, rad * 2, rad * 2);
      g.restore();
    }

    // 2) agrandissement lissé
    var hi = document.createElement("canvas");
    hi.width = hi.height = SIZE;
    var h = hi.getContext("2d");
    h.imageSmoothingEnabled = true;
    h.imageSmoothingQuality = "high";
    h.drawImage(lo, 0, 0, SIZE, SIZE);

    // 3) grain très léger pour éviter les bandes
    var img = h.getImageData(0, 0, SIZE, SIZE), d = img.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = (r() - 0.5) * 7;
      d[p] += n; d[p + 1] += n; d[p + 2] += n;
    }
    h.putImageData(img, 0, 0);

    // 4) petits motifs : paillettes, étoiles, cœurs
    decorate(h, r);
    return hi;
  }

  function heart(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.3);
    g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
    g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
    g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
    g.closePath();
    g.fill();
  }
  function sparkle(g, x, y, s) {
    // étoile scintillante à 4 branches
    g.beginPath();
    g.moveTo(x, y - s);
    g.quadraticCurveTo(x, y, x + s, y);
    g.quadraticCurveTo(x, y, x, y + s);
    g.quadraticCurveTo(x, y, x - s, y);
    g.quadraticCurveTo(x, y, x, y - s);
    g.closePath();
    g.fill();
  }
  function star5(g, x, y, s) {
    g.beginPath();
    for (var k = 0; k < 10; k++) {
      var rr = k % 2 ? s * 0.45 : s, an = -Math.PI / 2 + k * Math.PI / 5;
      g[k ? "lineTo" : "moveTo"](x + Math.cos(an) * rr, y + Math.sin(an) * rr);
    }
    g.closePath();
    g.fill();
  }
  function decorate(g, r) {
    g.save();
    // paillettes : petits points brillants
    var dots = 140 + Math.floor(r() * 120);
    for (var i = 0; i < dots; i++) {
      var x = r() * SIZE, y = r() * SIZE, rad = 0.8 + r() * 2.6;
      var tone = r() < 0.7 ? "255,255,255" : "255,215,235";
      var glow = g.createRadialGradient(x, y, 0, x, y, rad * 3);
      glow.addColorStop(0, "rgba(" + tone + "," + (0.55 + r() * 0.45) + ")");
      glow.addColorStop(1, "rgba(" + tone + ",0)");
      g.fillStyle = glow;
      g.fillRect(x - rad * 3, y - rad * 3, rad * 6, rad * 6);
    }
    // étoiles scintillantes et petites étoiles
    var stars = 6 + Math.floor(r() * 6);
    for (var j = 0; j < stars; j++) {
      g.fillStyle = "rgba(255,255,255," + (0.6 + r() * 0.35) + ")";
      g.shadowColor = "rgba(255,255,255,0.9)";
      g.shadowBlur = 12;
      var sx = r() * SIZE, sy = r() * SIZE;
      if (r() < 0.65) sparkle(g, sx, sy, 10 + r() * 24);
      else star5(g, sx, sy, 8 + r() * 12);
    }
    // cœurs
    var hearts = 4 + Math.floor(r() * 5);
    g.shadowColor = "rgba(255,255,255,0.6)";
    g.shadowBlur = 8;
    for (var k = 0; k < hearts; k++) {
      var hx = r() * SIZE, hy = r() * SIZE, hs = 22 + r() * 30;
      g.fillStyle = r() < 0.5 ? "rgba(255,255,255," + (0.55 + r() * 0.3) + ")" : "rgba(255,200,225," + (0.6 + r() * 0.3) + ")";
      g.save();
      g.translate(hx, hy); g.rotate((r() - 0.5) * 0.7);
      heart(g, 0, -hs / 2, hs);
      g.restore();
    }
    g.restore();
  }


/** Une photo de profil unique (JPEG) ; graine aléatoire si non fournie. */
export async function generatePfp(seed?: number): Promise<{ bytes: Uint8Array; seed: number }> {
  const s = seed ?? (crypto.getRandomValues(new Uint32Array(1))[0])
  const canvas = render(s)
  const blob: Blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95))
  return { bytes: new Uint8Array(await blob.arrayBuffer()), seed: s }
}
