'use client';

import { useEffect, useState } from 'react';

interface ResumenData {
  periodo: { desde: string; hasta: string };
  moneda: string;
  generado_en: string;
  operaciones_validas: number;
  unidades_totales: number;
  ingresos_totales: number;
  ingresos_por_categoria: { categoria: string; ingresos: number }[];
}

interface CalidadData {
  total_filas_entrada: number;
  operaciones_validas: number;
  copias_duplicadas_excluidas: number;
  incidencias_excluidas: number;
  balance_correcto: boolean;
  detalle_incidencias?: { venta_id: string; fila_csv: number; motivo: string }[];
}

export default function Dashboard() {
  const [resumen, setResumen] = useState<ResumenData | null>(null);
  const [calidad, setCalidad] = useState<CalidadData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/datos/resumen.json').then((res) => {
        if (!res.ok) throw new Error('No se encontró /datos/resumen.json');
        return res.json();
      }),
      fetch('/datos/calidad.json').then((res) => {
        if (!res.ok) throw new Error('No se encontró /datos/calidad.json');
        return res.json();
      }),
    ])
      .then(([dataResumen, dataCalidad]) => {
        setResumen(dataResumen);
        setCalidad(dataCalidad);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="p-8 text-red-600 font-mono">
        Error cargando datos: {error}.
      </div>
    );
  }

  if (!resumen || !calidad) {
    return <div className="p-8 text-slate-600">Cargando dashboard auditado...</div>;
  }

  const maxIngreso = Math.max(...resumen.ingresos_por_categoria.map((c) => c.ingresos), 1);
  const ticketMedio = (resumen.ingresos_totales / (resumen.operaciones_validas || 1)).toFixed(2);

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-800">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Encabezado */}
        <header className="border-b border-slate-200 pb-4">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900">
            Auditoría de Ventas · Práctica 5074
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Periodo: <span className="font-semibold">{resumen.periodo.desde}</span> al{' '}
            <span className="font-semibold">{resumen.periodo.hasta}</span> | Generado:{' '}
            <span className="font-semibold">{new Date(resumen.generado_en).toLocaleString()}</span>
          </p>
        </header>

        {/* Tarjetas de Métricas (KPIs) - Ahora con 5 Cards */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ingresos Totales</span>
            <p className="text-2xl font-black text-slate-900 mt-2">
              {resumen.ingresos_totales.toLocaleString()} {resumen.moneda}
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ventas Válidas</span>
            <p className="text-2xl font-black text-indigo-600 mt-2">
              {resumen.operaciones_validas}
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ticket Medio</span>
            <p className="text-2xl font-black text-slate-900 mt-2">
              {ticketMedio} {resumen.moneda}
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unidades Totales</span>
            <p className="text-2xl font-black text-slate-900 mt-2">
              {resumen.unidades_totales}
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm col-span-2 md:col-span-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Excluidas (Dup / Inc)</span>
            <p className="text-2xl font-black text-amber-600 mt-2">
              {calidad.copias_duplicadas_excluidas} / {calidad.incidencias_excluidas}
            </p>
          </div>
        </section>

        {/* Gráfico de Barras por Categoría */}
        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Ingresos por Categoría</h2>
            <p className="text-xs text-slate-500">
              Visualización mediante barras horizontales para comparar los ingresos en EUR por categoría.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {resumen.ingresos_por_categoria.map((item) => {
              const pct = Math.round((item.ingresos / maxIngreso) * 100);
              return (
                <div key={item.categoria} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">{item.categoria}</span>
                    <span className="font-semibold text-slate-900">
                      {item.ingresos.toLocaleString()} {resumen.moneda}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Auditoría de Calidad e Incidencias Detectadas */}
        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Auditoría de Incidencias</h2>
          <p className="text-xs text-slate-500">
            Total filas: {calidad.total_filas_entrada} = Válidas ({calidad.operaciones_validas}) + Duplicadas ({calidad.copias_duplicadas_excluidas}) + Incidencias ({calidad.incidencias_excluidas}). Estado: {calidad.balance_correcto ? 'Verificado ✓' : 'Fallo en recuento ✗'}.
          </p>

          {calidad.detalle_incidencias && calidad.detalle_incidencias.length > 0 && (
            <div className="overflow-x-auto pt-2">
              <table className="min-w-full text-xs text-left border border-slate-200">
                <thead className="bg-slate-50 border-b text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="px-3 py-2">ID Venta</th>
                    <th className="px-3 py-2">Fila CSV</th>
                    <th className="px-3 py-2">Motivo Exclusión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calidad.detalle_incidencias.map((inc, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono font-medium text-slate-800">{inc.venta_id}</td>
                      <td className="px-3 py-2 text-slate-600">{inc.fila_csv}</td>
                      <td className="px-3 py-2 text-red-600">{inc.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}