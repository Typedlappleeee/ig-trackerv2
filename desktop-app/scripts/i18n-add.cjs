// Ajoute des traductions à src/lib/i18n.en.ts.
//   node scripts/i18n-add.cjs '{"Texte FR":"English"}' '[["Gabarit {0} FR","Template {0} EN"]]'
const fs = require('fs'), path = require('path')
const file = path.join(__dirname, '../src/lib/i18n.en.ts')
let s = fs.readFileSync(file, 'utf8')
const exact = JSON.parse(process.argv[2] || '{}'), tpls = JSON.parse(process.argv[3] || '[]')
const J = x => JSON.stringify(x)
const ex = Object.entries(exact).filter(([fr]) => !s.includes(`    ${J(fr)}: `)).map(([fr, en]) => `    ${J(fr)}: ${J(en)},\n`).join('')
const tp = tpls.filter(([fr]) => !s.includes(`    [${J(fr)}, `)).map(([fr, en]) => `    [${J(fr)}, ${J(en)}],\n`).join('')
s = s.replace(/\n  \},\n  templates: \[\n/, `\n${ex}  },\n  templates: [\n`).replace(/\n  \],\n\}\n$/, `\n${tp}  ],\n}\n`)
fs.writeFileSync(file, s)
console.log(`+${ex.split('\n').filter(Boolean).length} exact, +${tp.split('\n').filter(Boolean).length} gabarits`)
