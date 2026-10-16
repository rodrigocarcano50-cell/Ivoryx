// ===============================
// PARA QUE SE CIERRE EL MENU HAMBURGUESA
// ===============================
const menuCheckbox = document.getElementById('menu');
const menuLinks = document.querySelectorAll('.barraLinks a');

menuLinks.forEach(link => {
  link.addEventListener('click', () => {
    menuCheckbox.checked = false;
  });
});


// ===============================
// SOMBRA EN LA BARRA AL HACER SCROLL
// ===============================
const header = document.getElementById('header');

function revisarScroll() {
  header.classList.toggle('scrolled', window.scrollY > 10);
}

window.addEventListener('scroll', revisarScroll, { passive: true });
revisarScroll();


// ===============================
// EQUIPOS DISPONIBLES (se leen de Supabase)
// ===============================
const equiposGrid = document.getElementById('equiposGrid');
const equiposEstado = document.getElementById('equiposEstado');

// Una foto sola, o un carrusel que se pasa deslizando con el dedo si hay varias
function fotosTarjeta(urls, alt) {
  const img = (u, extra = '') => `<img src="${Ivoryx.escapar(u)}" alt="${Ivoryx.escapar(alt)}${extra}" loading="lazy" draggable="false">`;
  if (urls.length < 2) return img(urls[0]);
  return `
    <div class="carrusel">
      <div class="carruselPista" tabindex="0" aria-label="${urls.length} fotos: deslizá para verlas">
        ${urls.map((u, i) => img(u, ` (foto ${i + 1} de ${urls.length})`)).join('')}
      </div>
      <div class="carruselPuntos" aria-hidden="true">
        ${urls.map((_, i) => `<span${i === 0 ? ' class="activo"' : ''}></span>`).join('')}
      </div>
    </div>`;
}

// Los puntitos siguen a la foto que se está viendo
document.addEventListener('scroll', (e) => {
  const pista = e.target;
  if (!pista.classList?.contains('carruselPista')) return;
  const actual = Math.round(pista.scrollLeft / pista.clientWidth);
  pista.nextElementSibling.querySelectorAll('span').forEach((punto, i) => punto.classList.toggle('activo', i === actual));
}, true);

// En la compu también se puede arrastrar con el mouse
let ultimoArrastre = 0;
document.addEventListener('pointerdown', (e) => {
  const pista = e.target.closest('.carruselPista');
  if (!pista || e.pointerType !== 'mouse' || e.button !== 0) return;
  e.preventDefault();
  const inicioX = e.clientX;
  const inicioScroll = pista.scrollLeft;
  pista.classList.add('arrastrando');
  const mover = (ev) => { pista.scrollLeft = inicioScroll - (ev.clientX - inicioX); };
  const soltar = (ev) => {
    document.removeEventListener('pointermove', mover);
    document.removeEventListener('pointerup', soltar);
    const ancho = pista.clientWidth;
    const dx = ev.clientX - inicioX;
    // Con un arrastre corto alcanza para pasar a la foto siguiente o anterior
    if (Math.abs(dx) > 5) ultimoArrastre = Date.now();
    const destino = Math.abs(dx) > ancho * 0.15 ? Math.round(inicioScroll / ancho) - Math.sign(dx) : Math.round(inicioScroll / ancho);
    pista.classList.remove('arrastrando');
    pista.scrollTo({ left: destino * ancho, behavior: 'smooth' });
  };
  document.addEventListener('pointermove', mover);
  document.addEventListener('pointerup', soltar);
});

function infoEquipo(p) {
  const reservado = p.estado === 'reservado';
  const nombre = Ivoryx.titulo(p);
  const urls = Ivoryx.fotos(p);
  const foto = urls.length ? fotosTarjeta(urls, `${nombre} ${p.color || ''}`.trim()) : Ivoryx.dibujoIphone(p);

  const bateria = Number(p.bateria) > 0 ? Math.min(100, Number(p.bateria)) : null;
  const datos = [
    p.condicion && `<div><dt>Condición</dt><dd>${Ivoryx.escapar(p.condicion)}</dd></div>`,
    bateria && `<div><dt>Batería</dt><dd><span class="bateria${bateria < 80 ? ' bateriaBaja' : ''}" aria-hidden="true"><span style="width:${bateria}%"></span></span>${bateria}%</dd></div>`
  ].filter(Boolean).join('');

  const mensaje = reservado
    ? `Hola! Vi que el ${nombre} ${p.color || ''} está reservado. ¿Tenés algo parecido?`
    : `Hola! Me interesa el ${nombre} ${p.color || ''} que vi en la web (${Ivoryx.precio(p)}). ¿Sigue disponible?`;

  return { reservado, foto, datos, mensaje };
}

function tarjetaEquipo(p, orden) {
  const { reservado, foto, datos, mensaje } = infoEquipo(p);
  return `
    <article class="equipo${reservado ? ' equipoReservado' : ''}" style="--orden:${orden}" data-detalle="equipo" data-indice="${orden}">
      <div class="equipoFoto">
        ${foto}
        ${reservado ? '<span class="equipoMarca">Reservado</span>' : ''}
      </div>
      <div class="equipoInfo">
        <h3><button type="button" class="tarjetaAbrir">${Ivoryx.escapar(p.modelo)}</button></h3>
        <p class="equipoSpecs">${[p.capacidad, p.color].filter(Boolean).map(Ivoryx.escapar).join(' · ')}</p>
        ${datos ? `<dl class="equipoDatos">${datos}</dl>` : ''}
        ${p.detalle ? `<p class="equipoDetalle">${Ivoryx.escapar(p.detalle)}</p>` : ''}
        <div class="equipoPie">
          <span class="equipoPrecio">${Ivoryx.precio(p)}</span>
          <a class="equipoCta" href="${Ivoryx.enlaceWhatsapp(mensaje)}" target="_blank" rel="noopener">
            ${reservado ? 'Pedir similar' : 'Consultar'}
          </a>
        </div>
      </div>
    </article>`;
}

let equiposVisibles = [];

async function mostrarEquipos() {
  let lista;
  try {
    lista = await Ivoryx.cargar();
  } catch (error) {
    console.error(error);
    equiposEstado.innerHTML = 'No pudimos cargar los equipos. <a href="https://wa.me/5492617501979" target="_blank" rel="noopener">Consultá el stock por WhatsApp</a>.';
    return;
  }

  const productos = lista
    .filter(p => p.estado !== 'vendido')
    // Primero los disponibles, después por precio
    .sort((a, b) => (a.estado === 'reservado') - (b.estado === 'reservado') || (a.precio || 0) - (b.precio || 0));

  if (productos.length === 0) {
    equiposEstado.textContent = 'Ahora mismo estamos renovando el stock. Escribinos y te contamos qué equipos entran esta semana.';
    return;
  }

  equiposEstado.hidden = true;
  equiposVisibles = productos;
  equiposGrid.innerHTML = productos.map(tarjetaEquipo).join('');
  animarGrilla(equiposGrid);
}

// Las tarjetas entran escalonadas la primera vez que la grilla aparece en pantalla
function animarGrilla(grilla) {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const observer = new IntersectionObserver((entradas) => {
    if (entradas[0].isIntersecting) {
      grilla.classList.add('entra');
      observer.disconnect();
    }
  }, { threshold: 0.1 });
  observer.observe(grilla);
}

mostrarEquipos();


// ===============================
// ACCESORIOS (las tarjetas se editan en el admin: Stock de accesorios → Muestra)
// ===============================
const accGrid = document.getElementById('accGrid');
const accEstado = document.getElementById('accEstado');

// Foto de muestra mientras no se suba una desde el admin
const ACC_FOTOS = { silicona: 'funda.png', magsafe: 'funda.png', cargador: 'cargador.png', airpods: 'airpods.gif', templados: 'protector.webp' };

function infoAccesorio(a) {
  const urls = Ivoryx.fotos(a);
  return {
    foto: fotosTarjeta(urls.length ? urls : [ACC_FOTOS[a.id] || 'cargador.png'], a.titulo),
    precio: Number(a.precio) > 0 ? Ivoryx.precio({ precio: Number(a.precio), moneda: 'ARS' }) : ''
  };
}

function tarjetaAccesorio(a, orden) {
  const { foto, precio } = infoAccesorio(a);
  return `
    <article class="acc" style="--orden:${orden}" data-detalle="accesorio" data-indice="${orden}">
      <div class="accFoto">${foto}</div>
      <div class="accInfo">
        <h3><button type="button" class="tarjetaAbrir">${Ivoryx.escapar(a.titulo)}</button></h3>
        ${a.descripcion ? `<p class="accDescripcion">${Ivoryx.escapar(a.descripcion)}</p>` : ''}
        <div class="equipoPie">
          ${precio ? `<span class="accPrecio"><small>desde</small> ${precio}</span>` : '<span></span>'}
          <a class="equipoCta" href="${Ivoryx.enlaceWhatsapp(a.mensaje)}" target="_blank" rel="noopener">Consultar</a>
        </div>
      </div>
    </article>`;
}

let accesoriosVisibles = [];

async function mostrarAccesorios() {
  const { data, error } = await Ivoryx.db.from('vitrina').select('id, titulo, descripcion, precio, mensaje, imagen, imagenes').order('orden');
  if (error || !data.length) {
    if (error) console.error(error);
    accEstado.innerHTML = 'Consultá los accesorios disponibles <a href="https://wa.me/5492617501979" target="_blank" rel="noopener">por WhatsApp</a>.';
    return;
  }
  accEstado.hidden = true;
  accesoriosVisibles = data;
  accGrid.innerHTML = data.map(tarjetaAccesorio).join('');
  animarGrilla(accGrid);
}

mostrarAccesorios();


// ===============================
// VISTA EN GRANDE: al tocar un equipo o un accesorio
// La flecha "Volver" (o el gesto de volver del celular) la cierra
// ===============================
const detalle = document.createElement('div');
detalle.className = 'detalle';
detalle.hidden = true;
detalle.setAttribute('role', 'dialog');
detalle.setAttribute('aria-modal', 'true');
detalle.setAttribute('aria-labelledby', 'detalleTitulo');
document.body.appendChild(detalle);
let tarjetaOrigen = null;

const FLECHA_VOLVER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function marcoDetalle({ foto, extraFoto = '', clase = '', info }) {
  return `
    <div class="detallePanel${clase}">
      <div class="detalleBarra">
        <button type="button" class="detalleVolver" data-volver>${FLECHA_VOLVER}Volver</button>
      </div>
      <div class="detalleCuerpo">
        <div class="detalleFoto">${foto}${extraFoto}</div>
        <div class="detalleInfo">${info}</div>
      </div>
    </div>`;
}

function detalleEquipo(p) {
  const { reservado, foto, datos, mensaje } = infoEquipo(p);
  return marcoDetalle({
    foto,
    extraFoto: reservado ? '<span class="equipoMarca">Reservado</span>' : '',
    clase: reservado ? ' equipoReservado' : '',
    info: `
      <h2 id="detalleTitulo">${Ivoryx.escapar(p.modelo)}</h2>
      <p class="equipoSpecs">${[p.capacidad, p.color].filter(Boolean).map(Ivoryx.escapar).join(' · ')}</p>
      ${datos ? `<dl class="equipoDatos">${datos}</dl>` : ''}
      ${p.detalle ? `<p class="detalleTexto">${Ivoryx.escapar(p.detalle)}</p>` : ''}
      <div class="detallePie">
        <span class="equipoPrecio">${Ivoryx.precio(p)}</span>
        <a class="equipoCta" href="${Ivoryx.enlaceWhatsapp(mensaje)}" target="_blank" rel="noopener">${reservado ? 'Pedir similar' : 'Consultar por WhatsApp'}</a>
      </div>`
  });
}

function detalleAccesorio(a) {
  const { foto, precio } = infoAccesorio(a);
  return marcoDetalle({
    foto,
    info: `
      <h2 id="detalleTitulo">${Ivoryx.escapar(a.titulo)}</h2>
      ${a.descripcion ? `<p class="detalleTexto">${Ivoryx.escapar(a.descripcion)}</p>` : ''}
      <div class="detallePie">
        ${precio ? `<span class="accPrecio"><small>desde</small> ${precio}</span>` : '<span></span>'}
        <a class="equipoCta" href="${Ivoryx.enlaceWhatsapp(a.mensaje)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>
      </div>`
  });
}

function abrirDetalle(tarjeta) {
  const equipo = tarjeta.dataset.detalle === 'equipo';
  const item = (equipo ? equiposVisibles : accesoriosVisibles)[Number(tarjeta.dataset.indice)];
  if (!item) return;
  detalle.innerHTML = equipo ? detalleEquipo(item) : detalleAccesorio(item);
  detalle.hidden = false;
  document.documentElement.classList.add('conDetalle');
  tarjetaOrigen = tarjeta;
  // Así el botón o el gesto de "atrás" del celular cierran la vista en vez de salir de la página
  history.pushState({ detalle: true }, '');
  detalle.querySelector('.detalleVolver').focus({ preventScroll: true });
}

function cerrarDetalle() {
  if (detalle.hidden) return;
  detalle.hidden = true;
  detalle.innerHTML = '';
  document.documentElement.classList.remove('conDetalle');
  tarjetaOrigen?.querySelector('.tarjetaAbrir')?.focus({ preventScroll: true });
}

const volverDetalle = () => (history.state?.detalle ? history.back() : cerrarDetalle());

document.addEventListener('click', (e) => {
  const tarjeta = e.target.closest('[data-detalle]');
  if (!tarjeta || e.target.closest('a') || Date.now() - ultimoArrastre < 400) return;
  abrirDetalle(tarjeta);
});

// La flecha, o un clic en el fondo oscuro (en la compu)
detalle.addEventListener('click', (e) => {
  if (e.target.closest('[data-volver]') || e.target === detalle) volverDetalle();
});
addEventListener('popstate', cerrarDetalle);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !detalle.hidden) volverDetalle();
});
