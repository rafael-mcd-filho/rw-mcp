import type { VercelRequest, VercelResponse } from "@vercel/node";

const INFO = {
  ok: true,
  name: "rw-mcp",
  mcp: "/mcp",
};

function acceptsHtml(req: VercelRequest): boolean {
  const accept = req.headers.accept;
  const value = Array.isArray(accept) ? accept.join(",") : accept ?? "";
  return value.includes("text/html");
}

function originFrom(req: VercelRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
  const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "rw-mcp.vercel.app";
  return `${proto}://${host}`;
}

const ICONS: Record<string, string> = {
  analytics: '<path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/>',
  report: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  campaign: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15 8a4 4 0 0 1 0 8M18 5a8 8 0 0 1 0 14"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  media: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M10 9l5 3-5 3z"/>',
  shield: '<path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>',
  link: '<path d="M9 15l6-6M11 7l1-1a4 4 0 0 1 6 6l-1 1M13 17l-1 1a4 4 0 0 1-6-6l1-1"/>',
};

function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

function feature(name: string, title: string, desc: string): string {
  return `<article class="card">
    <span class="ic">${icon(name)}</span>
    <h3>${title}</h3>
    <p>${desc}</p>
  </article>`;
}

function homeHtml(origin: string): string {
  const endpoint = `${origin}/mcp`;
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RW MCP — gestão e inteligência para Meta Ads</title>
    <meta name="description" content="Servidor MCP da RW: análise, relatórios e gestão completa de campanhas Meta Ads e Google Ads para assistentes de IA.">
    <style>
      :root {
        color-scheme: dark;
        --bg: #0a0b0d;
        --panel: #131519;
        --panel-2: #0f1114;
        --border: #23262d;
        --border-hi: #32373f;
        --text: #ECEDEE;
        --muted: #969ba4;
        --accent: #f0433a;
        --accent-dim: rgba(240,67,58,.12);
        --ok: #3dd68c;
        --r: 4px;
        --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        --sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      * { box-sizing: border-box; }
      html { -webkit-text-size-adjust: 100%; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: var(--sans);
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        background-image:
          linear-gradient(var(--border) 1px, transparent 1px),
          linear-gradient(90deg, var(--border) 1px, transparent 1px);
        background-size: 48px 48px;
        background-position: center top;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background:
          radial-gradient(900px 480px at 50% -8%, rgba(240,67,58,.10), transparent 70%),
          linear-gradient(180deg, rgba(10,11,13,.4), var(--bg) 60%);
        pointer-events: none;
        z-index: 0;
      }
      .wrap { position: relative; z-index: 1; width: min(1060px, 100%); margin: 0 auto; padding: 0 24px; }

      /* top bar */
      header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 22px 0; border-bottom: 1px solid var(--border);
      }
      .brand { display: flex; align-items: center; gap: 11px; }
      .mark {
        display: grid; place-items: center; width: 34px; height: 34px;
        background: var(--accent); color: #fff; font-weight: 800; font-size: 14px;
        border-radius: var(--r); letter-spacing: -.5px;
      }
      .brand b { font-size: 15px; font-weight: 700; letter-spacing: -.2px; }
      .brand span { display: block; font-size: 11.5px; color: var(--muted); font-weight: 500; }
      .badge {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 6px 11px; border: 1px solid rgba(61,214,140,.28);
        background: rgba(61,214,140,.08); color: var(--ok);
        font-size: 12px; font-weight: 600; border-radius: var(--r);
        font-family: var(--mono);
      }
      .dot { width: 7px; height: 7px; background: var(--ok); border-radius: 50%; box-shadow: 0 0 0 3px rgba(61,214,140,.18); }

      /* hero */
      .hero { padding: 72px 0 56px; max-width: 760px; }
      .eyebrow {
        font-family: var(--mono); font-size: 12px; letter-spacing: .12em;
        text-transform: uppercase; color: var(--accent); margin: 0 0 18px;
      }
      h1 {
        margin: 0; font-size: clamp(30px, 5vw, 50px); line-height: 1.05;
        letter-spacing: -1.5px; font-weight: 800;
      }
      h1 .hl { color: var(--muted); }
      .lead { margin: 22px 0 0; font-size: 17px; color: var(--muted); max-width: 620px; }

      /* connect block */
      .connect {
        margin: 34px 0 0; border: 1px solid var(--border); background: var(--panel-2);
        border-radius: var(--r); overflow: hidden; max-width: 620px;
      }
      .connect .row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
      .connect .lbl { font-family: var(--mono); font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
      .connect code { font-family: var(--mono); font-size: 14px; color: var(--text); flex: 1; overflow-x: auto; white-space: nowrap; }
      .copy {
        border: 1px solid var(--border-hi); background: var(--panel); color: var(--text);
        font-family: var(--mono); font-size: 12px; padding: 7px 12px; border-radius: var(--r);
        cursor: pointer; transition: border-color .15s, color .15s; white-space: nowrap;
      }
      .copy:hover { border-color: var(--accent); color: var(--accent); }

      /* stats */
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--border); border-radius: var(--r); margin: 48px 0; background: var(--panel-2); }
      .stats div { padding: 22px 24px; border-right: 1px solid var(--border); }
      .stats div:last-child { border-right: 0; }
      .stats .n { font-size: 26px; font-weight: 800; letter-spacing: -.5px; }
      .stats .k { font-family: var(--mono); font-size: 12px; color: var(--muted); margin-top: 3px; }

      /* section */
      .sec-head { display: flex; align-items: baseline; gap: 14px; margin: 0 0 22px; }
      .sec-head h2 { margin: 0; font-size: 22px; letter-spacing: -.4px; font-weight: 700; }
      .sec-head .num { font-family: var(--mono); font-size: 12px; color: var(--accent); }
      .rule { height: 1px; background: var(--border); flex: 1; align-self: center; }

      /* feature grid */
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      .card {
        border: 1px solid var(--border); background: var(--panel); border-radius: var(--r);
        padding: 22px; transition: border-color .15s, transform .15s, background .15s;
      }
      .card:hover { border-color: var(--border-hi); transform: translateY(-2px); background: #161a1f; }
      .card .ic { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid var(--border-hi); border-radius: var(--r); color: var(--accent); margin-bottom: 16px; }
      .card .ic svg { width: 20px; height: 20px; }
      .card h3 { margin: 0 0 7px; font-size: 15.5px; font-weight: 700; letter-spacing: -.2px; }
      .card p { margin: 0; font-size: 13.5px; color: var(--muted); }

      /* integrations strip */
      .integra { margin: 48px 0; border: 1px solid var(--border); border-radius: var(--r); background: var(--panel-2); padding: 20px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; }
      .integra .lbl { font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
      .integra .tag { font-size: 13px; font-weight: 600; color: var(--text); display: inline-flex; align-items: center; gap: 8px; }
      .integra .tag::before { content: ""; width: 5px; height: 5px; background: var(--accent); border-radius: 50%; }

      /* specs */
      .specs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
      .spec { border: 1px solid var(--border); border-radius: var(--r); background: var(--panel); padding: 18px 20px; }
      .spec dt { font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
      .spec dd { margin: 6px 0 0; font-size: 15px; font-weight: 600; }
      .spec dd code { font-family: var(--mono); font-size: 13.5px; background: var(--panel-2); border: 1px solid var(--border); padding: 2px 7px; border-radius: var(--r); }

      /* footer */
      footer { border-top: 1px solid var(--border); margin-top: 56px; padding: 28px 0 48px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; }
      footer .dev { font-size: 13.5px; color: var(--muted); }
      footer .dev b { color: var(--text); font-weight: 700; }
      footer .meta { font-family: var(--mono); font-size: 12px; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap; }

      @media (max-width: 820px) {
        .grid, .specs { grid-template-columns: 1fr 1fr; }
        .stats { grid-template-columns: 1fr; }
        .stats div { border-right: 0; border-bottom: 1px solid var(--border); }
        .stats div:last-child { border-bottom: 0; }
      }
      @media (max-width: 560px) {
        .grid, .specs { grid-template-columns: 1fr; }
        .hero { padding: 48px 0 36px; }
        .brand span { display: none; }
        .connect code { font-size: 12px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div class="brand">
          <div class="mark">RW</div>
          <div><b>RW MCP</b><span>RW Soluções Digitais</span></div>
        </div>
        <div class="badge"><span class="dot"></span> Operacional</div>
      </header>

      <section class="hero">
        <p class="eyebrow">Model Context Protocol · Meta &amp; Google Ads</p>
        <h1>Gestão e inteligência de tráfego pago <span class="hl">direto do seu assistente de IA.</span></h1>
        <p class="lead">
          Um servidor MCP que conecta assistentes compatíveis às contas de anúncios para
          analisar, criar e otimizar campanhas — da leitura de métricas à subida de campanha completa.
        </p>
        <div class="connect">
          <div class="row">
            <span class="lbl">Endpoint</span>
            <code id="ep">${endpoint}</code>
            <button class="copy" onclick="copyEp()" id="cp">Copiar</button>
          </div>
        </div>
      </section>

      <section class="stats">
        <div><div class="n">60+</div><div class="k">ferramentas</div></div>
        <div><div class="n">2</div><div class="k">plataformas · meta + google</div></div>
        <div><div class="n">HTTP</div><div class="k">streamable · stateless</div></div>
      </section>

      <section>
        <div class="sec-head"><span class="num">01</span><h2>O que ele faz</h2><span class="rule"></span></div>
        <div class="grid">
          ${feature("analytics", "Análise &amp; Insights", "Métricas cruas e comparação de períodos por conta, campanha, conjunto e anúncio — com breakdowns e atribuição.")}
          ${feature("report", "Relatórios em PDF", "Relatórios Meta e Google Ads prontos para o cliente, renderizados sob demanda e entregues por link.")}
          ${feature("campaign", "Gestão de Campanhas", "Cria, edita, duplica e ativa campanhas, conjuntos, criativos e anúncios — inclusive criação em lote por variação.")}
          ${feature("target", "Segmentação", "Busca de geolocalização, interesses e comportamentos, estimativa de alcance e públicos personalizados e lookalike.")}
          ${feature("media", "Mídia &amp; Criativos", "Upload de vídeo e imagem, thumbnail automático e preview do anúncio por posicionamento antes de ativar.")}
          ${feature("shield", "Controle &amp; Segurança", "Trava de confirmação em ações que gastam, ativação em cascata e programação de aumento de orçamento.")}
        </div>
      </section>

      <section class="integra">
        <span class="lbl">Integra com</span>
        <span class="tag">Meta Ads</span>
        <span class="tag">Google Ads</span>
        <span class="tag">WhatsApp · Evolution API</span>
        <span class="tag">Pixel / Conversões</span>
      </section>

      <section>
        <div class="sec-head"><span class="num">02</span><h2>Especificações</h2><span class="rule"></span></div>
        <dl class="specs">
          <div class="spec"><dt>Endpoint MCP</dt><dd><code>/mcp</code></dd></div>
          <div class="spec"><dt>Transporte</dt><dd>Streamable HTTP (stateless)</dd></div>
          <div class="spec"><dt>Autenticação</dt><dd>Bearer token opcional</dd></div>
          <div class="spec"><dt>Projeto</dt><dd>rw-mcp</dd></div>
        </dl>
      </section>

      <footer>
        <div class="dev">Desenvolvido por <b>RW Soluções Digitais</b> · operação de mídia da Plugue Marketing Solutions</div>
        <div class="meta"><span>rw-mcp</span><span>MCP · 2026</span></div>
      </footer>
    </div>

    <script>
      function copyEp(){
        var url = document.getElementById('ep').textContent.trim();
        var btn = document.getElementById('cp');
        navigator.clipboard.writeText(url).then(function(){
          var old = btn.textContent; btn.textContent = 'Copiado';
          btn.style.color = 'var(--ok)'; btn.style.borderColor = 'var(--ok)';
          setTimeout(function(){ btn.textContent = old; btn.style.color=''; btn.style.borderColor=''; }, 1600);
        });
      }
    </script>
  </body>
</html>`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (acceptsHtml(req)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).end(homeHtml(originFrom(req)));
    return;
  }

  res.status(200).json({
    ...INFO,
  });
}
