(function () {
  const $ = (id) => document.getElementById(id);

  // ====== CONFIG ======
  const CONFIG = {
    MAX_COTIZACIONES: 3,
  };

  // ====== Helpers ======
  const num = (v) => {
    const n = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const money = (v) =>
    new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(v || 0);

  const fmtDateTime = (d) =>
    new Intl.DateTimeFormat("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

  // PMT: pago mensual para un préstamo amortizado
  const pmt = (rateMonthly, nper, pv) => {
    if (nper <= 0) return 0;
    if (rateMonthly <= 0) return pv / nper;
    const r = rateMonthly;
    return (pv * r) / (1 - Math.pow(1 + r, -nper));
  };

  // ====== Elements (según tu HTML) ======
  const el = {
    // Inputs cotizador
    tasa: $("ct_tasa"),
    pvp: $("ct_pvp"),
    entrada: $("ct_entrada"),
    entradaPct: $("ct_entrada_pct"),
    saldo: $("ct_saldo"),
    plazo: $("ct_plazo"),
    tasaDesg: $("ct_tasa_desg"),
    tasaSeguro: $("ct_tasa_seguro"),
    plazoSeguro: $("ct_plazo_seguro"),
    gps: $("ct_gps"),

    // Actions
    btnCotizar: $("ct_cotizar"),
    btnLimpiar: $("ct_limpiar"),
    btnLimpiarCotizaciones: $("ct_limpiar_cotizaciones"),

    // Output
    cotizacionesList: $("ct_cotizaciones_list"),

    // Topbar (si existiera)
    btnTopbarLimpiar: $("new-query-btn"),
  };

  // Si no existe el cotizador en la página, salir
  if (!el.btnCotizar || !el.pvp || !el.entrada || !el.plazo) return;

  // ====== Estado ======
  /**
   * cotizaciones en orden visual: izquierda -> derecha (más antigua -> más nueva)
   * @type {Array<{id:string, createdAt: Date, resumen: any, filas: Array<[string, number, string?]>, cuotaMes: number}>}
   */
  let cotizaciones = [];

  // ====== Derivados ======
  function actualizarDerivados() {
    const pvp = num(el.pvp.value);
    const entrada = num(el.entrada.value);

    const entradaPct = pvp > 0 ? (entrada / pvp) * 100 : 0;
    const saldo = Math.max(pvp - entrada, 0);

    if (el.entradaPct) el.entradaPct.value = entradaPct.toFixed(2);
    if (el.saldo) el.saldo.value = saldo.toFixed(2);
  }

  // ====== Validación mínima ======
  function validar() {
    const pvp = num(el.pvp.value);
    const entrada = num(el.entrada.value);
    const plazo = parseInt(el.plazo.value || "0", 10);

    if (pvp <= 0) return { ok: false, msg: "Ingresa el PVP para calcular." };
    if (!plazo) return { ok: false, msg: "Selecciona el plazo para calcular." };
    if (entrada < 0 || entrada > pvp) return { ok: false, msg: "La entrada debe ser entre 0 y el PVP." };

    return { ok: true, pvp, entrada, plazo };
  }

  // ====== Cálculo ======
  function calcularCotizacion() {
    const v = validar();
    if (!v.ok) {
      alert(v.msg);
      return;
    }

    const { pvp, entrada, plazo } = v;
    const saldo = Math.max(pvp - entrada, 0);

    const tasaAnualPct = num(el.tasa?.value);
    const tasaMensual = (tasaAnualPct / 100) / 12;

    // Cuota base (capital + interés) solo del saldo
    const cuotaBase = pmt(tasaMensual, plazo, saldo);

    // Desgravamen mensual (anual % sobre saldo)
    const tasaDesgAnualPct = num(el.tasaDesg?.value);
    const desgMensual = (saldo * (tasaDesgAnualPct / 100)) / 12;

    // Seguro vehicular mensual (anual % sobre saldo) — aproximación
    const tasaSeguroAnualPct = num(el.tasaSeguro?.value);
    const plazoSeguro = parseInt(el.plazoSeguro?.value || "0", 10);
    const seguroMensual = plazoSeguro > 0 ? (saldo * (tasaSeguroAnualPct / 100)) / 12 : 0;

    // GPS mensual prorrateado
    // GPS mensual prorrateado (toma el valor numérico desde el HTML)
    const gpsTotal = num(el.gps?.value);       // valor total ingresado en ct_gps
    const gpsMensual = plazo > 0 ? (gpsTotal / plazo) : 0;

    const cuotaTotal = cuotaBase + desgMensual + seguroMensual + gpsMensual;

    const filas = [
      ["Precio vehículo", pvp],
      ["Entrada", -entrada],
      ["Saldo a financiar", saldo],
      ["Cuota base", cuotaBase],
      ["Seguro desgravamen (mensual)", desgMensual],
    ];

    if (plazoSeguro > 0) {
      const notaSeguro = plazoSeguro < plazo ? `Aplica ${plazoSeguro} meses` : "";
      filas.push(["Seguro vehicular (mensual)", seguroMensual, notaSeguro]);
    } else {
      filas.push(["Seguro vehicular", 0, "No aplica"]);
    }

    if (gpsTotal > 0) {
      filas.push(["GPS (mensual)", gpsMensual, `Prorrateado en ${plazo} meses (Total: ${money(gpsTotal)})`]);
    } else {
      filas.push(["GPS", 0, "No aplica"]);
    }

    const resumen = {
      marca: (el.marca?.value || "").trim(),
      tipo: (el.tipoVehiculo?.value || "").trim(),
      plazo,
      entradaPct: pvp > 0 ? (entrada / pvp) * 100 : 0,
    };

    pushCotizacion({ resumen, filas, cuotaTotal });
  }

  // ✅ IMPORTANTE: ahora la nueva cotización va AL FINAL (derecha)
  function pushCotizacion({ resumen, filas, cuotaTotal }) {
    const item = {
      id: String(Date.now()),
      createdAt: new Date(),
      resumen,
      filas,
      cuotaMes: cuotaTotal,
    };

    cotizaciones.push(item);

    // Mantener máximo N (si te pasas, borramos la más antigua: la primera)
    while (cotizaciones.length > CONFIG.MAX_COTIZACIONES) cotizaciones.shift();

    renderCotizaciones();

    // Si estás en layout horizontal con overflow, autoscroll a la derecha
    if (el.cotizacionesList) {
      el.cotizacionesList.scrollLeft = el.cotizacionesList.scrollWidth;
    }
  }

  function renderCotizaciones() {
    if (!el.cotizacionesList) return;


    el.cotizacionesList.innerHTML = "";

    cotizaciones.forEach((c, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "quote";

      const head = document.createElement("div");
      head.className = "quote__head";

      const title = document.createElement("div");
      title.className = "quote__title";
      // idx+1 corresponde a la posición visual izquierda->derecha
      title.textContent = `Cotización #${idx + 1} — ${fmtDateTime(c.createdAt)}`;

      const subtitle = document.createElement("div");
      subtitle.className = "quote__subtitle";
      const parts = [];
      if (c.resumen.marca) parts.push(`Marca: ${c.resumen.marca}`);
      if (c.resumen.tipo) parts.push(`Tipo: ${c.resumen.tipo}`);
      parts.push(`Plazo: ${c.resumen.plazo}m`);
      parts.push(`Entrada: ${c.resumen.entradaPct.toFixed(2)}%`);
      subtitle.textContent = parts.join(" · ");

      const total = document.createElement("div");
      total.className = "quote__total";
      total.innerHTML =
        `<div class="quote__total-label">Cuota aprox.</div>` +
        `<div class="quote__total-value">${money(c.cuotaMes)}</div>`;

      head.appendChild(title);
      head.appendChild(subtitle);
      head.appendChild(total);

      const table = document.createElement("table");
      table.className = "table table--compact";

      const tbody = document.createElement("tbody");

      c.filas.forEach(([rubro, valor, nota]) => {
        if (Math.abs(valor) < 0.00001 && !nota) return;

        const tr = document.createElement("tr");

        const tdR = document.createElement("td");
        tdR.textContent = rubro;

        const tdV = document.createElement("td");
        tdV.className = "right";
        tdV.textContent = money(valor);

        tr.appendChild(tdR);
        tr.appendChild(tdV);
        tbody.appendChild(tr);

        if (nota) {
          const trNote = document.createElement("tr");
          const tdNote = document.createElement("td");
          tdNote.colSpan = 2;
          tdNote.className = "quote__note";
          tdNote.textContent = nota;
          trNote.appendChild(tdNote);
          tbody.appendChild(trNote);
        }
      });

      // Total fila
      const trTotal = document.createElement("tr");
      trTotal.className = "quote__total-row";

      const tdTL = document.createElement("td");
      tdTL.innerHTML = "<strong>Cuota total aproximada</strong>";

      const tdTV = document.createElement("td");
      tdTV.className = "right";
      tdTV.innerHTML = `<strong>${money(c.cuotaMes)}</strong>`;

      trTotal.appendChild(tdTL);
      trTotal.appendChild(tdTV);
      tbody.appendChild(trTotal);

      table.appendChild(tbody);

      wrap.appendChild(head);
      wrap.appendChild(table);

      el.cotizacionesList.appendChild(wrap);
    });
  }

  // ====== Limpieza ======
  function limpiarCotizadorInputs() {
    el.pvp.value = "";
    el.entrada.value = "";
    el.plazo.value = ""; // vuelve a "Seleccionar"

    if (el.tasa) el.tasa.value = "15.60";
    if (el.tasaDesg) el.tasaDesg.value = "0.60";
    if (el.tasaSeguro) el.tasaSeguro.value = "4.09";
    if (el.plazoSeguro) el.plazoSeguro.value = ""; // "Seleccionar"

    if (el.marca) el.marca.value = "";
    if (el.tipoVehiculo) el.tipoVehiculo.value = "";
    if (el.gps) el.gps.value = "";
    if (el.plazoGps) el.plazoGps.value = "";

    actualizarDerivados();
  }

  function limpiarCotizaciones() {
    cotizaciones = [];
    renderCotizaciones();
  }

  // ====== Events (con guardas) ======
  ["input", "change"].forEach((evt) => {
    el.pvp?.addEventListener(evt, actualizarDerivados);
    el.entrada?.addEventListener(evt, actualizarDerivados);
  });

  el.btnCotizar?.addEventListener("click", calcularCotizacion);
  el.btnLimpiar?.addEventListener("click", limpiarCotidorInputsSafe);
  el.btnLimpiarCotizaciones?.addEventListener("click", limpiarCotizaciones);
  el.btnTopbarLimpiar?.addEventListener("click", limpiarCotidorInputsSafe);

  function limpiarCotidorInputsSafe() {
    try { limpiarCotizadorInputs(); } catch (e) { console.error(e); }
  }

  // Init
  actualizarDerivados();
  renderCotizaciones();
})();
