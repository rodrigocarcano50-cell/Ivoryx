const carrusel = document.querySelector('.carrusel');
const slides = Array.from(carrusel.children);

let index = 1;
let autoPlay;
const delay = 2500;
const transitionTime = 800;

// Clonamos primero y último
const firstClone = slides[0].cloneNode(true);
const lastClone = slides[slides.length - 1].cloneNode(true);

carrusel.appendChild(firstClone);
carrusel.insertBefore(lastClone, slides[0]);

const allSlides = Array.from(carrusel.children);

function slideWidth() {
  return allSlides[0].clientWidth;
}

// Posición inicial
carrusel.style.transform = `translateX(-${slideWidth() * index}px)`;

// Mover al siguiente
function nextSlide() {
  index++;
  carrusel.style.transition = `transform ${transitionTime}ms ease`;
  carrusel.style.transform = `translateX(-${slideWidth() * index}px)`;
}

// Loop infinito limpio
carrusel.addEventListener('transitionend', () => {
  if (allSlides[index].isSameNode(firstClone)) {
    carrusel.style.transition = 'none';
    index = 1;
    carrusel.style.transform = `translateX(-${slideWidth() * index}px)`;
  }

  if (allSlides[index].isSameNode(lastClone)) {
    carrusel.style.transition = 'none';
    index = slides.length;
    carrusel.style.transform = `translateX(-${slideWidth() * index}px)`;
  }
});

// Autoplay
function startAutoPlay() {
  autoPlay = setInterval(nextSlide, delay);
}

function stopAutoPlay() {
  clearInterval(autoPlay);
}

// Pausa si el usuario interactúa
['mousedown', 'touchstart'].forEach(e =>
  carrusel.addEventListener(e, stopAutoPlay)
);
['mouseup', 'touchend'].forEach(e =>
  carrusel.addEventListener(e, startAutoPlay)
);

startAutoPlay();
















//PARA QUE SE CIERRE EL MENU HAMBURGUESA
const menuCheckbox = document.getElementById('menu');
  const menuLinks = document.querySelectorAll('.barraLinks a');

  menuLinks.forEach(link => {
    link.addEventListener('click', () => {
      menuCheckbox.checked = false;
    });
  });