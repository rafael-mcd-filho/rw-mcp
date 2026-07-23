// Serve a referência de tipos de campanha Meta Ads (guia/balizamento) para clientes
// do MCP que não têm o repositório (ex.: usar o MCP sem o Codex/Claude Code local).
// Conteúdo vem de referencia-content.ts, gerado no build a partir da doc markdown.
import { META_ADS_REFERENCIA } from "./referencia-content.js";

const NOTA_GUIA =
  "> ⚠️ Isto é um GUIA/balizamento para AJUDAR a montar a campanha, não regra rígida. " +
  "Itens ✅ = padrão fixo; 🔧 = decisão do gestor por campanha; ⚠️ = pegadinha técnica. " +
  "Sempre confirmar o caso específico com o usuário.\n";

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Retorna a referência inteira (sem `tipo`) ou só a(s) seção(ões) de nível 2 (`## `)
 * cujo título casa com `tipo` (ex.: "perfil", "alcance", "conversas", "lead", "engajamento").
 */
export function getReferenciaMetaAds(tipo?: string): string {
  if (!tipo || !tipo.trim()) return NOTA_GUIA + "\n" + META_ADS_REFERENCIA;

  const q = semAcento(tipo);
  const partes = META_ADS_REFERENCIA.split(/\n(?=## )/);
  const intro = partes[0] ?? "";
  const secoes = partes.slice(1).filter((p) => {
    const titulo = semAcento(p.match(/^## (.+)$/m)?.[1] ?? "");
    return titulo.includes(q);
  });

  if (!secoes.length) {
    return (
      `Nenhuma seção encontrada para "${tipo}". ` +
      `Tipos disponíveis: perfil, alcance, conversas, lead, engajamento. ` +
      `Chame sem 'tipo' para a referência completa.`
    );
  }
  return [NOTA_GUIA, intro.trim(), ...secoes].join("\n\n");
}
