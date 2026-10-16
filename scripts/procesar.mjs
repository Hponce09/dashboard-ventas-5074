import fs from 'node:fs';
import path from 'node:path';

const RUTA_VENTAS = path.resolve('datos/ventas.csv');
const RUTA_PRODUCTOS = path.resolve('datos/productos.json');
const DIR_SALIDA = path.resolve('salida');
const DIR_PUBLIC = path.resolve('public/datos');

if (!fs.existsSync(DIR_SALIDA)) fs.mkdirSync(DIR_SALIDA, { recursive: true });
if (!fs.existsSync(DIR_PUBLIC)) fs.mkdirSync(DIR_PUBLIC, { recursive: true });

// 1. Cargar productos
const productosRaw = JSON.parse(fs.readFileSync(RUTA_PRODUCTOS, 'utf-8'));
const productosMap = new Map();
for (const p of productosRaw) {
  // Guardamos tanto por p.id como p.producto_id por si acaso
  const id = p.id || p.producto_id;
  productosMap.set(String(id).trim(), p);
}

// 2. Cargar ventas CSV
const csvContent = fs.readFileSync(RUTA_VENTAS, 'utf-8').trim();
const lineas = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);

// Limpiar posibles caracteres invisibles/BOM en la cabecera
const cabecera = lineas[0].replace(/^\uFEFF/, '').split(',').map(c => c.trim().toLowerCase());
const registrosRaw = lineas.slice(1);

const totalFilasEntrada = registrosRaw.length;
const duplicadosExcluidos = [];
const incidenciasExcluidas = [];
const operacionesValidas = [];

// Detectar nombres de columna reales
const idxVentaId = cabecera.findIndex(c => c === 'venta_id' || c === 'id' || c === 'id_venta');
const idxFecha = cabecera.findIndex(c => c === 'fecha' || c === 'date');
const idxProdId = cabecera.findIndex(c => c === 'producto_id' || c === 'id_producto');
const idxUnidades = cabecera.findIndex(c => c === 'unidades' || c === 'cantidad');
const idxPrecio = cabecera.findIndex(c => c === 'precio' || c === 'precio_unitario');

const agrupadoPorId = new Map();

registrosRaw.forEach((linea, index) => {
  const fila_csv = index + 2;
  const valores = linea.split(',').map(v => v.trim());
  
  const venta_id = idxVentaId !== -1 ? valores[idxVentaId] : `FILA_${fila_csv}`;
  
  if (!agrupadoPorId.has(venta_id)) {
    agrupadoPorId.set(venta_id, []);
  }
  agrupadoPorId.get(venta_id).push({ fila_csv, rawLine: linea, valores });
});

for (const [venta_id, apariciones] of agrupadoPorId.entries()) {
  const primeraLinea = apariciones[0].rawLine;
  const todasIdenticas = apariciones.every(a => a.rawLine === primeraLinea);

  if (apariciones.length > 1) {
    if (!todasIdenticas) {
      apariciones.forEach(item => {
        incidenciasExcluidas.push({
          venta_id,
          fila_csv: item.fila_csv,
          motivo: 'Conflicto de datos: venta_id repetido con atributos contradictorios'
        });
      });
      continue;
    } else {
      for (let i = 1; i < apariciones.length; i++) {
        duplicadosExcluidos.push({
          venta_id,
          fila_csv: apariciones[i].fila_csv,
          motivo: 'Copia duplicada exacta'
        });
      }
    }
  }

  const { valores, fila_csv } = apariciones[0];
  let errorMotivo = null;

  const valVentaId = idxVentaId !== -1 ? valores[idxVentaId] : '';
  const valFecha = idxFecha !== -1 ? valores[idxFecha] : '';
  const valProdId = idxProdId !== -1 ? valores[idxProdId] : '';
  const valUnidades = idxUnidades !== -1 ? valores[idxUnidades] : '';
  const valPrecio = idxPrecio !== -1 ? valores[idxPrecio] : '';

  if (!valVentaId) {
    errorMotivo = 'Campo venta_id obligatorio vacío';
  } else if (!valFecha || !valProdId || valUnidades === '' || valPrecio === '') {
    errorMotivo = 'Campos obligatorios vacíos o incompletos';
  } else {
    // Normalizar y validar fecha (acepta 2026-10-01 a 2026-10-07 o 01/10/2026 a 07/10/2026)
    let fechaNormalizada = valFecha;
    const matchISO = valFecha.match(/^2026-10-0([1-7])/);
    const matchBarra = valFecha.match(/^0([1-7])\/10\/2026/);

    if (matchISO) {
      fechaNormalizada = `2026-10-0${matchISO[1]}`;
    } else if (matchBarra) {
      fechaNormalizada = `2026-10-0${matchBarra[1]}`;
    } else {
      errorMotivo = `Fecha fuera del periodo (2026-10-01 a 2026-10-07): ${valFecha}`;
    }

    const unidades = Number(valUnidades);
    if (!Number.isInteger(unidades) || unidades <= 0) {
      errorMotivo = `Unidades inválidas (debe ser entero > 0): ${valUnidades}`;
    }

    const precio = Number(valPrecio);
    if (isNaN(precio) || !isFinite(precio) || precio < 0) {
      errorMotivo = `Precio inválido (debe ser numérico >= 0): ${valPrecio}`;
    }

    if (!errorMotivo && !productosMap.has(valProdId)) {
      errorMotivo = `Producto no existe en el catálogo: ${valProdId}`;
    }

    if (!errorMotivo) {
      const prod = productosMap.get(valProdId);
      const ingreso = unidades * precio;

      operacionesValidas.push({
        venta_id: valVentaId,
        fecha: fechaNormalizada,
        producto_id: valProdId,
        producto_nombre: prod.nombre,
        categoria: prod.categoria,
        unidades,
        precio,
        ingreso: Math.round(ingreso * 100) / 100
      });
    }
  }

  if (errorMotivo) {
    incidenciasExcluidas.push({
      venta_id,
      fila_csv,
      motivo: errorMotivo
    });
  }
}

// Métricas
const unidadesTotales = operacionesValidas.reduce((acc, v) => acc + v.unidades, 0);
const ingresosTotales = Math.round(operacionesValidas.reduce((acc, v) => acc + v.ingreso, 0) * 100) / 100;

const mapaCategorias = new Map();
operacionesValidas.forEach(v => {
  const actual = mapaCategorias.get(v.categoria) || 0;
  mapaCategorias.set(v.categoria, actual + v.ingreso);
});

const ingresos_por_categoria = Array.from(mapaCategorias.entries())
  .map(([categoria, ingresos]) => ({
    categoria,
    ingresos: Math.round(ingresos * 100) / 100
  }))
  .sort((a, b) => b.ingresos - a.ingresos);

const resumen = {
  periodo: { desde: "2026-10-01", hasta: "2026-10-07" },
  moneda: "EUR",
  generado_en: new Date().toISOString(),
  operaciones_validas: operacionesValidas.length,
  unidades_totales: unidadesTotales,
  ingresos_totales: ingresosTotales,
  ingresos_por_categoria
};

const calidad = {
  total_filas_entrada: totalFilasEntrada,
  operaciones_validas: operacionesValidas.length,
  copias_duplicadas_excluidas: duplicadosExcluidos.length,
  incidencias_excluidas: incidenciasExcluidas.length,
  balance_correcto: (totalFilasEntrada === operacionesValidas.length + duplicadosExcluidos.length + incidenciasExcluidas.length),
  detalle_duplicados: duplicadosExcluidos,
  detalle_incidencias: incidenciasExcluidas
};

fs.writeFileSync(path.join(DIR_SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2));
fs.writeFileSync(path.join(DIR_SALIDA, 'calidad.json'), JSON.stringify(calidad, null, 2));
fs.writeFileSync(path.join(DIR_PUBLIC, 'resumen.json'), JSON.stringify(resumen, null, 2));
fs.writeFileSync(path.join(DIR_PUBLIC, 'calidad.json'), JSON.stringify(calidad, null, 2));
fs.writeFileSync(path.join(DIR_PUBLIC, 'ventas.json'), JSON.stringify(operacionesValidas, null, 2));

console.log('✅ AUDITORÍA COMPLETADA CON ÉXITO:');
console.log(`- Total filas leídas: ${totalFilasEntrada}`);
console.log(`- Operaciones válidas: ${operacionesValidas.length}`);
console.log(`- Duplicados excluidos: ${duplicadosExcluidos.length}`);
console.log(`- Incidencias excluidas: ${incidenciasExcluidas.length}`);
console.log(`- Balance (Total == Válidas + Dup + Inc): ${calidad.balance_correcto ? 'CORRECTO ✓' : 'INCORRECTO ✗'}`);
console.log(`- Ingresos totales auditados: ${ingresosTotales} EUR`);
