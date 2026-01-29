/* avalReport.js - Generador PDF Réplica Exacta AVAL (Versión Completa) */
(function () {
  const state = { titular: null, conyuge: null, meta: {} };

  // --- 1. HELPERS & FORMATTERS ---
  const fmt = {
    money: (n) => {
      let val = parseFloat(n);
      if (isNaN(val) || val === null) return "$ 0.00";
      return "$ " + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    date: (d) => {
      if (!d) return "-";
      try {
        // Soporta fechas ISO o YYYY-MM-DD
        const dateObj = new Date(d + 'T00:00:00'); 
        if(isNaN(dateObj)) {
            const parts = d.split("-");
            if (parts.length === 3) {
                 const m = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
                 return `${parts[2]}-${m[parseInt(parts[1]) - 1]}-${parts[0]}`;
            }
            return d;
        }
        const m = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        return `${dateObj.getDate()}-${m[dateObj.getMonth()]}-${dateObj.getFullYear()}`;
      } catch { return d; }
    },
    safe: (v) => (v === undefined || v === null) ? "-" : v,
    pct: (v) => {
        let n = parseFloat(v);
        if(isNaN(n)) return "0.00%";
        if(n < 1 && n > -1) n = n * 100; // Convertir decimal a pct si es necesario
        return n.toFixed(2) + "%";
    }
  };

  // --- 2. RENDERIZADO DE COMPONENTES ---

  // Semáforo (Círculos de colores)
  function renderSemaforo(list) {
      if(!list || !list.length) return '<div class="box">Sin información de semáforo.</div>';
      // Ordenar cronológicamente
      const sorted = [...list].sort((a,b) => new Date(a.fechaCorte) - new Date(b.fechaCorte));
      
      let html = '<div class="semaforo-grid">';
      sorted.forEach(item => {
          const date = new Date(item.fechaCorte);
          const label = date.toLocaleString('es-EC', { month: 'short', year: '2-digit' });
          const color = item.color || '#ccc';
          const dias = item.diasVencido || '0';
          html += `
            <div class="semaforo-item">
                <div class="semaforo-circle" style="background-color: ${color};">${dias}</div>
                <div class="semaforo-label">${label}</div>
            </div>
          `;
      });
      html += '</div>';
      return html;
  }

  // Tablas Genéricas y Específicas
  function renderTable(cols, data) {
      if(!data || !data.length) return '<div class="no-data">No se registra información.</div>';
      return `
        <table>
            <thead>
                <tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${data.map(row => `
                    <tr>
                        ${cols.map(c => {
                            let val = row[c.key];
                            // Soporte para keys alternativas
                            if(val === undefined && c.alt) val = row[c.alt];
                            if(c.fmt) val = c.fmt(val);
                            return `<td class="${c.cls || ''}" style="${c.style||''}">${val ?? '-'}</td>`;
                        }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
      `;
  }

  // --- 3. CONSTRUCCIÓN DEL HTML ---
  function buildHtml(data, meta) {
    const r = data.result || data; 
    const info = (r.identificacionTitular && r.identificacionTitular[0]) || {};
    const scoreInfo = (r.scoreFinanciero && r.scoreFinanciero[0]) || { score: 0, tasaMalos: 0, clientesPeorScore: 0 };
    const gasto = (r.gastoFinanciero && r.gastoFinanciero[0]) || {};
    
    // --- PREPARACIÓN DE DATOS PARA GRÁFICOS ---
    
    // 1. Histórico Score
    const histSorted = [...(r.evolucionScoreFinanciero || [])].sort((a, b) => new Date(a.fechaCorte) - new Date(b.fechaCorte));
    const chartHist = {
        labels: histSorted.map(h => {
             const d = new Date(h.fechaCorte);
             const m = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
             return `${m[d.getMonth()]}.${d.getFullYear().toString().substr(-2)}`;
        }),
        data: histSorted.map(h => parseInt(h.ejeY || 0)),
        colors: histSorted.map(h => h.color || "#cccccc")
    };

    // 2. Tendencia Deuda (Area Chart)
    const tendSorted = [...(r.tendenciaDeuda || [])].sort((a,b) => new Date(a.fechaCorte) - new Date(b.fechaCorte));
    const chartTend = {
        labels: tendSorted.map(h => {
             const d = new Date(h.fechaCorte);
             const m = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
             return `${m[d.getMonth()]}.${d.getFullYear().toString().substr(-2)}`;
        }),
        total: tendSorted.map(h => parseFloat(h.totalDeuda || 0)),
        vencido: tendSorted.map(h => parseFloat(h.valorVencidoTotal || 0))
    };

    const config = JSON.stringify({ 
        score: parseInt(scoreInfo.score||0), 
        hist: chartHist, 
        tend: chartTend 
    });

    // --- TEMPLATE HTML ---
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Reporte Aval - ${info.identificacionSujeto}</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        body { font-family: 'Arial Narrow', Arial, sans-serif; font-size: 9px; margin: 0; padding: 15px; background: #525659; }
        .page { background: white; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm; box-sizing: border-box; }
        
        /* HEADER */
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #002e5f; padding-bottom: 5px; margin-bottom: 10px; }
        .brand { font-size: 22px; font-weight: bold; color: #666; } .brand span { color: #002e5f; }
        .meta-table td { border-right: 1px solid #ccc; padding: 0 5px; font-size: 8px; }
        .meta-table td:last-child { border-right: none; }
        .meta-label { font-weight: bold; color: #002e5f; }

        /* SECCIONES & GRID */
        .section-title { background: #002e5f; color: white; padding: 2px 5px; font-weight: bold; margin-top: 10px; font-size: 9px; text-transform: uppercase; }
        .box { border: 1px solid #ddd; padding: 5px; margin-bottom: 5px; }
        .row { display: flex; gap: 10px; }
        .col { flex: 1; }
        .no-data { font-style: italic; color: #777; padding: 5px; text-align: center; }

        /* TABLAS */
        table { width: 100%; border-collapse: collapse; font-size: 8px; }
        th { background: #eee; color: #002e5f; font-weight: bold; border: 1px solid #ccc; padding: 2px; text-align: center; }
        td { border: 1px solid #ccc; padding: 2px; text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        
        /* Key-Value Tables (Invisible borders) */
        .kv-table td { border: none; border-bottom: 1px dotted #ccc; text-align: left; padding: 1px 3px; }
        .kv-key { font-weight: bold; color: #444; width: 50%; }

        /* SCORE GAUGE */
        .score-row { display: flex; align-items: center; justify-content: space-between; }
        .gauge-wrap { width: 120px; height: 70px; position: relative; display: flex; justify-content: center; }
        .score-val { position: absolute; bottom: 0; font-size: 20px; font-weight: bold; color: #444; }
        .score-stats { font-size: 8px; line-height: 1.3; }

        /* SEMÁFORO GRID */
        .semaforo-grid { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-start; }
        .semaforo-item { text-align: center; width: 30px; }
        .semaforo-circle { width: 18px; height: 18px; border-radius: 50%; margin: 0 auto; color: white; font-weight: bold; line-height: 18px; font-size: 7px; border: 1px solid rgba(0,0,0,0.1); }
        .semaforo-label { font-size: 7px; color: #555; margin-top: 2px; }

        /* CHARTS */
        .chart-container { height: 140px; width: 100%; position: relative; }
        
        /* BADGES */
        .badge-pos { color: green; font-weight: bold; }
        .badge-neg { color: red; font-weight: bold; }

        @media print {
            body { background: white; padding: 0; }
            .page { margin: 0; box-shadow: none; page-break-inside: avoid; }
            .section-title { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tr { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
            <div class="brand">aval<span>buró</span></div>
            <table class="meta-table">
                <tr><td class="meta-label">Empresa</td><td>${meta.empresa}</td></tr>
                <tr><td class="meta-label">Usuario</td><td>${meta.usuario}</td></tr>
                <tr><td class="meta-label">Fecha</td><td>${meta.fecha}</td></tr>
                <tr><td class="meta-label">Hora</td><td>${meta.hora}</td></tr>
            </table>
        </div>

        <div class="section-title">Información del Titular</div>
        <div class="box">
            <table class="kv-table" style="width:100%">
                <tr>
                    <td style="width:10%; font-weight:bold;">Tipo Doc:</td><td style="width:20%">${fmt.safe(info.tipoIdentificacionSujetoDescripcion)}</td>
                    <td style="width:10%; font-weight:bold;">Identificación:</td><td style="width:20%">${fmt.safe(info.identificacionSujeto)}</td>
                    <td style="width:10%; font-weight:bold;">Nombres:</td><td><strong>${fmt.safe(info.nombreRazonSocial)}</strong></td>
                </tr>
            </table>
        </div>

        ${r.informacionComoRUC && r.informacionComoRUC.length ? `
            <div class="section-title">RUC Personal</div>
            <div class="box">
                ${renderTable([
                    {label:"RUC", key:"identificacionSujeto"},
                    {label:"Estado", key:"estadoRuc"},
                    {label:"F. Inicio", key:"fechaInicioActividades", fmt: fmt.date},
                    {label:"Actividad Económica", key:"actividadEconomica", cls:"text-left"}
                ], r.informacionComoRUC)}
            </div>
        ` : ''}

        <div class="row">
            <div class="col">
                <div class="section-title">Score Financiero</div>
                <div class="box score-row">
                    <div class="gauge-wrap">
                        <canvas id="chartScore"></canvas>
                        <div class="score-val">${scoreInfo.score}</div>
                    </div>
                    <div class="score-stats">
                        <div>Población peor score: <strong>${fmt.pct(scoreInfo.clientesPeorScore)}</strong></div>
                        <div>Probabilidad de mora: <strong>${fmt.pct(scoreInfo.tasaMalos)}</strong></div>
                        <div style="margin-top:4px; font-style:italic; font-size:7px;">Explicación: Sujeto dentro del rango calculado.</div>
                    </div>
                </div>
            </div>
            <div class="col">
                <div class="section-title">Factores de Riesgo</div>
                <div class="box">
                    <table>
                        <thead><tr><th>Factor</th><th>Valor</th><th>Efecto</th></tr></thead>
                        <tbody>
                            ${(r.factoresScore||[]).slice(0,5).map(f => `<tr><td class="text-left">${f.factor}</td><td>${f.valor}</td><td class="${f.efecto==='+'?'badge-pos':'badge-neg'}">${f.efecto}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="section-title">Manejo de Cuentas Corrientes</div>
        <div class="box">
            ${(!r.manejoCuentasCorrientes || r.manejoCuentasCorrientes.length === 0) 
              ? 'El titular consultado no registra inhabilitación para el manejo de cuentas corrientes.' 
              : renderTable([{label:"Banco", key:"razonSocial"}, {label:"Tipo", key:"tipoCta"}, {label:"Estado", key:"estado"}], r.manejoCuentasCorrientes)}
        </div>

        <div class="row">
            <div class="col">
                <div class="section-title">Deuda Vigente Total</div>
                <div class="box">
                     ${renderTable([
                         {label:"Sistema", key:"sistemaCrediticio", cls:"text-left"},
                         {label:"Por Vencer", key:"valorPorVencer", fmt:fmt.money},
                         {label:"Vencido", key:"valorVencido", fmt:fmt.money},
                         {label:"Total", key:"totalDeuda", fmt:fmt.money}
                     ], r.deudaVigenteTotal)}
                </div>
            </div>
            <div class="col">
                <div class="section-title">Gasto Financiero Estimado</div>
                <div class="box">
                    <table class="kv-table">
                        <tr><td class="kv-key">Cuota Mensual Total:</td><td class="text-right"><strong>${fmt.money(gasto.cuotaTotalOperaciones)}</strong></td></tr>
                        <tr><td class="kv-key">Cuota Est. Créditos:</td><td class="text-right">${fmt.money(gasto.cuotaEstimadaTitular)}</td></tr>
                        <tr><td class="kv-key">Cuota Est. Tarjetas:</td><td class="text-right">${fmt.money(gasto.cuotaTotalTarjeta)}</td></tr>
                        <tr><td class="kv-key">Cuota Servicios:</td><td class="text-right">${fmt.money(gasto.cuotaTotalServicios)}</td></tr>
                        <tr><td class="kv-key">Cuota Vencidos:</td><td class="text-right">${fmt.money(gasto.cuotaVencidos)}</td></tr>
                    </table>
                </div>
            </div>
        </div>

        <div class="section-title">Evolución Score Financiero</div>
        <div class="box">
            <div class="chart-container" style="height:120px;">
                <canvas id="chartHist"></canvas>
            </div>
        </div>

        <div class="section-title">Semáforo Máximo Días Vencido</div>
        <div class="box">
            ${renderSemaforo(r.semaforoMaximoDiasVencido)}
        </div>

        <div class="section-title">Tendencia de Deuda (Últimos 24 meses)</div>
        <div class="box">
            <div class="chart-container" style="height:150px;">
                <canvas id="chartTend"></canvas>
            </div>
        </div>

        ${renderVigentes(r)}

        ${renderHistoricas(r)}

        <div class="row" style="page-break-inside:avoid;">
             <div class="col">
                <div class="section-title">Consultas (Últimos 12 meses)</div>
                <div class="box">
                    ${renderTable([
                        {label:"Fecha", key:"fechaConsulta", fmt:fmt.date},
                        {label:"Institución", key:"nombreComercial", cls:"text-left"}
                    ], (r.titularConsultado12Meses||[]).slice(0,10))}
                </div>
             </div>
             <div class="col">
                <div class="section-title">Datos de Contacto</div>
                <div class="box">
                    ${renderTable([
                        {label:"Dirección", key:"direccion", cls:"text-left"},
                        {label:"Teléfono", key:"telefono"}
                    ], (r.datosContacto||[]).slice(0,5))}
                </div>
             </div>
        </div>

        <div style="font-size:7px; text-align:center; margin-top:20px; color:#999; border-top:1px solid #ccc; padding-top:5px;">
             La información contenida en este reporte es de carácter confidencial. COPYRIGHT Aval Buró. Todos los derechos reservados.
        </div>
      </div>

      <script>
        const cfg = JSON.parse('${config}');

        // 1. SCORE
        new Chart(document.getElementById('chartScore'), {
            type: 'doughnut',
            data: {
                labels: ['Score', ''],
                datasets: [{
                    data: [cfg.score, 999 - cfg.score],
                    backgroundColor: [(cfg.score<650?'#d32f2f':(cfg.score<800?'#fbc02d':'#388e3c')), '#eee'],
                    borderWidth: 0, cutout: '80%', circumference: 180, rotation: 270
                }]
            },
            options: { responsive:true, maintainAspectRatio:false, plugins:{legend:false, tooltip:false} }
        });

        // 2. HISTORIAL (BARRAS)
        new Chart(document.getElementById('chartHist'), {
            type: 'bar',
            data: {
                labels: cfg.hist.labels,
                datasets: [{
                    data: cfg.hist.data,
                    backgroundColor: cfg.hist.colors,
                    borderRadius: 3, barThickness: 10
                }]
            },
            options: { 
                responsive:true, maintainAspectRatio:false, 
                scales:{ y:{min:300, max:1000}, x:{grid:{display:false}} },
                plugins:{legend:false} 
            }
        });

        // 3. TENDENCIA (AREA)
        new Chart(document.getElementById('chartTend'), {
            type: 'line',
            data: {
                labels: cfg.tend.labels,
                datasets: [
                    {
                        label: 'Total Deuda',
                        data: cfg.tend.total,
                        borderColor: '#007bff', backgroundColor: 'rgba(0,123,255,0.1)',
                        fill: true, tension: 0.4, pointRadius: 2
                    },
                    {
                        label: 'Vencido',
                        data: cfg.tend.vencido,
                        borderColor: '#dc3545', backgroundColor: 'rgba(220,53,69,0.1)',
                        fill: true, tension: 0.4, pointRadius: 2
                    }
                ]
            },
            options: { 
                responsive:true, maintainAspectRatio:false, 
                plugins:{legend:{position:'top', labels:{boxWidth:10, font:{size:8}}}} 
            }
        });

        setTimeout(() => window.print(), 1000);
      </script>
    </body>
    </html>
    `;
  }

  // --- HELPERS PARA SECCIONES ESPECÍFICAS ---

  function renderVigentes(r) {
      const groups = [
          {t:"Bancos", d:r.operacionesVigentesBanco},
          {t:"Cooperativas", d:r.operacionesVigentesCooperativa},
          {t:"Tarjetas", d:[...(r.operacionesVigentesTarjeta||[]), ...(r.detalleTarjetaCredito||[])]},
          // SERVICIOS (Tabla especial con Num Contrato)
          {t:"Servicios", d:r.operacionesVigentesServicio, cols:[
             {label:"Empresa", key:"razonSocial", cls:"text-left"},
             {label:"Contrato", key:"numeroOperacion"},
             {label:"Estado", key:"situacionOperacionDescripcion"},
             {label:"Cuota", key:"cuotaEstimadaOperacion", fmt:fmt.money},
             {label:"Saldo", key:"saldoTotalCalculado", fmt:fmt.money},
             {label:"Días Venc.", key:"diasMorosidad"}
          ]},
          {t:"Cobranza", d:r.operacionesVigentesCobranza}
      ];
      
      const colsStd = [
          {label:"Institución", key:"razonSocial", cls:"text-left"},
          {label:"Operación", key:"numeroOperacion"},
          {label:"Tipo", key:"tipoCreditoDescripcion"},
          {label:"F. Vencim.", key:"fechaVencimiento", fmt:fmt.date},
          {label:"Saldo", key:"saldoTotalCalculado", fmt:fmt.money},
          {label:"Días Mora", key:"diasMorosidad", style:"color:red; font-weight:bold;"}
      ];

      return groups.map(g => {
          if(!g.d || !g.d.length) return ''; // No mostrar sección vacía
          return `<div class="section-title">Operaciones Vigentes - ${g.t}</div>
                  <div class="box">${renderTable(g.cols || colsStd, g.d)}</div>`;
      }).join('');
  }

  function renderHistoricas(r) {
      const groups = [
          {t:"Bancos", d:r.operacionesHistoricasBanco},
          {t:"Cooperativas", d:r.operacionesHistoricasCooperativa},
          {t:"Servicios", d:r.operacionesHistoricasServicio},
          {t:"Cobranza", d:r.operacionesHistoricasCobranza}
      ];
      // Columnas históricas (incluye Saldo NDI y Peor Edad si existen en JSON)
      const colsHist = [
          {label:"F. Corte", key:"fechaCorte", fmt:fmt.date},
          {label:"Institución", key:"razonSocial", cls:"text-left"},
          {label:"Operación", key:"numeroOperacion"},
          {label:"Saldo", key:"saldoTotalCalculado", fmt:fmt.money},
          {label:"Vencido", key:"valorVencidoTotal", fmt:fmt.money},
          {label:"Días Mora", key:"diasMorosidad"}
      ];

      return groups.map(g => {
           if(!g.d || !g.d.length) return '';
           // Ordenar histórico por fecha desc
           const sorted = [...g.d].sort((a,b) => new Date(b.fechaCorte) - new Date(a.fechaCorte));
           return `<div class="section-title">Operaciones Históricas - ${g.t}</div>
                   <div class="box">${renderTable(colsHist, sorted)}</div>`;
      }).join('');
  }

  // --- API PUBLICA ---
  function setAvalData(titular, conyuge, meta) {
    state.titular = titular;
    state.conyuge = conyuge;
    state.meta = meta || {};
  }

  function openAvalDownload(type) {
    const data = (type === 'conyuge') ? state.conyuge : state.titular;
    if (!data) { alert("No hay datos para " + type); return; }
    const win = window.open("", "_blank", "width=1100,height=900");
    win.document.write(buildHtml(data, state.meta));
    win.document.close();
  }

  window.AvalReport = { setAvalData, openAvalDownload };
})();