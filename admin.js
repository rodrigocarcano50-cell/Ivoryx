// ===============================
// ADMIN: ACCESO Y EQUIPOS PUBLICADOS
// (stock, ventas, clientes y estadísticas están en stock.js)
// Todo se guarda en Supabase y se ve en el sitio al instante.
// La contraseña se cambia desde el mismo admin (botón "Contraseña").
// ===============================
const db = Ivoryx.db;

let productos = [];
let editandoId = null;
let filtro = 'todos';

const $ = (id) => document.getElementById(id);
const resumen = $('resumen');
const filas = $('filas');
const listaVacia = $('listaVacia');
const editor = $('editor');
const form = $('form');

// ---------- Botón para ver la contraseña ----------
document.querySelectorAll('.verClave').forEach((boton) => {
  boton.addEventListener('click', () => {
    const input = boton.parentElement.querySelector('input');
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    boton.setAttribute('aria-pressed', String(mostrar));
    boton.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
    input.focus();
  });
});

// ---------- Acceso ----------
function mostrarPanel(sesion) {
  $('acceso').hidden = !!sesion;
  $('panel').hidden = !sesion;
  $('btnSalir').hidden = !sesion;
  $('btnCambiarClave').hidden = !sesion;
  if (sesion) iniciarPanel();
}

$('formAcceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clave = $('clave');
  const boton = $('btnIngresar');
  if (!clave.value) {
    errorAcceso('Escribí la contraseña.');
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Ingresando…';
  const { data, error } = await db.auth.signInWithPassword({ email: IVORYX_SUPABASE.adminEmail, password: clave.value });
  boton.disabled = false;
  boton.textContent = 'Ingresar';

  if (error) {
    const sinConexion = !navigator.onLine || /fetch/i.test(error.message);
    errorAcceso(sinConexion
      ? 'No hay conexión con el servidor. Revisá tu internet y probá de nuevo.'
      : error.status === 429
        ? 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'
        : 'La contraseña no es correcta. Probá de nuevo.');
    return;
  }
  clave.value = '';
  mostrarPanel(data.session);
});

function errorAcceso(texto) {
  $('clave').setAttribute('aria-invalid', 'true');
  $('errorClave').textContent = texto;
  $('errorClave').hidden = false;
  $('clave').select();
}

$('clave').addEventListener('input', () => {
  $('clave').removeAttribute('aria-invalid');
  $('errorClave').hidden = true;
});

$('btnSalir').addEventListener('click', async () => {
  await db.auth.signOut();
  location.reload();
});

// ---------- Cambiar contraseña ----------
$('btnCambiarClave').addEventListener('click', () => {
  $('cambioClave').hidden = false;
  $('claveNueva').focus();
});

function cerrarCambioClave() {
  $('formCambioClave').reset();
  $('errorCambioClave').hidden = true;
  $('cambioClave').hidden = true;
}

$('btnCancelarClave').addEventListener('click', cerrarCambioClave);

$('formCambioClave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nueva = $('claveNueva').value;
  const error = (texto) => { $('errorCambioClave').textContent = texto; $('errorCambioClave').hidden = false; };

  if (nueva.length < 8) return error('La contraseña tiene que tener al menos 8 caracteres.');
  if (nueva !== $('claveRepetida').value) return error('Las dos contraseñas no coinciden.');

  const boton = $('btnGuardarClave');
  boton.disabled = true;
  const respuesta = await db.auth.updateUser({ password: nueva });
  boton.disabled = false;

  if (respuesta.error) return error('No se pudo cambiar la contraseña. Probá de nuevo en un rato.');
  cerrarCambioClave();
  avisar('Contraseña cambiada. Usala la próxima vez que entres.');
});

// ---------- Listado ----------
function contar(estado) {
  return productos.filter((p) => p.estado === estado).length;
}

function render() {
  const d = contar('disponible'), r = contar('reservado'), v = contar('vendido');
  resumen.textContent = productos.length
    ? `${d} disponible${d === 1 ? '' : 's'} · ${r} reservado${r === 1 ? '' : 's'} · ${v} vendido${v === 1 ? '' : 's'}`
    : 'Todavía no cargaste ningún equipo.';

  const texto = $('buscar').value.trim().toLowerCase();
  const visibles = productos.filter((p) =>
    (filtro === 'todos' || p.estado === filtro) &&
    [p.modelo, p.capacidad, p.color].join(' ').toLowerCase().includes(texto)
  );

  filas.innerHTML = visibles.map((p) => `
    <li>
      <button type="button" class="fila${p.id === editandoId ? ' seleccionada' : ''}" data-id="${Ivoryx.escapar(p.id)}">
        <span class="filaFoto">${p.imagen ? `<img src="${Ivoryx.escapar(p.imagen)}" alt="">` : Ivoryx.dibujoIphone(p)}</span>
        <span class="filaTexto">
          <strong>${Ivoryx.escapar(Ivoryx.titulo(p))}</strong>
          <span>${[p.color, p.condicion, p.bateria ? `Batería ${p.bateria}%` : ''].filter(Boolean).map(Ivoryx.escapar).join(' · ')}</span>
        </span>
        <span class="filaPrecio">${Ivoryx.precio(p)}</span>
        <span class="estado estado-${p.estado}">${Ivoryx.ESTADOS[p.estado] || p.estado}</span>
      </button>
      ${botonEstado(p)}
    </li>`).join('');

  listaVacia.hidden = visibles.length > 0;
  if (!visibles.length) {
    listaVacia.textContent = productos.length
      ? 'Ningún equipo coincide con la búsqueda.'
      : 'Tocá “Cargar equipo” para sumar el primero.';
  }
}

const botonCopiar = (p, seg) =>
  `<button type="button" class="btnVendido republicar" data-copiar="${Ivoryx.escapar(p.id)}" data-operacion="${Ivoryx.escapar(seg.operacion)}">Copiar mensaje</button>`;

// Copia texto al portapapeles (con un método viejo de respaldo si el navegador no deja)
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

// Botón de cada fila: Vendido, Volver a publicar o, si se vendió hace 2 días, Escribirle al cliente
function botonEstado(p) {
  const id = Ivoryx.escapar(p.id);
  if (p.estado !== 'vendido') return `<button type="button" class="btnVendido" data-vender="${id}" data-estado="vendido">Vendido</button>`;
  const seg = Gestion.seguimientoDeEquipo(p.id);
  if (seg?.faltan > 0) return `<span class="seguimientoFalta">Escribile a ${Ivoryx.escapar(seg.cliente)} en ${seg.faltan === 1 ? '1 día' : `${seg.faltan} días`}</span>`;
  if (seg?.enlace) return `<span class="seguimientoBotones">${botonCopiar(p, seg)}<a class="btnVendido escribir" href="${Ivoryx.escapar(seg.enlace)}"${seg.enlace.startsWith('intent:') ? '' : ' target="_blank" rel="noopener"'} data-escribir="${id}" data-operacion="${Ivoryx.escapar(seg.operacion)}">Escribirle a ${Ivoryx.escapar(seg.cliente)}</a></span>`;
  if (seg) return `<span class="seguimientoFalta">Sin celular de ${Ivoryx.escapar(seg.cliente)}: corregilo en Clientes</span>`;
  return `<button type="button" class="btnVendido republicar" data-vender="${id}" data-estado="disponible">Volver a publicar</button>`;
}

// stock.js la llama cuando termina de leer las ventas
window.dibujarEquipos = () => render();

async function recargar() {
  try {
    // Los vendidos que ya tuvieron su seguimiento quedan archivados: no se listan
    productos = (await Ivoryx.cargar()).filter((p) => !p.archivado);
  } catch (error) {
    console.error(error);
    avisar('No se pudieron leer los equipos. Revisá tu conexión y recargá la página.');
  }
  render();
  await Gestion.equiposCambiaron();
}

// ---------- Editor ----------
function abrirEditor(id = null) {
  editandoId = id;
  const p = productos.find((x) => x.id === id) || {
    modelo: '', capacidad: '128 GB', color: '', condicion: 'Excelente',
    bateria: '', precio: '', moneda: productos[0]?.moneda || 'ARS', detalle: '', estado: 'disponible', imagen: ''
  };

  $('tituloEditor').textContent = id ? 'Editar equipo' : 'Cargar equipo';
  $('btnEliminar').hidden = !id;
  $('modelo').value = p.modelo;
  asegurarOpcion($('capacidad'), p.capacidad);
  $('capacidad').value = p.capacidad;
  $('color').value = p.color || '';
  asegurarOpcion($('condicion'), p.condicion);
  $('condicion').value = p.condicion;
  $('bateria').value = p.bateria || '';
  $('precio').value = p.precio ? new Intl.NumberFormat('es-AR').format(p.precio) : '';
  $('moneda').value = p.moneda || 'ARS';
  const costo = id ? Gestion.costoEquipo(id) : null;
  $('costo').value = costo ? new Intl.NumberFormat('es-AR').format(costo) : '';
  $('detalle').value = p.detalle || '';
  form.querySelector(`input[name="estado"][value="${p.estado || 'disponible'}"]`).checked = true;
  fotosEquipo.poner(Ivoryx.fotos(p));
  limpiarErrores();

  editor.hidden = false;
  document.body.classList.add('editando');
  render();
  $('modelo').focus({ preventScroll: true });
  if (matchMedia('(min-width: 1001px)').matches) editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function cerrarEditor() {
  editor.hidden = true;
  editandoId = null;
  fotosEquipo.poner([]);
  document.body.classList.remove('editando');
  render();
}

// Si un producto viejo tiene un valor que no está en la lista, lo agregamos para no perderlo
function asegurarOpcion(select, valor) {
  if (valor && ![...select.options].some((o) => o.value === valor)) {
    select.add(new Option(valor, valor));
  }
}

function datosDelEquipo() {
  return {
    modelo: $('modelo').value.trim(),
    capacidad: $('capacidad').value,
    color: $('color').value.trim(),
    condicion: $('condicion').value,
    bateria: $('bateria').value ? Number($('bateria').value) : null,
    precio: Number($('precio').value.replace(/\D/g, '')) || null,
    moneda: $('moneda').value,
    detalle: $('detalle').value.trim(),
    estado: form.querySelector('input[name="estado"]:checked').value
  };
}

// El costo no va en la tabla de equipos (que es pública): se guarda como precio de compra de su producto
const leerCosto = () => (/\d/.test($('costo').value) ? Number($('costo').value.replace(/\D/g, '')) : null);

async function guardarCosto(equipoId, costo) {
  const { error } = await db.from('productos').update({ precio_compra: costo }).eq('equipo_id', equipoId);
  if (error) throw error;
}

function limpiarErrores() {
  form.querySelectorAll('.error').forEach((e) => (e.hidden = true));
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

function marcarError(campo, error) {
  $(campo).setAttribute('aria-invalid', 'true');
  $(error).hidden = false;
}

function validar(d) {
  limpiarErrores();
  let primero = null;
  if (!d.modelo) { marcarError('modelo', 'errorModelo'); primero ??= 'modelo'; }
  if (d.bateria !== null && !(d.bateria >= 1 && d.bateria <= 100)) { marcarError('bateria', 'errorBateria'); primero ??= 'bateria'; }
  if (!d.precio) { marcarError('precio', 'errorPrecio'); primero ??= 'precio'; }
  if (leerCosto() === null) { marcarError('costo', 'errorCosto'); primero ??= 'costo'; }
  if (primero) $(primero).focus();
  return !primero;
}

async function subirFoto(blob) {
  const ruta = `${crypto.randomUUID()}.webp`;
  const { error } = await db.storage.from(Ivoryx.BUCKET_FOTOS).upload(ruta, blob, { contentType: 'image/webp', cacheControl: '31536000' });
  if (error) throw error;
  return db.storage.from(Ivoryx.BUCKET_FOTOS).getPublicUrl(ruta).data.publicUrl;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = datosDelEquipo();
  if (!validar(datos)) return;

  const boton = $('btnGuardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    datos.imagenes = await fotosEquipo.subir();
    datos.imagen = datos.imagenes[0] || '';

    // El id se arma acá para poder guardar el costo del equipo nuevo
    const id = editandoId || crypto.randomUUID();
    const consulta = editandoId
      ? db.from(Ivoryx.TABLA).update(datos).eq('id', id)
      : db.from(Ivoryx.TABLA).insert({ id, ...datos });
    const { error } = await consulta;
    if (error) throw error;
    await guardarCosto(id, leerCosto());

    avisar(editandoId ? 'Cambios guardados. Ya se ven en el sitio.' : `${datos.modelo} publicado en el sitio.`);
    cerrarEditor();
    await recargar();
  } catch (error) {
    console.error(error);
    avisar(error.status === 401 || /JWT/i.test(error.message || '')
      ? 'Tu sesión venció. Recargá la página y volvé a entrar.'
      : 'No se pudo guardar. Revisá tu conexión y probá de nuevo.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
});

$('btnEliminar').addEventListener('click', async () => {
  const eliminado = productos.find((p) => p.id === editandoId);
  if (!eliminado) return;
  const costo = Gestion.costoEquipo(eliminado.id);

  const { error } = await db.from(Ivoryx.TABLA).delete().eq('id', eliminado.id);
  if (error) {
    avisar('No se pudo eliminar. Probá de nuevo.');
    return;
  }
  cerrarEditor();
  await recargar();
  avisar(`${Ivoryx.titulo(eliminado)} eliminado.`, async () => {
    await db.from(Ivoryx.TABLA).insert(eliminado);
    if (costo) await guardarCosto(eliminado.id, costo).catch(console.error);
    await recargar();
  });
});

// ---------- Fotos: se achican antes de subirlas ----------
function achicarImagen(origen, lado = 1000) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo convertir'))), 'image/webp', 0.82);
    };
    img.onerror = () => rechazar(new Error('Imagen inválida'));
    img.src = typeof origen === 'string' ? origen : URL.createObjectURL(origen);
  });
}

// Editor de varias fotos (equipos y muestra de accesorios). La primera es la portada.
// Cada foto es la URL de una ya subida o el Blob de una nueva, que se sube al guardar.
// vacio(): lo que se ve cuando no hay ninguna foto
function editorFotos(raiz, { vacio } = {}) {
  let fotos = [];
  const urlDe = (f) => (typeof f === 'string' ? f : (f.vista ||= URL.createObjectURL(f)));

  function dibujar() {
    raiz.innerHTML = `
      <ul class="fotosLista">
        ${fotos.length ? fotos.map((f, i) => `
          <li class="fotosItem">
            <img src="${Ivoryx.escapar(urlDe(f))}" alt="Foto ${i + 1}">
            ${i === 0 ? '<span class="fotosPortada">Portada</span>' : `<button type="button" class="fotosMover" data-mover="${i}" aria-label="Mover la foto ${i + 1} un lugar antes" title="Mover antes">←</button>`}
            <button type="button" class="fotosQuitar" data-quitar="${i}" aria-label="Quitar la foto ${i + 1}" title="Quitar">×</button>
          </li>`).join('') : `<li class="fotosItem fotosVacio">${vacio ? vacio() : ''}</li>`}
        <li>
          <label class="fotosAgregar">
            <input type="file" accept="image/*" multiple class="visualmenteOculto">
            <span aria-hidden="true">+</span>
            ${fotos.length ? 'Agregar más' : 'Subir fotos'}
          </label>
        </li>
      </ul>`;
  }

  raiz.addEventListener('click', (e) => {
    const quitar = e.target.closest('[data-quitar]');
    const mover = e.target.closest('[data-mover]');
    if (quitar) fotos.splice(Number(quitar.dataset.quitar), 1);
    else if (mover) {
      const i = Number(mover.dataset.mover);
      [fotos[i - 1], fotos[i]] = [fotos[i], fotos[i - 1]];
    } else return;
    dibujar();
  });

  raiz.addEventListener('change', async (e) => {
    const archivos = [...e.target.files];
    e.target.value = '';
    let fallidas = 0;
    for (const archivo of archivos) {
      try {
        fotos.push(await achicarImagen(archivo));
      } catch {
        fallidas++;
      }
    }
    dibujar();
    if (fallidas) avisar(`No pudimos abrir ${fallidas === 1 ? 'una imagen' : `${fallidas} imágenes`}. Probá con fotos JPG o PNG.`);
  });

  return {
    poner(lista) { fotos = [...lista]; dibujar(); },
    lista: () => fotos,
    redibujar: dibujar,
    // Sube las fotos nuevas y devuelve todas las URLs en orden
    async subir() {
      fotos = await Promise.all(fotos.map((f) => (typeof f === 'string' ? f : subirFoto(f))));
      return fotos;
    }
  };
}

const fotosEquipo = editorFotos($('fotosEquipo'), { vacio: () => Ivoryx.dibujoIphone(datosDelEquipo()) });

// El dibujo de la vista previa sigue al modelo y al color mientras escribís
['modelo', 'color'].forEach((id) => $(id).addEventListener('input', () => !fotosEquipo.lista().length && fotosEquipo.redibujar()));

// ---------- Importar equipos guardados con el admin anterior ----------
function revisarImportacion() {
  const guardados = Ivoryx.leerBorrador();
  if (!guardados?.length) return;
  $('importarTexto').innerHTML = `<strong>Encontramos ${guardados.length} equipo${guardados.length === 1 ? '' : 's'} guardado${guardados.length === 1 ? '' : 's'} en este navegador</strong> con la versión anterior del admin. ¿Los subimos al sitio?`;
  $('importar').hidden = false;
}

$('btnIgnorarImportar').addEventListener('click', () => {
  $('importar').hidden = true;
});

$('btnImportar').addEventListener('click', async () => {
  const boton = $('btnImportar');
  boton.disabled = true;
  boton.textContent = 'Subiendo…';
  try {
    const guardados = Ivoryx.leerBorrador() || [];
    const filasNuevas = [];
    for (const p of guardados) {
      let imagen = p.imagen || '';
      if (imagen.startsWith('data:')) imagen = await subirFoto(await achicarImagen(imagen));
      filasNuevas.push({
        modelo: p.modelo || p.nombre || 'iPhone',
        capacidad: p.capacidad || null,
        color: p.color || null,
        condicion: p.condicion || null,
        bateria: Number(p.bateria) >= 1 && Number(p.bateria) <= 100 ? Number(p.bateria) : null,
        precio: Number(p.precio) || 0,
        moneda: p.moneda === 'USD' ? 'USD' : 'ARS',
        detalle: p.detalle || p.descripcion || null,
        estado: ['disponible', 'reservado', 'vendido'].includes(p.estado) ? p.estado : 'disponible',
        imagen,
        imagenes: imagen ? [imagen] : []
      });
    }
    const { error } = await db.from(Ivoryx.TABLA).insert(filasNuevas);
    if (error) throw error;
    localStorage.removeItem(Ivoryx.CLAVE_BORRADOR);
    $('importar').hidden = true;
    await recargar();
    avisar(`Listo: ${filasNuevas.length} equipos publicados. Revisá la lista y borrá los que no correspondan.`);
  } catch (error) {
    console.error(error);
    avisar('No se pudieron subir. Probá de nuevo.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Subirlos';
  }
});

// ---------- Aviso con deshacer ----------
let temporizadorAviso;
function avisar(texto, deshacer) {
  const aviso = $('aviso');
  const accion = $('avisoAccion');
  $('avisoTexto').textContent = texto;
  accion.hidden = !deshacer;
  accion.onclick = deshacer ? () => { aviso.hidden = true; deshacer(); } : null;
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (aviso.hidden = true), deshacer ? 7000 : 4000);
}

// ---------- Eventos generales ----------
$('btnNuevo').addEventListener('click', () => abrirEditor());
$('btnCerrarEditor').addEventListener('click', cerrarEditor);
$('buscar').addEventListener('input', render);

// Botón "Vendido" de cada equipo: lo saca del sitio sin abrir el editor
async function cambiarEstado(id, estado) {
  const { error } = await db.from(Ivoryx.TABLA).update({ estado }).eq('id', id);
  if (error) throw error;
  await recargar();
}

filas.addEventListener('click', async (e) => {
  // Escribirle: el enlace abre WhatsApp y el equipo sale de la lista
  // Copiar mensaje: lo mismo, pero el texto queda copiado para pegarlo en WhatsApp Business
  const escribir = e.target.closest('[data-escribir], [data-copiar]');
  if (escribir) {
    const copiar = 'copiar' in escribir.dataset;
    const id = copiar ? escribir.dataset.copiar : escribir.dataset.escribir;
    const p = productos.find((x) => x.id === id);
    if (copiar) {
      const seg = Gestion.seguimientoDeEquipo(id);
      if (!seg || !(await copiarTexto(seg.mensaje))) return avisar('No se pudo copiar el mensaje. Probá con “Escribirle”.');
    }
    try {
      const deshacer = await Gestion.cerrarSeguimiento(escribir.dataset.operacion, id);
      if (editandoId === p?.id) cerrarEditor();
      avisar(copiar
        ? `Mensaje copiado: pegalo en el chat de WhatsApp Business. ${p ? Ivoryx.titulo(p) : 'El equipo'} salió de la lista.`
        : `Mensaje listo para mandar. ${p ? Ivoryx.titulo(p) : 'El equipo'} salió de la lista (la venta queda en Movimientos).`, deshacer);
    } catch (error) {
      console.error(error);
      avisar('No se pudo guardar el seguimiento. Probá de nuevo.');
    }
    return;
  }
  const vender = e.target.closest('[data-vender]');
  if (vender) {
    const p = productos.find((x) => x.id === vender.dataset.vender);
    if (!p) return;
    const anterior = p.estado;
    const nuevo = vender.dataset.estado;
    vender.disabled = true;
    try {
      await cambiarEstado(p.id, nuevo);
      if (editandoId === p.id) cerrarEditor();
      avisar(nuevo === 'vendido'
        ? `${Ivoryx.titulo(p)} vendido. Ya no se ve en el sitio.`
        : `${Ivoryx.titulo(p)} publicado de nuevo.`,
        () => cambiarEstado(p.id, anterior).catch(() => avisar('No se pudo deshacer. Probá de nuevo.')));
    } catch (error) {
      console.error(error);
      vender.disabled = false;
      avisar('No se pudo cambiar el estado. Revisá tu conexión y probá de nuevo.');
    }
    return;
  }
  const fila = e.target.closest('.fila');
  if (fila) abrirEditor(fila.dataset.id);
});

document.querySelectorAll('.filtro').forEach((boton) => {
  boton.addEventListener('click', () => {
    filtro = boton.dataset.filtro;
    document.querySelectorAll('.filtro').forEach((b) => b.classList.toggle('activo', b === boton));
    render();
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !editor.hidden) cerrarEditor();
});

// ---------- Arranque ----------
Ivoryx.CONDICIONES.forEach((c) => $('condicion').add(new Option(c, c)));

let panelIniciado = false;
async function iniciarPanel() {
  if (panelIniciado) return;
  panelIniciado = true;
  revisarImportacion();
  await Promise.all([recargar(), Gestion.iniciar()]);
}

// Si ya había una sesión abierta, entra directo (cuando stock.js también terminó de cargar)
document.addEventListener('DOMContentLoaded', () => {
  db.auth.getSession().then(({ data }) => mostrarPanel(data.session));
});
