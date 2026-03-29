// core/documentos/generarHTMLPlanLocal.js
// Extraído de index.html — generarHTMLPlanLocal(completo)
// Depende de globals: getMunicipioActual, getNombreMunicipio, planLocalSalud,
//   accionesAgenda, window.datosParticipacionCiudadana,
//   generarPortadaPLS, generarAgendaCompletaPorEntorno,
//   generarConclusionesCompletasPDF, generarCronogramaCompilado,
//   generarDeterminantesCompletosPDF, generarSeccionParticipacionCiudadanaPDF

function generarHTMLPlanLocal(completo) {

    const municipio = getMunicipioActual();

    const nombre = getNombreMunicipio(municipio);

    

    // Usar datos del compilador si están disponibles

    const acciones = planLocalSalud.agenda.completado ? planLocalSalud.agenda.actuaciones : (accionesAgenda || []);

    const planAccionHTML = planLocalSalud.planAccion.completado ? planLocalSalud.planAccion.html : null;

    

    // Portada

    let html = '';

    if (completo) {

        html += generarPortadaPLS(nombre);

    }

    

    html += '<div class="doc">';

    

    // ==========================================

    // PARTE 1: PERFIL DE SALUD LOCAL (COMPLETO)

    // ==========================================

    html += '<section class="seccion">';

    html += '<div class="sec-header perfil"><div class="sec-num">01</div><div class="sec-pre">Parte Primera</div><h2 class="sec-titulo">Perfil de salud local de ' + nombre + '</h2></div>';

    html += '<div class="sec-body">';

    

    // 1.1 Marco estratégico (contenido dinámico completo)

    html += '<div class="sub"><div class="sub-header"><div class="sub-icon blue">🎯</div><h3 class="sub-titulo">Marco estratégico de la acción local en salud</h3></div>';

    

    // Obtener configuración del municipio

    const configMarcoPDF = {

        municipio: nombre,

        distrito: 'Distrito sanitario Granada-Metropolitano',

        anioInforme: (datosMunicipioActual && datosMunicipioActual.anioInforme) || new Date().getFullYear(),

        anioEncuesta: (datosMunicipioActual && datosMunicipioActual.anioEncuesta) || (new Date().getFullYear() - 1),

        mesPriorizacion: (datosMunicipioActual && datosMunicipioActual.mesPriorizacion) || 'febrero',

        anioPriorizacion: (datosMunicipioActual && datosMunicipioActual.anioPriorizacion) || new Date().getFullYear(),

        lineasEstrategia: (datosMunicipioActual && datosMunicipioActual.lineasEstrategia) || '1, 3 y 4'

    };

    

    html += '<p>Este informe ha sido elaborado por profesionales de la <strong>Unidad de Prevención, Promoción y Vigilancia de la Salud</strong> del <strong>' + configMarcoPDF.distrito + '</strong>, en el marco de la <strong>Estrategia de promoción de una vida saludable en Andalucía</strong> (la Estrategia en adelante), que promueve la <strong>Consejería de Salud y Consumo</strong>, a través de la <strong>Dirección General de salud pública y ordenación farmacéutica</strong>, con el objetivo de mejorar la salud y el bienestar de la población andaluza, e incluye la información epidemiológica más reciente y relevante de <strong>' + nombre + '</strong>, además de alguna información de utilidad sobre programas de salud y sobre hábitos de vida saludable.</p>';

    html += '<div class="dest dest-azul"><strong>La Estrategia pretende promover los hábitos saludables en toda la población y edades</strong>, mediante intervenciones en el <strong>ámbito local</strong>, en <strong>todos los entornos de vida</strong> y en <strong>todas las políticas y actuaciones sobre los determinantes que generan desigualdades en salud</strong>. Así mismo, propone <strong>potenciar los activos personales y comunitarios</strong> que generan salud a lo largo de la vida, para que la ciudadanía pueda afrontar el día a día con <strong>mayores cotas de bienestar</strong>.</div>';

    html += '<p>El <strong>Informe sobre la situación de salud de ' + nombre + ' (' + configMarcoPDF.anioInforme + ')</strong> y la <strong>Encuesta local de salud de ' + nombre + ' (' + configMarcoPDF.anioEncuesta + ')</strong> han facilitado el paso del diagnóstico a la acción. De acuerdo con lo acordado por el Grupo-Motor en su sesión de priorización del mes de <strong>' + configMarcoPDF.mesPriorizacion + ' de ' + configMarcoPDF.anioPriorizacion + '</strong>, se adaptará el diseño del plan de acción a las <strong>líneas ' + configMarcoPDF.lineasEstrategia + '</strong> de la Estrategia, situando la <strong>percepción de calidad de vida y el bienestar emocional</strong> en el centro neurálgico del plan.</p>';

    html += '<p>Al acompasar el Plan local de salud de ' + nombre + ' a la Estrategia, se incorporan de manera automática al mismo las <strong>líneas estratégicas</strong>, los <strong>objetivos</strong> seleccionados dentro de cada línea y los <strong>indicadores de contexto e impacto</strong> vinculados a cada objetivo. Lo que debería permitir no solo el seguimiento y la evaluación, sino también la <strong>comparación de resultados con otros territorios de referencia</strong>.</p>';

    html += '<h4 style="margin:1.5rem 0 0.75rem;color:#1e293b;">Fuentes de información</h4>';

    html += '<p>El informe incorpora una <strong>herramienta para el seguimiento y la evaluación</strong>, y se ha construido a partir de información disponible en fuentes oficiales como el <strong>Instituto Nacional de Estadística (INE)</strong> o el <strong>Instituto de Estadística y Cartografía de Andalucía (IECA)</strong>, así como también en fuentes propias del sistema sanitario Público de Andalucía (<strong>INFOWEB, BPS, Registro Andaluz de Cáncer y el Módulo IAHS de Diraya</strong>).</p>';

    html += '</div>';

    

    // 1.2 Informe epidemiológico COMPLETO

    html += '<div class="sub ' + (completo ? 'page-break' : '') + '"><div class="sub-header"><div class="sub-icon blue">📊</div><h3 class="sub-titulo">Informe sobre la Situación de Salud</h3></div>';

    // Usar el informe desde Firebase

    if (datosMunicipioActual && datosMunicipioActual.informe && datosMunicipioActual.informe.htmlCompleto) {

        html += '<div class="compas-informe-html">' + datosMunicipioActual.informe.htmlCompleto + '</div>';

    } else {

        html += '<div class="dest dest-rojo"><strong>⚠️ Contenido pendiente:</strong> Carga los datos del informe epidemiológico en la Fase 2.</div>';

    }

    html += '</div>';

    

    // 1.3 DETERMINANTES COMPLETOS (las 3 áreas)

    html += '<div class="sub ' + (completo ? 'page-break' : '') + '"><div class="sub-header"><div class="sub-icon" style="background:rgba(102,126,234,0.1);">📈</div><h3 class="sub-titulo">Determinantes de la salud</h3></div>';

    html += '<div class="dest" style="background:linear-gradient(135deg,rgba(102,126,234,0.1),rgba(118,75,162,0.05));border-color:#0074c8;"><strong>📊 Valores estimados mediante reponderación Bettersurveys</strong><br>Estimaciones territoriales a partir de la Encuesta Andaluza de Salud 2023 para el municipio de <strong>' + nombre + '</strong>. Los valores se comparan con las referencias provinciales (Granada) y autonómicas (Andalucía).</div>';

    html += generarDeterminantesCompletosPDF();

    html += '</div>';

    

    // 1.4 Estudios complementarios (si existen)

    var _estudiosElPDF = document.getElementById('seccion-estudios-complementarios');

    var _estudiosHTMLPDF = _estudiosElPDF && _estudiosElPDF.innerHTML.trim();

    var _estudiosContenido = (_estudiosHTMLPDF && _estudiosHTMLPDF.length > 30 && !_estudiosHTMLPDF.includes('Carga el') && !_estudiosHTMLPDF.includes('Sin estudios')) ? _estudiosHTMLPDF : null;

    html += '<div class="sub ' + (completo ? 'page-break' : '') + '"><div class="sub-header"><div class="sub-icon" style="background:rgba(3,105,161,0.1);">🧠</div><h3 class="sub-titulo">Estudios complementarios (IBSE y otros)</h3></div>';

    html += _estudiosContenido || '<div class="dest" style="background:#fef9c3;border-color:#fcd34d;color:#92400e;"><em>📋 Sección pendiente: Estudios complementarios — carga archivos IBSE u otros en ⚙️ Gestionar fuentes si dispones de ellos.</em></div>';

    html += '</div>';



    // 1.5 Prioridades ciudadanas (RELAS / EPVSA)

    html += '<div class="sub"><div class="sub-header"><div class="sub-icon orange">🗳️</div><h3 class="sub-titulo">Prioridades ciudadanas</h3></div>';

    if (window.datosParticipacionCiudadana && typeof generarSeccionParticipacionCiudadanaPDF === 'function') {

        html += generarSeccionParticipacionCiudadanaPDF();

    } else {

        html += '<div class="dest" style="background:#fef9c3;border-color:#fcd34d;color:#92400e;"><em>📋 Sección pendiente: Prioridades ciudadanas — incorpora resultados desde Tab 3 (EPVSA o RELAS).</em></div>';

    }

    html += '</div>';



    // 1.6 Conclusiones y Recomendaciones — generadas en Tab 1 (analisisIA)

    var _iaPDF = datosMunicipioActual && datosMunicipioActual.analisisIA;

    html += '<div class="sub ' + (completo ? 'page-break' : '') + '"><div class="sub-header"><div class="sub-icon blue">💡</div><h3 class="sub-titulo">Conclusiones y Recomendaciones <small style="font-size:0.68rem;background:#e0e7ff;color:#3730a3;padding:0.1rem 0.4rem;border-radius:6px;font-weight:600;vertical-align:middle;">IA · Tab 1</small></h3></div>';

    if (_iaPDF && typeof generarConclusionesCompletasPDF === 'function') {

        html += generarConclusionesCompletasPDF(_iaPDF.conclusiones, _iaPDF.recomendaciones, nombre);

    } else if (_iaPDF) {

        html += '<p style="color:#475569;">Análisis disponible. Exporta el documento completo para ver el contenido formateado.</p>';

    } else {

        html += '<div class="dest" style="background:#fef9c3;border-color:#fcd34d;color:#92400e;"><strong>⚠️ Genera primero el análisis en Tab 1</strong> — abre el acordeón "07 🧠 Conclusiones, recomendaciones y prioridades" y pulsa "Generar análisis con IA".</div>';

    }

    html += '</div>';

    

    html += '</div></section>';

    

    // ==========================================

    // PARTE 2: PLAN DE ACCIÓN (COMPLETO)

    // ==========================================

    html += '<section class="seccion ' + (completo ? 'page-break' : '') + '">';

    html += '<div class="sec-header plan"><div class="sec-num">02</div><div class="sec-pre">Parte Segunda</div><h2 class="sec-titulo">Plan de acción 2026-2030</h2></div>';

    html += '<div class="sec-body">';

    

    if (planAccionHTML) {

        // Incluir el plan de acción completo generado en Fase 3

        html += '<div class="plan-accion-completo">' + planAccionHTML + '</div>';

    } else {

        html += '<div class="dest dest-rojo"><strong>⚠️ Contenido pendiente:</strong> Genera el Plan de acción completo en la Fase 3.</div>';

    }

    

    html += '</div></section>';

    

    // ==========================================

    // PARTE 3: AGENDA ANUAL 2026 (COMPLETA)

    // ==========================================

    html += '<section class="seccion ' + (completo ? 'page-break' : '') + '">';

    html += '<div class="sec-header agenda"><div class="sec-num">03</div><div class="sec-pre">Parte Tercera</div><h2 class="sec-titulo">Agenda anual Municipal 2026</h2></div>';

    html += '<div class="sec-body">';

    

    if (acciones.length > 0) {

        html += '<p>la Agenda anual 2026 incluye <strong>' + acciones.length + ' actuaciones</strong> distribuidas en los cuatro entornos de intervención.</p>';

        

        // Generar tabla completa de actuaciones por entorno

        html += generarAgendaCompletaPorEntorno(acciones);

        

        // Cronograma

        html += '<div class="sub ' + (completo ? 'page-break' : '') + '"><div class="sub-header"><div class="sub-icon orange">📆</div><h3 class="sub-titulo">Cronograma por Trimestres</h3></div>';

        html += generarCronogramaCompilado(acciones);

        html += '</div>';

    } else {

        html += '<div class="dest dest-rojo"><strong>⚠️ Contenido pendiente:</strong> Añada actuaciones a la Agenda en la Fase 5.</div>';

    }

    

    html += '</div></section>';

    

    // Footer

    html += '<footer class="doc-footer">';

    html += '<p><strong>Plan local de salud de ' + nombre + ' 2026-2030</strong></p>';

    html += '<p>Elaborado en el marco de la Estrategia de promoción de una vida saludable en Andalucía (EPVSA)</p>';

    html += '<p style="margin-top:0.75rem;">Unidad de Prevención, Promoción y Vigilancia de la Salud</p>';

    html += '<p>Distrito sanitario Granada-Metropolitano · Servicio Andaluz de Salud</p>';

    html += '<p style="margin-top:0.75rem;font-size:0.7rem;">' + (typeof COMPAS_VERSION !== 'undefined' ? COMPAS_VERSION.docFooter : 'Documento generado con COMPÁS') + '</p>';

    html += '</footer>';

    html += '</div>';

    

    return html;

}

// Exposición global para call sites en index.html
window.__COMPAS_generarHTMLPlanLocal = generarHTMLPlanLocal;
