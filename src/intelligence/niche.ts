// Infere o nicho do cliente a partir do campo livre `contexto_cliente` do
// webhook. Mapeia palavras-chave para um dos baldes de benchmark, com fallback
// para "geral". Sempre devolve evidência e confiança para correção manual.

import type { BenchmarkNiche, NicheResult } from "./types.js";

export const NICHE_LABELS: Record<BenchmarkNiche, string> = {
  alimentacao_delivery: "Alimentação / Delivery",
  franquias: "Franquias",
  saude_estetica: "Saúde / Estética",
  servicos_locais: "Serviços locais",
  imoveis: "Imóveis",
  educacao: "Educação",
  infoprodutos: "Infoprodutos",
  ecommerce_moda: "E-commerce (moda)",
  ecommerce_tech: "E-commerce (tech)",
  saas_b2b: "SaaS / B2B",
  financeiro: "Financeiro",
  geral: "Geral",
};

// Ordem importa: baldes mais específicos primeiro. Ex.: "franqueadora de food
// service" deve cair em `franquias` (captação de investidor, ticket alto), não
// em `alimentacao_delivery` (CPL barato).
const NICHE_KEYWORDS: Array<{ niche: BenchmarkNiche; terms: string[] }> = [
  { niche: "franquias", terms: ["franquia", "franqueadora", "franqueado", "franchising", "franchise"] },
  { niche: "imoveis", terms: ["imovel", "imoveis", "imobiliaria", "corretor", "apartamento", "loteamento", "incorporadora", "construtora", "terreno"] },
  { niche: "financeiro", terms: ["financeir", "credito", "emprestimo", "seguro", "investiment", "consorcio", "banco", "cartao de credito"] },
  { niche: "saude_estetica", terms: ["clinica", "estetica", "odonto", "dentista", "dermato", "harmoniza", "botox", "saude", "fisio", "nutri", "medic", "procedimento facial", "depilacao", "capilar"] },
  { niche: "infoprodutos", terms: ["infoproduto", "curso online", "mentoria", "ebook", "lancamento", "produto digital", "comunidade paga"] },
  { niche: "educacao", terms: ["escola", "faculdade", "ensino", "vestibular", "concurso", "curso preparatorio", "educacao", "idiomas", "pos-graduacao"] },
  { niche: "ecommerce_moda", terms: ["moda", "roupa", "vestuario", "calcad", "fashion", "semijoia", "semijoias", "acessorios", "bijuteria", "lingerie"] },
  { niche: "ecommerce_tech", terms: ["eletronico", "gadget", "informatica", "celular", "computador", "notebook", "smartphone", "tecnologia de consumo"] },
  { niche: "saas_b2b", terms: ["saas", "software", "b2b", "plataforma", "sistema", "aplicativo corporativo", "erp", "crm"] },
  { niche: "alimentacao_delivery", terms: ["restaurante", "delivery", "lanchonete", "pizzaria", "hamburgu", "acai", "comida", "gastronom", "cafeteria", "food service", "food", "bar", "doceria", "padaria"] },
  { niche: "servicos_locais", terms: ["servico", "lava jato", "oficina", "pet", "petshop", "salao", "barbearia", "academia", "advoga", "contabil", "manutencao", "reforma", "limpeza", "rastreament"] },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Mapeia o texto livre de contexto para um balde de benchmark.
 * Pontua cada balde pelo nº de termos encontrados; o maior vence (empate →
 * ordem da lista, que prioriza baldes mais específicos). Sem match → "geral".
 */
export function normalizeNiche(contexto?: string): NicheResult {
  if (!contexto || !contexto.trim()) {
    return { niche: "geral", label: NICHE_LABELS.geral, confidence: "baixa", evidence: [] };
  }

  const text = normalize(contexto);
  let best: { niche: BenchmarkNiche; hits: string[] } | null = null;

  for (const { niche, terms } of NICHE_KEYWORDS) {
    const hits = terms.filter((t) => text.includes(t));
    if (hits.length && (!best || hits.length > best.hits.length)) {
      best = { niche, hits };
    }
  }

  if (!best) {
    return { niche: "geral", label: NICHE_LABELS.geral, confidence: "baixa", evidence: [] };
  }

  const confidence: NicheResult["confidence"] = best.hits.length >= 2 ? "alta" : "media";
  return {
    niche: best.niche,
    label: NICHE_LABELS[best.niche],
    confidence,
    evidence: best.hits,
  };
}
