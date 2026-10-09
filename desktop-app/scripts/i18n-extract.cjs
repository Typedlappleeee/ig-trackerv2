// Extrait les chaînes UI (JSX text, littéraux, gabarits) de desktop-app/src.
// Extrait les chaînes d'interface françaises de src/ (texte JSX, littéraux, gabarits)
// pour le dictionnaire anglais (src/lib/i18n.en.ts). Utilisé par src/lib/i18n.test.ts.
//   node scripts/i18n-extract.cjs            → liste les chaînes sans traduction
const fs = require('fs'), path = require('path')
function extract(appDir) {
const ts = require(path.join(appDir, 'node_modules/typescript'))
const root = path.join(appDir, 'src')
const files = []; (function w(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d,f); if (fs.statSync(p).isDirectory()) w(p); else if (/\.tsx?$/.test(f) && !/\.test\.|\.d\.ts$|i18n|changelog/.test(f)) files.push(p) } })(root)
const CSS = /\d(px|ms|s|%|deg|fr|em|vh|vw)\b|rgba?\(|gradient\(|cubic-bezier|\bease\b|\bsolid\b|\binset\b|var\(--|calc\(|^#[0-9a-f]{3,8}$|infinite|\bnowrap\b|\bflex\b|translate[XY(]|^[a-z-]+:[a-z]/i
const SKIP_PARENT_PROPS = new Set(['className','style','key','href','src','type','target','rel','fill','stroke','d','viewBox','strokeLinecap','strokeLinejoin','id','name','autoComplete','inputMode','accept','method','role','htmlFor','transform','mode','lang','encType'])
const out = new Map()
const add = (kind, s, f, ui = false) => {
  s = s.replace(/\s+/g, ' ').trim()
  if (!s || s.length > 600) return
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(s.replace(/\{\d+\}/g, ''))) return
  if (CSS.test(s)) return
  if (/^[a-z0-9_.\-\/:@]+$/.test(s) && !(ui && /^[a-zà-ÿ]{3,}$/.test(s))) return   // identifiants, chemins, clés (sauf mot d'interface)
  if (/^(M|m|L|l|C|c)[\d.\s,-]/.test(s) && /\d/.test(s)) return  // chemins SVG
  if (/^https?:|^www\.|\.(png|jpg|mp4|json|js|html)$/i.test(s)) return
  if (/^select |^[a-z_]+\s*,\s*[a-z_]+/.test(s)) return       // colonnes Supabase
  if (kind === 'tpl') {
    const statics = s.split(/\{\d+\}/).join(' ')
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(statics)) return
    if (/^[a-z0-9_.\-\/:@?=&{} ]+$/i.test(s) && !/ /.test(statics.trim())) return
  }
  const k = kind + '\u0001' + s
  if (!out.has(k)) out.set(k, { kind, fr: s, files: new Set() })
  out.get(k).files.add(path.relative(root, f))
}
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = n => {
    const p = n.parent
    const inProp = p && ts.isJsxAttribute(p) ? p.name.getText() : (p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent) ? p.parent.name.getText() : null)
    const isKey = p && (ts.isPropertyAssignment(p) && p.name === n || ts.isElementAccessExpression(p) && p.argumentExpression === n)
    const isImport = p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p))
    const callee = p && ts.isCallExpression(p) ? p.expression.getText() : ''
    const techCall = /\.(from|select|eq|neq|is|in|order|rpc|getItem|setItem|removeItem|addEventListener|removeEventListener|querySelector|on|channel|startsWith|includes|split|replace|test|match|get|set|has|endsWith|createElement)$/.test(callee) || /^(fetch|geelarkFetch|import|require|shellExec)$/.test(callee)
    // Texte déjà bilingue dans le code : pick({ fr: '…', en: '…' })
    let a = n.parent, bil = false
    for (let k = 0; a && k < 4; k++, a = a.parent) if (ts.isPropertyAssignment(a) && /^(fr|en)$/.test(a.name.getText())) { bil = true; break }
    const skip = bil || isKey || isImport || (inProp && SKIP_PARENT_PROPS.has(inProp)) || techCall || (p && ts.isLiteralTypeNode(p)) || (p && ts.isCaseClause(p)) || (p && ts.isBinaryExpression(p) && /===|!==|==|!=/.test(p.operatorToken.getText()))
    if (!skip) {
      const UIP = /^(label|hint|title|sub|desc|description|text|placeholder|l|h|t|d|cta|badge|tag|help|empty|unit|suffix|caption|note|tip|subtitle|heading)$/
      const ui = (p && ts.isPropertyAssignment(p) && p.initializer === n && UIP.test(p.name.getText())) || (!!inProp && UIP.test(inProp))
      if (ts.isJsxText(n)) add('exact', n.text, f, true)
      else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add('exact', n.text, f, ui)
      else if (ts.isTemplateExpression(n)) {
        // Pas de nœud texte unique si le gabarit contient du HTML ; sinon regex.
        add('tpl', n.head.text + n.templateSpans.map((sp, i) => '{' + i + '}' + sp.literal.text).join(''), f)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
return [...out.values()].map(e => ({ kind: e.kind, fr: e.fr, files: [...e.files].slice(0, 3).join(',') }))
}
module.exports = { extract }
if (require.main === module) {
  const app = path.join(__dirname, '..')
  const dict = fs.readFileSync(path.join(app, 'src/lib/i18n.en.ts'), 'utf8')
  const reviewed = new Set(require('./i18n-reviewed.json'))
  const known = new Set([...dict.matchAll(/^\s*(\[?)("(?:[^"\\]|\\.)*")/gm)].map(m => JSON.parse(m[2])))
  const missing = extract(app).filter(e => !known.has(e.fr) && !reviewed.has(e.fr))
  for (const e of missing) console.log(`${e.kind}\t${e.files}\t${e.fr}`)
  console.error(`${missing.length} chaîne(s) sans traduction`)
}
