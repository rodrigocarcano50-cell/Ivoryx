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
// ANIMACIÓN DE ELEMENTOS AL APARECER
// ===============================
const elementosRevelar = document.querySelectorAll('.revelar');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entradas) => {
    entradas.forEach(entrada => {
      if (entrada.isIntersecting) {
        const el = entrada.target;
        el.classList.add('visible');
        el.addEventListener('transitionend', () => el.classList.add('listo'), { once: true });
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.15 });

  elementosRevelar.forEach(el => observer.observe(el));
} else {
  elementosRevelar.forEach(el => el.classList.add('visible'));
}
