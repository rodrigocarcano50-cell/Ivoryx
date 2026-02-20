// ===============================
// PRECIOS BASE (90% de batería)
// ===============================
const preciosBase = {
  "iPhone 12|64": 230000,
  "iPhone 12|128": 260000,

  "iPhone 12 Pro|128": 300000,
  "iPhone 12 Pro|256": 340000,

  "iPhone 12 Pro Max|128": 380000,
  "iPhone 12 Pro Max|256": 400000,

  "iPhone 13|128": 420000,
  "iPhone 13|256": 480000,

  "iPhone 13 Pro|128": 520000,
  "iPhone 13 Pro|256": 560000,

  "iPhone 13 Pro Max|128": 580000,
  "iPhone 13 Pro Max|256": 600000,

  "iPhone 14|128": 470000,
  "iPhone 14|256": 500000,

  "iPhone 14 Pro|128": 600000,
  "iPhone 14 Pro|256": 640000,

  "iPhone 14 Pro Max|128": 800000,
  "iPhone 14 Pro Max|256": 840000,

  "iPhone 15|128": 660000,
  "iPhone 15|256": 700000,

  "iPhone 15 Pro|128": 800000,
  "iPhone 15 Pro|256": 840000,

  "iPhone 15 Pro Max|128": 900000,
  "iPhone 15 Pro Max|256": 950000,
};

// ===============================
// AJUSTE POR BATERÍA
// ===============================
function ajustarPorBateria(bateria, precio) {
  switch (bateria) {
    case "100%":
      return precio + 20000;
    case "95%-99%":
      return precio + 10000;
    case "90%-94%":
      return precio;
    case "85%-89%":
      return precio - 20000;
    case "80%-84%":
      return precio - 40000;
    case "Menos de 79%":
      return precio - 70000;
    default:
      return precio;
  }
}

// ===============================
// DESCUENTOS POR FALLAS (ARS)
// ===============================
const descuentosFallas = {
  rayonesPantalla: 15000,
  pantallaTrizada: 120000,
  pantallaCambiada: 40000,
  tapaTrizada: 80000,
  tapaCambiada: 30000,
  falloCamaras: 70000,
  camaraCambiada: 35000,
  faceidNo: 60000,
  bateriaCambiada: 25000,
  microfonoNO: 30000,
  altavozNO: 30000,
  botonesNO: 25000,
};

// ===============================
// EVENTO FORMULARIO
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  const precioFinal = document.getElementById("precioFinal");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const modelo = document.querySelector("select[name='modelo']").value;
    const capacidadTexto = document.querySelector("select[name='capacidad']").value;
    const bateria = document.querySelector("select[name='bateria']").value;

    if (
      modelo === "Seleccionar Equipo" ||
      capacidadTexto === "Seleccionar" ||
      bateria === "Seleccionar"
    ) {
      precioFinal.textContent = "Completá todos los campos";
      return;
    }

    const capacidad = capacidadTexto.replace(" GB", "");
    const clave = `${modelo}|${capacidad}`;

    let precio = preciosBase[clave];

    if (!precio) {
      precioFinal.textContent = "Modelo no cotizable por ahora";
      return;
    }

    // Ajuste por batería
    precio = ajustarPorBateria(bateria, precio);

    // Descuentos por fallas
    for (let id in descuentosFallas) {
      const checkbox = document.getElementById(id);
      if (checkbox && checkbox.checked) {
        precio -= descuentosFallas[id];
      }
    }

    // Precio mínimo de seguridad
    if (precio < 50000) precio = 50000;

    // Mostrar resultado
    precioFinal.textContent =
      "$ " + precio.toLocaleString("es-AR");
  });
});
