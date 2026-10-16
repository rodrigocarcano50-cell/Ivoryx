-- ===============================================================
-- Ivoryx: stock de accesorios, ventas, ingresos y clientes
-- (lo que antes era la app "ivoryx-stock").
-- Todo es privado: solo el admin puede leer y escribir.
-- Requiere public.es_admin() de esquema.sql.
-- ===============================================================

create table if not exists public.productos (
  id            text primary key default gen_random_uuid()::text,
  nombre        text not null,
  categoria     text not null,
  modelo        text,
  color         text,
  sku           text,
  stock         integer not null default 0,
  precio_compra numeric(14, 2) not null default 0,
  precio_venta  numeric(14, 2) not null default 0,
  bateria       smallint check (bateria between 0 and 100),
  creado        timestamptz not null default now()
);
create index if not exists productos_categoria_idx on public.productos (categoria);

create table if not exists public.clientes (
  id       text primary key default gen_random_uuid()::text,
  nombre   text,
  apellido text,
  celular  text,
  creado   timestamptz not null default now()
);
create index if not exists clientes_celular_idx on public.clientes (celular);

-- Cada renglón es un producto; los renglones de una misma venta o ingreso comparten "operacion"
create table if not exists public.movimientos (
  id              text primary key default gen_random_uuid()::text,
  operacion       text not null,
  tipo            text not null check (tipo in ('ingreso', 'venta', 'ajuste')),
  producto_id     text not null references public.productos (id) on delete cascade,
  cliente_id      text references public.clientes (id) on delete set null,
  cantidad        integer not null check (cantidad > 0),
  costo_unitario  numeric(14, 2),
  precio_unitario numeric(14, 2),
  fecha           timestamptz not null default now(),
  nota            text
);
create index if not exists movimientos_fecha_idx on public.movimientos (fecha desc);
create index if not exists movimientos_producto_idx on public.movimientos (producto_id);
create index if not exists movimientos_cliente_idx on public.movimientos (cliente_id);
create index if not exists movimientos_operacion_idx on public.movimientos (operacion);

-- componentes: [{"producto_id": "...", "cantidad": 1}, ...]
create table if not exists public.combos (
  id           text primary key default gen_random_uuid()::text,
  nombre       text not null,
  categoria    text not null default 'Cargadores',
  precio_venta numeric(14, 2) not null default 0,
  componentes  jsonb not null default '[]',
  creado       timestamptz not null default now()
);

create table if not exists public.ajustes (
  id         smallint primary key default 1 check (id = 1),
  stock_bajo integer not null default 5 check (stock_bajo >= 0)
);
insert into public.ajustes (id) values (1) on conflict do nothing;

-- Seguridad: nada es público
do $$
declare t text;
begin
  foreach t in array array['productos', 'clientes', 'movimientos', 'combos', 'ajustes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "solo admin" on public.%I', t);
    execute format('create policy "solo admin" on public.%I for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Busca el cliente por celular (o lo crea) y actualiza su nombre
-- ---------------------------------------------------------------
create or replace function public.cliente_por_celular(p_cliente jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_id text;
  v_existente text := nullif(p_cliente ->> 'id', '');
  v_celular text := nullif(trim(p_cliente ->> 'celular'), '');
  v_nombre text := nullif(trim(p_cliente ->> 'nombre'), '');
  v_apellido text := nullif(trim(p_cliente ->> 'apellido'), '');
begin
  -- Al editar una venta de un cliente sin celular, se reusa ese mismo cliente
  if v_existente is not null then
    update public.clientes
       set nombre = coalesce(v_nombre, nombre), apellido = coalesce(v_apellido, apellido), celular = coalesce(v_celular, celular)
     where id = v_existente
    returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;

  -- Sin celular: si hay nombre se guarda igual, si no la venta queda sin cliente
  if v_celular is null then
    if v_nombre is null then return null; end if;
    insert into public.clientes (nombre, apellido) values (v_nombre, v_apellido) returning id into v_id;
    return v_id;
  end if;

  select id into v_id from public.clientes where celular = v_celular order by creado limit 1;
  if v_id is null then
    insert into public.clientes (nombre, apellido, celular) values (v_nombre, v_apellido, v_celular) returning id into v_id;
  else
    update public.clientes
       set nombre = coalesce(v_nombre, nombre), apellido = coalesce(v_apellido, apellido)
     where id = v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------
-- Venta: descuenta stock y registra los renglones en un solo paso.
-- p_lineas: [{"producto_id", "cantidad", "precio_unitario"}]
-- p_reemplaza: operación a reemplazar (editar una venta); conserva su fecha.
-- ---------------------------------------------------------------
create or replace function public.registrar_venta(p_lineas jsonb, p_cliente jsonb, p_nota text default null, p_reemplaza text default null)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_operacion text := gen_random_uuid()::text;
  v_fecha timestamptz := now();
  v_cliente text;
  v_linea jsonb;
  v_cantidad integer;
  v_costo numeric;
  v_nombre text;
begin
  if not (select public.es_admin()) then raise exception 'No autorizado'; end if;
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'La venta no tiene productos'; end if;

  if p_reemplaza is not null then
    select min(fecha) into v_fecha from public.movimientos where operacion = p_reemplaza and tipo = 'venta';
    if v_fecha is null then raise exception 'No se encontró la venta'; end if;
    update public.productos p set stock = p.stock + m.total
      from (select producto_id, sum(cantidad) total from public.movimientos
             where operacion = p_reemplaza and tipo = 'venta' group by producto_id) m
     where p.id = m.producto_id;
    delete from public.movimientos where operacion = p_reemplaza;
    v_operacion := p_reemplaza;
  end if;

  v_cliente := public.cliente_por_celular(p_cliente);

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cantidad := (v_linea ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 then raise exception 'Cantidad inválida'; end if;

    update public.productos set stock = stock - v_cantidad
     where id = v_linea ->> 'producto_id' and stock >= v_cantidad
     returning precio_compra into v_costo;

    if not found then
      select trim(concat_ws(' ', nombre, modelo, color)) into v_nombre from public.productos where id = v_linea ->> 'producto_id';
      raise exception 'Stock insuficiente: %', coalesce(v_nombre, 'producto eliminado');
    end if;

    insert into public.movimientos (operacion, tipo, producto_id, cliente_id, cantidad, costo_unitario, precio_unitario, fecha, nota)
    values (v_operacion, 'venta', v_linea ->> 'producto_id', v_cliente, v_cantidad, v_costo,
            coalesce((v_linea ->> 'precio_unitario')::numeric, 0), v_fecha, nullif(trim(p_nota), ''));
  end loop;

  return v_operacion;
end;
$$;

-- ---------------------------------------------------------------
-- Ingreso de mercadería: suma stock y, si viene costo, actualiza el precio de compra.
-- p_lineas: [{"producto_id", "cantidad", "costo_unitario" (opcional)}]
-- ---------------------------------------------------------------
create or replace function public.registrar_ingreso(p_lineas jsonb, p_nota text default null)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_operacion text := gen_random_uuid()::text;
  v_linea jsonb;
  v_cantidad integer;
  v_costo numeric;
begin
  if not (select public.es_admin()) then raise exception 'No autorizado'; end if;
  if jsonb_array_length(coalesce(p_lineas, '[]')) = 0 then raise exception 'El ingreso no tiene productos'; end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cantidad := (v_linea ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 then raise exception 'Cantidad inválida'; end if;
    v_costo := (v_linea ->> 'costo_unitario')::numeric;

    update public.productos
       set stock = stock + v_cantidad,
           precio_compra = coalesce(v_costo, precio_compra)
     where id = v_linea ->> 'producto_id'
     returning precio_compra into v_costo;
    if not found then raise exception 'Producto no encontrado'; end if;

    insert into public.movimientos (operacion, tipo, producto_id, cantidad, costo_unitario, nota)
    values (v_operacion, 'ingreso', v_linea ->> 'producto_id', v_cantidad, v_costo, nullif(trim(p_nota), ''));
  end loop;

  return v_operacion;
end;
$$;

-- ---------------------------------------------------------------
-- Borra una venta y devuelve el stock
-- ---------------------------------------------------------------
create or replace function public.eliminar_venta(p_operacion text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select public.es_admin()) then raise exception 'No autorizado'; end if;
  update public.productos p set stock = p.stock + m.total
    from (select producto_id, sum(cantidad) total from public.movimientos
           where operacion = p_operacion and tipo = 'venta' group by producto_id) m
   where p.id = m.producto_id;
  delete from public.movimientos where operacion = p_operacion and tipo = 'venta';
end;
$$;

revoke execute on function public.cliente_por_celular(jsonb) from public, anon;
revoke execute on function public.registrar_venta(jsonb, jsonb, text, text) from public, anon;
revoke execute on function public.registrar_ingreso(jsonb, text) from public, anon;
revoke execute on function public.eliminar_venta(text) from public, anon;
grant execute on function public.cliente_por_celular(jsonb) to authenticated;
grant execute on function public.registrar_venta(jsonb, jsonb, text, text) to authenticated;
grant execute on function public.registrar_ingreso(jsonb, text) to authenticated;
grant execute on function public.eliminar_venta(text) to authenticated;

-- ===============================================================
-- Equipos vendibles: cada equipo de la tabla equipos tiene un producto
-- (categoría Celulares, stock 1, o 0 si está vendido). Su precio de compra
-- es lo que costó el equipo: se guarda acá y no en equipos, que es pública.
-- Venderlo con registrar_venta lo marca vendido (sale del sitio);
-- borrar esa venta lo vuelve a publicar.
-- ===============================================================
alter table public.productos add column if not exists equipo_id uuid unique references public.equipos (id) on delete set null;

create or replace function public.equipo_a_producto()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_nombre text := trim(concat_ws(' ', new.modelo, new.capacidad));
  v_stock integer := case when new.estado = 'vendido' then 0 else 1 end;
  v_precio numeric := case when new.moneda = 'ARS' then new.precio else 0 end;
begin
  if tg_op = 'INSERT' then
    insert into public.productos (nombre, categoria, color, stock, precio_venta, equipo_id)
    values (v_nombre, 'Celulares', nullif(trim(new.color), ''), v_stock, v_precio, new.id)
    on conflict (equipo_id) do nothing;
  else
    update public.productos
       set nombre = v_nombre, color = nullif(trim(new.color), ''), stock = v_stock, precio_venta = v_precio
     where equipo_id = new.id
       and (nombre, coalesce(color, ''), stock, precio_venta)
           is distinct from (v_nombre, coalesce(nullif(trim(new.color), ''), ''), v_stock, v_precio);
  end if;
  return null;
end;
$$;

drop trigger if exists equipos_producto on public.equipos;
create trigger equipos_producto after insert or update on public.equipos
  for each row execute function public.equipo_a_producto();

-- Al borrar un equipo: si nunca se vendió se borra su producto; si tiene ventas, queda en el historial sin stock
create or replace function public.equipo_borrado()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.productos p
   where p.equipo_id = old.id
     and not exists (select 1 from public.movimientos m where m.producto_id = p.id);
  update public.productos set stock = 0 where equipo_id = old.id;
  return old;
end;
$$;

drop trigger if exists equipos_borrado on public.equipos;
create trigger equipos_borrado before delete on public.equipos
  for each row execute function public.equipo_borrado();

-- Un equipo es una sola unidad
create or replace function public.producto_equipo_tope()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.equipo_id is not null and new.stock > 1 then new.stock := 1; end if;
  return new;
end;
$$;

drop trigger if exists productos_equipo_tope on public.productos;
create trigger productos_equipo_tope before insert or update on public.productos
  for each row execute function public.producto_equipo_tope();

create or replace function public.producto_a_equipo()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.equipo_id is not null and new.stock is distinct from old.stock then
    update public.equipos
       set estado = case when new.stock <= 0 then 'vendido' when estado = 'vendido' then 'disponible' else estado end
     where id = new.equipo_id
       and estado <> case when new.stock <= 0 then 'vendido' when estado = 'vendido' then 'disponible' else estado end;
  end if;
  return null;
end;
$$;

drop trigger if exists productos_equipo on public.productos;
create trigger productos_equipo after update of stock on public.productos
  for each row execute function public.producto_a_equipo();

-- ---------------------------------------------------------------
-- Las 5 tarjetas de accesorios de la página principal
-- (fotos y textos editables desde el admin: "Accesorios en la web")
-- ---------------------------------------------------------------
create table if not exists public.vitrina (
  id          text primary key default gen_random_uuid()::text,
  orden       smallint not null default 0,
  titulo      text not null,
  descripcion text,
  precio      numeric(14, 2) check (precio >= 0),
  mensaje     text not null,
  imagen      text not null default '',
  visible     boolean not null default true
);

alter table public.vitrina enable row level security;
revoke all on public.vitrina from anon;
grant select on public.vitrina to anon, authenticated;
grant insert, update, delete on public.vitrina to authenticated;

drop policy if exists "ver vitrina" on public.vitrina;
create policy "ver vitrina" on public.vitrina for select to anon, authenticated
  using (visible or (select public.es_admin()));

drop policy if exists "admin edita vitrina" on public.vitrina;
create policy "admin edita vitrina" on public.vitrina for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists "admin agrega vitrina" on public.vitrina;
create policy "admin agrega vitrina" on public.vitrina for insert to authenticated
  with check ((select public.es_admin()));

drop policy if exists "admin borra vitrina" on public.vitrina;
create policy "admin borra vitrina" on public.vitrina for delete to authenticated
  using ((select public.es_admin()));

insert into public.vitrina (id, orden, titulo, descripcion, precio, mensaje) values
  ('silicona', 1, 'Funda de silicona', 'Colores lisos, para todos los modelos de iPhone.', 6000, 'Hola! Quería consultar por la funda de silicona. Mi iPhone es: '),
  ('magsafe', 2, 'Funda MagSafe', 'Transparente, con imán para cargadores MagSafe.', 7000, 'Hola! Quería consultar por la funda MagSafe. Mi iPhone es: '),
  ('cargador', 3, 'Cargador', 'Carga rápida USB-C.', 20000, 'Hola! Quería consultar por el cargador. Mi iPhone es: '),
  ('airpods', 4, 'AirPods', 'AirPods Pro 2.', 30000, 'Hola! Quería consultar por los AirPods. ¿Qué modelos tenés?'),
  ('templados', 5, 'Vidrio templado', 'Protección para la pantalla.', 4000, 'Hola! Quería consultar por el vidrio templado. Mi iPhone es: ')
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Seguimiento a los 2 días de vender un equipo (Resumen del admin):
-- ventas que ya se contactaron o se descartaron
-- ---------------------------------------------------------------
create table if not exists public.seguimientos (
  operacion text primary key,
  hecho     timestamptz not null default now()
);

alter table public.seguimientos enable row level security;
revoke all on public.seguimientos from anon;
grant select, insert, delete on public.seguimientos to authenticated;
drop policy if exists "solo admin" on public.seguimientos;
create policy "solo admin" on public.seguimientos for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- Equipos vendidos que ya tuvieron su seguimiento: dejan de listarse en el admin
-- (no se borran: la venta y el equipo quedan en el historial)
alter table public.equipos add column if not exists archivado boolean not null default false;
