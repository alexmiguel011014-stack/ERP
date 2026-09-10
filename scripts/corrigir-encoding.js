/* Corrige texto com dupla codificação UTF-8 (mojibake), em que "Ações" foi
   gravado como a sequência A + C3-A7 + C3-B5 + es e aparece embaralhado na tela.
   Uso: node scripts/corrigir-encoding.js [--aplicar]
   Sem --aplicar apenas lista o que seria alterado. */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const APLICAR = process.argv.indexOf('--aplicar') !== -1;
const IGNORAR = /[\\/](node_modules|dist|dist_locked|graphify-out|mcp-servers|servers|build|\.git|data)[\\/]/;
const EXTENSOES = /\.(html|js|css|md|json)$/i;

// Sequências de caracteres U+0080..U+00FF que, relidas como bytes latin-1,
// formam UTF-8 válido — a assinatura da dupla codificação.
const FAIXA_MOJIBAKE = /[Â-ô][-¿]+/g;

function corrigir(texto) {
  return texto.replace(FAIXA_MOJIBAKE, (trecho) => {
    const decodificado = Buffer.from(trecho, 'latin1').toString('utf8');
    // Se sobrou caractere de substituição, não era mojibake: preserva o original.
    return decodificado.indexOf('�') === -1 ? decodificado : trecho;
  });
}

function listarArquivos(dir, saida) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (IGNORAR.test(completo + path.sep)) continue;
    if (entrada.isDirectory()) listarArquivos(completo, saida);
    else if (EXTENSOES.test(entrada.name)) saida.push(completo);
  }
  return saida;
}

let alterados = 0;
let trechos = 0;
for (const arquivo of listarArquivos(RAIZ, [])) {
  const original = fs.readFileSync(arquivo, 'utf8');
  const corrigido = corrigir(original);
  if (corrigido === original) continue;
  alterados++;
  const achados = original.match(FAIXA_MOJIBAKE) || [];
  const unicos = [...new Set(achados)].filter((t) => corrigir(t) !== t);
  trechos += achados.length;
  console.log(
    (APLICAR ? 'CORRIGIDO ' : 'PENDENTE  ') +
      path.relative(RAIZ, arquivo) +
      '  (' + achados.length + ' ocorrências: ' +
      unicos.slice(0, 8).map((t) => t + '->' + corrigir(t)).join(', ') + ')'
  );
  if (APLICAR) fs.writeFileSync(arquivo, corrigido, 'utf8');
}

console.log('\nArquivos: ' + alterados + ' | ocorrências: ' + trechos + (APLICAR ? ' | gravado' : ' | simulação (use --aplicar)'));
