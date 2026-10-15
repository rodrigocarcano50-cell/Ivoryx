// ===============================
// CARRUSEL DE ACCESORIOS
// ===============================
const carrusel = document.querySelector('.carrusel');
const slides = Array.from(carrusel.children);
const puntosBox = document.querySelector('.carruselPuntos');

let index = 1;
let autoPlay;
let enMovimiento = false;
const delay = 3000;
const transitionTime = 700;

// Clonamos primero y último para el loop infinito
const firstClone = slides[0].cloneNode(true);
const lastClone = slides[slides.length - 1].cloneNode(true);

carrusel.appendChild(firstClone);
carrusel.insertBefore(lastClone, slides[0]);

// Puntos indicadores
const puntos = slides.map((_, i) => {
  const punto = document.createElement('span');
  puntosBox.appendChild(punto);
  return punto;
});

function actualizarPuntos() {
  let real = index - 1;
  if (index === 0) real = slides.length - 1;
  if (index === slides.length + 1) real = 0;
  puntos.forEach((p, i) => p.classList.toggle('activo', i === real));
}

// Usamos porcentaje para que no se rompa al cambiar el tamaño de la ventana
function mover(animado) {
  carrusel.style.transition = animado ? `transform ${transitionTime}ms cubic-bezier(.65,0,.35,1)` : 'none';
  carrusel.style.transform = `translateX(-${index * 100}%)`;
  actualizarPuntos();
}

function irA(nuevoIndex) {
  if (enMovimiento) return;
  enMovimiento = true;
  index = nuevoIndex;
  mover(true);
  // Usamos un timeout (y no transitionend) para que funcione aunque las animaciones estén desactivadas
  setTimeout(finalizarMovimiento, transitionTime + 20);
}

mover(false);

// Loop infinito limpio
function finalizarMovimiento() {
  enMovimiento = false;
  if (index === slides.length + 1) {
    index = 1;
    mover(false);
  }
  if (index === 0) {
    index = slides.length;
    mover(false);
  }
}

// Autoplay
function startAutoPlay() {
  stopAutoPlay();
  autoPlay = setInterval(() => irA(index + 1), delay);
}

function stopAutoPlay() {
  clearInterval(autoPlay);
}

// Flechas
document.querySelector('.carruselNext').addEventListener('click', () => {
  irA(index + 1);
  startAutoPlay();
});

document.querySelector('.carruselPrev').addEventListener('click', () => {
  irA(index - 1);
  startAutoPlay();
});

// Deslizar con el dedo en celulares
let inicioX = 0;
carrusel.addEventListener('touchstart', (e) => {
  inicioX = e.touches[0].clientX;
  stopAutoPlay();
}, { passive: true });

carrusel.addEventListener('touchend', (e) => {
  const diferencia = e.changedTouches[0].clientX - inicioX;
  if (Math.abs(diferencia) > 40) {
    irA(diferencia < 0 ? index + 1 : index - 1);
  }
  startAutoPlay();
});

// Pausa al pasar el mouse
const marco = document.querySelector('.carruselMarco');
marco.addEventListener('mouseenter', stopAutoPlay);
marco.addEventListener('mouseleave', startAutoPlay);

startAutoPlay();


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
  animarEquipos();
}

// Las tarjetas entran escalonadas la primera vez que la grilla aparece en pantalla
function animarEquipos() {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const observer = new IntersectionObserver((entradas) => {
    if (entradas[0].isIntersecting) {
      equiposGrid.classList.add('entra');
      observer.disconnect();
    }
  }, { threshold: 0.1 });
  observer.observe(equiposGrid);
}

mostrarEquipos();
