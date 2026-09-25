import { fecha, mes, soles } from "@/lib/format";
import { ESTADO_RECIBO, porcentaje, type DatosRecibo } from "@/lib/recibo";

// Recibo formal de mantenimiento (prototipo reciboHTML). Papel siempre claro, también en modo oscuro.
// El PDF (lib/pdf/ReciboPdf.tsx) dibuja el mismo contenido.
export function ReciboVista({ d }: { d: DatosRecibo }) {
  const t = d.totales;
  const estado = ESTADO_RECIBO[d.estado];
  const meta: [string, string][] = [
    ["Departamento", `${d.departamento.numero}${d.departamento.piso !== null ? `, piso ${d.departamento.piso}` : ""}`],
    ["Periodo", mes(d.mes)],
    ["Propietario", d.departamento.propietario ?? "—"],
    ["Inquilino", d.departamento.inquilino ?? "No aplica"],
    ["Área", d.departamento.area !== null ? `${Number(d.departamento.area).toLocaleString("en-US")} m²` : "—"],
    ["Alícuota", porcentaje(d.departamento.alicuota)],
  ];

  return (
    <article className="rounded-xl border border-[#D5DCDA] bg-white p-4 text-[0.9rem] text-[#1B2328] sm:p-7 print:border-0 print:p-0">
      <header className="mb-4 flex flex-wrap justify-between gap-4 border-b-2 border-[#0E2A47] pb-3">
        <div>
          <h2 className="text-xl text-[#0E2A47]">{d.edificio.nombre}</h2>
          <p className="text-[#5B6970]">{d.edificio.direccion}</p>
          <p className="text-[#5B6970]">Administración: {d.edificio.administrador ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className="font-bold">Recibo de mantenimiento</p>
          <p className="text-[#5B6970]">N.° {d.numero}</p>
          <p className="text-[#5B6970]">Emitido el {fecha(d.emitido)}</p>
        </div>
      </header>

      <div className="mb-2 flex items-start gap-4">
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-[#5B6970]">{k}</dt>
              <dd className={`font-semibold ${k === "Periodo" ? "capitalize" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <span
          className="shrink-0 rounded-md border-2 px-2.5 py-0.5 font-display font-bold"
          style={{ color: estado.color, borderColor: estado.color }}
        >
          {estado.texto}
        </span>
      </div>

      <h4 className="mt-4 mb-1 font-display text-[0.95rem] font-bold">Detalle del mes</h4>
      <table className="w-full border-collapse">
        <tbody>
          {d.cargos.length === 0 && (
            <Fila izq={<span className="text-[#5B6970]">Sin cargos en este periodo</span>} der="" />
          )}
          {d.cargos.map((c, i) =>
            c.tipo === "cuota" && c.comun !== null ? (
              <CuotaFilas key={i} c={c} />
            ) : (
              <Fila
                key={i}
                izq={
                  <>
                    {c.concepto}
                    {c.estado === "pagado" && <span className="text-[#5B6970]"> (pagado)</span>}
                  </>
                }
                der={soles(c.monto)}
              />
            ),
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#1B2328] font-semibold">
            <td className="px-1 py-1.5">Cargos de {mes(d.mes)}</td>
            <td className="px-1 py-1.5 text-right tabular-nums">{soles(t.cargos)}</td>
          </tr>
        </tfoot>
      </table>

      <table className="mt-2 w-full border-collapse">
        <tbody>
          {t.saldo_aplicado > 0 && <Fila izq="Saldo a favor aplicado" der={`− ${soles(t.saldo_aplicado)}`} />}
          {t.pagado > 0 && <Fila izq="Pagos aplicados" der={`− ${soles(t.pagado)}`} />}
          {t.en_revision > 0 && <Fila izq="Pagos en revisión (aún no validados)" der={soles(t.en_revision)} tenue />}
          <Fila
            izq={
              <>
                Deuda de meses anteriores
                {t.anteriores > 0 && (
                  <span className="text-[#5B6970]">
                    {" "}
                    ({t.anteriores} {t.anteriores > 1 ? "conceptos" : "concepto"})
                  </span>
                )}
              </>
            }
            der={soles(t.anterior)}
          />
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#E1EEFB] px-4 py-3">
        <div>
          <p className="text-[#5B6970]">Total a pagar</p>
          {t.total > 0 && t.vence && (
            <p className="text-[0.82rem] text-[#5B6970]">
              Vence el {fecha(t.vence)}
              {d.edificio.mora > 0 && `. Después se aplica una mora de ${soles(d.edificio.mora)}.`}
            </p>
          )}
          {t.saldo_favor > 0 && <p className="text-[0.82rem] text-[#2E7D4F]">Saldo a favor: {soles(t.saldo_favor)}, se aplica a las próximas cuotas</p>}
        </div>
        <strong className="font-display text-3xl text-[#0E2A47] tabular-nums">{soles(Math.max(0, t.total))}</strong>
      </div>

      {d.gastos.categorias.length > 0 && (
        <>
          <h4 className="mt-5 mb-1 font-display text-[0.95rem] font-bold">Gastos del edificio en {mes(d.gastos.mes)}</h4>
          <table className="w-full border-collapse">
            <tbody>
              {d.gastos.categorias.map((g) => (
                <Fila key={g.categoria} izq={g.categoria} der={soles(g.monto)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#1B2328] font-semibold">
                <td className="px-1 py-1.5">Total de gastos</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{soles(d.gastos.total)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}

      <footer className="mt-5 flex flex-wrap justify-between gap-3 border-t border-dashed border-[#C9D1CF] pt-3 text-[0.8rem] text-[#5B6970]">
        <span>
          Paga a: {[d.edificio.cuenta_bancaria, d.edificio.yape_plin && `Yape o Plin: ${d.edificio.yape_plin}`].filter(Boolean).join(". ") || "consulta con la administración"}.
          Sube tu constancia en EDIFIKA.
        </span>
        <span>Generado con EDIFIKA</span>
      </footer>
    </article>
  );
}

function CuotaFilas({ c }: { c: DatosRecibo["cargos"][number] }) {
  return (
    <>
      <Fila
        izq={
          <>
            {c.base_mes ? `Gastos comunes de ${mes(c.base_mes)}` : "Cuota de mantenimiento"}
            {c.alicuota !== null && <div className="text-[0.8rem] text-[#5B6970]">Alícuota {porcentaje(c.alicuota)}</div>}
          </>
        }
        der={soles(c.comun)}
      />
      {Number(c.agua) > 0 && (
        <Fila
          izq={
            <>
              Consumo de agua
              {c.m3 !== null && <div className="text-[0.8rem] text-[#5B6970]">{Number(c.m3).toLocaleString("en-US")} m³ según lectura</div>}
            </>
          }
          der={soles(c.agua)}
        />
      )}
      {c.estado === "pagado" && (
        <tr>
          <td colSpan={2} className="px-1 pb-1.5 text-[0.8rem] text-[#5B6970]">
            Cuota pagada
          </td>
        </tr>
      )}
    </>
  );
}

function Fila({ izq, der, tenue = false }: { izq: React.ReactNode; der: string; tenue?: boolean }) {
  return (
    <tr className={`border-b border-[#E1E6E4] ${tenue ? "text-[#5B6970]" : ""}`}>
      <td className="px-1 py-1.5">{izq}</td>
      <td className="px-1 py-1.5 text-right whitespace-nowrap tabular-nums">{der}</td>
    </tr>
  );
}
