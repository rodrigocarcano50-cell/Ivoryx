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

function tarjetaEquipo(p, orden) {
  const reservado = p.estado === 'reservado';
  const nombre = Ivoryx.titulo(p);
  const foto = p.imagen
    ? `<img src="${Ivoryx.escapar(p.imagen)}" alt="${Ivoryx.escapar(nombre)} ${Ivoryx.escapar(p.color)}" loading="lazy">`
    : Ivoryx.dibujoIphone(p);

  const bateria = Number(p.bateria) > 0 ? Math.min(100, Number(p.bateria)) : null;
  const datos = [
    p.condicion && `<div><dt>Condición</dt><dd>${Ivoryx.escapar(p.condicion)}</dd></div>`,
    bateria && `<div><dt>Batería</dt><dd><span class="bateria${bateria < 80 ? ' bateriaBaja' : ''}" aria-hidden="true"><span style="width:${bateria}%"></span></span>${bateria}%</dd></div>`
  ].filter(Boolean).join('');

  const mensaje = reservado
    ? `Hola! Vi que el ${nombre} ${p.color || ''} está reservado. ¿Tenés algo parecido?`
    : `Hola! Me interesa el ${nombre} ${p.color || ''} que vi en la web (${Ivoryx.precio(p)}). ¿Sigue disponible?`;

  return `
    <article class="equipo${reservado ? ' equipoReservado' : ''}" style="--orden:${orden}">
      <div class="equipoFoto">
        ${foto}
        ${reservado ? '<span class="equipoMarca">Reservado</span>' : ''}
      </div>
      <div class="equipoInfo">
        <h3>${Ivoryx.escapar(p.modelo)}</h3>
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
// ACCESORIOS (las tarjetas se editan en el admin: "Accesorios en la web")
// ===============================
const accGrid = document.getElementById('accGrid');
const accEstado = document.getElementById('accEstado');

// Foto de muestra mientras no se suba una desde el admin
const ACC_FOTOS = { silicona: 'funda.png', magsafe: 'funda.png', cargador: 'cargador.png', airpods: 'airpods.gif', templados: 'protector.webp' };

function tarjetaAccesorio(a, orden) {
  const foto = a.imagen || ACC_FOTOS[a.id] || 'cargador.png';
  const precio = Number(a.precio) > 0 ? Ivoryx.precio({ precio: Number(a.precio), moneda: 'ARS' }) : '';
  return `
    <article class="acc" style="--orden:${orden}">
      <div class="accFoto"><img src="${Ivoryx.escapar(foto)}" alt="${Ivoryx.escapar(a.titulo)}" loading="lazy"></div>
      <div class="accInfo">
        <h3>${Ivoryx.escapar(a.titulo)}</h3>
        ${a.descripcion ? `<p class="accDescripcion">${Ivoryx.escapar(a.descripcion)}</p>` : ''}
        <div class="equipoPie">
          ${precio ? `<span class="accPrecio"><small>desde</small> ${precio}</span>` : '<span></span>'}
          <a class="equipoCta" href="${Ivoryx.enlaceWhatsapp(a.mensaje)}" target="_blank" rel="noopener">Consultar</a>
        </div>
      </div>
    </article>`;
}

async function mostrarAccesorios() {
  const { data, error } = await Ivoryx.db.from('vitrina').select('id, titulo, descripcion, precio, mensaje, imagen').order('orden');
  if (error || !data.length) {
    if (error) console.error(error);
    accEstado.innerHTML = 'Consultá los accesorios disponibles <a href="https://wa.me/5492617501979" target="_blank" rel="noopener">por WhatsApp</a>.';
    return;
  }
  accEstado.hidden = true;
  accGrid.innerHTML = data.map(tarjetaAccesorio).join('');
  animarGrilla(accGrid);
}

mostrarAccesorios();
