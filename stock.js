// ===============================
// ADMIN: STOCK, VENTAS, CLIENTES Y ESTADÍSTICAS
// Lo que antes era la app "ivoryx-stock", ahora guardado en Supabase
// (tablas productos, movimientos, clientes, combos y ajustes: ver supabase/stock.sql).
// Las ventas y los ingresos se registran con funciones de la base,
// así el stock y los movimientos siempre quedan de acuerdo.
// ===============================
const Gestion = (() => {
  const db = Ivoryx.db;
  const esc = Ivoryx.escapar;

  // Solo accesorios: los celulares se manejan en "Equipos".
  // Los productos viejos de la categoría Celulares quedan en la base, pero no se muestran.
  const CATEGORIAS = ['Fundas', 'Templados', 'Cargadores', 'Auriculares', 'Bolsas', 'Tarjetas', 'Otros'];
  const OCULTAS = ['Celulares'];
  const POR_MODELO = new Set(['Fundas', 'Templados']); // se ven agrupadas por modelo
  const CON_COLOR = new Set(['Fundas']);
  const SECCIONES = ['resumen', 'equipos', 'stock', 'movimientos', 'clientes', 'estadisticas', 'ajustes'];
  const TITULOS = { resumen: 'Resumen', equipos: 'Equipos', stock: 'Stock de accesorios', movimientos: 'Movimientos', clientes: 'Clientes', estadisticas: 'Estadísticas', ajustes: 'Ajustes' };
  const SIN_MODELO = 'Sin modelo';

  // Colores sugeridos para accesorios (se puede escribir cualquier otro)
  const COLORES = {
    negro: '#111827', blanco: '#f8fafc', transparente: 'transparent', azul: '#2563eb', celeste: '#38bdf8',
    rojo: '#dc2626', rosa: '#ec4899', violeta: '#7c3aed', verde: '#16a34a', amarillo: '#facc15',
    naranja: '#f97316', gris: '#6b7280', beige: '#e7d7b1', dorado: '#d4af37', otros: '#c0c0c0'
  };
  const NOMBRES_COLORES = ['Negro', 'Blanco', 'Transparente', 'Azul', 'Celeste', 'Rojo', 'Rosa', 'Violeta', 'Verde', 'Amarillo', 'Naranja', 'Gris', 'Beige', 'Dorado', 'Otros'];
  const GRUPOS_FUNDA = ['Blanco', 'Negro', 'Azul', 'Rojo', 'Otros', 'MagSafe'];
  const VARIANTES_FUNDA = ['Blanco', 'Negro', 'Azul', 'Rojo', 'Otros', 'Transparente'];
  const MODELOS_FUNDA = [
    'iPhone X', 'iPhone XR', 'iPhone XS', 'iPhone XS Max',
    'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
    'iPhone 12', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
    'iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
    'iPhone 14', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
    'iPhone 15', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
    'iPhone 16', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
    'iPhone 17', 'iPhone Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
    'Otros'
  ];

  const vista = document.getElementById('vistaGestion');
  const vistaEquipos = document.getElementById('vistaEquipos');
  const modal = document.getElementById('modal');

  let datos = { productos: [], movimientos: [], clientes: [], combos: [], ajustes: { stock_bajo: 5 } };
  let cargado = false;
  let ruta = { seccion: 'resumen', categoria: '', modelo: '' };
  let busquedaStock = '';
  let soloBajo = false;
  let busquedaClientes = '';
  let filtrosMov = { desde: '', hasta: '', tipo: '', categoria: '', producto: '' };

  // ---------- Utilidades ----------
  const plata = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const $p = (n) => plata.format(Number(n) || 0);
  const suma = (lista, fn) => lista.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
  const plural = (n, uno, varios = uno + 's') => `${n} ${n === 1 ? uno : varios}`;
  const diaLocal = (f) => new Date(f).toLocaleDateString('sv-SE'); // AAAA-MM-DD en hora de Argentina
  const fechaHora = (f) => new Date(f).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fechaCorta = (f) => new Date(f).toLocaleDateString('es-AR');
  const normalizar = (t) => (t ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const coincide = (texto, consulta) => normalizar(consulta).split(/\s+/).filter(Boolean).every((palabra) => normalizar(texto).includes(palabra));
  const enlace = (...partes) => '#' + partes.map(encodeURIComponent).join('/');
  const ICONO_BUSCAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m13.5 13.5 3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICONO_CERRAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  const producto = (id) => datos.productos.find((p) => p.id === id);
  const cliente = (id) => datos.clientes.find((c) => c.id === id);
  const combo = (id) => datos.combos.find((c) => c.id === id);
  const etiqueta = (p) => [p.nombre, p.modelo, p.color].filter(Boolean).join(' · ');
  const textoBusqueda = (p) => [p.nombre, p.modelo, p.color, p.categoria, p.sku].join(' ');
  const nombreCliente = (c) => [c.nombre, c.apellido].filter(Boolean).join(' ') || 'Sin nombre';
  const costoDe = (m) => m.costo_unitario ?? producto(m.producto_id)?.precio_compra ?? 0;
  const ganancia = (m) => m.cantidad * ((m.precio_unitario || 0) - costoDe(m));
  const importe = (m) => m.cantidad * (m.tipo === 'venta' ? (m.precio_unitario || 0) : (m.costo_unitario || 0));
  const ventas = () => datos.movimientos.filter((m) => m.tipo === 'venta');
  const equipos = () => (typeof productos !== 'undefined' ? productos : []); // lista de admin.js

  function nivel(stock) {
    if (stock <= 0) return { clase: 'agotado', texto: 'Sin stock' };
    if (stock <= datos.ajustes.stock_bajo) return { clase: 'bajo', texto: 'Poco stock' };
    return { clase: 'ok', texto: 'OK' };
  }

  function stockCombo(c) {
    if (!c.componentes?.length) return 0;
    return Math.max(0, Math.min(...c.componentes.map((comp) => {
      const p = producto(comp.producto_id);
      return p ? Math.floor(p.stock / (comp.cantidad || 1)) : 0;
    })));
  }

  const esMagsafe = (p) => normalizar(p.color) === 'transparente' || /magsafe/i.test(p.nombre || '');
  function grupoFunda(p) {
    if (esMagsafe(p)) return 'MagSafe';
    return ['Blanco', 'Negro', 'Azul', 'Rojo'].find((g) => normalizar(g) === normalizar(p.color)) || 'Otros';
  }
  const grupoTemplado = (p) => /privacidad|anti ?espia/.test(normalizar(p.nombre)) ? 'Templados anti espía' : 'Templados';

  function punto(nombre) {
    if (!nombre) return '';
    const hex = COLORES[normalizar(nombre)] ?? Ivoryx.colorDe(nombre);
    const fondo = hex === 'transparent' ? 'repeating-conic-gradient(#cbd5e1 0 25%, #fff 0 50%) 50% / 6px 6px' : hex;
    return `<span class="punto" style="background:${fondo}" aria-hidden="true"></span>`;
  }

  // Agrupa los renglones de cada venta o ingreso
  function operaciones(movs) {
    const mapa = new Map();
    for (const m of movs) {
      if (!mapa.has(m.operacion)) mapa.set(m.operacion, []);
      mapa.get(m.operacion).push(m);
    }
    return [...mapa.values()].map((items) => ({
      id: items[0].operacion,
      tipo: items[0].tipo,
      fecha: items[0].fecha,
      nota: items[0].nota,
      cliente: cliente(items[0].cliente_id),
      items,
      cantidad: suma(items, (m) => m.cantidad),
      total: suma(items, importe),
      ganancia: items[0].tipo === 'venta' ? suma(items, ganancia) : 0
    }));
  }

  // ---------- Datos ----------
  async function traer(tabla, orden, ascendente) {
    const filas = [];
    const paso = 1000;
    for (let desde = 0; ; desde += paso) {
      const { data, error } = await db.from(tabla).select('*')
        .order(orden, { ascending: ascendente }).order('id').range(desde, desde + paso - 1);
      if (error) throw error;
      filas.push(...data);
      if (data.length < paso) return filas;
    }
  }

  async function cargar() {
    const [productos, movimientos, clientes, combos, ajustes] = await Promise.all([
      traer('productos', 'creado', true),
      traer('movimientos', 'fecha', false),
      traer('clientes', 'creado', true),
      traer('combos', 'creado', true),
      db.from('ajustes').select('*').eq('id', 1).maybeSingle()
    ]);
    if (ajustes.error) throw ajustes.error;
    datos = {
      productos: productos.filter((p) => !OCULTAS.includes(p.categoria)),
      movimientos, clientes, combos,
      ajustes: ajustes.data || { stock_bajo: 5 }
    };
    cargado = true;
  }

  async function refrescar() {
    try {
      await cargar();
    } catch (error) {
      console.error(error);
      avisar('No se pudieron leer el stock y las ventas. Revisá tu conexión y recargá la página.');
    }
    render();
  }

  function mensajeError(error, porDefecto) {
    const texto = error?.message || '';
    if (/Stock insuficiente/.test(texto)) return texto + '. Alguien pudo haber vendido mientras cargabas: revisá el stock.';
    if (error?.status === 401 || /JWT/i.test(texto)) return 'Tu sesión venció. Recargá la página y volvé a entrar.';
    return porDefecto;
  }

  // Ejecuta una escritura, avisa y vuelve a leer todo
  async function escribir(consulta, textoOk, porDefecto = 'No se pudo guardar. Revisá tu conexión y probá de nuevo.') {
    const { error } = await consulta;
    if (error) {
      console.error(error);
      avisar(mensajeError(error, porDefecto));
      return false;
    }
    await refrescar();
    if (textoOk) avisar(textoOk);
    return true;
  }

  // ---------- Navegación ----------
  function leerRuta() {
    const partes = location.hash.slice(1).split('/').map((s) => {
      try { return decodeURIComponent(s); } catch { return s; }
    });
    return {
      seccion: SECCIONES.includes(partes[0]) ? partes[0] : 'resumen',
      categoria: CATEGORIAS.includes(partes[1]) ? partes[1] : '',
      modelo: partes[2] || ''
    };
  }

  function mostrar() {
    const anterior = ruta.seccion;
    ruta = leerRuta();
    if (ruta.seccion === 'stock' && !ruta.categoria) ruta.categoria = CATEGORIAS[0];

    document.querySelectorAll('#secciones a').forEach((a) => {
      if (a.dataset.seccion === ruta.seccion) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const enEquipos = ruta.seccion === 'equipos';
    if (!enEquipos && !document.getElementById('editor').hidden) cerrarEditor();
    vistaEquipos.hidden = !enEquipos;
    vista.hidden = enEquipos;
    document.title = `${TITULOS[ruta.seccion]} | Admin Ivoryx`;
    if (anterior !== ruta.seccion) busquedaStock = '';
    render();
  }

  function render() {
    if (ruta.seccion === 'equipos') return;
    if (!cargado) {
      vista.innerHTML = '<p class="cargandoVista">Cargando…</p>';
      return;
    }
    const vistas = { resumen: vistaResumen, stock: vistaStock, movimientos: vistaMovimientos, clientes: vistaClientes, estadisticas: vistaEstadisticas, ajustes: vistaAjustes };
    vista.innerHTML = vistas[ruta.seccion]();
  }

  const cabecera = (titulo, resumen, acciones = '') => `
    <div class="adminTop">
      <div>
        <h1>${titulo}</h1>
        <p class="adminResumen">${resumen}</p>
      </div>
      ${acciones ? `<div class="adminTopAcciones">${acciones}</div>` : ''}
    </div>`;

  const dato = (titulo, valor, nota, tono = '') => `
    <div class="dato${tono ? ' ' + tono : ''}">
      <p class="datoTitulo">${titulo}</p>
      <p class="datoValor">${valor}</p>
      <p class="datoNota">${nota}</p>
    </div>`;

  const etiquetaTipo = (tipo) => `<span class="etiqueta ${tipo}">${{ venta: 'Venta', ingreso: 'Ingreso', ajuste: 'Ajuste' }[tipo] || tipo}</span>`;
  const etiquetaNivel = (stock) => { const n = nivel(stock); return `<span class="etiqueta ${n.clase}">${n.texto}</span>`; };
  const boton = (texto, accion, extra = '', clase = 'btnMini') => `<button type="button" class="${clase}" data-accion="${accion}" ${extra}>${texto}</button>`;

  // ---------- Resumen ----------
  function vistaResumen() {
    const P = datos.productos;
    const bajo = datos.ajustes.stock_bajo;
    const hoy = diaLocal(new Date());
    const ventasHoy = ventas().filter((m) => diaLocal(m.fecha) === hoy);
    const opsHoy = new Set(ventasHoy.map((m) => m.operacion)).size;
    const pocos = P.filter((p) => p.stock > 0 && p.stock <= bajo).length;
    const agotados = P.filter((p) => p.stock <= 0).length;
    const eq = equipos();
    const disponibles = eq.filter((e) => e.estado === 'disponible').length;
    const reservados = eq.filter((e) => e.estado === 'reservado').length;
    const reponer = P.filter((p) => p.stock <= bajo).sort((a, b) => a.stock - b.stock);
    const hoyTexto = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

    return `
      ${cabecera('Resumen', hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1),
        `${boton('Nuevo ingreso', 'nuevo-ingreso', '', 'btnChico')}
         <button type="button" class="btn btnPrimario" data-accion="nueva-venta">Nueva venta</button>`)}

      <div class="datos">
        ${dato('Vendido hoy', $p(suma(ventasHoy, importe)), `${plural(opsHoy, 'venta')} · ${plural(suma(ventasHoy, (m) => m.cantidad), 'unidad', 'unidades')}`)}
        ${dato('Ganancia de hoy', $p(suma(ventasHoy, ganancia)), 'precio de venta menos costo', 'positivo')}
        ${dato('Equipos publicados', disponibles + reservados, `${plural(disponibles, 'disponible')} · ${plural(reservados, 'reservado')}`)}
      </div>
      <div class="datos">
        ${dato('Unidades en stock', suma(P, (p) => Math.max(0, p.stock)), plural(P.length, 'producto'))}
        ${dato('Poco stock', pocos, `${bajo} unidades o menos`, pocos ? 'alerta' : '')}
        ${dato('Sin stock', agotados, 'productos agotados', agotados ? 'peligro' : '')}
        ${dato('Valor del stock', $p(suma(P, (p) => Math.max(0, p.stock) * p.precio_venta)), 'a precio de venta')}
      </div>

      <div class="cajasDos">
        <section class="caja">
          <div class="cajaCabecera">
            <h2>Últimos movimientos</h2>
            <a class="enlaceCaja" href="#movimientos">Ver todos</a>
          </div>
          ${tablaOperaciones(operaciones(datos.movimientos).slice(0, 8), false)}
        </section>
        <div class="columna">
          <section class="caja">
            <h2 class="cajaTitulo">Accesos rápidos</h2>
            <div class="accesos">
              ${boton('Nuevo producto', 'nuevo-producto', '', 'btnChico')}
              ${boton('Cargar equipo', 'cargar-equipo', '', 'btnChico')}
              ${boton('Nuevo cliente', 'nuevo-cliente', '', 'btnChico')}
            </div>
          </section>
          <section class="caja">
            <h2 class="cajaTitulo">Para reponer</h2>
            ${reponer.length ? `<ul class="alertas">${reponer.slice(0, 8).map((p) => `
              <li><span>${esc(etiqueta(p))}</span>${etiquetaNivel(p.stock)}<strong class="tono-${nivel(p.stock).clase}">${p.stock}</strong></li>`).join('')}
            </ul>${reponer.length > 8 ? `<p class="sutil chico">Y ${plural(reponer.length - 8, 'producto')} más.</p>` : ''}`
              : '<p class="vacio chico">No hay productos con poco stock.</p>'}
          </section>
        </div>
      </div>`;
  }

  function tablaOperaciones(ops, completa) {
    if (!ops.length) return `<p class="vacio">${completa ? 'No hay movimientos con estos filtros.' : 'Todavía no hay movimientos.'}</p>`;
    return `<div class="tablaScroll"><table class="tabla">
      <thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Productos</th><th class="num">Total</th>
        ${completa ? '<th>Cliente</th><th>Nota</th><th><span class="visualmenteOculto">Acciones</span></th>' : ''}
      </tr></thead>
      <tbody>${ops.map((o) => `<tr>
        <td class="nowrap">${fechaHora(o.fecha)}</td>
        <td>${etiquetaTipo(o.tipo)}</td>
        <td class="productosOp">${o.items.map((m) => {
          const p = producto(m.producto_id);
          const unidad = m.tipo === 'venta' ? m.precio_unitario : m.costo_unitario;
          return `<div><span>${p ? esc(etiqueta(p)) : 'Producto eliminado'}</span><span class="sutil nowrap">${m.cantidad} × ${$p(unidad)}</span></div>`;
        }).join('')}</td>
        <td class="num fuerte">${$p(o.total)}</td>
        ${completa ? `
          <td>${o.cliente ? `${esc(nombreCliente(o.cliente))}<div class="sutil">${esc(o.cliente.celular || '')}</div>` : '<span class="sutil">—</span>'}</td>
          <td class="sutil">${esc(o.nota || '')}</td>
          <td class="acciones">${o.tipo === 'venta' ? boton('Editar', 'editar-venta', `data-id="${esc(o.id)}"`) + boton('Eliminar', 'borrar-venta', `data-id="${esc(o.id)}"`, 'btnMini peligro') : ''}</td>` : ''}
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ---------- Stock ----------
  function vistaStock() {
    const cat = ruta.categoria;
    const P = datos.productos;
    return `
      ${cabecera('Stock de accesorios', `${plural(suma(P, (p) => Math.max(0, p.stock)), 'unidad', 'unidades')} en ${plural(P.length, 'producto')}`,
        `${boton('Ingreso de mercadería', 'nuevo-ingreso', '', 'btnChico')}
         <button type="button" class="btn btnPrimario" data-accion="nuevo-producto" data-categoria="${esc(cat)}" data-modelo="${esc(ruta.modelo)}">Nuevo producto</button>`)}

      <label class="buscador buscadorSuelto">
        ${ICONO_BUSCAR}
        <span class="visualmenteOculto">Buscar en todo el stock</span>
        <input type="search" id="buscarStock" placeholder="Buscar en todo el stock: nombre, modelo, color o SKU" value="${esc(busquedaStock)}" autocomplete="off">
      </label>

      <nav class="pestanas" aria-label="Categorías">
        ${CATEGORIAS.map((c) => {
          const unidades = suma(P.filter((p) => p.categoria === c), (p) => Math.max(0, p.stock));
          return `<a class="pestana" href="${enlace('stock', c)}"${c === cat && !busquedaStock ? ' aria-current="page"' : ''}>${c}<span class="cuenta">${unidades}</span></a>`;
        }).join('')}
      </nav>

      <div id="stockContenido">${contenidoStock()}</div>`;
  }

  function contenidoStock() {
    if (busquedaStock.trim()) {
      const hallados = datos.productos.filter((p) => coincide(textoBusqueda(p), busquedaStock));
      return `<p class="sutil margenAbajo">${plural(hallados.length, 'resultado')} en todas las categorías</p>
        ${tablaProductos(hallados, { categoria: true, modelo: true, color: true })}`;
    }
    const cat = ruta.categoria;
    if (POR_MODELO.has(cat)) return ruta.modelo ? detalleModelo(cat, ruta.modelo) : tarjetasModelos(cat);
    return listaCategoria(cat);
  }

  function herramientasCategoria(cat, extras = '') {
    return `<div class="herramientas">
      ${extras}
      ${cat === 'Fundas' ? `
        ${boton('Crear modelos de fundas', 'crear-fundas', '', 'btnChico')}
        ${boton('Precio de compra: silicona', 'precio-fundas', 'data-tipo="silicona"', 'btnChico')}
        ${boton('Precio de compra: MagSafe', 'precio-fundas', 'data-tipo="magsafe"', 'btnChico')}` : ''}
      ${cat === 'Cargadores' ? boton('Crear combo', 'nuevo-combo', '', 'btnChico') : ''}
      ${boton('Exportar CSV', 'exportar-categoria', `data-categoria="${esc(cat)}"`, 'btnChico')}
    </div>`;
  }

  function modelosDe(cat) {
    const mapa = new Map();
    for (const p of datos.productos.filter((x) => x.categoria === cat)) {
      const clave = (p.modelo || '').trim() || SIN_MODELO;
      const actual = mapa.get(clave) || { unidades: 0, variantes: 0 };
      actual.unidades += Math.max(0, p.stock);
      actual.variantes += 1;
      mapa.set(clave, actual);
    }
    return [...mapa.entries()]
      .map(([modelo, v]) => ({ modelo, ...v }))
      .sort((a, b) => a.modelo.localeCompare(b.modelo, 'es', { numeric: true }));
  }

  function tarjetasModelos(cat) {
    const modelos = modelosDe(cat);
    return `${herramientasCategoria(cat)}
      ${modelos.length ? `<div class="modelos">${modelos.map((m) => `
        <a class="modelo" href="${enlace('stock', cat, m.modelo)}">
          <span><strong>${esc(m.modelo)}</strong><small>${plural(m.variantes, 'variante')}</small></span>
          <span class="modeloStock tono-${nivel(m.unidades).clase}">${m.unidades}<small>en stock</small></span>
        </a>`).join('')}</div>`
        : `<p class="vacio caja">Todavía no hay ${cat.toLowerCase()} cargados. Tocá “Nuevo producto”${cat === 'Fundas' ? ' o “Crear modelos de fundas”' : ''}.</p>`}`;
  }

  function detalleModelo(cat, modelo) {
    const items = datos.productos.filter((p) => p.categoria === cat && ((p.modelo || '').trim() || SIN_MODELO) === modelo);
    let grupos = '';
    if (cat === 'Fundas' || cat === 'Templados') {
      const nombres = cat === 'Fundas' ? GRUPOS_FUNDA : ['Templados', 'Templados anti espía'];
      const deGrupo = cat === 'Fundas' ? grupoFunda : grupoTemplado;
      grupos = `<div class="grupos">${nombres.map((nombre) => {
        const lista = items.filter((p) => deGrupo(p) === nombre);
        const unidades = suma(lista, (p) => Math.max(0, p.stock));
        const muestra = nombre === 'MagSafe' ? punto('Transparente') : cat === 'Fundas' ? punto(nombre) : '';
        return `<div class="grupo">
          <div class="grupoCabecera"><span>${muestra}${nombre}</span><strong class="tono-${nivel(unidades).clase}">${unidades}</strong></div>
          ${lista.length ? `<ul>${lista.map((p) => `<li><span>${esc([p.nombre, p.color].filter(Boolean).join(' · '))}</span><span>${p.stock}</span></li>`).join('')}</ul>` : '<p class="sutil chico">Sin stock</p>'}
        </div>`;
      }).join('')}</div>`;
    }
    return `
      <div class="migas">
        <a href="${enlace('stock', cat)}">${cat}</a>
        <span aria-hidden="true">/</span>
        <strong>${esc(modelo)}</strong>
      </div>
      ${herramientasCategoria(cat)}
      ${grupos}
      ${tablaProductos(items, { color: CON_COLOR.has(cat) })}`;
  }

  function listaCategoria(cat) {
    const items = datos.productos.filter((p) => p.categoria === cat && (!soloBajo || p.stock <= datos.ajustes.stock_bajo));
    const filtro = `<label class="casilla"><input type="checkbox" id="soloBajo"${soloBajo ? ' checked' : ''}> Solo poco stock</label>`;
    return `${herramientasCategoria(cat, filtro)}
      ${cat === 'Cargadores' ? seccionCombos(cat) : ''}
      ${tablaProductos(items, { modelo: true, color: CON_COLOR.has(cat) })}`;
  }

  function tablaProductos(items, columnas) {
    const { categoria = false, modelo = false, color = false } = columnas;
    if (!items.length) return `<p class="vacio caja">No hay productos${soloBajo ? ' con poco stock' : ''} acá.</p>`;
    return `<div class="tablaCaja"><div class="tablaScroll"><table class="tabla">
      <thead><tr>
        <th>Producto</th>
        ${categoria ? '<th>Categoría</th>' : ''}
        ${modelo ? '<th>Modelo</th>' : ''}
        ${color ? '<th>Color</th>' : ''}
        <th class="num">Stock</th><th class="num">Compra</th><th class="num">Venta</th><th class="num">Ganancia</th><th>Estado</th>
        <th><span class="visualmenteOculto">Acciones</span></th>
      </tr></thead>
      <tbody>${items.map((p) => `<tr>
        <td class="fuerte">${esc(p.nombre)}${p.sku ? ` <span class="sutil chico">${esc(p.sku)}</span>` : ''}</td>
        ${categoria ? `<td>${esc(p.categoria)}</td>` : ''}
        ${modelo ? `<td>${esc(p.modelo || '—')}</td>` : ''}
        ${color ? `<td class="nowrap">${p.color ? punto(p.color) + esc(p.color) : '<span class="sutil">—</span>'}</td>` : ''}
        <td class="num fuerte">${p.stock}</td>
        <td class="num">${$p(p.precio_compra)}</td>
        <td class="num">${$p(p.precio_venta)}</td>
        <td class="num tono-ok">${$p(p.precio_venta - p.precio_compra)}</td>
        <td>${etiquetaNivel(p.stock)}</td>
        <td class="acciones">
          ${boton('+ Stock', 'sumar-stock', `data-id="${esc(p.id)}"`, 'btnMini lleno')}
          ${boton('Editar', 'editar-producto', `data-id="${esc(p.id)}"`)}
          ${boton('Eliminar', 'borrar-producto', `data-id="${esc(p.id)}"`, 'btnMini peligro')}
        </td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  function seccionCombos(cat) {
    const combos = datos.combos.filter((c) => c.categoria === cat);
    if (!combos.length) return '';
    return `<h2 class="subtitulo">Combos</h2>
      <div class="grupos">${combos.map((c) => {
        const disponibles = stockCombo(c);
        return `<div class="grupo">
          <div class="grupoCabecera"><span>${esc(c.nombre)}</span><strong class="tono-${nivel(disponibles).clase}">${disponibles}</strong></div>
          <ul>${c.componentes.map((comp) => {
            const p = producto(comp.producto_id);
            return p ? `<li><span>${esc(etiqueta(p))}${comp.cantidad > 1 ? ` × ${comp.cantidad}` : ''}</span><span>${p.stock} u.</span></li>` : '';
          }).join('')}</ul>
          <p class="grupoPrecio">${$p(c.precio_venta)}</p>
          <div class="grupoAcciones">
            ${boton('Vender', 'vender-combo', `data-id="${esc(c.id)}"`, 'btnMini lleno')}
            ${boton('Editar', 'editar-combo', `data-id="${esc(c.id)}"`)}
            ${boton('Eliminar', 'borrar-combo', `data-id="${esc(c.id)}"`, 'btnMini peligro')}
          </div>
        </div>`;
      }).join('')}</div>`;
  }

  // ---------- Movimientos ----------
  function movimientosFiltrados() {
    const f = filtrosMov;
    const deCategoria = f.categoria ? new Set(datos.productos.filter((p) => p.categoria === f.categoria).map((p) => p.id)) : null;
    return datos.movimientos.filter((m) =>
      (!f.desde || diaLocal(m.fecha) >= f.desde) &&
      (!f.hasta || diaLocal(m.fecha) <= f.hasta) &&
      (!f.tipo || m.tipo === f.tipo) &&
      (!f.producto || m.producto_id === f.producto) &&
      (!deCategoria || deCategoria.has(m.producto_id))
    );
  }

  function vistaMovimientos() {
    const lista = movimientosFiltrados();
    const ops = operaciones(lista);
    const f = filtrosMov;
    const hayFiltros = Object.values(f).some(Boolean);
    const productosOrdenados = [...datos.productos].sort((a, b) => etiqueta(a).localeCompare(etiqueta(b), 'es', { numeric: true }));
    return `
      ${cabecera('Movimientos', `${plural(ops.length, 'operación', 'operaciones')}${hayFiltros ? ' con estos filtros' : ''}`,
        `${boton('Exportar CSV', 'exportar-movimientos', '', 'btnChico')}
         ${boton('Nuevo ingreso', 'nuevo-ingreso', '', 'btnChico')}
         <button type="button" class="btn btnPrimario" data-accion="nueva-venta">Nueva venta</button>`)}

      <div class="datos">
        ${dato('Plata gastada', $p(suma(lista.filter((m) => m.tipo === 'ingreso'), importe)), 'en compras de mercadería')}
        ${dato('Plata cobrada', $p(suma(lista.filter((m) => m.tipo === 'venta'), importe)), 'en ventas')}
        ${dato('Ganancia', $p(suma(lista.filter((m) => m.tipo === 'venta'), ganancia)), 'ventas menos costo', 'positivo')}
      </div>

      <div class="filtrosMov">
        <div class="campo"><label for="movDesde">Desde</label><input type="date" id="movDesde" data-filtro="desde" value="${f.desde}"></div>
        <div class="campo"><label for="movHasta">Hasta</label><input type="date" id="movHasta" data-filtro="hasta" value="${f.hasta}"></div>
        <div class="campo"><label for="movTipo">Tipo</label>
          <select id="movTipo" data-filtro="tipo">
            <option value="">Todos</option>
            <option value="venta"${f.tipo === 'venta' ? ' selected' : ''}>Ventas</option>
            <option value="ingreso"${f.tipo === 'ingreso' ? ' selected' : ''}>Ingresos</option>
            <option value="ajuste"${f.tipo === 'ajuste' ? ' selected' : ''}>Ajustes</option>
          </select></div>
        <div class="campo"><label for="movCategoria">Categoría</label>
          <select id="movCategoria" data-filtro="categoria">
            <option value="">Todas</option>
            ${CATEGORIAS.map((c) => `<option${f.categoria === c ? ' selected' : ''}>${c}</option>`).join('')}
          </select></div>
        <div class="campo"><label for="movProducto">Producto</label>
          <select id="movProducto" data-filtro="producto">
            <option value="">Todos</option>
            ${productosOrdenados.map((p) => `<option value="${esc(p.id)}"${f.producto === p.id ? ' selected' : ''}>${esc(etiqueta(p))}</option>`).join('')}
          </select></div>
        ${hayFiltros ? boton('Limpiar filtros', 'limpiar-filtros', '', 'btnTexto') : ''}
      </div>

      <div class="tablaCaja">${tablaOperaciones(ops, true)}</div>`;
  }

  // ---------- Clientes ----------
  function datosCliente(id) {
    const compras = ventas().filter((m) => m.cliente_id === id);
    return {
      compras: new Set(compras.map((m) => m.operacion)).size,
      unidades: suma(compras, (m) => m.cantidad),
      total: suma(compras, importe),
      ultima: compras[0]?.fecha
    };
  }

  function vistaClientes() {
    return `
      ${cabecera('Clientes', plural(datos.clientes.length, 'cliente'),
        '<button type="button" class="btn btnPrimario" data-accion="nuevo-cliente">Nuevo cliente</button>')}
      <label class="buscador buscadorSuelto">
        ${ICONO_BUSCAR}
        <span class="visualmenteOculto">Buscar cliente</span>
        <input type="search" id="buscarClientes" placeholder="Buscar por nombre, apellido o celular" value="${esc(busquedaClientes)}" autocomplete="off">
      </label>
      <div id="clientesContenido">${contenidoClientes()}</div>`;
  }

  function contenidoClientes() {
    const lista = datos.clientes
      .filter((c) => coincide(`${c.nombre} ${c.apellido} ${c.celular}`, busquedaClientes))
      .map((c) => ({ c, ...datosCliente(c.id) }))
      .sort((a, b) => (b.ultima || '').localeCompare(a.ultima || ''));
    if (!lista.length) {
      return `<p class="vacio caja">${datos.clientes.length ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes. Se crean solos al registrar una venta.'}</p>`;
    }
    return `<div class="tablaCaja"><div class="tablaScroll"><table class="tabla">
      <thead><tr><th>Cliente</th><th>Celular</th><th class="num">Compras</th><th class="num">Unidades</th><th class="num">Total gastado</th><th>Última compra</th><th><span class="visualmenteOculto">Acciones</span></th></tr></thead>
      <tbody>${lista.map(({ c, compras, unidades, total, ultima }) => `<tr>
        <td class="fuerte">${esc(nombreCliente(c))}</td>
        <td class="nowrap">${c.celular ? `<a class="enlaceTabla" href="https://wa.me/${esc(c.celular.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(c.celular)}</a>` : '—'}</td>
        <td class="num">${compras}</td>
        <td class="num">${unidades}</td>
        <td class="num fuerte">${$p(total)}</td>
        <td class="sutil">${ultima ? fechaCorta(ultima) : '—'}</td>
        <td class="acciones">
          ${boton('Historial', 'historial-cliente', `data-id="${esc(c.id)}"`)}
          ${boton('Editar', 'editar-cliente', `data-id="${esc(c.id)}"`)}
          ${boton('Eliminar', 'borrar-cliente', `data-id="${esc(c.id)}"`, 'btnMini peligro')}
        </td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  // ---------- Estadísticas ----------
  function vistaEstadisticas() {
    const V = ventas();
    const porProducto = new Map();
    for (const m of V) {
      const actual = porProducto.get(m.producto_id) || { unidades: 0, ingreso: 0, ganancia: 0 };
      actual.unidades += m.cantidad;
      actual.ingreso += importe(m);
      actual.ganancia += ganancia(m);
      porProducto.set(m.producto_id, actual);
    }
    const top = [...porProducto.entries()]
      .map(([id, v]) => ({ p: producto(id), ...v }))
      .filter((x) => x.p)
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 10);

    const porMes = new Map();
    for (const m of V) {
      const clave = diaLocal(m.fecha).slice(0, 7);
      const actual = porMes.get(clave) || { ingreso: 0, ganancia: 0 };
      actual.ingreso += importe(m);
      actual.ganancia += ganancia(m);
      porMes.set(clave, actual);
    }
    const meses = [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const maximo = Math.max(1, ...meses.map(([, v]) => v.ingreso));
    const nombreMes = (clave) => {
      const [a, m] = clave.split('-').map(Number);
      const t = new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      return t.charAt(0).toUpperCase() + t.slice(1);
    };

    return `
      ${cabecera('Estadísticas', `${plural(new Set(V.map((m) => m.operacion)).size, 'venta')} registradas`)}
      <div class="datos">
        ${dato('Ingresos totales', $p(suma(V, importe)), 'todas las ventas')}
        ${dato('Ganancia total', $p(suma(V, ganancia)), 'ventas menos costo', 'positivo')}
        ${dato('Unidades vendidas', suma(V, (m) => m.cantidad), 'accesorios')}
        ${dato('Valor del stock', $p(suma(datos.productos, (p) => Math.max(0, p.stock) * p.precio_venta)), 'a precio de venta')}
      </div>
      <div class="cajasDos">
        <section class="caja">
          <h2 class="cajaTitulo">Productos más vendidos</h2>
          ${top.length ? `<div class="tablaScroll"><table class="tabla">
            <thead><tr><th>Producto</th><th class="num">Unidades</th><th class="num">Ingreso</th><th class="num">Ganancia</th></tr></thead>
            <tbody>${top.map((t) => `<tr>
              <td>${esc(etiqueta(t.p))}</td>
              <td class="num fuerte">${t.unidades}</td>
              <td class="num">${$p(t.ingreso)}</td>
              <td class="num tono-ok">${$p(t.ganancia)}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : '<p class="vacio">Todavía no hay ventas.</p>'}
        </section>
        <section class="caja">
          <h2 class="cajaTitulo">Ventas por mes</h2>
          ${meses.length ? `<ul class="meses">${meses.map(([clave, v]) => `
            <li>
              <div class="mesFila"><span>${nombreMes(clave)}</span><strong>${$p(v.ingreso)}</strong></div>
              <div class="barraMes"><span style="width:${(v.ingreso / maximo * 100).toFixed(1)}%"></span></div>
              <p class="sutil chico">Ganancia ${$p(v.ganancia)}</p>
            </li>`).join('')}</ul>` : '<p class="vacio">Todavía no hay ventas.</p>'}
        </section>
      </div>`;
  }

  // ---------- Ajustes ----------
  function vistaAjustes() {
    return `
      ${cabecera('Ajustes', 'Alertas de stock y copias de seguridad')}
      <div class="ajustes">
        <section class="caja">
          <h2 class="cajaTitulo">Alertas de stock</h2>
          <form id="formAjustes" class="filaForm" novalidate>
            <div class="campo">
              <label for="stockBajo">Avisar “poco stock” con</label>
              <input type="number" id="stockBajo" min="0" step="1" inputmode="numeric" value="${datos.ajustes.stock_bajo}">
              <p class="ayuda">unidades o menos. Esos productos aparecen en “Para reponer” del resumen.</p>
            </div>
            <button type="submit" class="btnChico lleno">Guardar</button>
          </form>
        </section>

        <section class="caja">
          <h2 class="cajaTitulo">Copia de seguridad</h2>
          <p class="sutil margenAbajo">Descargá una copia de productos, ventas, clientes y combos. Para restaurarla, subí el archivo: se agregan o actualizan los datos, no se borra nada. También acepta las copias de la app de stock anterior.</p>
          <div class="herramientas">
            ${boton('Descargar copia', 'descargar-copia', '', 'btnChico lleno')}
            <label class="btnChico">Restaurar copia<input type="file" id="archivoCopia" accept="application/json,.json" class="visualmenteOculto"></label>
          </div>
        </section>

        <section class="caja">
          <h2 class="cajaTitulo">Importar y exportar CSV</h2>
          <p class="sutil margenAbajo">Para importar productos, el archivo necesita estas columnas: <code>nombre, categoria, modelo, color, stock, precio_compra, precio_venta, sku</code>.</p>
          <div class="herramientas">
            <label class="btnChico">Importar productos CSV<input type="file" id="archivoCsv" accept=".csv,text/csv" class="visualmenteOculto"></label>
            ${boton('Exportar movimientos CSV', 'exportar-movimientos', '', 'btnChico')}
          </div>
        </section>

        <section class="caja cajaPeligro">
          <h2 class="cajaTitulo">Borrar todo el stock</h2>
          <p class="sutil margenAbajo">Elimina todos los productos, ventas, ingresos, clientes y combos. Los equipos publicados en el sitio no se tocan. No se puede deshacer: descargá una copia antes.</p>
          ${boton('Borrar todo el stock', 'borrar-todo', '', 'btnChico peligroLleno')}
        </section>
      </div>`;
  }

  // ---------- Ventana de formularios ----------
  function abrirModal({ titulo, cuerpo, pie, ancho = false, alEnviar, alMontar }) {
    modal.className = 'modal' + (ancho ? ' ancho' : '');
    modal.innerHTML = `<form class="modalForm" novalidate>
      <div class="modalCabecera">
        <h2>${titulo}</h2>
        <button type="button" class="btnIconoAdmin" data-cerrar aria-label="Cerrar">${ICONO_CERRAR}</button>
      </div>
      <div class="modalCuerpo">${cuerpo}</div>
      <div class="modalPie">
        <p class="error modalError" role="alert" hidden></p>
        ${pie}
      </div>
    </form>`;
    const form = modal.querySelector('form');
    const errorEl = form.querySelector('.modalError');
    const fallo = (texto) => {
      errorEl.textContent = texto;
      errorEl.hidden = false;
      return false;
    };
    form.addEventListener('input', () => (errorEl.hidden = true));
    modal.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => modal.close()));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enviar = form.querySelector('[type="submit"]');
      if (enviar.disabled) return;
      enviar.disabled = true;
      try {
        const resultado = await alEnviar(form, fallo);
        if (resultado !== false) modal.close();
      } catch (error) {
        console.error(error);
        fallo(mensajeError(error, 'No se pudo guardar. Revisá tu conexión y probá de nuevo.'));
      } finally {
        enviar.disabled = false;
      }
    });
    modal.showModal();
    alMontar?.(form);
  }

  function confirmar({ titulo, texto, accion = 'Eliminar', escribirPalabra }) {
    return new Promise((resolver) => {
      let aceptado = false;
      abrirModal({
        titulo,
        cuerpo: `<p class="textoModal">${texto}</p>
          ${escribirPalabra ? `<div class="campo"><label for="palabraConfirmar">Escribí ${escribirPalabra} para confirmar</label><input id="palabraConfirmar" autocomplete="off"></div>` : ''}`,
        pie: `<button type="button" class="btnTexto" data-cerrar>Cancelar</button>
              <button type="submit" class="btn btnPeligroLleno">${accion}</button>`,
        alEnviar: (form, fallo) => {
          if (escribirPalabra && form.querySelector('#palabraConfirmar').value.trim().toUpperCase() !== escribirPalabra) {
            return fallo(`Escribí ${escribirPalabra} para confirmar.`);
          }
          aceptado = true;
        },
        alMontar: (form) => form.querySelector(escribirPalabra ? '#palabraConfirmar' : '[type="submit"]').focus()
      });
      modal.addEventListener('close', () => resolver(aceptado), { once: true });
    });
  }

  const numero = (valor) => (valor === '' || valor == null ? null : Number(valor));

  // ---------- Productos ----------
  function formProducto(p = null, categoria = '', modelo = '') {
    const v = p || { nombre: '', categoria: categoria || ruta.categoria || 'Fundas', modelo, color: '', stock: 0, precio_compra: '', precio_venta: '', sku: '' };
    abrirModal({
      titulo: p ? 'Editar producto' : 'Nuevo producto',
      cuerpo: `
        <div class="campo">
          <label for="pNombre">Nombre</label>
          <input id="pNombre" value="${esc(v.nombre)}" placeholder="Ej: Funda, Templado, Cargador 20W" required autocomplete="off">
        </div>
        <div class="camposFila">
          <div class="campo">
            <label for="pCategoria">Categoría</label>
            <select id="pCategoria">${CATEGORIAS.map((c) => `<option${c === v.categoria ? ' selected' : ''}>${c}</option>`).join('')}</select>
          </div>
          <div class="campo">
            <label for="pModelo">Modelo <span class="opcional">opcional</span></label>
            <input id="pModelo" value="${esc(v.modelo || '')}" list="modelos" placeholder="iPhone 13" autocomplete="off">
          </div>
        </div>
        <div class="camposFila">
          <div class="campo">
            <label for="pColor">Color <span class="opcional">opcional</span></label>
            <input id="pColor" value="${esc(v.color || '')}" list="coloresStock" placeholder="Negro" autocomplete="off">
          </div>
          <div class="campo">
            <label for="pSku">SKU <span class="opcional">opcional</span></label>
            <input id="pSku" value="${esc(v.sku || '')}" autocomplete="off">
          </div>
        </div>
        <div class="campo">
          <label for="pStock">Stock</label>
          <input id="pStock" type="number" step="1" inputmode="numeric" value="${v.stock}">
          ${p ? '<p class="ayuda">Para sumar mercadería usá “+ Stock”, así queda registrado el ingreso.</p>' : ''}
        </div>
        <div class="camposFila">
          <div class="campo">
            <label for="pCompra">Precio de compra</label>
            <input id="pCompra" type="number" min="0" step="any" inputmode="decimal" value="${v.precio_compra ?? ''}" placeholder="0">
          </div>
          <div class="campo">
            <label for="pVenta">Precio de venta</label>
            <input id="pVenta" type="number" min="0" step="any" inputmode="decimal" value="${v.precio_venta ?? ''}" placeholder="0">
          </div>
        </div>`,
      pie: `<button type="button" class="btnTexto" data-cerrar>Cancelar</button>
            <button type="submit" class="btn btnPrimario">${p ? 'Guardar' : 'Crear producto'}</button>`,
      alMontar: (form) => form.querySelector('#pNombre').focus(),
      alEnviar: async (form, fallo) => {
        const valor = (id) => form.querySelector(id).value.trim();
        const fila = {
          nombre: valor('#pNombre'),
          categoria: valor('#pCategoria'),
          modelo: valor('#pModelo') || null,
          color: valor('#pColor') || null,
          sku: valor('#pSku') || null,
          stock: Math.trunc(Number(valor('#pStock')) || 0),
          precio_compra: Number(valor('#pCompra')) || 0,
          precio_venta: Number(valor('#pVenta')) || 0
        };
        if (!fila.nombre) return fallo('Escribí el nombre del producto.');
        if (fila.precio_compra < 0 || fila.precio_venta < 0) return fallo('Los precios no pueden ser negativos.');
        const consulta = p ? db.from('productos').update(fila).eq('id', p.id) : db.from('productos').insert(fila);
        const { error } = await consulta;
        if (error) throw error;
        await refrescar();
        avisar(p ? 'Producto guardado.' : `${fila.nombre} creado.`);
      }
    });
  }

  async function borrarProducto(id) {
    const p = producto(id);
    if (!p) return;
    const movs = datos.movimientos.filter((m) => m.producto_id === id).length;
    const ok = await confirmar({
      titulo: 'Eliminar producto',
      texto: `¿Eliminar <strong>${esc(etiqueta(p))}</strong>?${movs ? ` También se borran sus ${plural(movs, 'movimiento')} del historial, y eso cambia las estadísticas.` : ''}`
    });
    if (ok) await escribir(db.from('productos').delete().eq('id', id), 'Producto eliminado.', 'No se pudo eliminar. Probá de nuevo.');
  }

  // ---------- Renglones de ventas e ingresos ----------
  // Un buscador de producto por renglón, con cantidad, precio y subtotal.
  function montarRenglones(form, { renglones, modo, disponible }) {
    const caja = form.querySelector('#renglones');
    const totalEl = form.querySelector('#totalOperacion');
    const esVenta = modo === 'venta';

    const precioDe = (r) => {
      if (esVenta) return Number(r.precio) || 0;
      const p = producto(r.producto_id);
      return r.costo === '' || r.costo == null ? (p?.precio_compra || 0) : Number(r.costo) || 0;
    };
    const subtotal = (r) => (Number(r.cantidad) || 0) * precioDe(r);
    const nombreDe = (r) => (r.combo_id ? combo(r.combo_id)?.nombre : r.producto_id ? etiqueta(producto(r.producto_id) || {}) : '') || '';

    function info(r) {
      if (r.combo_id) {
        const c = combo(r.combo_id);
        return c ? `Combos disponibles: <strong>${stockCombo(c)}</strong> · ${c.componentes.map((comp) => {
          const p = producto(comp.producto_id);
          return p ? `${esc(p.nombre)}: ${p.stock}` : '';
        }).filter(Boolean).join(' · ')}` : '';
      }
      const p = producto(r.producto_id);
      if (!p) return '';
      return esVenta
        ? `Disponible: <strong>${disponible(p)}</strong> · Compra ${$p(p.precio_compra)} · Venta ${$p(p.precio_venta)}`
        : `Stock actual: <strong>${p.stock}</strong> · Compra actual ${$p(p.precio_compra)} · Venta ${$p(p.precio_venta)}`;
    }

    function html(r, i) {
      const p = producto(r.producto_id);
      return `<div class="renglon" data-i="${i}">
        <div class="renglonCabecera">
          <span>Producto ${i + 1}</span>
          ${renglones.length > 1 ? '<button type="button" class="btnTexto btnPeligro" data-quitar>Quitar</button>' : ''}
        </div>
        <div class="selector">
          <input type="search" class="buscarRenglon" placeholder="Buscar por nombre, modelo, color o SKU" autocomplete="off"
            value="${esc(nombreDe(r))}" aria-label="Producto ${i + 1}" aria-autocomplete="list" aria-expanded="false">
          <div class="opciones" role="listbox" hidden></div>
        </div>
        <p class="renglonInfo">${info(r)}</p>
        <div class="camposFila tres">
          <div class="campo">
            <label for="cant${i}">Cantidad</label>
            <input id="cant${i}" type="number" min="1" step="1" inputmode="numeric" data-campo="cantidad" value="${r.cantidad}">
          </div>
          <div class="campo">
            <label for="precio${i}">${esVenta ? 'Precio unitario' : 'Costo unitario'}</label>
            <input id="precio${i}" type="number" min="0" step="any" inputmode="decimal" data-campo="${esVenta ? 'precio' : 'costo'}"
              value="${esVenta ? r.precio : r.costo}" ${!esVenta && p ? `placeholder="${esc($p(p.precio_compra))}"` : ''}>
          </div>
          <div class="campo">
            <span class="etiquetaCampo">Subtotal</span>
            <div class="subtotal">${$p(subtotal(r))}</div>
          </div>
        </div>
      </div>`;
    }

    function total() {
      totalEl.textContent = $p(suma(renglones, subtotal));
    }

    function dibujar() {
      caja.innerHTML = renglones.map(html).join('');
      total();
    }

    function opciones(consulta) {
      let html = '';
      if (esVenta) {
        const combos = datos.combos.filter((c) => stockCombo(c) > 0 && coincide(c.nombre, consulta)).slice(0, 5);
        if (combos.length) {
          html += `<p class="opcionesTitulo">Combos</p>${combos.map((c) => `
            <button type="button" class="opcion" role="option" data-combo="${esc(c.id)}">
              <span><span class="etiqueta venta">Combo</span> ${esc(c.nombre)}</span><small>${stockCombo(c)} disp.</small>
            </button>`).join('')}<p class="opcionesTitulo">Productos</p>`;
        }
      }
      const lista = datos.productos
        .filter((p) => (!esVenta || disponible(p) > 0) && coincide(textoBusqueda(p), consulta))
        .sort((a, b) => etiqueta(a).localeCompare(etiqueta(b), 'es', { numeric: true }))
        .slice(0, 40);
      html += lista.length ? lista.map((p) => `
        <button type="button" class="opcion" role="option" data-producto="${esc(p.id)}">
          <span>${punto(p.color)}<strong>${esc(p.nombre)}</strong>${p.modelo ? ` · ${esc(p.modelo)}` : ''}${p.color ? ` · ${esc(p.color)}` : ''}</span>
          <small class="${esVenta && disponible(p) <= datos.ajustes.stock_bajo ? 'tono-bajo' : ''}">${esVenta ? `${disponible(p)} disp.` : `compra ${$p(p.precio_compra)}`}</small>
        </button>`).join('')
        : `<p class="opcionesVacio">${esVenta ? 'No hay productos con stock que coincidan.' : 'No hay productos que coincidan.'}</p>`;
      return html;
    }

    function abrirOpciones(input) {
      const lista = input.nextElementSibling;
      lista.innerHTML = opciones(input.value);
      lista.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function cerrarOpciones(excepto) {
      caja.querySelectorAll('.opciones').forEach((lista) => {
        if (lista === excepto) return;
        lista.hidden = true;
        lista.previousElementSibling.setAttribute('aria-expanded', 'false');
      });
    }

    function elegir(i, boton) {
      const r = renglones[i];
      if (boton.dataset.combo) {
        const c = combo(boton.dataset.combo);
        Object.assign(r, { combo_id: c.id, producto_id: '', precio: c.precio_venta });
      } else {
        const p = producto(boton.dataset.producto);
        Object.assign(r, { producto_id: p.id, combo_id: '' });
        if (esVenta) r.precio = p.precio_venta;
      }
      dibujar();
      caja.querySelector(`#cant${i}`).select();
    }

    caja.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('buscarRenglon')) {
        cerrarOpciones(e.target.nextElementSibling);
        abrirOpciones(e.target);
      }
    });

    caja.addEventListener('input', (e) => {
      const fila = e.target.closest('.renglon');
      if (!fila) return;
      const r = renglones[Number(fila.dataset.i)];
      if (e.target.classList.contains('buscarRenglon')) {
        Object.assign(r, { producto_id: '', combo_id: '' });
        fila.querySelector('.renglonInfo').innerHTML = '';
        abrirOpciones(e.target);
        return;
      }
      if (e.target.dataset.campo) {
        r[e.target.dataset.campo] = e.target.value;
        fila.querySelector('.subtotal').textContent = $p(subtotal(r));
        total();
      }
    });

    caja.addEventListener('keydown', (e) => {
      const input = e.target;
      if (!input.classList?.contains('buscarRenglon')) {
        if (input.classList?.contains('opcion') && e.key === 'Escape') {
          e.preventDefault();
          cerrarOpciones();
          input.closest('.selector').querySelector('input').focus();
        }
        if (input.classList?.contains('opcion') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          const todas = [...input.parentElement.querySelectorAll('.opcion')];
          const siguiente = todas[todas.indexOf(input) + (e.key === 'ArrowDown' ? 1 : -1)];
          (siguiente || input.closest('.selector').querySelector('input')).focus();
        }
        return;
      }
      const primera = input.nextElementSibling.querySelector('.opcion');
      if (e.key === 'Enter') {
        e.preventDefault(); // que Enter elija el producto y no envíe el formulario
        if (primera) elegir(Number(input.closest('.renglon').dataset.i), primera);
      } else if (e.key === 'ArrowDown' && primera) {
        e.preventDefault();
        primera.focus();
      } else if (e.key === 'Escape' && !input.nextElementSibling.hidden) {
        e.preventDefault();
        e.stopPropagation(); // cierra la lista, no la ventana
        cerrarOpciones();
      }
    });

    caja.addEventListener('click', (e) => {
      const fila = e.target.closest('.renglon');
      if (!fila) return;
      const i = Number(fila.dataset.i);
      const opcion = e.target.closest('.opcion');
      if (opcion) return elegir(i, opcion);
      if (e.target.closest('[data-quitar]')) {
        renglones.splice(i, 1);
        dibujar();
      }
    });

    // Cerrar las listas al tocar fuera de ellas
    form.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.selector')) cerrarOpciones();
    });

    form.querySelector('#agregarRenglon').addEventListener('click', () => {
      renglones.push(esVenta ? { producto_id: '', combo_id: '', cantidad: 1, precio: '' } : { producto_id: '', cantidad: 1, costo: '' });
      dibujar();
      caja.querySelector('.renglon:last-child .buscarRenglon').focus();
    });

    dibujar();
  }

  const cuerpoRenglones = (textoAyuda) => `
    ${textoAyuda ? `<p class="ayuda margenAbajo">${textoAyuda}</p>` : ''}
    <div id="renglones"></div>
    <button type="button" class="btnAgregar" id="agregarRenglon">+ Agregar otro producto</button>`;

  const pieRenglones = (textoTotal, textoBoton) => `
    <div class="totalOperacion"><span>${textoTotal}</span><strong id="totalOperacion">${$p(0)}</strong></div>
    <button type="button" class="btnTexto" data-cerrar>Cancelar</button>
    <button type="submit" class="btn btnPrimario">${textoBoton}</button>`;

  // ---------- Ingreso de mercadería ----------
  function formIngreso(productoId = '') {
    const renglones = [{ producto_id: productoId, cantidad: 1, costo: '' }];
    abrirModal({
      titulo: 'Ingreso de mercadería',
      ancho: true,
      cuerpo: `${cuerpoRenglones('Si dejás el costo vacío, se usa el último precio de compra del producto. Si lo completás, se actualiza.')}
        <div class="campo margenArriba">
          <label for="ingNota">Nota <span class="opcional">opcional</span></label>
          <input id="ingNota" placeholder="Ej: proveedor, número de factura" autocomplete="off">
        </div>`,
      pie: pieRenglones('Total gastado', 'Registrar ingreso'),
      alMontar: (form) => {
        montarRenglones(form, { renglones, modo: 'ingreso' });
        if (productoId) form.querySelector('#cant0').select();
        else form.querySelector('.buscarRenglon').focus();
      },
      alEnviar: async (form, fallo) => {
        const lineas = [];
        for (const [i, r] of renglones.entries()) {
          const p = producto(r.producto_id);
          if (!p) return fallo(`Producto ${i + 1}: elegí un producto de la lista.`);
          const cantidad = Number(r.cantidad);
          if (!Number.isInteger(cantidad) || cantidad <= 0) return fallo(`${p.nombre}: la cantidad tiene que ser un número entero mayor a 0.`);
          const costo = numero(r.costo);
          if (costo !== null && !(costo >= 0)) return fallo(`${p.nombre}: el costo no puede ser negativo.`);
          lineas.push({ producto_id: p.id, cantidad, costo_unitario: costo });
        }
        const { error } = await db.rpc('registrar_ingreso', { p_lineas: lineas, p_nota: form.querySelector('#ingNota').value });
        if (error) throw error;
        await refrescar();
        avisar(`Ingreso registrado: ${plural(suma(lineas, (l) => l.cantidad), 'unidad', 'unidades')}.`);
      }
    });
  }

  // ---------- Ventas ----------
  // operacion: para editar una venta existente. comboId: para arrancar con un combo cargado.
  function formVenta(operacion = '', comboId = '') {
    const anteriores = operacion ? datos.movimientos.filter((m) => m.operacion === operacion && m.tipo === 'venta') : [];
    if (operacion && !anteriores.length) return avisar('No se encontró esa venta.');

    // Al editar, lo vendido vuelve a estar disponible
    const devuelto = new Map();
    for (const m of anteriores) devuelto.set(m.producto_id, (devuelto.get(m.producto_id) || 0) + m.cantidad);
    const disponible = (p) => p.stock + (devuelto.get(p.id) || 0);

    const c = comboId ? combo(comboId) : null;
    const renglones = anteriores.length
      ? anteriores.map((m) => ({ producto_id: m.producto_id, combo_id: '', cantidad: m.cantidad, precio: m.precio_unitario }))
      : [{ producto_id: '', combo_id: c?.id || '', cantidad: 1, precio: c ? c.precio_venta : '' }];
    const clienteAnterior = anteriores.length ? cliente(anteriores[0].cliente_id) : null;
    // Al editar una venta que quedó sin celular, la casilla arranca marcada
    const sinNumeroAntes = anteriores.length > 0 && !clienteAnterior?.celular;

    abrirModal({
      titulo: operacion ? 'Editar venta' : 'Nueva venta',
      ancho: true,
      cuerpo: `${cuerpoRenglones()}
        <fieldset class="bloqueCliente">
          <legend>Cliente</legend>
          <div class="campo">
            <label for="venCelular">Celular</label>
            <input id="venCelular" type="tel" inputmode="tel" list="celularesClientes" placeholder="261 555-5555" autocomplete="off" value="${esc(clienteAnterior?.celular || '')}"${sinNumeroAntes ? ' disabled' : ''}>
            <p class="ayuda" id="venClienteAyuda">${sinNumeroAntes ? 'Venta sin celular. El nombre es opcional.' : clienteAnterior ? `Cliente: ${esc(nombreCliente(clienteAnterior))}` : 'Si ya compró, se completa solo.'}</p>
            <label class="casilla"><input type="checkbox" id="venSinNumero"${sinNumeroAntes ? ' checked' : ''}> No me dejó el número</label>
          </div>
          <div class="camposFila">
            <div class="campo">
              <label for="venNombre">Nombre <span class="opcional" id="venNombreOpcional"${sinNumeroAntes ? '' : ' hidden'}>opcional</span></label>
              <input id="venNombre" value="${esc(clienteAnterior?.nombre || '')}" autocomplete="off">
            </div>
            <div class="campo">
              <label for="venApellido">Apellido <span class="opcional">opcional</span></label>
              <input id="venApellido" value="${esc(clienteAnterior?.apellido || '')}" autocomplete="off">
            </div>
          </div>
        </fieldset>
        <div class="campo">
          <label for="venNota">Nota <span class="opcional">opcional</span></label>
          <input id="venNota" value="${esc(anteriores[0]?.nota || '')}" autocomplete="off">
        </div>
        <datalist id="celularesClientes">${datos.clientes.filter((x) => x.celular).map((x) => `<option value="${esc(x.celular)}">${esc(nombreCliente(x))}</option>`).join('')}</datalist>`,
      pie: pieRenglones('Total', operacion ? 'Guardar cambios' : 'Registrar venta'),
      alMontar: (form) => {
        montarRenglones(form, { renglones, modo: 'venta', disponible });
        const celular = form.querySelector('#venCelular');
        form.querySelector('#venSinNumero').addEventListener('change', (e) => {
          const sinNumero = e.target.checked;
          celular.disabled = sinNumero;
          if (sinNumero) celular.value = '';
          form.querySelector('#venNombreOpcional').hidden = !sinNumero;
          form.querySelector('#venClienteAyuda').textContent = sinNumero
            ? 'Venta sin celular. El nombre es opcional.'
            : 'Si ya compró, se completa solo.';
          (sinNumero ? form.querySelector('#venNombre') : celular).focus();
        });
        celular.addEventListener('input', () => {
          const valor = celular.value.trim();
          const hallado = valor && datos.clientes.find((x) => x.celular === valor);
          const ayuda = form.querySelector('#venClienteAyuda');
          if (hallado) {
            form.querySelector('#venNombre').value = hallado.nombre || '';
            form.querySelector('#venApellido').value = hallado.apellido || '';
            ayuda.textContent = `Cliente: ${nombreCliente(hallado)}`;
          } else {
            ayuda.textContent = valor ? 'Cliente nuevo: se guarda al registrar la venta.' : 'Si ya compró, se completa solo.';
          }
        });
        if (c) form.querySelector('#cant0').select();
        else if (!operacion) form.querySelector('.buscarRenglon').focus();
      },
      alEnviar: async (form, fallo) => {
        const lineas = [];
        const uso = new Map();
        const notasCombo = [];
        for (const [i, r] of renglones.entries()) {
          const cantidad = Number(r.cantidad);
          const precio = Number(r.precio) || 0;
          const nombre = r.combo_id ? combo(r.combo_id)?.nombre : producto(r.producto_id)?.nombre;
          if (!nombre) return fallo(`Producto ${i + 1}: elegí un producto de la lista.`);
          if (!Number.isInteger(cantidad) || cantidad <= 0) return fallo(`${nombre}: la cantidad tiene que ser un número entero mayor a 0.`);
          if (precio < 0) return fallo(`${nombre}: el precio no puede ser negativo.`);
          if (r.combo_id) {
            // El combo se descuenta como sus productos; el precio va en el primero
            const cb = combo(r.combo_id);
            notasCombo.push(cb.nombre);
            cb.componentes.forEach((comp, j) => {
              const unidades = cantidad * (comp.cantidad || 1);
              lineas.push({ producto_id: comp.producto_id, cantidad: unidades, precio_unitario: j === 0 ? precio / (comp.cantidad || 1) : 0 });
              uso.set(comp.producto_id, (uso.get(comp.producto_id) || 0) + unidades);
            });
          } else {
            lineas.push({ producto_id: r.producto_id, cantidad, precio_unitario: precio });
            uso.set(r.producto_id, (uso.get(r.producto_id) || 0) + cantidad);
          }
        }
        for (const [id, unidades] of uso) {
          const p = producto(id);
          if (!p) return fallo('Un producto del combo ya no existe. Revisá el combo.');
          if (unidades > disponible(p)) return fallo(`${etiqueta(p)}: pediste ${unidades} y hay ${disponible(p)}.`);
        }

        const sinNumero = form.querySelector('#venSinNumero').checked;
        const celular = sinNumero ? '' : form.querySelector('#venCelular').value.trim();
        const nombreCli = form.querySelector('#venNombre').value.trim();
        if (!sinNumero && !celular) return fallo('Escribí el celular del cliente o marcá “No me dejó el número”.');
        if (!sinNumero && !nombreCli) return fallo('Escribí el nombre del cliente.');

        const nota = form.querySelector('#venNota').value.trim() || (notasCombo.length ? `Combo: ${notasCombo.join(', ')}` : '');
        const { error } = await db.rpc('registrar_venta', {
          p_lineas: lineas,
          p_cliente: {
            // Si la venta ya era de un cliente sin celular, se mantiene el mismo (no se duplica)
            id: sinNumero && clienteAnterior && !clienteAnterior.celular ? clienteAnterior.id : null,
            celular,
            nombre: nombreCli,
            apellido: form.querySelector('#venApellido').value.trim()
          },
          p_nota: nota,
          p_reemplaza: operacion || null
        });
        if (error) throw error;
        await refrescar();
        avisar(operacion ? 'Venta actualizada.' : `Venta registrada: ${$p(suma(lineas, (l) => l.cantidad * l.precio_unitario))}.`);
      }
    });
  }

  async function borrarVenta(operacion) {
    const items = datos.movimientos.filter((m) => m.operacion === operacion);
    if (!items.length) return;
    const ok = await confirmar({
      titulo: 'Eliminar venta',
      texto: `¿Eliminar esta venta de ${plural(suma(items, (m) => m.cantidad), 'unidad', 'unidades')} por ${$p(suma(items, importe))}? El stock vuelve al inventario.`
    });
    if (ok) await escribir(db.rpc('eliminar_venta', { p_operacion: operacion }), 'Venta eliminada. El stock volvió al inventario.', 'No se pudo eliminar la venta. Probá de nuevo.');
  }

  // ---------- Combos ----------
  function formCombo(c = null) {
    const opciones = datos.productos.filter((p) => p.categoria === 'Cargadores')
      .sort((a, b) => etiqueta(a).localeCompare(etiqueta(b), 'es', { numeric: true }));
    const elegido = (id) => c?.componentes.find((comp) => comp.producto_id === id);
    abrirModal({
      titulo: c ? 'Editar combo' : 'Nuevo combo',
      cuerpo: `
        <div class="camposFila">
          <div class="campo">
            <label for="cbNombre">Nombre</label>
            <input id="cbNombre" value="${esc(c?.nombre || 'Combo cargador C a Lightning')}" autocomplete="off">
          </div>
          <div class="campo">
            <label for="cbPrecio">Precio de venta del combo</label>
            <input id="cbPrecio" type="number" min="0" step="any" inputmode="decimal" value="${c?.precio_venta ?? ''}" placeholder="0">
          </div>
        </div>
        <fieldset class="campo">
          <legend>Productos que lleva <span class="opcional">de Cargadores</span></legend>
          ${opciones.length ? `<div class="checks">${opciones.map((p) => {
            const comp = elegido(p.id);
            return `<label class="check">
              <input type="checkbox" data-componente="${esc(p.id)}"${comp ? ' checked' : ''}>
              <span>${esc(etiqueta(p))} <span class="sutil">· stock ${p.stock}</span></span>
              <input type="number" min="1" step="1" class="checkCantidad" aria-label="Cantidad de ${esc(p.nombre)}" value="${comp?.cantidad || 1}"${comp ? '' : ' hidden'}>
            </label>`;
          }).join('')}</div>` : '<p class="sutil">Primero creá productos en la categoría Cargadores.</p>'}
        </fieldset>`,
      pie: `<button type="button" class="btnTexto" data-cerrar>Cancelar</button>
            <button type="submit" class="btn btnPrimario">Guardar combo</button>`,
      alMontar: (form) => {
        form.addEventListener('change', (e) => {
          if (e.target.dataset.componente) e.target.parentElement.querySelector('.checkCantidad').hidden = !e.target.checked;
        });
        form.querySelector('#cbNombre').focus();
      },
      alEnviar: async (form, fallo) => {
        const nombre = form.querySelector('#cbNombre').value.trim();
        if (!nombre) return fallo('Escribí el nombre del combo.');
        const componentes = [...form.querySelectorAll('[data-componente]:checked')].map((chk) => ({
          producto_id: chk.dataset.componente,
          cantidad: Math.max(1, Math.trunc(Number(chk.parentElement.querySelector('.checkCantidad').value) || 1))
        }));
        if (!componentes.length) return fallo('Elegí al menos un producto.');
        const fila = { nombre, categoria: 'Cargadores', precio_venta: Number(form.querySelector('#cbPrecio').value) || 0, componentes };
        const { error } = await (c ? db.from('combos').update(fila).eq('id', c.id) : db.from('combos').insert(fila));
        if (error) throw error;
        await refrescar();
        avisar('Combo guardado.');
      }
    });
  }

  async function borrarCombo(id) {
    const c = combo(id);
    if (!c) return;
    const ok = await confirmar({ titulo: 'Eliminar combo', texto: `¿Eliminar el combo <strong>${esc(c.nombre)}</strong>? Los productos y las ventas no se tocan.` });
    if (ok) await escribir(db.from('combos').delete().eq('id', id), 'Combo eliminado.', 'No se pudo eliminar. Probá de nuevo.');
  }

  // ---------- Fundas ----------
  function formFundas() {
    abrirModal({
      titulo: 'Crear modelos de fundas',
      cuerpo: `<p class="ayuda margenAbajo">Escribí un modelo por línea. Para cada uno se crean 6 fundas: ${VARIANTES_FUNDA.join(', ')} (MagSafe). Arrancan con stock y precios en 0. Las que ya existen no se duplican.</p>
        <div class="campo">
          <label for="fundasModelos">Modelos</label>
          <textarea id="fundasModelos" rows="14" class="mono">${MODELOS_FUNDA.join('\n')}</textarea>
        </div>`,
      pie: `<button type="button" class="btnTexto" data-cerrar>Cancelar</button>
            <button type="submit" class="btn btnPrimario">Crear fundas</button>`,
      alEnviar: async (form, fallo) => {
        const modelos = [...new Set(form.querySelector('#fundasModelos').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
        if (!modelos.length) return fallo('Escribí al menos un modelo.');
        const existe = (modelo, color) => datos.productos.some((p) =>
          p.categoria === 'Fundas' && normalizar(p.nombre) === 'funda' && normalizar(p.modelo) === normalizar(modelo) && normalizar(p.color) === normalizar(color));
        const nuevas = modelos.flatMap((modelo) => VARIANTES_FUNDA.filter((color) => !existe(modelo, color))
          .map((color) => ({ nombre: 'Funda', categoria: 'Fundas', modelo, color, stock: 0, precio_compra: 0, precio_venta: 0 })));
        const repetidas = modelos.length * VARIANTES_FUNDA.length - nuevas.length;
        if (nuevas.length) {
          const { error } = await db.from('productos').insert(nuevas);
          if (error) throw error;
          await refrescar();
        }
        avisar(`${plural(nuevas.length, 'funda creada', 'fundas creadas')}${repetidas ? ` · ${repetidas} ya existían` : ''}.`);
      }
    });
  }

  function formPrecioFundas(tipo) {
    const magsafe = tipo === 'magsafe';
    const objetivo = datos.productos.filter((p) => p.categoria === 'Fundas' && esMagsafe(p) === magsafe);
    const nombre = magsafe ? 'MagSafe (transparentes)' : 'de silicona';
    if (!objetivo.length) return avisar(`No hay fundas ${nombre} cargadas.`);
    const iguales = objetivo.every((p) => p.precio_compra === objetivo[0].precio_compra);
    abrirModal({
      titulo: `Precio de compra: fundas ${nombre}`,
      cuerpo: `<p class="textoModal">Cambia el precio de compra de <strong>${plural(objetivo.length, 'funda')} ${nombre}</strong> en todos los modelos. ${iguales ? `Ahora: ${$p(objetivo[0].precio_compra)}.` : 'Ahora tienen precios distintos.'}</p>
        <div class="campo">
          <label for="precioFundas">Nuevo precio de compra</label>
          <input id="precioFundas" type="number" min="0" step="any" inputmode="decimal" value="${iguales ? objetivo[0].precio_compra : ''}">
        </div>`,
      pie: `<button type="button" class="btnTexto" data-cerrar>Cancelar</button>
            <button type="submit" class="btn btnPrimario">Actualizar ${objetivo.length}</button>`,
      alMontar: (form) => form.querySelector('#precioFundas').select(),
      alEnviar: async (form, fallo) => {
        const precio = numero(form.querySelector('#precioFundas').value);
        if (precio === null || !(precio >= 0)) return fallo('Escribí un precio válido.');
        const { error } = await db.from('productos').update({ precio_compra: precio }).in('id', objetivo.map((p) => p.id));
        if (error) throw error;
        await refrescar();
        avisar(`${plural(objetivo.length, 'funda actualizada', 'fundas actualizadas')}.`);
      }
    });
  }

  // ---------- Clientes ----------
  function formCliente(c = null) {
    abrirModal({
      titulo: c ? 'Editar cliente' : 'Nuevo cliente',
      cuerpo: `
        <div class="camposFila">
          <div class="campo">
            <label for="cliNombre">Nombre</label>
            <input id="cliNombre" value="${esc(c?.nombre || '')}" autocomplete="off">
          </div>
          <div class="campo">
            <label for="cliApellido">Apellido <span class="opcional">opcional</span></label>
            <input id="cliApellido" value="${esc(c?.apellido || '')}" autocomplete="off">
          </div>
        </div>
        <div class="campo">
          <label for="cliCelular">Celular <span class="opcional">opcional</span></label>
          <input id="cliCelular" type="tel" inputmode="tel" value="${esc(c?.celular || '')}" placeholder="261 555-5555" autocomplete="off">
        </div>`,
      pie: `<button type="button" class="btnTexto" data-cerrar>Cancelar</button>
            <button type="submit" class="btn btnPrimario">Guardar</button>`,
      alMontar: (form) => form.querySelector('#cliNombre').focus(),
      alEnviar: async (form, fallo) => {
        const fila = {
          nombre: form.querySelector('#cliNombre').value.trim(),
          apellido: form.querySelector('#cliApellido').value.trim() || null,
          celular: form.querySelector('#cliCelular').value.trim() || null
        };
        if (!fila.nombre) return fallo('Escribí el nombre.');
        const repetido = fila.celular && datos.clientes.find((x) => x.celular === fila.celular && x.id !== c?.id);
        if (repetido) return fallo(`Ese celular ya es de ${nombreCliente(repetido)}.`);
        const { error } = await (c ? db.from('clientes').update(fila).eq('id', c.id) : db.from('clientes').insert(fila));
        if (error) throw error;
        await refrescar();
        avisar('Cliente guardado.');
      }
    });
  }

  async function borrarCliente(id) {
    const c = cliente(id);
    if (!c) return;
    const ok = await confirmar({ titulo: 'Eliminar cliente', texto: `¿Eliminar a <strong>${esc(nombreCliente(c))}</strong>? Sus ventas quedan registradas, pero sin cliente.` });
    if (ok) await escribir(db.from('clientes').delete().eq('id', id), 'Cliente eliminado.', 'No se pudo eliminar. Probá de nuevo.');
  }

  function historialCliente(id) {
    const c = cliente(id);
    if (!c) return;
    const ops = operaciones(ventas().filter((m) => m.cliente_id === id));
    abrirModal({
      titulo: esc(nombreCliente(c)),
      ancho: true,
      cuerpo: `<p class="sutil margenAbajo">${esc(c.celular || '')} · ${plural(ops.length, 'compra')} · ${$p(suma(ops, (o) => o.total))}</p>
        ${ops.length ? `<div class="tablaScroll"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Productos</th><th class="num">Total</th></tr></thead>
          <tbody>${ops.map((o) => `<tr>
            <td class="nowrap">${fechaCorta(o.fecha)}</td>
            <td class="productosOp">${o.items.map((m) => {
              const p = producto(m.producto_id);
              return `<div><span>${p ? esc(etiqueta(p)) : '—'}</span><span class="sutil nowrap">${m.cantidad} × ${$p(m.precio_unitario)}</span></div>`;
            }).join('')}</td>
            <td class="num fuerte">${$p(o.total)}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<p class="vacio">Todavía no compró nada.</p>'}`,
      pie: '<button type="button" class="btn btnPrimario" data-cerrar>Listo</button>',
      alEnviar: () => {}
    });
  }

  // ---------- Archivos ----------
  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Con BOM para que Excel respete los acentos
  const csv = (filas) => '﻿' + filas.map((fila) => fila.map((v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');

  const hoyArchivo = () => diaLocal(new Date());

  function exportarCategoria(cat) {
    const filas = [['nombre', 'categoria', 'modelo', 'color', 'stock', 'precio_compra', 'precio_venta', 'sku']];
    datos.productos.filter((p) => p.categoria === cat)
      .forEach((p) => filas.push([p.nombre, p.categoria, p.modelo, p.color, p.stock, p.precio_compra, p.precio_venta, p.sku]));
    descargar(`ivoryx-${normalizar(cat)}-${hoyArchivo()}.csv`, csv(filas), 'text/csv;charset=utf-8');
  }

  function exportarMovimientos() {
    const lista = ruta.seccion === 'movimientos' ? movimientosFiltrados() : datos.movimientos;
    const filas = [['fecha', 'tipo', 'producto', 'categoria', 'modelo', 'color', 'cantidad', 'unitario', 'total', 'cliente', 'celular', 'nota']];
    lista.forEach((m) => {
      const p = producto(m.producto_id) || {};
      const c = cliente(m.cliente_id);
      const unitario = m.tipo === 'venta' ? m.precio_unitario : m.costo_unitario;
      filas.push([fechaHora(m.fecha), m.tipo, p.nombre, p.categoria, p.modelo, p.color, m.cantidad, unitario, importe(m), c ? nombreCliente(c) : '', c?.celular, m.nota]);
    });
    descargar(`ivoryx-movimientos-${hoyArchivo()}.csv`, csv(filas), 'text/csv;charset=utf-8');
  }

  function descargarCopia() {
    const copia = { app: 'ivoryx-admin', version: 1, fecha: new Date().toISOString(), ...datos };
    descargar(`ivoryx-copia-${hoyArchivo()}.json`, JSON.stringify(copia, null, 2), 'application/json');
    avisar('Copia descargada.');
  }

  // Acepta copias de este admin y de la app de stock anterior (products, movements, customers, combos)
  function convertirCopia(json) {
    if (Array.isArray(json.productos)) return json;
    if (!Array.isArray(json.products)) throw new Error('formato');
    const tipos = { in: 'ingreso', out: 'venta', adj: 'ajuste' };
    // La app anterior no guardaba un id de operación: agrupaba por tipo, fecha, cliente y nota
    const operacionDe = (m) => {
      let h = 2166136261;
      for (const ch of `${m.type}|${m.date}|${m.customerId || ''}|${m.note || ''}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      return 'op-' + (h >>> 0).toString(16) + '-' + String(m.date || '').slice(0, 19);
    };
    return {
      productos: json.products.map((p) => ({
        id: p.id, nombre: p.name || 'Producto', categoria: [...CATEGORIAS, ...OCULTAS].includes(p.category) ? p.category : 'Otros',
        modelo: p.model || null, color: p.color || null, sku: p.sku || null, stock: Math.trunc(Number(p.stock) || 0),
        precio_compra: Number(p.buyPrice) || 0, precio_venta: Number(p.sellPrice) || 0,
        bateria: p.battery ?? null, creado: p.createdAt || new Date().toISOString()
      })),
      clientes: (json.customers || []).map((c) => ({
        id: c.id, nombre: c.firstName || null, apellido: c.lastName || null, celular: c.phone || null, creado: c.createdAt || new Date().toISOString()
      })),
      movimientos: (json.movements || []).filter((m) => Number(m.qty) > 0).map((m) => ({
        id: m.id, operacion: operacionDe(m), tipo: tipos[m.type] || 'ajuste', producto_id: m.productId, cliente_id: m.customerId || null,
        cantidad: Math.trunc(Number(m.qty)), costo_unitario: m.unitCost ?? null, precio_unitario: m.unitPrice ?? null,
        fecha: m.date, nota: m.note || null
      })),
      combos: (json.combos || []).map((c) => ({
        id: c.id, nombre: c.name, categoria: c.category || 'Cargadores', precio_venta: Number(c.sellPrice) || 0,
        componentes: (c.components || []).map((x) => ({ producto_id: x.productId, cantidad: x.qty || 1 })),
        creado: c.createdAt || new Date().toISOString()
      })),
      ajustes: json.settings?.lowStock != null ? { id: 1, stock_bajo: Number(json.settings.lowStock) || 0 } : null
    };
  }

  async function subirPorPartes(tabla, filas) {
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await db.from(tabla).upsert(filas.slice(i, i + 500));
      if (error) throw error;
    }
  }

  async function restaurarCopia(archivo) {
    let copia;
    try {
      copia = convertirCopia(JSON.parse(await archivo.text()));
    } catch {
      return avisar('Ese archivo no es una copia de Ivoryx.');
    }
    const ids = new Set(copia.productos.map((p) => p.id));
    const clientesIds = new Set((copia.clientes || []).map((c) => c.id));
    const movimientos = (copia.movimientos || []).filter((m) => ids.has(m.producto_id))
      .map((m) => ({ ...m, cliente_id: clientesIds.has(m.cliente_id) ? m.cliente_id : null }));
    const ok = await confirmar({
      titulo: 'Restaurar copia',
      texto: `Se van a agregar o actualizar ${plural(copia.productos.length, 'producto')}, ${plural(movimientos.length, 'movimiento')}, ${plural((copia.clientes || []).length, 'cliente')} y ${plural((copia.combos || []).length, 'combo')}. Lo que ya está cargado y no figura en la copia queda igual.`,
      accion: 'Restaurar'
    });
    if (!ok) return;
    avisar('Restaurando…');
    try {
      await subirPorPartes('clientes', copia.clientes || []);
      await subirPorPartes('productos', copia.productos);
      await subirPorPartes('movimientos', movimientos);
      await subirPorPartes('combos', copia.combos || []);
      if (copia.ajustes) await db.from('ajustes').upsert({ id: 1, stock_bajo: copia.ajustes.stock_bajo });
      await refrescar();
      avisar('Copia restaurada.');
    } catch (error) {
      console.error(error);
      await refrescar();
      avisar(mensajeError(error, 'No se pudo terminar de restaurar. Probá de nuevo: lo que ya se subió no se duplica.'));
    }
  }

  function leerCsv(texto) {
    const filas = [];
    let fila = [], celda = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (comillas) {
        if (ch === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
        else if (ch === '"') comillas = false;
        else celda += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === ',' || ch === ';') { fila.push(celda); celda = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(celda); filas.push(fila); fila = []; celda = '';
      } else celda += ch;
    }
    if (celda || fila.length) { fila.push(celda); filas.push(fila); }
    return filas.filter((f) => f.some((c) => c.trim()));
  }

  async function importarCsv(archivo) {
    const filas = leerCsv((await archivo.text()).replace(/^﻿/, ''));
    const cabeza = (filas.shift() || []).map((c) => normalizar(c).trim());
    const col = (fila, nombre) => (fila[cabeza.indexOf(nombre)] ?? '').trim();
    if (!cabeza.includes('nombre')) return avisar('El CSV necesita al menos la columna “nombre”.');
    const nuevos = filas.filter((f) => col(f, 'nombre')).map((f) => {
      const categoria = CATEGORIAS.find((c) => normalizar(c) === normalizar(col(f, 'categoria'))) || 'Otros';
      return {
        nombre: col(f, 'nombre'), categoria, modelo: col(f, 'modelo') || null, color: col(f, 'color') || null,
        stock: Math.trunc(Number(col(f, 'stock')) || 0), precio_compra: Number(col(f, 'precio_compra')) || 0,
        precio_venta: Number(col(f, 'precio_venta')) || 0, sku: col(f, 'sku') || null
      };
    });
    if (!nuevos.length) return avisar('El CSV no tiene productos.');
    const ok = await confirmar({ titulo: 'Importar productos', texto: `Se van a crear ${plural(nuevos.length, 'producto')} nuevos.`, accion: 'Importar' });
    if (ok) await escribir(db.from('productos').insert(nuevos), `${plural(nuevos.length, 'producto importado', 'productos importados')}.`, 'No se pudo importar. Revisá el archivo y probá de nuevo.');
  }

  async function borrarTodo() {
    const ok = await confirmar({
      titulo: 'Borrar todo el stock',
      texto: 'Se eliminan todos los productos, ventas, ingresos, clientes y combos. Los equipos del sitio no se tocan. <strong>No se puede deshacer.</strong>',
      accion: 'Borrar todo',
      escribirPalabra: 'BORRAR'
    });
    if (!ok) return;
    try {
      for (const tabla of ['movimientos', 'combos', 'productos', 'clientes']) {
        const { error } = await db.from(tabla).delete().not('id', 'is', null);
        if (error) throw error;
      }
      await refrescar();
      avisar('Se borró todo el stock.');
    } catch (error) {
      console.error(error);
      await refrescar();
      avisar('No se pudo borrar todo. Probá de nuevo.');
    }
  }

  // ---------- Eventos ----------
  vista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const id = b.dataset.id;
    const acciones = {
      'nueva-venta': () => formVenta(),
      'nuevo-ingreso': () => formIngreso(),
      'nuevo-producto': () => formProducto(null, b.dataset.categoria, b.dataset.modelo),
      'editar-producto': () => formProducto(producto(id)),
      'borrar-producto': () => borrarProducto(id),
      'sumar-stock': () => formIngreso(id),
      'editar-venta': () => formVenta(id),
      'borrar-venta': () => borrarVenta(id),
      'nuevo-combo': () => formCombo(),
      'editar-combo': () => formCombo(combo(id)),
      'borrar-combo': () => borrarCombo(id),
      'vender-combo': () => formVenta('', id),
      'crear-fundas': () => formFundas(),
      'precio-fundas': () => formPrecioFundas(b.dataset.tipo),
      'exportar-categoria': () => exportarCategoria(b.dataset.categoria),
      'exportar-movimientos': () => exportarMovimientos(),
      'limpiar-filtros': () => { filtrosMov = { desde: '', hasta: '', tipo: '', categoria: '', producto: '' }; render(); },
      'nuevo-cliente': () => formCliente(),
      'editar-cliente': () => formCliente(cliente(id)),
      'borrar-cliente': () => borrarCliente(id),
      'historial-cliente': () => historialCliente(id),
      'descargar-copia': () => descargarCopia(),
      'borrar-todo': () => borrarTodo(),
      'cargar-equipo': () => { location.hash = '#equipos'; abrirEditor(); }
    };
    acciones[b.dataset.accion]?.();
  });

  vista.addEventListener('input', (e) => {
    if (e.target.id === 'buscarStock') {
      busquedaStock = e.target.value;
      document.getElementById('stockContenido').innerHTML = contenidoStock();
      document.querySelectorAll('.pestana').forEach((a) => {
        if (busquedaStock.trim()) a.removeAttribute('aria-current');
        else if (a.getAttribute('href') === enlace('stock', ruta.categoria)) a.setAttribute('aria-current', 'page');
      });
    }
    if (e.target.id === 'buscarClientes') {
      busquedaClientes = e.target.value;
      document.getElementById('clientesContenido').innerHTML = contenidoClientes();
    }
  });

  vista.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'soloBajo') {
      soloBajo = t.checked;
      document.getElementById('stockContenido').innerHTML = contenidoStock();
      document.getElementById('soloBajo')?.focus();
    }
    if (t.dataset.filtro) {
      filtrosMov[t.dataset.filtro] = t.value;
      render();
      document.getElementById(t.id)?.focus();
    }
    if (t.id === 'archivoCopia' && t.files[0]) restaurarCopia(t.files[0]);
    if (t.id === 'archivoCsv' && t.files[0]) importarCsv(t.files[0]);
  });

  vista.addEventListener('submit', async (e) => {
    if (e.target.id !== 'formAjustes') return;
    e.preventDefault();
    const valor = numero(document.getElementById('stockBajo').value);
    if (valor === null || !Number.isInteger(valor) || valor < 0) return avisar('Escribí un número entero, 0 o más.');
    await escribir(db.from('ajustes').upsert({ id: 1, stock_bajo: valor }), 'Ajustes guardados.');
  });

  // Pasar de una categoría a otra con un clic en la pestaña no recarga nada: solo cambia el hash
  window.addEventListener('hashchange', () => {
    const antes = ruta.seccion;
    mostrar();
    if (antes !== ruta.seccion) window.scrollTo({ top: 0 });
  });

  // ---------- Arranque ----------
  async function iniciar() {
    if (!location.hash) history.replaceState(null, '', '#resumen');
    mostrar();
    await refrescar();
  }

  // admin.js avisa cuando cambian los equipos, para actualizar el resumen
  function equiposCambiaron() {
    if (ruta.seccion === 'resumen' && cargado) render();
  }

  // Colores sugeridos al cargar un producto
  document.body.insertAdjacentHTML('beforeend',
    `<datalist id="coloresStock">${NOMBRES_COLORES.map((c) => `<option value="${c}">`).join('')}</datalist>`);

  return { iniciar, equiposCambiaron };
})();

// ---------- Modo oscuro ----------
(() => {
  const botonTema = document.getElementById('btnTema');
  const aplicar = (oscuro) => {
    document.body.classList.toggle('oscuro', oscuro);
    botonTema.setAttribute('aria-pressed', String(oscuro));
    botonTema.setAttribute('aria-label', oscuro ? 'Usar modo claro' : 'Usar modo oscuro');
    document.querySelector('meta[name="theme-color"]').content = oscuro ? '#0e1626' : '#093287';
  };
  aplicar(document.body.classList.contains('oscuro'));
  botonTema.addEventListener('click', () => {
    const oscuro = !document.body.classList.contains('oscuro');
    aplicar(oscuro);
    try { localStorage.setItem('ivoryx_tema', oscuro ? 'oscuro' : 'claro'); } catch { /* sin almacenamiento: solo dura esta visita */ }
  });
})();
