// Formatadores numéricos/textuais pt-BR compartilhados entre os módulos de
// relatório (Google e integrado) e o template de PDF. O módulo report.ts (Meta)
// mantém variantes próprias que usam "—" para valores ausentes nas mensagens.

export const round2 = (n: number): number =>
  Math.round((Number(n) || 0) * 100) / 100;

export const moneyBR = (n: number): string =>
  "R$ " +
  (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const intBR = (n: number): string =>
  (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const pctBR = (n: number): string =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";

/** Converte `YYYY-MM-DD` em `DD/MM/YYYY`; devolve a entrada se não casar. */
export function dateBR(date: string): string {
  if (!date) return date;
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

/** Chave de ordenação a partir de `DD/MM/YYYY` → `YYYYMMDD` (cronológica). */
export function sortKeyFromBR(label: string): string {
  const m = label.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}${m[2]}${m[1]}` : label;
}
