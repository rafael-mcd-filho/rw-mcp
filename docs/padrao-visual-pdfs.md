# Padrão visual dos PDFs

Este documento é a fonte de verdade para a apresentação visual dos relatórios
gerados pelo MCP. Ele define identidade e composição, não o conteúdo de cada
relatório.

## 1. Princípios

1. Aparência executiva, objetiva e orientada à decisão.
2. Predominância de branco, com azul e azul-marinho como cores estruturais.
3. Alta densidade de informação sem comprometer a leitura.
4. Hierarquia construída por tipografia, espaço e contraste.
5. Cartões, tabelas e painéis usados somente quando facilitam comparação ou decisão.
6. Marca Plugue e identificação do cliente em todas as páginas.
7. Conteúdo preservado entre a fonte, o HTML intermediário e o PDF.

## 2. Identidade

- Marca oficial: `assets/logo-plugue.png`.
- Variável preferida para substituir a marca: `REPORT_LOGO`.
- Compatibilidade mantida com a variável antiga: `META_REPORT_LOGO`.
- A marca não deve ser recolorida, distorcida, redesenhada ou receber efeitos.
- O cliente deve ser identificado por texto até existir uma marca oficial aprovada.

## 3. Paleta adaptada

| Uso | Cor | Código |
| --- | --- | --- |
| Azul principal | Destaques, categoria, marcadores e faixa superior | `#1A53F0` |
| Azul forte | Valores de destaque e estados ativos | `#1440C9` |
| Azul-marinho | Painéis escuros e segunda parte da faixa superior | `#0B2A6B` |
| Preto estrutural | Títulos e números de alto contraste | `#101216` |
| Texto principal | Corpo e títulos secundários | `#16181D` |
| Texto secundário | Parágrafos e descrições | `#3B414C` |
| Texto auxiliar | Legendas, cabeçalhos e metadados | `#6B7280` |
| Fundo externo | Área de visualização fora da página | `#F2F4F7` |
| Fundo suave | Cabeçalhos de tabela e cartões | `#F8FAFC` |
| Linhas | Bordas e divisores | `#E5E7EB` |
| Fundo de atenção | Notas e decisões destacadas | `#EEF3FF` |
| Branco | Página, cartões e texto sobre fundo escuro | `#FFFFFF` |

Verde, amarelo, laranja e vermelho ficam reservados para estados semânticos
como bom desempenho, atenção, risco e erro. Eles não substituem as cores da
marca na estrutura do documento.

## 4. Tipografia

Família única: `Inter, Arial, Helvetica, sans-serif`.

| Elemento | Tamanho | Peso | Entrelinha |
| --- | --- | --- | --- |
| Título principal | `30px` | 850 | `1.02` a `1.04` |
| Título de seção | `18px` a `20px` | 700 a 800 | `1.16` |
| Subtítulo | `13px` | 700 | `1.20` |
| Texto de abertura | `13.2px` a `13.5px` | 400 | `1.42` a `1.45` |
| Corpo | `11.5px` a `12px` | 400 | `1.42` a `1.45` |
| Corpo compacto | `9.4px` a `11px` | 400 | `1.24` a `1.36` |
| Tabela | `8.1px` a `10.3px` | 400 | `1.25` a `1.35` |
| Cabeçalho de tabela | `8.2px` a `9px` | 700 | `1.20` |
| Rodapé | `9px` | 400 | `1.20` |

## 5. Página A4

- Tamanho: `210 mm × 297 mm`.
- Margens laterais: `16 mm`.
- Margem superior: `18 mm`, incluindo a compensação do cabeçalho.
- Faixa superior: `6 mm`, dividida em 44% azul e 56% azul-marinho.
- Fundo da página: branco.
- Rodapé: `10 mm` da borda inferior.
- Paginação: página atual / total.
- Cabeçalhos de tabela devem se repetir quando houver continuação.
- Títulos, cartões, painéis e linhas de tabela não devem quebrar entre páginas.

## 6. Cabeçalho e rodapé

O cabeçalho é único para todos os geradores:

1. logo Plugue à esquerda;
2. categoria em azul, caixa alta e peso forte, com descrição curta ao centro;
3. cliente, período e detalhe do documento à direita.

O rodapé deve conter a fonte/contexto do relatório, data de geração quando
aplicável e paginação.

## 7. Componentes

### Cartões de indicadores

- quatro colunas quando a largura permitir;
- borda cinza clara e raio de `8px`;
- fundo branco ou cinza suave;
- destaque superior azul ou azul-marinho;
- número principal com alto contraste.

### Painéis

- borda de `1px`, raio de `8px` e preenchimento de `10px` a `13px`;
- variante escura em azul-marinho;
- variante de atenção em azul muito claro com borda esquerda azul.

### Tabelas

- largura total e cabeçalho com fundo suave;
- títulos das colunas em caixa alta;
- divisores horizontais discretos;
- números alinhados e com algarismos tabulares;
- texto compacto, mas sempre legível.

### Notas e decisões

- fundo azul muito claro;
- borda esquerda de `3px` em azul principal;
- texto em cinza escuro;
- uso reservado a conclusões, regras e alertas.

### Imagens

- somente imagens fornecidas ou aprovadas;
- proporção preservada;
- sem imagens geradas por IA nas entregas de cliente;
- borda e raio discretos quando estiverem em cartão;
- legenda ou função estratégica mantida próxima.

## 8. Versões

- A4: versão oficial para apresentação, impressão, arquivo e aprovação.
- Fluida: versão complementar para leitura contínua em tela; não substitui a A4.

O gerador de PDF usa sempre a versão A4. Uma saída HTML fluida pode ser criada
se houver uma necessidade específica de leitura contínua.

## 9. Controle de qualidade

1. Validar acentos, símbolos monetários e caracteres especiais.
2. Confirmar a marca e os metadados do cliente.
3. Gerar o HTML intermediário e o PDF.
4. Verificar overflow, páginas vazias e imagens quebradas.
5. Renderizar todas as páginas como imagem.
6. Revisar cortes, sobreposições, linhas órfãs e tabelas ilegíveis.
7. Conferir início, encerramento, cabeçalhos, rodapés e paginação.
