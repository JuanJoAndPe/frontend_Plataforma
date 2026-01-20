function actualizarMonto() {
  const valorEl = document.getElementById('valor');
  const entradaEl = document.getElementById('entrada');
  const dispositivoEl = document.getElementById('dispositivo');
  const montoEl = document.getElementById('monto');

  // Seguridad por si el DOM no está listo
  if (!valorEl || !entradaEl || !montoEl) return;

  const valorVehiculo = parseFloat(valorEl.value);
  const entrada = parseFloat(entradaEl.value);

  // 👉 CLAVE: si está vacío o NaN, usar 0
  const dispositivo = dispositivoEl && !isNaN(parseFloat(dispositivoEl.value))
    ? parseFloat(dispositivoEl.value)
    : 0;

  // Si valor o entrada no son válidos, limpiamos monto
  if (isNaN(valorVehiculo) || isNaN(entrada)) {
    montoEl.value = "";
    return;
  }

  const montoNum = (valorVehiculo - entrada) + dispositivo;

  // Protección extra
  if (isNaN(montoNum) || montoNum < 0) {
    montoEl.value = "";
    return;
  }

  montoEl.value = montoNum.toFixed(2);
}
// Convierte un data URI (data:application/pdf;base64,...) a base64 puro
function dataUriToBase64(dataUri) {
  const s = String(dataUri || "");
  const idx = s.indexOf("base64,");
  return idx >= 0 ? s.slice(idx + "base64,".length) : s;
}


// ===============================
// HISTORIAL PRECALIFICACIONES (Backend)
// ===============================
const BACKEND_BASE = "https://backend-plataforma-ftw7.onrender.com";

function getAuthToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("jwt") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("access_token") ||
    ""
  );
}

async function apiFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (token) headers.Authorization = "Bearer " + token;

  const r = await fetch(BACKEND_BASE + path, Object.assign({}, options, { headers }));
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg = data?.message || data?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

let __precalHistCache = [];

async function fetchPrecalHistory(limit = 50) {
  const data = await apiFetch(`/precalificaciones/historial?limit=${encodeURIComponent(String(limit))}`, { method: "GET" });
  const list =
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.Items) && data.Items) ||
    (Array.isArray(data?.history) && data.history) ||
    (Array.isArray(data?.result?.items) && data.result.items) ||
    [];

  // Ordenar por createdAt/gsi1sk/fechaISO desc si vienen
  __precalHistCache = list.slice().sort((a, b) => {
    const da = ((a?.createdAt ?? a?.gsi1sk ?? Date.parse(a?.data?.fechaISO || a?.fechaISO || "")) || 0);
    const db = ((b?.createdAt ?? b?.gsi1sk ?? Date.parse(b?.data?.fechaISO || b?.fechaISO || "")) || 0);
    return Number(db) - Number(da);
  });
  return __precalHistCache;
}

function formatFechaEC(iso) {
  try { return new Date(iso).toLocaleString("es-EC"); } catch { return iso || ""; }
}

function renderPrecalHistory() {
  const cont = document.getElementById("hist_list");
  if (!cont) return;

  (async () => {
    try {
      if (!getAuthToken()) {
        cont.innerHTML = '<p class="hint" style="margin:0;">Inicia sesión para ver el historial.</p>';
        return;
      }

      const list = await fetchPrecalHistory(50);
      if (!list.length) {
        cont.innerHTML = '<p class="hint" style="margin:0;">Aún no hay precalificaciones guardadas.</p>';
        return;
      }

      cont.innerHTML = list.map((h) => {
        const d = (h?.data && typeof h.data === "object") ? h.data : h;
        const pk = h?.pk || d?.pk || "";
        const fecha = formatFechaEC(d.fechaISO || h?.createdAt);
        const ced = String(d.cedulaDeudor || "").trim();
        const decision = String(d.decisionFinal || "").trim();
        const monto = isFinite(Number(d.monto)) ? Number(d.monto).toFixed(2) : "";
        const cuota = isFinite(Number(d.cuota)) ? Number(d.cuota).toFixed(2) : "";
        const plazo = d.plazo ? `${d.plazo}m` : "";
        const veh = `${String(d.marca||"").trim()} ${String(d.modelo||"").trim()}`.trim();
        const conc = String(d.concesionario||"").trim();

        return `
          <div class="card" style="margin-top:12px;">
            <div class="card__header" style="align-items:flex-start;">
              <div>
                <h3 class="card__title" style="margin:0;">${ced || "(sin cédula)"} · ${decision || "(sin decisión)"}</h3>
                <p class="hint" style="margin:4px 0 0 0;">${fecha}${veh ? ` · ${veh}` : ""}${conc ? ` · ${conc}` : ""}</p>
              </div>
              <div class="card__header-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn btn--primary" data-hist-load="${pk}">Cargar</button>
                <button type="button" class="btn btn--secondary" data-hist-del="${pk}">Eliminar</button>
              </div>
            </div>
            <div style="padding: 0 16px 16px 16px;">
              <p style="margin:0;"><strong>Monto:</strong> $${monto} · <strong>Plazo:</strong> ${plazo} · <strong>Cuota:</strong> $${cuota}</p>
            </div>
          </div>
        `;
      }).join("");

    } catch (e) {
      cont.innerHTML = `<p class="hint" style="margin:0;">No se pudo cargar el historial. ${String(e?.message || e)}</p>`;
    }
  })();
}

function deletePrecalHistoryItem(pk) {
  if (!pk) return;
  apiFetch(`/precalificaciones/historial/${encodeURIComponent(String(pk))}`, { method: "DELETE" })
    .then(() => renderPrecalHistory())
    .catch((e) => alert("No se pudo eliminar: " + (e?.message || e)));
}

function clearPrecalHistory() {
  apiFetch(`/precalificaciones/historial`, { method: "DELETE" })
    .then(() => renderPrecalHistory())
    .catch((e) => alert("No se pudo limpiar: " + (e?.message || e)));
}

function loadHistoryItemToForm(pk) {
  const item = (__precalHistCache || []).find((x) => (x?.pk || "") === pk);
  const d = (item?.data && typeof item.data === "object") ? item.data : item;
  if (!d) return;

  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = (v ?? "");
  };

  setVal("marca", d.marca);
  setVal("modelo", d.modelo);
  setVal("monto", d.monto ? Number(d.monto).toFixed(2) : "");
  setVal("plazo", d.plazo || "");
  setVal("cedulaDeudor", d.cedulaDeudor);
  setVal("cedulaConyuge", d.cedulaConyuge);
}

// Exponer para el flujo de precalificación
window.savePrecalificacionToHistory = function(item) {
  const safe = item && typeof item === "object" ? item : {};
  const payload = {
    fechaISO: safe.fechaISO || new Date().toISOString(),
    cedulaDeudor: String(safe.cedulaDeudor || ""),
    cedulaConyuge: String(safe.cedulaConyuge || ""),
    marca: String(safe.marca || ""),
    modelo: String(safe.modelo || ""),
    monto: Number(safe.monto || 0),
    plazo: Number(safe.plazo || 0),
    cuota: Number(safe.cuota || 0),
    decisionFinal: String(safe.decisionFinal || ""),
    concesionario: String(safe.concesionario || ""),
  };

  apiFetch("/precalificaciones/historial", { method: "POST", body: JSON.stringify(payload) })
    .then(() => {
      const vHis = document.getElementById("view-historial");
      if (vHis && vHis.style.display !== "none") renderPrecalHistory();
    })
    .catch((e) => {
      console.warn("No se pudo guardar historial en backend:", e?.message || e);
      const vHis = document.getElementById("view-historial");
      const cont = document.getElementById("hist_list");
      if (vHis && vHis.style.display !== "none" && cont) {
        cont.innerHTML = `<p class="hint" style="margin:0;">No se pudo guardar en historial: ${String(e?.message || e)}</p>`;
      }
    });
};

// Evita "Cannot read properties of null (reading 'addEventListener')"
const __calcularBtn = document.getElementById('calcularBtn');
if (__calcularBtn) __calcularBtn.addEventListener('click', function () {
    const bnt = document.getElementById('calcularBtn');
    bnt.disabled = true;
    bnt.innerText = "Procesando...";

    function resetBtn(text = "Calcular Preaprobación") {
      bnt.disabled = false;
      bnt.innerText = text;
    }
     actualizarMonto();
    // Obtener los valores de los campos
    const marca = document.getElementById('marca').value;
    const modelo = document.getElementById('modelo').value;
    const valorVehiculo = parseFloat(document.getElementById('valor').value);
    const entrada = parseFloat(document.getElementById('entrada').value);
    const dispositivo = parseFloat(document.getElementById('dispositivo')?.value) || 0;

    // Monto base (vehículo - entrada) + dispositivo financiado
    const montoNum = (valorVehiculo - entrada);
    const ingresoDeudor = parseFloat(document.getElementById('ingresoDeudor').value);
    const plazo = parseFloat(document.getElementById('plazo').value);
    const ingresoConyuge = parseFloat(document.getElementById('ingresoConyuge').value) || 0;
    const cedulaDeudor = document.getElementById('cedulaDeudor').value;
    const otrosIngresos = parseFloat(document.getElementById('otrosIngresos').value) || 0;
    const estadocivil = document.getElementById('estado_civil').value;
    const cedulaConyuge = document.getElementById('cedulaConyuge').value;
    const hijos = Math.trunc(parseFloat(document.getElementById('numerohijos').value)) || 0;
    const activos = parseFloat(document.getElementById('Activos').value) || 0;
    const separacionBienesSeleccionada = !!document.querySelector('input[name="separacion"]:checked');
    const separacionBienes = document.querySelector('input[name="separacion"]:checked')?.value;
    const terminosAceptados = document.getElementById('terminos').checked;
    const regexCedula = /^\d{10}$/;

    // Validar que todos los campos estén llenos
    function resetearEstilos(campos) {
      campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.border = '';
      });
    }

    let errores = [];
    const camposAValidar = ['valor', 'plazo', 'cedulaDeudor', 'estado_civil', 'ingresoDeudor', 'numerohijos', 'terminos', 'entrada'];
    resetearEstilos(camposAValidar);

    if (!valorVehiculo) {
        errores.push("El campo 'Valor Vehículo' es obligatorio.");
        document.getElementById('valor').style.border = '2px solid red';
    }
    if (!entrada) {
        errores.push("El campo 'Entrada' es obligatorio.");
        document.getElementById('entrada').style.border = '2px solid red';
    }
    if (!plazo) {
        errores.push("El campo 'Plazo' es obligatorio.");
        document.getElementById('plazo').style.border = '2px solid red';
    }
    if (!cedulaDeudor) {
        errores.push("El campo 'Cédula del Deudor' es obligatorio.");
        document.getElementById('cedulaDeudor').style.border = '2px solid red';
    }
    if (!estadocivil) {
        errores.push("El campo 'Estado Civil' es obligatorio.");
        document.getElementById('estado_civil').style.border = '2px solid red';
    }

    // Validaciones de cónyuge SOLO si no hay separación de bienes
    const requiereDatosConyuge = (estadocivil === "Casada/o" || estadocivil === "Unión Libre") && (separacionBienes !== "SI");

    if ((estadocivil === "Casada/o" || estadocivil === "Unión Libre") && !separacionBienesSeleccionada) {
        errores.push("El campo 'Separación de Bienes' es obligatorio.");
    }

    if (requiereDatosConyuge && !cedulaConyuge) {
        errores.push("El campo 'Cédula del Cónyuge' es obligatorio para el estado civil seleccionado.");
        document.getElementById('cedulaConyuge').style.border = '2px solid red';
    }

    if (!ingresoDeudor) {
        errores.push("El campo 'Ingreso del Deudor' es obligatorio.");
        document.getElementById('ingresoDeudor').style.border = '2px solid red';
    }

    if (document.getElementById('numerohijos').value === '') {
        errores.push("El campo 'Número de hijos' es obligatorio.");
        document.getElementById('numerohijos').style.border = '2px solid red';
    }

    if (!terminosAceptados) {
        errores.push("Debe aceptar los términos y condiciones para continuar.");
    }
    if (isNaN(montoNum) || montoNum <= 0) {
        errores.push("El campo 'Monto' no puede estar vacío y debe ser mayor que 0.");
    }
    if (!regexCedula.test(cedulaDeudor)) {
        errores.push("La cédula del deudor debe tener exactamente 10 dígitos.");
        document.getElementById('cedulaDeudor').style.border = '2px solid red';
    }

    // Validación del cónyuge SOLO si no hay separación de bienes
    if (requiereDatosConyuge && !regexCedula.test(cedulaConyuge)) {
        errores.push("La cédula del cónyuge debe tener exactamente 10 dígitos.");
        document.getElementById('cedulaConyuge').style.border = '2px solid red';
    }

    // Ingresos
    if (ingresoDeudor <= 0) {
        errores.push("El ingreso del deudor no puede ser negativo y debe ser mayor que 0.");
        document.getElementById('ingresoDeudor').style.border = '2px solid red';
    }

    if (requiereDatosConyuge && ingresoConyuge < 0) {
        errores.push("El ingreso del cónyuge no puede ser negativo.");
        document.getElementById('ingresoConyuge').style.border = '2px solid red';
    }

    if (otrosIngresos < 0) {
        errores.push("Los otros ingresos no pueden ser negativos.");
        document.getElementById('otrosIngresos').style.border = '2px solid red';
    }
    if (hijos < 0) {
        errores.push("Los hijos no pueden ser negativos.");
        document.getElementById('numerohijos').style.border = '2px solid red';
    }

    if (errores.length > 0) {
        window.alert("Corrige los siguientes errores:\n\n" + errores.join('\n'));
        resetBtn();
        return;
    }


    //Variables usadas en API y posterior
    let identificacionSujeto;
    let nombreRazonSocial;
    let identificacionConyuge;
    let nombresConyuge;
    let score;
    let scoreConyuge;
    let ctaCorrientes;
    let ctaCorrientesConyuge;
    let deudaVigenteTotal;
    let cuotaTotal;
    let deudaVigenteConyuge = 0;
    let cuotaTotalConyuge = 0;
    let numOpActuales; 
    let mesesSinVencimientos;
    let carteraCastigada;
    let demandaJudicial;
    let numOpActualesConyuge;
    let mesesSinVencimientosConyuge;
    let carteraCastigadaConyuge;
    let demandaJudicialConyuge;


    // Crear un array de promesas para las solicitudes fetch
    const fetchPromises = [];

    //Función para llamar API
    fetchPromises.push(
        fetch('https://backend-plataforma-ftw7.onrender.com/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
                     'Authorization': 'Bearer ' + localStorage.getItem('token')
           },
          body: JSON.stringify({
            "origin": "webservice",
            "request": {
              "codigoProducto": "T453",
              "datosEntrada": [
                {
                  "clave": "tipoIdentificacionSujeto",
                  "valor": "C"
                },
                {
                  "clave": "identificacionSujeto",
                  "valor": cedulaDeudor
                }
              ]
            }
          })
        })
      );
         
      // Si existe cédula del cónyuge, agregamos otra solicitud fetch para el cónyuge
      if (cedulaConyuge) {
        fetchPromises.push(
          fetch('https://backend-plataforma-ftw7.onrender.com/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json',
                       'Authorization': 'Bearer ' + localStorage.getItem('token')
             },
            body: JSON.stringify({
              "origin": "webservice",
              "request": {
                "codigoProducto": "T453",
                "datosEntrada": [
                  {
                  "clave": "tipoIdentificacionSujeto",
                  "valor": "C"
                  },
                  {
                  "clave": "identificacionSujeto",
                  "valor": cedulaConyuge
                  }
                ]
              }
            })
          })
        );
      }
     
      // Ejecutar todas las solicitudes en paralelo
      Promise.all(fetchPromises)
        .then(responses => Promise.all(responses.map(res => res.json())))
        .then(jsons => {
        const [deudorData, conyugeData] = jsons;
        console.log(deudorData);

        showAvalReport(deudorData, {
          empresa: "TÁCTIQA CAPITAL PARTNERS S.A.",
          usuario: "Jose", // o desde JWT si luego lo conectas
          fecha: new Date().toLocaleDateString("es-EC"),
          hora: new Date().toLocaleTimeString("es-EC", {
            hour: "2-digit",
            minute: "2-digit"
          })
        });
                
        // Procesar datos del deudor principal
        if (deudorData.result && deudorData.result.identificacionTitular && deudorData.result.identificacionTitular.length > 0) {
            identificacionSujeto = deudorData.result.identificacionTitular[0].identificacionSujeto;
            nombreRazonSocial = deudorData.result.identificacionTitular[0].nombreRazonSocial;
        }
        if(deudorData.result && deudorData.result.scoreFinanciero && deudorData.result.scoreFinanciero.length > 0){
            score = parseInt(deudorData.result.scoreFinanciero[0].score);
        }
        if(deudorData.result && deudorData.result.factoresScore && deudorData.result.factoresScore.length > 0){
          numOpActuales = parseInt(deudorData.result.factoresScore[0].valor);
          mesesSinVencimientos = parseInt(deudorData.result.factoresScore[2].valor);
          carteraCastigada = parseFloat(deudorData.result.factoresScore[9].valor);
          demandaJudicial= parseFloat(deudorData.result.factoresScore[8].valor);
        }
        if(deudorData.result && deudorData.result.manejoCuentasCorrientes && deudorData.result.manejoCuentasCorrientes.length > 0){
            ctaCorrientes = deudorData.result.manejoCuentasCorrientes[0].accionDescripcion
            if(!ctaCorrientes || ctaCorrientes === undefined){
              ctaCorrientes = "No posee restricción"
            }
        } else{
            ctaCorrientes = "No posee restricción";
        }
        if (deudorData.result && deudorData.result.deudaVigenteTotal) {
            deudaVigenteTotal = 0;
            deudorData.result.deudaVigenteTotal.forEach(item => {
                if (item && item.totalDeuda) {
                    deudaVigenteTotal += parseFloat(item.totalDeuda) || 0;
                }
            });
        } else {
            deudaVigenteTotal = 0;
        }
        if (deudaVigenteTotal === 0) {
            cuotaTotal = 0;
        } else if (deudorData.result && deudorData.result.gastoFinanciero && deudorData.result.gastoFinanciero.length > 0) {
            cuotaTotal = parseFloat(deudorData.result.gastoFinanciero[0].cuotaEstimadaTitular) || 0;
        };

        // Procesar datos del cónyuge si existen
        if (conyugeData) {
          if (conyugeData.result && conyugeData.result.identificacionTitular && conyugeData.result.identificacionTitular.length > 0) {
              identificacionConyuge = conyugeData.result.identificacionTitular[0].identificacionSujeto;
              nombresConyuge = conyugeData.result.identificacionTitular[0].nombreRazonSocial;
          }
          if(conyugeData.result && conyugeData.result.scoreFinanciero && conyugeData.result.scoreFinanciero.length > 0){
              scoreConyuge = parseInt(conyugeData.result.scoreFinanciero[0].score);
          }
          if(conyugeData.result && conyugeData.result.factoresScore && conyugeData.result.factoresScore.length > 0){
              numOpActualesConyuge = parseInt(conyugeData.result.factoresScore[0].valor);
              mesesSinVencimientosConyuge = parseInt(conyugeData.result.factoresScore[2].valor);
              carteraCastigadaConyuge = parseFloat(conyugeData.result.factoresScore[9].valor);
              demandaJudicialConyuge= parseFloat(conyugeData.result.factoresScore[8].valor);
          }
          if(conyugeData.result && conyugeData.result.manejoCuentasCorrientes && conyugeData.result.manejoCuentasCorrientes.length > 0){
              ctaCorrientesConyuge = conyugeData.result.manejoCuentasCorrientes[0].accionDescripcion
              if(!ctaCorrientesConyuge || ctaCorrientesConyuge === undefined){
                ctaCorrientesConyuge = "No posee restricción"
              }
          } else {
              ctaCorrientesConyuge = "No posee restricción";    
          }
          if (conyugeData.result && conyugeData.result.deudaVigenteTotal) {
              deudaVigenteConyuge = 0;
              conyugeData.result.deudaVigenteTotal.forEach(item => {
                  if (item && item.totalDeuda) {
                      deudaVigenteConyuge += parseFloat(item.totalDeuda) || 0;
                  }
              });
          } else {
              deudaVigenteConyuge = 0;
          }
    
          if (deudaVigenteConyuge === 0) {
            cuotaTotalConyuge = 0;
          } else if (conyugeData.result && conyugeData.result.gastoFinanciero && conyugeData.result.gastoFinanciero.length > 0) {
              cuotaTotalConyuge = parseFloat(conyugeData.result.gastoFinanciero[0].cuotaEstimadaTitular) || 0;
          }
          };
        
        //
        //Validaciones con datos de API 
        //

        //Validación SCORE
          function obtenerValorNumerico(categoria) {
            switch(categoria){
              case "AAA": return 3;
              case "AA": return 2;
              case "A": return 1;
              case "Analista": return 0;
              case "Rechazado": return -1;
              default: return 0;
            }
          }
       
        function obtenerDecisionFinal(score, numOpActuales, mesesSinVencimientos, carteraCastigada, demandaJudicial) {  
          let evaScore;
          if(score >=900){
            evaScore = "AAA"
          } else if( score>=800){
            evaScore = "AA"
          } else if( score>=700){
            evaScore = "A"
          } else if( score>=650){
            evaScore = "Analista"
          } else if( score < 650 && score >=1){
            evaScore = "Rechazado"
          }else if (score === 0){
            evaScore = "Analista"
          };

          let evaNumOpe;
          if(numOpActuales <= 5){
            evaNumOpe = "AAA"
          } else if(numOpActuales > 5 && numOpActuales <7){
            evaNumOpe = "AA"
          } else if(numOpActuales > 7 && numOpActuales <10){
            evaNumOpe = "A"
          } else if(numOpActuales > 10){
            evaNumOpe = "Analista"
          };

          let evaMesesSinVen;
          if(mesesSinVencimientos >= 24){
            evaMesesSinVen = "AAA"
          } else if(mesesSinVencimientos <24 && mesesSinVencimientos >=12){
            evaMesesSinVen = "AA"
          } else if(mesesSinVencimientos <12 && mesesSinVencimientos >=6){
            evaMesesSinVen = "A"
          } else if(mesesSinVencimientos <6){
            evaMesesSinVen = "Analista"
          };
                    
          if (evaScore === "Rechazado" || carteraCastigada > 0 || demandaJudicial > 0) {
            return "Rechazado";
          };

          const total = obtenerValorNumerico(evaScore) +
                obtenerValorNumerico(evaNumOpe) +
                obtenerValorNumerico(evaMesesSinVen);
          const promedio = total / 3;

          let decisionFinal;
          if (promedio >= 2.5){
            decisionFinal = "AAA";
          } else if (promedio >= 1.5){
            decisionFinal = "AA";
          } else if (promedio >= 0.5){
            decisionFinal = "A";
          } else if(promedio < 0.5){
            decisionFinal = "Analista";
          } else if (carteraCastigada > 0 || demandaJudicial > 0){
            decisionFinal = "Rechazado"
          }

          return decisionFinal;
        };      
        const evaluacionIntegral = obtenerDecisionFinal(score, numOpActuales, mesesSinVencimientos);

        let evaIntegralConyuge;

        if(cedulaConyuge){
          function obtenerDecisionFinalCyg(scoreConyuge, numOpActualesConyuge, mesesSinVencimientosConyuge, carteraCastigadaConyuge, demandaJudicialConyuge) {  
          let evaScoreCyg;
          if(scoreConyuge >=900){
            evaScoreCyg = "AAA"
          } else if( scoreConyuge>=800){
            evaScoreCyg = "AA"
          } else if( scoreConyuge>=700){
            evaScoreCyg = "A"
          } else if( scoreConyuge>=650){
            evaScoreCyg = "Analista"
          } else if( scoreConyuge < 650 && scoreConyuge >=1){
            evaScoreCyg = "Rechazado"
          } else if(scoreConyuge === 0){
            evaScoreCyg = "Analista"
          };

          let evaNumOpeCyg;
          if(numOpActualesConyuge <= 5){
            evaNumOpeCyg = "AAA"
          } else if(numOpActualesConyuge > 5 && numOpActualesConyuge <7){
            evaNumOpeCyg = "AA"
          } else if(numOpActualesConyuge > 7 && numOpActualesConyuge <10){
            evaNumOpeCyg = "A"
          } else if(numOpActualesConyuge > 10){
            evaNumOpeCyg = "Analista"
          };

          let evaMesesSinVenCyg;
          if(mesesSinVencimientosConyuge >= 24){
            evaMesesSinVenCyg = "AAA"
          } else if(mesesSinVencimientosConyuge <24 && mesesSinVencimientosConyuge >=12){
            evaMesesSinVenCyg = "AA"
          } else if(mesesSinVencimientosConyuge <12 && mesesSinVencimientosConyuge >=6){
            evaMesesSinVenCyg = "A"
          } else if(mesesSinVencimientosConyuge <6){
            evaMesesSinVenCyg = "Analista"
          };

          if (evaScoreCyg === "Rechazado" || carteraCastigadaConyuge > 0 || demandaJudicialConyuge > 0) {
            return "Rechazado";
          };

          const totalcyg = obtenerValorNumerico(evaScoreCyg) +
                obtenerValorNumerico(evaNumOpeCyg) +
                obtenerValorNumerico(evaMesesSinVenCyg);
          const promediocyg = totalcyg / 3;

          let decisionFinalcyg;
          if (promediocyg >= 2.5){
            decisionFinalcyg = "AAA";
          } else if (promediocyg >= 1.5){
            decisionFinalcyg = "AA";
          } else if (promediocyg >= 0.5){
            decisionFinalcyg = "A";
          } else if (promediocyg < 0.5){
            decisionFinalcyg = "Analista";
          } else if (carteraCastigadaConyuge > 0 || demandaJudicialConyuge > 0){
            decisionFinal = "Rechazado"
          }

          return decisionFinalcyg;
          };      
          evaIntegralConyuge = obtenerDecisionFinalCyg(scoreConyuge, numOpActualesConyuge, mesesSinVencimientosConyuge);
          };
        
        let decisionScore;
        if (evaluacionIntegral == "AAA" || evaluacionIntegral == "AA" || evaluacionIntegral == "A") {
            if (!conyugeData || evaIntegralConyuge == "AAA" || evaIntegralConyuge == "AA" || evaIntegralConyuge == "A") {
                decisionScore = "APROBADO";
            } 
            else if (evaIntegralConyuge == "Analista" || evaIntegralConyuge == "Sin Información") {
                decisionScore = "ANALISTA";
            }
            else if (evaIntegralConyuge == "Rechazado") {
                decisionScore = "RECHAZAR";
            }
        } 
        else if (evaluacionIntegral == "Analista") {
            if (!conyugeData) {
                decisionScore = "ANALISTA";
            }
            else if (evaIntegralConyuge == "AAA" || evaIntegralConyuge == "AA" || evaIntegralConyuge == "A") {
                decisionScore = "ANALISTA";
            }
            else if (evaIntegralConyuge == "Analista" || evaIntegralConyuge == "Sin Información") {
                decisionScore = "ANALISTA";
            }
            else if (evaIntegralConyuge == "Rechazado") {
                decisionScore = "RECHAZAR";
            }
        } 
        else if (evaluacionIntegral == "Rechazado") {
            decisionScore = "RECHAZAR";
        } 
        else if (evaluacionIntegral == "Sin Información") {
            if (!conyugeData) {
                decisionScore = "ANALISTA";
            }
            else if (evaIntegralConyuge == "AAA" || evaIntegralConyuge == "AA" || evaIntegralConyuge == "A") {
                decisionScore = "ANALISTA";
            }
            else if (evaIntegralConyuge == "Analista" || evaIntegralConyuge == "Sin Información") {
                decisionScore = "ANALISTA";
            }
            else if (evaIntegralConyuge == "Rechazado") {
                decisionScore = "RECHAZAR";
            }
        };
       
        //Validación Cartera Castigada
        let decisionCarteraCastigada;
        if (carteraCastigada > 0) {
            decisionCarteraCastigada = "RECHAZADO";
        } 
        else if (conyugeData && carteraCastigadaConyuge > 0) {
            decisionCarteraCastigada = "RECHAZADO";
        } 
        else {
            decisionCarteraCastigada = "OK";
        };

        //Validación Demanda Judicial
        let decisionDemandaJudicial;
        if (demandaJudicial > 0) {
          decisionDemandaJudicial = "RECHAZADO";
        } 
        else if (conyugeData && demandaJudicialConyuge > 0) {
          decisionDemandaJudicial = "RECHAZADO";
        } 
        else {
          decisionDemandaJudicial = "OK";
        };      

        // Validación y cálculo de patrimonio
        let totalPasivos = deudaVigenteTotal + deudaVigenteConyuge;
        let patrimonio = ((activos + entrada) - totalPasivos).toFixed(2);

        //Monto a financiar
        document.getElementById('monto').value = montoNum.toFixed(2);

        //Cuota financiera deudor
        document.getElementById('gastosFinancierosDeudor').value = cuotaTotal.toFixed(2);
        cuotaTotal = parseFloat(cuotaTotal);

        //Cuota financiera cónyuge
        if(conyugeData){
          document.getElementById('gastosFinancierosConyuge').value = cuotaTotalConyuge.toFixed(2);
          cuotaTotalConyuge = parseFloat(cuotaTotalConyuge);
        };        

        // Cálculo de la cuota mensual
        const interesMensual = 0.1560 / 12;

        //Cálculo de cuota final a financiar
        const gtosLegales = 970; //fideicomiso y extras o prenda y extras
        const seguroDesgravamen = (montoNum + gtosLegales) * 0.006 //0.60% tasa referencial anual
        const seguroDesgravamenMensual = seguroDesgravamen / 12; 
        const seguroVehicular = valorVehiculo * 0.0409; //4.90% tasa referencial

        // Cálculo de monto a financiar con seguros y gastos legales
        const montoTotal = montoNum + gtosLegales + seguroVehicular + dispositivo;
        const montoFinanciamiento = montoTotal + seguroDesgravamen;
        
        // Cálculo de cuota final con seguros, gastos legales y dispositivo
        const cuotaFinal = ((montoTotal * interesMensual) / (1 - Math.pow(1 + interesMensual, -plazo)) + seguroDesgravamenMensual);

 
        // Cálculo de ingresos y gastos totales
        const ingresoBruto = ingresoDeudor + ingresoConyuge + otrosIngresos;
        
        // Cálculo de gastos familiares
        const tieneConyuge = !!(cedulaConyuge && String(cedulaConyuge).trim());

        let gastosFamiliares = 200;                 
        if (tieneConyuge) gastosFamiliares += 200;  

        const hijosNum = Number(hijos) || 0;
        let numHijos = hijosNum * 200;             

        const gastosFamiliaresTotales = gastosFamiliares + numHijos;
        document.getElementById('gastosFamiliaresTotales').value = gastosFamiliaresTotales.toFixed(2); 
        const gastosTotales = cuotaTotal + cuotaTotalConyuge + gastosFamiliaresTotales;
        const ingresoNeto = ingresoBruto - gastosTotales;
        const ingresoDisponible = ingresoNeto * 0.50;
        const indicadorEndeudamiento = ingresoDisponible / cuotaFinal;
        const porcEntrada = (entrada/valorVehiculo)*100;

        //Árbol de decisión
        let decisionFinal;
        if(decisionScore == "RECHAZAR" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" ){
          decisionFinal = "RECHAZADO"
        } else if((decisionScore == "ANALISTA" || decisionScore == "APROBADO") && decisionCarteraCastigada == "RECHAZADO"){
          decisionFinal = "RECHAZADO"
        } else if((decisionScore == "ANALISTA" || decisionScore == "APROBADO") && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "RECHAZADO"){
          decisionFinal = "RECHAZADO"
        } else if(decisionScore == "ANALISTA" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio > 0 && (indicadorEndeudamiento < 1 && indicadorEndeudamiento >= 0.80)){
          decisionFinal = "ANALISTA CONDICIONADO // JUSTIFICAR INGRESOS ADICIONALES"
        } else if(decisionScore == "ANALISTA" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio > 0 && indicadorEndeudamiento <0.80){
          decisionFinal = "RECHAZADO // SIN CAPACIDAD DE PAGO"
        } else if(decisionScore == "ANALISTA" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio < 0 && (indicadorEndeudamiento < 1 && indicadorEndeudamiento >= 0.80)){
          decisionFinal = "ANALISTA CONDICIONADO // JUSTIFICAR INGRESOS ADICIONALES  // JUSTIFICAR PATRIMONIO ADICIONAL"
        } else if(decisionScore == "ANALISTA" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio < 0 && indicadorEndeudamiento <0.80){
          decisionFinal = "RECHAZADO // SIN CAPACIDAD DE PAGO // SIN PATRIMONIO"
        } else if(decisionScore == "ANALISTA" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio > 0 && (indicadorEndeudamiento < 1 && indicadorEndeudamiento >= 0.80)){
          decisionFinal = "ANALISTA CONDICIONADO // JUSTIFICAR INGRESOS ADICIONALES"
        } else if(decisionScore == "ANALISTA" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio > 0 && indicadorEndeudamiento <0.80){
          decisionFinal = "RECHAZADO // SIN CAPACIDAD DE PAGO"
        } else if(decisionScore == "ANALISTA" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio > 0 && indicadorEndeudamiento >= 1){
          decisionFinal = "PRE - APROBADO ANALISTA"
        } else if(decisionScore == "APROBADO" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio < 0 && (indicadorEndeudamiento < 1 && indicadorEndeudamiento >= 0.80)){
          decisionFinal = "PRE - APROBADO // JUSTIFICAR INGRESOS ADICIONALES // JUSTIFICAR PATRIMONIO ADICIONAL"
        } else if(decisionScore == "APROBADO" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio < 0 && indicadorEndeudamiento <0.80){
          decisionFinal = "RECHAZADO // SIN CAPACIDAD DE PAGO // SIN PATRIMONIO"
        } else if(decisionScore == "APROBADO" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio < 0 && indicadorEndeudamiento >= 1){
          decisionFinal = "PRE - APROBADO CONDICIONADO // JUSTIFICAR PATRIMONIO ADICIONAL"
        } else if(decisionScore == "APROBADO" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio > 0 && indicadorEndeudamiento <0.80){
          decisionFinal = "RECHAZADO // SIN CAPACIDAD DE PAGO"
        } else if(decisionScore == "APROBADO" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio > 0 && (indicadorEndeudamiento < 1 && indicadorEndeudamiento >= 0.80)){
          decisionFinal = "PRE - APROBADO CONDICIONADO // JUSTIFICAR INGRESOS ADICIONALES"
        } else if(decisionScore == "APROBADO" && decisionCarteraCastigada == "OK" && decisionDemandaJudicial == "OK" && patrimonio > 0 && indicadorEndeudamiento >= 1){
          decisionFinal = "PRE - APROBADO"
        } else{
          decisionFinal = "RECHAZADO"
        }

        // Crear el contenido HTML para mostrar los resultados
        const resultadosHTML = `
            <p><strong>Monto a Financiar:</strong> $${montoTotal.toFixed(2)}</p>
            <p><strong>Plazo:</strong> ${plazo} meses</p>
            <p><strong>Tasa:</strong> ${(0.1560 * 100).toFixed(2)}%</p>
            <p><strong>Cuota Mensual:</strong> $${cuotaFinal.toFixed(2)}</p>`;

        // Crear el contenido HTML para mostrar los resultados
        const FinalDecision = `
            <h3><strong>${decisionFinal}</strong>`;
        
        // Mostrar los resultados en el contenedor
        document.getElementById('resultados').innerHTML = resultadosHTML;
        document.getElementById('decision').innerHTML = FinalDecision;

        // Guardar historial en backend (best-effort, no rompe el flujo)
        try {
          if (typeof window.savePrecalificacionToHistory === 'function') {
            window.savePrecalificacionToHistory({
              fechaISO: new Date().toISOString(),
              cedulaDeudor,
              cedulaConyuge,
              marca,
              modelo,
              monto: montoTotal,
              plazo,
              cuota: cuotaFinal,
              decisionFinal,
            });
          }
        } catch (e) {
          console.warn('Historial precalificación: no se pudo guardar', e);
        }


          const doc = new jsPDF();
          const pageHeight = doc.internal.pageSize.height;
          let y = 20;

          function addLineBreak(lines = 1, lineHeight = 6) {
            y += lines * lineHeight;
            if (y > pageHeight - 20) {
              doc.addPage();
              y = 20;
            }
          }

          // Estilo general
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(12);

          // Título
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(0, 0, 128);
          doc.text('RESUMEN DE ANÁLISIS CREDITICIO', 105, y, null, null, 'center');
          addLineBreak(2);

          // DATOS DEL DEUDOR
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 128);
          doc.text('DATOS DEL DEUDOR', 14, y);
          addLineBreak();

          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          doc.text('Nombre:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${nombreRazonSocial}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Cédula:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${identificacionSujeto}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Score:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${score}`, 70, y);

          doc.setFont('helvetica', 'normal');
          doc.text('Decisión:', 110, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${evaluacionIntegral}`, 160, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('N° operaciones actuales:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${numOpActuales}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Meses sin vencimientos:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${mesesSinVencimientos}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Cartera castigada:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${carteraCastigada.toFixed(2)}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Demanda judicial:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${demandaJudicial.toFixed(2)}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Manejo cuentas corrientes:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${ctaCorrientes}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Deuda vigente total:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${deudaVigenteTotal.toFixed(2)}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Cuota estimada deudor:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${cuotaTotal.toFixed(2)}`, 70, y);
          addLineBreak(2);

          // DATOS DEL CÓNYUGE (si existen)
          if (identificacionConyuge) {
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 128);
            doc.text('DATOS DEL CÓNYUGE', 14, y);
            addLineBreak();

            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.text('Nombre:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${nombresConyuge}`, 70, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('Cédula:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${identificacionConyuge}`, 70, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('Score:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${scoreConyuge}`, 70, y);

            doc.setFont('helvetica', 'normal');
            doc.text('Decisión:', 110, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${evaIntegralConyuge}`, 160, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('N° operaciones actuales:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${numOpActualesConyuge}`, 70, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('Meses sin vencimientos:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${mesesSinVencimientosConyuge}`, 70, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('Cartera castigada:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`$${carteraCastigadaConyuge.toFixed(2)}`, 70, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('Demanda judicial:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`$${demandaJudicialConyuge.toFixed(2)}`, 70, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('Manejo cuentas corrientes:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`${ctaCorrientesConyuge}`, 70, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('Deuda vigente total:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`$${deudaVigenteConyuge.toFixed(2)}`, 70, y);
            addLineBreak();

            doc.setFont('helvetica', 'normal');
            doc.text('Cuota estimada cónyuge:', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.text(`$${cuotaTotalConyuge.toFixed(2)}`, 70, y);
            addLineBreak(2);
          }
         
          // RESUMEN DEL CRÉDITO CALCULADO
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 128);
          doc.text('DETALLES DEL CRÉDITO', 14, y);
          doc.text('DETALLES DE VEHÍCULO',104,y);
          addLineBreak();

          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);

          doc.setFont('helvetica', 'normal');
          doc.text('Monto a financiar:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${montoTotal.toFixed(2)}`, 80, y);

          doc.setFont('helvetica', 'normal');
          doc.text('Vehículo:', 110, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${marca}`, 160, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Plazo:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${plazo} meses`, 80, y);

          doc.setFont('helvetica', 'normal');
          doc.text('Modelo:', 110, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${modelo}`, 160, y);
          addLineBreak();          

          doc.setFont('helvetica', 'normal');
          doc.text('Tasa de interés:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${(0.1560 * 100).toFixed(2)}%`, 80, y);

          doc.setFont('helvetica', 'normal');
          doc.text('Valor del Vehículo:', 110, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${valorVehiculo.toFixed(2)}`, 160, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Cuota mensual estimada:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${cuotaFinal.toFixed(2)}`, 80, y);

          doc.setFont('helvetica', 'normal');
          doc.text('Entrada:', 110, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${entrada.toFixed(2)}`, 160, y);
          addLineBreak(2);

          // RESUMEN CAPACIDAD DE PAGO Y PATRIMONIO
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 128);
          doc.text('DETALLES CAPACIDAD DE PAGO', 14, y);
          doc.text('DETALLES PATRIMONIO', 104, y);
          addLineBreak();

          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);

          doc.setFont('helvetica', 'normal');
          doc.text('Ingreso Total:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${ingresoBruto.toFixed(2)}`, 70, y);

          doc.setFont('helvetica', 'normal');
          doc.text('Activos:', 110, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${activos.toFixed(2)}`, 160, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Gastos Familiares:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${gastosFamiliaresTotales.toFixed(2)}`, 70, y);

          doc.setFont('helvetica', 'normal');
          doc.text('Pasivos:', 110, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${totalPasivos.toFixed(2)}`, 160, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Obligaciones Deudor:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${cuotaTotal.toFixed(2)}`, 70, y);

          doc.setFont('helvetica', 'normal');
          doc.text('Patrimonio:', 110, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${parseFloat(patrimonio).toFixed(2)}`, 160, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Obligaciones Cónyuge:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${cuotaTotalConyuge.toFixed(2)}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Ingreso Neto:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${ingresoNeto.toFixed(2)}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Ingreso Disponible:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`$${ingresoDisponible.toFixed(2)}`, 70, y);
          addLineBreak();

          doc.setFont('helvetica', 'normal');
          doc.text('Indicador:', 20, y);
          doc.setFont('helvetica', 'bold');
          doc.text(`${indicadorEndeudamiento.toFixed(2)}`, 70, y);
          addLineBreak(2);

          // DECISIÓN FINAL EN COLOR DESTACADO
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');

          if (decisionFinal.includes("APROBADO")) {
            doc.setTextColor(0, 128, 0);
          } else if (decisionFinal.includes("ANALISTA")) {
            doc.setTextColor(255, 165, 0);
          } else {
            doc.setTextColor(255, 0, 0);
          }

          doc.text(`${decisionFinal}`, 105, y, null, null, 'center');
          addLineBreak();

          // Restaurar color para texto informativo posterior
          doc.setTextColor(0, 0, 0);

          // Pie de página
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(`Generado el ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()}`, 105, pageHeight - 10, null, null, 'center');

          const token = localStorage.getItem('token');

          // Adjuntar reporte al correo
          const nombreDocAnalisis = `Análisis Crediticio ${nombreRazonSocial}.pdf`;
          const pdfDataUriAnalisis = doc.output('datauristring');
          const pdfB64Analisis = dataUriToBase64(pdfDataUriAnalisis);

          fetch('https://backend-plataforma-ftw7.onrender.com/enviarCorreo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
              subject: `Análisis Crediticio ${nombreRazonSocial}`,
              html: `
                <h2>Precalificación generada</h2>
                <p><strong>Cliente:</strong> ${nombreRazonSocial}</p>
                <p><strong>Cédula:</strong> ${cedulaDeudor}</p>
                <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-EC')}</p>
                <p>Se adjunta el PDF del análisis crediticio.</p>
              `,
              attachments: [
                {
                  filename: nombreDocAnalisis,
                  content: pdfB64Analisis,
                  encoding: 'base64',
                  contentType: 'application/pdf'
                }
              ]
            })
          })
          .then(async (res) => {
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch { data = { ok: res.ok, raw: text }; }
            if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
            return data;
          })
          .then(data => console.log('Correo enviado:', data))
          .catch(err => console.error('Error al enviar correo:', err));
        })
        .catch(error => {
          console.error('Error en la consulta:', error);
        })
        .finally(() => {
          // Re-habilitar botón al terminar el flujo
          resetBtn("Calcular Preaprobación");
        });
    });
    
    function limpiarFormulario() {
    const inputs = document.querySelectorAll('#app-container input, #app-container select');
    inputs.forEach(input => {
        if (input.type === 'radio' || input.type === 'checkbox') {
            input.checked = false;
        } else {
            // Mantener 0 por defecto en rubros típicos
            if (['ct_accesorios','ct_total_otros'].includes(input.id)) {
              input.value = '0';
            } else {
              input.value = '';
            }
        }
    });
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    setVal('monto', '');
    setVal('gastosFamiliaresTotales', '');
    setVal('gastosFinancierosDeudor', '');
    setVal('gastosFinancierosConyuge', '');

    setHtml('resultados', '');
    setHtml('decision', '');
    setHtml('ct_resultados', '');
    setHtml('ct_decision', '');

    // Limpiar y ocultar el reporte AVAL (solo precalificación)
    const avalSection = document.getElementById('aval-report');
    if (avalSection) avalSection.style.display = 'none';
    setHtml('aval-report-content', '');

    const btn = document.getElementById('calcularBtn');
    if (btn) {
      btn.disabled = false;
      btn.innerText = "Calcular Preaprobación";
    }

    const btnCt = document.getElementById('ct_cotizarBtn');
    if (btnCt) {
      btnCt.disabled = false;
      btnCt.innerText = "Cotizar";
    }
    }

    // Evita error si el botón no existe en alguna vista
    const __newQueryBtn = document.getElementById('new-query-btn');
    if (__newQueryBtn) __newQueryBtn.addEventListener('click', limpiarFormulario);

    // Botón "Limpiar formulario" en Precalificación
    const __precalBtnLimpiar = document.getElementById('precalBtnLimpiar');
    if (__precalBtnLimpiar) __precalBtnLimpiar.addEventListener('click', limpiarFormulario);

    let timeoutInactividad;

    function reiniciarTemporizador() {
        clearTimeout(timeoutInactividad);
        timeoutInactividad = setTimeout(cerrarSesionAutomatica, 30 * 60 * 1000);
    }

    function cerrarSesionAutomatica() {
        alert("Sesión cerrada por inactividad.");
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('login-container').style.display = 'block';
        localStorage.removeItem('token');
        limpiarFormulario();
    }

    ['click', 'mousemove', 'keydown'].forEach(event => {
        document.addEventListener(event, reiniciarTemporizador);
    });

    reiniciarTemporizador();

// ===============================
// Navegación de vistas (Cotizador / Precalificación / Historial)
// ===============================
(function initNavViews() {
  const navCot = document.getElementById('nav-cotizador');
  const navPre = document.getElementById('nav-precalificacion');
  const navHis = document.getElementById('nav-historial');

  const vCot = document.getElementById('view-cotizador');
  const vPre = document.getElementById('view-precalificacion');
  const vHis = document.getElementById('view-historial');

  function setActive(id) {
    ['nav-cotizador','nav-precalificacion','nav-historial'].forEach((x) => {
      const b = document.getElementById(x);
      if (b) b.classList.toggle('is-active', x === id);
    });
  }

  function show(view) {
    if (vCot) vCot.style.display = (view === 'cot') ? 'block' : 'none';
    if (vPre) vPre.style.display = (view === 'pre') ? 'block' : 'none';
    if (vHis) vHis.style.display = (view === 'his') ? 'block' : 'none';

    const title = document.getElementById('view-title');
    if (title) title.innerText = (view === 'cot') ? 'Cotizador' : (view === 'pre') ? 'Precalificación' : 'Historial';
  }

  if (navCot) navCot.addEventListener('click', () => { show('cot'); setActive('nav-cotizador'); });
  if (navPre) navPre.addEventListener('click', () => { show('pre'); setActive('nav-precalificacion'); });
  if (navHis) navHis.addEventListener('click', () => { show('his'); setActive('nav-historial'); renderPrecalHistory(); });

  // Botones dentro de historial
  const histList = document.getElementById('hist_list');
  if (histList) {
    histList.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const del = t.getAttribute('data-hist-del');
      const load = t.getAttribute('data-hist-load');
      if (del) deletePrecalHistoryItem(del);
      if (load) { loadHistoryItemToForm(load); show('pre'); setActive('nav-precalificacion'); }
    });
  }

  const btnClear = document.getElementById('hist_limpiar');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (confirm('¿Seguro que deseas limpiar todo el historial?')) clearPrecalHistory();
    });
  }
})();
