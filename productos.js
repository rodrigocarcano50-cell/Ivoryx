// ===============================
// UTILIDADES COMPARTIDAS DE PRODUCTOS
// (las usan index.html y admin.html)
// ===============================
const Ivoryx = (() => {
  const WHATSAPP = '5492617501979';
  const TABLA = 'equipos';
  const BUCKET_FOTOS = 'equipos';
  // Equipos que quedaron guardados en el navegador con la versión anterior del admin
  const CLAVE_BORRADOR = 'ivoryx_borrador';

  // Conexión a Supabase (los datos están en supabase-config.js)
  const db = window.supabase.createClient(IVORYX_SUPABASE.url, IVORYX_SUPABASE.anonKey);

  const CONDICIONES = ['Como nuevo', 'Excelente', 'Muy bueno', 'Bueno'];
  const ESTADOS = {
    disponible: 'Disponible',
    reservado: 'Reservado',
    vendido: 'Vendido'
  };

  // Colores aproximados de los acabados de Apple, para dibujar el equipo cuando no hay foto
  const COLORES = {
    negro: '#2b2b2e', grafito: '#3d3c3a', medianoche: '#232a31', 'gris espacial': '#4a4a4c',
    blanco: '#ecebe6', 'blanco estelar': '#f0ebe1', plata: '#e3e4e5', starlight: '#f0ebe1',
    azul: '#3f5f86', 'azul sierra': '#9bb5ce', 'azul pacífico': '#2f4c5f', 'azul profundo': '#2c3a52',
    rojo: '#b3242e', púrpura: '#b8a9cf', morado: '#b8a9cf', lavanda: '#c9bfdc',
    verde: '#a7c1a0', 'verde alpino': '#56614f', salvia: '#b4bfa8', amarillo: '#f2e18b',
    rosa: '#f1cfd0', dorado: '#efd9b8', oro: '#efd9b8', coral: '#ef8a73',
    'titanio natural': '#b3aea3', 'titanio negro': '#3d3d3f', 'titanio blanco': '#e2e0da',
    'titanio azul': '#4a5465', 'titanio desierto': '#c9b39b', naranja: '#e0743a', 'naranja cósmico': '#e0743a'
  };

  function normalizar(texto) {
    return (texto || '').toString().trim().toLowerCase();
  }

  function colorDe(nombre) {
    const n = normalizar(nombre);
    if (COLORES[n]) return COLORES[n];
    const parcial = Object.keys(COLORES).find((c) => n.includes(c));
    return parcial ? COLORES[parcial] : '#c7c9cf';
  }

  // ¿Es un color claro? Sirve para decidir el tono del logo y los lentes
  function esClaro(hex) {
    const v = parseInt(hex.slice(1), 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150;
  }

  let contadorDibujos = 0;

  // Dibujo de la parte trasera del iPhone, tintado con el color del equipo
  function dibujoIphone(producto) {
    const cuerpo = colorDe(producto.color);
    const claro = esClaro(cuerpo);
    const borde = claro ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.14)';
    const modulo = claro ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.08)';
    const esPro = /pro/i.test(producto.modelo || '');
    const esSE = /\bse\b/i.test(producto.modelo || '');
    const lente = (cx, cy, r) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#16171a" stroke="${borde}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r * 0.45}" fill="#2a3242"/><circle cx="${cx - r * 0.2}" cy="${cy - r * 0.25}" r="${r * 0.14}" fill="rgba(255,255,255,.55)"/>`;

    let camaras;
    if (esSE) {
      camaras = lente(46, 46, 11);
    } else if (esPro) {
      camaras = `<rect x="20" y="20" width="76" height="76" rx="20" fill="${modulo}" stroke="${borde}"/>` +
        lente(41, 41, 13) + lente(41, 75, 13) + lente(74, 58, 13);
    } else {
      camaras = `<rect x="20" y="20" width="62" height="76" rx="20" fill="${modulo}" stroke="${borde}"/>` +
        lente(51, 41, 13) + lente(51, 75, 13);
    }

    const brillo = `brillo${++contadorDibujos}`;
    return `<svg class="equipoDibujo" viewBox="0 0 200 400" role="img" aria-label="${escapar(producto.modelo)} ${escapar(producto.color)}">
      <rect x="4" y="4" width="192" height="392" rx="36" fill="${cuerpo}" stroke="${borde}" stroke-width="2"/>
      <rect x="4" y="4" width="192" height="392" rx="36" fill="url(#${brillo})"/>
      <defs><linearGradient id="${brillo}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient></defs>
      ${camaras}
    </svg>`;
  }

  function escapar(texto) {
    return (texto ?? '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function precio(producto) {
    const moneda = producto.moneda === 'USD' ? 'USD' : 'ARS';
    if (!producto.precio && producto.precio !== 0) return 'Consultar';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: moneda,
      currencyDisplay: moneda === 'USD' ? 'code' : 'symbol',
      maximumFractionDigits: 0
    }).format(producto.precio);
  }

  function titulo(producto) {
    return [producto.modelo, producto.capacidad].filter(Boolean).join(' ');
  }

  function enlaceWhatsapp(texto) {
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
  }

  // Los visitantes solo reciben disponibles y reservados; el admin logueado recibe todos
  // Fotos de un equipo o accesorio: la lista de fotos, o la foto única de antes
  const fotos = (p) => (p.imagenes?.length ? p.imagenes : p.imagen ? [p.imagen] : []);

  async function cargar() {
    const { data, error } = await db.from(TABLA).select('*').order('creado', { ascending: false });
    if (error) throw error;
    return data;
  }

  function leerBorrador() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE_BORRADOR));
      return Array.isArray(datos) ? datos : null;
    } catch {
      return null;
    }
  }

  return { db, TABLA, BUCKET_FOTOS, WHATSAPP, CLAVE_BORRADOR, leerBorrador, CONDICIONES, ESTADOS, colorDe, dibujoIphone, escapar, precio, titulo, enlaceWhatsapp, fotos, cargar };
})();
