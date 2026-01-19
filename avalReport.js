/* avalReport.js
   Renderiza el JSON de Aval Buró en HTML estilo reporte + descarga (print to PDF)
*/

(function () {
  function money(n) {
    const num = Number(n || 0);
    return num.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function safeArr(v) { return Array.isArray(v) ? v : []; }
  function safeObj(v) { return (v && typeof v === "object") ? v : {}; }
  function getFirst(arr) { return safeArr(arr)[0] || null; }

  // ============================
  // AUTO-RENDER: CUALQUIER JSON
  // ============================
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderAny(value) {
    if (value === null || value === undefined) return "-";

    // Primitivos
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return escapeHtml(value);
    }

    // Arrays
    if (Array.isArray(value)) {
      if (!value.length) return `<div class="aval-muted">Sin registros.</div>`;

      // array de objetos -> tabla con columnas dinámicas
      const isObjArray = value.every(v => v && typeof v === "object" && !Array.isArray(v));
      if (isObjArray) {
        const cols = Array.from(new Set(value.flatMap(o => Object.keys(o || {}))));
        return `
          <div class="aval-table-wrap">
            <table class="aval-table">
              <thead>
                <tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${value.map(row => `
                  <tr>
                    ${cols.map(c => `<td>${renderAny(row?.[c])}</td>`).join("")}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      }

      // array mixto -> lista
      return `<ul style="margin:0; padding-left:18px;">${value.map(v => `<li>${renderAny(v)}</li>`).join("")}</ul>`;
    }

    // Objetos -> tabla key/value
    const entries = Object.entries(value);
    if (!entries.length) return `<div class="aval-muted">Sin información.</div>`;
    return `
      <table class="aval-kv">
        ${entries.map(([k, v]) =>
          `<tr><td>${escapeHtml(k)}</td><td><strong>${renderAny(v)}</strong></td></tr>`
        ).join("")}
      </table>
    `;
  }

  function prettifyKey(k) {
    return String(k || "")
      .replaceAll("_", " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, c => c.toUpperCase());
  }

  // ✅ Genera secciones "como arriba": barra + caja (sin <details>)
  function buildAutoAvalSections(result, exclude = []) {
    const omit = new Set(exclude);
    const keys = Object.keys(result || {}).filter(k => !omit.has(k));
    if (!keys.length) return "";

    return `
      <div class="page-break"></div>

      ${keys.map(k => `
        <div class="aval-bar">${prettifyKey(k)}</div>
        <div class="aval-box">
          ${renderAny(result[k])}
        </div>
      `).join("")}
    `;
  }

  // ==========================================
  // SECCIONES "BONITAS" ESPECÍFICAS (IMÁGENES)
  // ==========================================
  function toDate(d) {
    if (!d) return null;
    const s = String(d).trim();
    const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = m[3] ? Number(m[3]) : 1;
    return new Date(y, mo, day);
  }

  function mesAnioEs(dateStr) {
    const d = toDate(dateStr);
    if (!d) return "-";
    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${meses[d.getMonth()]}-${d.getFullYear()}`;
  }

  function pickCorteFromResult(r) {
    const candidates = [
      ...(Array.isArray(r?.tendenciaDeuda) ? r.tendenciaDeuda : []),
      ...(Array.isArray(r?.evolucionScoreFinanciero) ? r.evolucionScoreFinanciero : []),
      ...(Array.isArray(r?.operacionesHistoricasBanco) ? r.operacionesHistoricasBanco : []),
      ...(Array.isArray(r?.operacionesHistoricasCooperativa) ? r.operacionesHistoricasCooperativa : []),
      ...(Array.isArray(r?.operacionesHistoricasTarjeta) ? r.operacionesHistoricasTarjeta : []),
      ...(Array.isArray(r?.operacionesHistoricasEmpresa) ? r.operacionesHistoricasEmpresa : []),
      ...(Array.isArray(r?.operacionesHistoricasServicio) ? r.operacionesHistoricasServicio : []),
      ...(Array.isArray(r?.operacionesHistoricasCobranza) ? r.operacionesHistoricasCobranza : []),
    ];
    let best = null;
    for (const x of candidates) {
      const d = toDate(x?.fechaCorte);
      if (!d) continue;
      if (!best || d > best) best = d;
    }
    return best ? `${best.getFullYear()}-${String(best.getMonth() + 1).padStart(2, "0")}-01` : null;
  }

  function detectWindowMonths(indObj) {
    const keys = Object.keys(indObj || {});
    const ms = keys
      .map(k => (k.match(/(\d{2})M/i) ? Number(k.match(/(\d{2})M/i)[1]) : null))
      .filter(Boolean);
    if (!ms.length) return 24;
    return Math.max(...ms);
  }

  function buildIndicadoresDeuda(r) {
    const ind = (Array.isArray(r?.indicadoresDeuda) && r.indicadoresDeuda[0]) ? r.indicadoresDeuda[0] : null;
    if (!ind) {
      return `
        <div class="aval-bar">Indicadores de Deuda</div>
        <div class="aval-box"><div class="aval-muted">No se encuentra información.</div></div>
      `;
    }

    const months = detectWindowMonths(ind);
    const corte = pickCorteFromResult(r);
    const corteLabel = corte ? mesAnioEs(corte) : "-";

    const rows = [
      { k: "Saldo total promedio", v: ind.saldoPromedio36M ?? ind.saldoPromedio24M ?? "-" },
      { k: "Saldo TC promedio", v: ind.saldoPromedioTarjetas36M ?? ind.saldoPromedioTarjetas24M ?? "-" },
      { k: "Máximo monto concedido", v: ind.maxMontoConcedidoDirecta36M ?? ind.maxMontoConcedidoDirecta24M ?? "-" },
      { k: "Peor edad vencido", v: ind.peorEdadVencidoDirecta36M ?? ind.peorEdadVencidoDirecta24M ?? "-" },
      { k: "Mayor saldo vencido", v: ind.maySaldoVencDirecta36M ?? ind.maySaldoVencDirecta24M ?? "-" },
      { k: "Fecha último vencido", v: ind.fechaUltimoVencido ?? "-" },
    ];

    function fmt(v) {
      if (v === null || v === undefined || v === "-") return "-";
      const n = Number(v);
      if (!Number.isFinite(n)) return escapeHtml(String(v));
      return money(n);
    }

    return `
      <div class="aval-bar">Indicadores de Deuda en los últimos ${months} meses - Fecha de Corte: ${escapeHtml(corteLabel)}</div>
      <div class="aval-box">
        <table class="aval-kv">
          ${rows.map(x => `<tr><td>${escapeHtml(x.k)}</td><td><strong>${fmt(x.v)}</strong></td></tr>`).join("")}
        </table>
      </div>
    `;
  }

  function buildDynamicTable(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    if (!arr.length) return `<div class="aval-muted">Sin registros.</div>`;

    const cols = Array.from(new Set(arr.flatMap(o => Object.keys(o || {}))));
    return `
      <div class="aval-table-wrap">
        <table class="aval-table">
          <thead>
            <tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${arr.map(o => `
              <tr data-fecha="${escapeHtml(o?.fechaCorte ?? "")}">
                ${cols.map(c => `<td>${renderAny(o?.[c])}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function computePeriodoLabel(rows) {
    const fechas = (rows || [])
      .map(r => r?.fechaCorte)
      .map(toDate)
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (!fechas.length) return "";
    const ini = fechas[0];
    const fin = fechas[fechas.length - 1];
    const iniStr = `${String(ini.getMonth() + 1).padStart(2, "0")}-${ini.getFullYear()}`;
    const finStr = `${String(fin.getMonth() + 1).padStart(2, "0")}-${fin.getFullYear()}`;
    return `${iniStr} a ${finStr}`;
  }

  function buildHistoricasSection(key, title, rows) {
    const periodo = computePeriodoLabel(rows);
    const id = `hist_${key}`;

    return `
      <div class="aval-bar">${escapeHtml(title)}${periodo ? `. Periodo: ${escapeHtml(periodo)}` : ""}</div>
      <div class="aval-box" id="${id}">
        <div style="display:flex; gap:18px; align-items:center; margin:6px 0 12px;">
          <strong>Últimos</strong>
          <label style="display:flex; align-items:center; gap:6px;"><input type="radio" name="${id}_n" value="6"> 6</label>
          <label style="display:flex; align-items:center; gap:6px;"><input type="radio" name="${id}_n" value="12"> 12</label>
          <label style="display:flex; align-items:center; gap:6px;"><input type="radio" name="${id}_n" value="24" checked> 24</label>
        </div>
        ${buildDynamicTable(rows)}
      </div>
    `;
  }

  function filterTableLastNMonths(containerId, n) {
    const root = document.getElementById(containerId);
    if (!root) return;

    const trs = Array.from(root.querySelectorAll("tbody tr"));
    if (!trs.length) return;

    const dates = trs.map(tr => toDate(tr.getAttribute("data-fecha"))).filter(Boolean);
    if (!dates.length) return;

    const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    const limit = new Date(maxD.getFullYear(), maxD.getMonth() - Number(n) + 1, 1);

    trs.forEach(tr => {
      const d = toDate(tr.getAttribute("data-fecha"));
      if (!d) { tr.style.display = ""; return; }
      tr.style.display = (d >= limit) ? "" : "none";
    });
  }

  function bindHistoricasFilters(scopeEl) {
    const boxes = scopeEl.querySelectorAll('[id^="hist_"]');
    boxes.forEach(box => {
      const id = box.id;
      const radios = box.querySelectorAll(`input[name="${id}_n"]`);
      radios.forEach(r => {
        r.addEventListener("change", () => filterTableLastNMonths(id, r.value));
      });
      // default 24
      filterTableLastNMonths(id, 24);
    });
  }

  // ============================
  // UI HELPERS EXISTENTES
  // ============================

  // ✅ SOLO Empresa, Fecha y Hora
  function buildMetaTable({ empresa, fecha, hora }) {
    return `
      <table class="aval-meta">
        <tr><td>Empresa</td><td>${empresa || "-"}</td></tr>
        <tr><td>Fecha</td><td>${fecha || "-"}</td></tr>
        <tr><td>Hora</td><td>${hora || "-"}</td></tr>
        <tr><td colspan="2" class="aval-meta__foot">Aval Buró ®</td></tr>
      </table>
    `;
  }

  function buildKV(rows) {
    return `
      <table class="aval-kv">
        ${rows.map(r => `<tr><td>${r.k}</td><td><strong>${r.v ?? "-"}</strong></td></tr>`).join("")}
      </table>
    `;
  }

  function buildFactorsTable(factores) {
    if (!factores.length) return `<div class="aval-muted">No se encuentra información.</div>`;
    return `
      <table class="aval-table">
        <thead>
          <tr><th>Factor</th><th style="width:90px;">Valor</th><th style="width:70px;">Efecto</th></tr>
        </thead>
        <tbody>
          ${factores.map(f => `
            <tr>
              <td>${f.factor ?? "-"}</td>
              <td style="text-align:right;"><strong>${f.valor ?? 0}</strong></td>
              <td style="text-align:center;"><strong>${f.efecto ?? "-"}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function buildDebtSummaryTable(rows) {
    if (!rows.length) return `<div class="aval-muted">No se encuentra información.</div>`;
    const total = rows.reduce((acc, r) => acc + Number(r.totalDeuda || 0), 0);

    return `
      <table class="aval-table">
        <thead>
          <tr>
            <th>Sistema Crediticio</th>
            <th style="width:120px;">Saldo Vencer</th>
            <th style="width:120px;">Saldo NDI</th>
            <th style="width:120px;">Saldo Vencido</th>
            <th style="width:140px;">Demanda Judicial</th>
            <th style="width:140px;">Cartera Castigada</th>
            <th style="width:120px;">Deuda Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.sistemaCrediticio ?? "-"}</td>
              <td style="text-align:right;">${money(r.valorPorVencer)}</td>
              <td style="text-align:right;">${money(r.noDevengaIntereses)}</td>
              <td style="text-align:right;">${money(r.valorVencido)}</td>
              <td style="text-align:right;">${money(r.valorDemandaJudicial)}</td>
              <td style="text-align:right;">${money(r.carteraCastigada)}</td>
              <td style="text-align:right;"><strong>${money(r.totalDeuda)}</strong></td>
            </tr>
          `).join("")}
          <tr>
            <td><strong>TOTAL</strong></td>
            <td colspan="5"></td>
            <td style="text-align:right;"><strong>${money(total)}</strong></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function buildGastoFinanciero(g) {
    if (!g) return `<div class="aval-muted">No se encuentra información.</div>`;
    return buildKV([
      { k: "Cuota Mensual Total", v: money(g.cuotaEstimadaTitular) },
      { k: "Cuota estimada de créditos", v: money(g.cuotaTotalOperaciones) },
      { k: "Cuota estimada de tarjetas", v: money(g.cuotaTotalTarjeta) },
      { k: "Cuota Servicios", v: money(g.cuotaTotalServicios) },
      { k: "Cuota de valores vencidos", v: money(g.cuotaVencidos) },
      { k: "Operaciones excluidas cuota", v: String(g.numOperacionesExcluidasCuota ?? 0) },
      { k: "Saldo excluido", v: money(g.saldoExcluidoCuota) },
    ]);
  }

  function buildOpsCooperativa(ops) {
    if (!ops.length) return `<div class="aval-muted">No registra operaciones vigentes en Cooperativas.</div>`;
    return `
      <table class="aval-table">
        <thead>
          <tr>
            <th>Fecha Corte</th>
            <th>Entidad</th>
            <th>Tipo Deudor</th>
            <th>Tipo Crédito</th>
            <th style="width:110px;">Monto Original</th>
            <th style="width:90px;">Plazo Orig.</th>
            <th style="width:90px;">Plazo Pend.</th>
            <th style="width:110px;">Saldo Total</th>
            <th style="width:110px;">Saldo Vencer</th>
            <th style="width:110px;">Saldo Vencido</th>
            <th style="width:90px;">Días Mora</th>
            <th style="width:110px;">Cuota Mensual</th>
          </tr>
        </thead>
        <tbody>
          ${ops.map(o => `
            <tr>
              <td>${o.fechaCorte ?? "-"}</td>
              <td>${o.razonSocial ?? "-"}</td>
              <td>${o.tipoDeudorDescripcion ?? "-"}</td>
              <td>${o.tipoCreditoDescripcion ?? "-"}</td>
              <td style="text-align:right;">${money(o.valorOperacion)}</td>
              <td style="text-align:right;">${Number(o.plazoXOperacion || 0).toFixed(2)}</td>
              <td style="text-align:right;">${Number(o.plazoXOpPendiente || 0).toFixed(2)}</td>
              <td style="text-align:right;">${money(o.saldoTotalCalculado)}</td>
              <td style="text-align:right;">${money(o.valorxVencerTotal)}</td>
              <td style="text-align:right;">${money(o.valorVencidoTotal)}</td>
              <td style="text-align:right;">${Number(o.diasMorosidad || 0)}</td>
              <td style="text-align:right;"><strong>${money(o.cuotaEstimadaOperacion)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  // ============================
  // RENDER PRINCIPAL
  // ============================
  function renderAvalReport(raw, opts = {}) {
    const data = safeObj(raw);
    const r = safeObj(data.result);

    const titular = getFirst(r.identificacionTitular);
    const score = getFirst(r.scoreFinanciero);
    const gasto = getFirst(r.gastoFinanciero);
    const ruc = getFirst(r.informacionComoRUC);

    const meta = {
      empresa: opts.empresa || "",
      fecha: opts.fecha || "",
      hora: opts.hora || "",
    };

    return `
      <div class="aval-header">
        <div><div class="aval-logo">aval</div></div>
        ${buildMetaTable(meta)}
      </div>

      <div class="aval-title">Reporte Financial Aval</div>
      <div class="aval-subtitle">Información del Titular</div>

      <div class="aval-bar">Identificación del Titular</div>
      <div class="aval-box">
        ${buildKV([
          { k: "Tipo de documento", v: titular?.tipoIdentificacionSujetoDescripcion || "-" },
          { k: "Identificación", v: titular?.identificacionSujeto || "-" },
          { k: "Apellidos y Nombres", v: titular?.nombreRazonSocial || "-" },
        ])}
      </div>

      <div class="aval-bar">RUC Personal</div>
      <div class="aval-box">
        ${ruc
          ? buildKV([
              { k: "RUC", v: ruc.identificacionSujeto || "-" },
              { k: "Relación", v: ruc.tipoRelacion || "-" },
            ])
          : `<div class="aval-muted">No se encuentra información en la base de Aval Buró.</div>`
        }
      </div>

      <div class="aval-bar">Score Financiero 2.0</div>
      <div class="aval-box aval-grid-2">
        <div class="aval-score-card">
          <div class="aval-score-big">${score?.score ?? "-"}</div>
          <!-- ✅ Solo número; sin gráfico -->
        </div>
        <div class="aval-score-card">
          ${buildKV([
            { k: "Puntaje Score", v: score?.score ?? "-" },
            { k: "% de personas con peor score", v: score?.clientesPeorScore != null ? String(score.clientesPeorScore) : "-" },
            { k: "% probabilidad caer en mora", v: score?.tasaMalos ? `${(Number(score.tasaMalos) * 100).toFixed(2)} %` : "-" },
          ])}
          <div class="aval-muted" style="margin-top:8px;">
            <strong>Explicación</strong><br/>
            (Aquí puedes poner un texto fijo o uno que venga desde tu backend si lo tienes)
          </div>
        </div>
      </div>

      <div class="aval-bar">Factores de riesgo que influyen en el Score</div>
      <div class="aval-box">
        ${buildFactorsTable(safeArr(r.factoresScore))}
      </div>

      <!-- ✅ COMO TU 1RA IMAGEN -->
      ${buildIndicadoresDeuda(r)}

      <!-- ✅ COMO TU 2DA IMAGEN (TABLAS GRANDES) -->
      ${buildHistoricasSection("tarjeta", "Operaciones Históricas de Tarjetas de Crédito", safeArr(r.operacionesHistoricasTarjeta))}
      ${buildHistoricasSection("banco", "Operaciones Históricas de Bancos", safeArr(r.operacionesHistoricasBanco))}
      ${buildHistoricasSection("coop", "Operaciones Históricas de Cooperativas", safeArr(r.operacionesHistoricasCooperativa))}
      ${buildHistoricasSection("empresa", "Operaciones Históricas de Empresas", safeArr(r.operacionesHistoricasEmpresa))}
      ${buildHistoricasSection("servicio", "Operaciones Históricas de Servicios", safeArr(r.operacionesHistoricasServicio))}
      ${buildHistoricasSection("cobranza", "Operaciones Históricas de Cobranza", safeArr(r.operacionesHistoricasCobranza))}

      <div class="page-break"></div>

      <div class="aval-bar">Manejo de Cuentas Corrientes</div>
      <div class="aval-box">
        ${safeArr(r.manejoCuentasCorrientes).length
          ? `<div class="aval-muted">Hay registros de manejo de cuentas.</div>`
          : `<div class="aval-muted">El titular consultado no registra inhabilitación para el manejo de cuentas corrientes.</div>`
        }
      </div>

      <div class="aval-bar">Deuda Vigente Total</div>
      <div class="aval-box">
        ${buildDebtSummaryTable(safeArr(r.deudaVigenteTotal))}
      </div>

      <div class="aval-bar">Gasto Financiero</div>
      <div class="aval-box">
        ${buildGastoFinanciero(gasto)}
      </div>

      <div class="aval-bar">Operaciones en las que es Codeudor</div>
      <div class="aval-box">
        ${safeArr(r.operacionesCodeudorGarante).length
          ? `<div class="aval-muted">Existen operaciones como codeudor/garante.</div>`
          : `<div class="aval-muted">El titular consultado no registra información crediticia como Codeudor.</div>`
        }
      </div>

      <div class="aval-bar">Detalle Deuda Vigente</div>
      <div class="aval-box">
        <div class="aval-pill"><strong>Cooperativas</strong></div>
        <div style="margin-top:10px;">
          ${buildOpsCooperativa(safeArr(r.operacionesVigentesCooperativa))}
        </div>

        <div style="margin-top:14px;" class="aval-pill"><strong>Servicios</strong></div>
        <div style="margin-top:10px;">
          ${safeArr(r.operacionesVigentesServicio).length
            ? `<div class="aval-table-wrap">
                <table class="aval-table">
                  <thead>
                    <tr><th>Fecha Corte</th><th>Entidad</th><th>Servicio</th><th>Estado</th><th style="width:110px;">Cuota</th><th style="width:110px;">Deuda</th></tr>
                  </thead>
                  <tbody>
                    ${r.operacionesVigentesServicio.map(s => `
                      <tr>
                        <td>${s.fechaCorte ?? "-"}</td>
                        <td>${s.razonSocial ?? "-"}</td>
                        <td>${s.tipoServicioDescripcion ?? "-"}</td>
                        <td>${s.estadoServicioDescripcion ?? "-"}</td>
                        <td style="text-align:right;">${money(s.cuotaEstimadaOperacion)}</td>
                        <td style="text-align:right;"><strong>${money(s.totalDeuda)}</strong></td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>`
            : `<div class="aval-muted">El titular consultado no registra saldo en servicios.</div>`
          }
        </div>
      </div>

      <!-- ✅ ANEXO: Renderiza TODAS las demás llaves -->
      ${buildAutoAvalSections(r, [
        "identificacionTitular",
        "informacionComoRUC",
        "scoreFinanciero",
        "factoresScore",
        "manejoCuentasCorrientes",
        "deudaVigenteTotal",
        "gastoFinanciero",
        "operacionesCodeudorGarante",
        "operacionesVigentesCooperativa",
        "operacionesVigentesServicio",
        "evolucionScoreFinanciero",
        "semaforoMaximoDiasVencido",
        "indicadoresDeuda",
        "operacionesHistoricasTarjeta",
        "operacionesHistoricasBanco",
        "operacionesHistoricasCooperativa",
        "operacionesHistoricasEmpresa",
        "operacionesHistoricasServicio",
        "operacionesHistoricasCobranza"
      ])}
    `;
  }

  function ensureReportShell() {
    let shell = document.getElementById("aval-report");
    if (shell) return shell;

    // Si no existe en tu HTML, lo creamos al vuelo:
    shell = document.createElement("section");
    shell.id = "aval-report";
    shell.className = "aval-report";
    shell.style.display = "none";
    shell.innerHTML = `
      <div class="aval-report__toolbar no-print">
        <button id="aval-btn-download" type="button" class="btn btn--primary">Descargar PDF</button>
      </div>
      <div id="aval-report-content"></div>
    `;

    document.body.appendChild(shell);
    return shell;
  }

  function showAvalReport(rawAvalResponse, opts = {}) {
    const shell = ensureReportShell();
    const content = document.getElementById("aval-report-content");
    if (!content) return;

    content.innerHTML = renderAvalReport(rawAvalResponse, opts);

    // ✅ activa filtros 6/12/24 de tablas históricas
    bindHistoricasFilters(shell);

    shell.style.display = "block";

    const btn = document.getElementById("aval-btn-download");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => window.print()); // (CSS @media print debe ocultar todo excepto #aval-report)
    }
  }

  // Exporta función global para usar desde main.js
  window.showAvalReport = showAvalReport;
})();
