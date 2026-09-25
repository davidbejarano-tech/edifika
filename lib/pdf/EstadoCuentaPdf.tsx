import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { EstadoCuentaDatos } from "../estado-cuenta";
import { fecha, mes, soles } from "../format";
import { C, Fila, FilaTotal, LogoPdf, Pie, s } from "./comunes";

const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

// Estado de cuenta mensual en A4: el mismo contenido que components/EstadoCuenta.tsx
function EstadoCuentaPdf({ e }: { e: EstadoCuentaDatos }) {
  const sello = e.oficial ? C.ok : C.aviso;
  const cifras: [string, string, string][] = [
    ["Saldo anterior", soles(e.saldoAnterior), C.tinta],
    ["Ingresos del mes", `+ ${soles(e.ingresos)}`, C.ok],
    ["Gastos del mes", `- ${soles(e.gastos)}`, C.mal],
    ["Monto acumulado", soles(e.acumulado), e.acumulado >= 0 ? C.navy : C.mal],
  ];
  return (
    <Document title={`Estado de cuenta ${mes(e.periodo.mes)} · ${e.nombre}`} author="EDIFIKA" language="es-PE">
      <Page size="A4" style={s.pagina}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: C.navy, paddingBottom: 10, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
            <LogoPdf alto={30} />
            <View style={{ flex: 1 }}>
              <Text style={s.tenue}>Estado de cuenta mensual</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 15, color: C.navy, lineHeight: 1.2, marginBottom: 2 }}>{e.nombre}</Text>
              <Text style={s.tenue}>{e.direccion}</Text>
            </View>
          </View>
          <Text
            style={{ borderWidth: 1.8, borderColor: sello, color: sello, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, fontFamily: "Helvetica-Bold", fontSize: 12, letterSpacing: 1.5, transform: "rotate(-6deg)", alignSelf: "flex-start" }}
          >
            {e.oficial ? "OFICIAL" : "BORRADOR"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 24, marginBottom: 10 }}>
          <View>
            <Text style={s.chico}>Periodo</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{mes(e.periodo.mes).replace(/^./, (x) => x.toUpperCase())}</Text>
          </View>
          <View>
            <Text style={s.chico}>Administrador titular</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{e.administrador ?? "-"}</Text>
          </View>
          <View>
            <Text style={s.chico}>Fecha de emisión</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{fecha(hoyLima())}</Text>
          </View>
        </View>
        {!e.oficial && <Text style={[s.chico, { marginBottom: 8 }]}>Borrador: los gastos del mes aún no están confirmados y pueden cambiar.</Text>}

        <View style={{ flexDirection: "row", borderWidth: 0.6, borderColor: C.linea, borderRadius: 6, marginBottom: 6 }}>
          {cifras.map(([t, v, color], i) => (
            <View key={t} style={{ flex: 1, padding: 8, borderLeftWidth: i ? 0.6 : 0, borderLeftColor: C.linea }}>
              <Text style={s.chico}>{t}</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12, color }}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={s.chico}>Monto acumulado = saldo anterior + ingresos validados del mes - gastos del mes.</Text>

        <Text style={s.h4}>Ingresos</Text>
        {e.filasIngresos.length ? e.filasIngresos.map(([t, m]) => <Fila key={t} izq={t} der={soles(m)} />) : <Fila izq="Sin pagos validados en el mes" der="" tenue />}
        <FilaTotal izq="Total de ingresos" der={soles(e.ingresos)} />
        <Text style={s.chico}>Pagos validados con fecha de pago en el mes.</Text>

        <Text style={s.h4}>Gastos</Text>
        {e.categorias.length ? e.categorias.map(([t, m]) => <Fila key={t} izq={t} der={soles(m)} />) : <Fila izq="Sin gastos registrados" der="" tenue />}
        <FilaTotal izq="Total de gastos" der={soles(e.gastos)} />

        {e.custodia > 0 && (
          <Text style={[s.chico, { marginTop: 8 }]}>
            Garantías en custodia: {soles(e.custodia)}. Es dinero de los vecinos por reservas de áreas comunes: no forma parte del saldo del edificio.
          </Text>
        )}

        {e.conDesglose && (
          <View>
            <Text style={s.h4}>Cuentas por cobrar por departamento</Text>
            {e.deudores.length ? (
              <>
                {e.deudores.map((c) => (
                  <Fila
                    key={c.departamento_id}
                    izq={`Depto ${c.numero}${Number(c.vencido) > 0 ? ` · vencido ${soles(c.vencido)}` : ""}`}
                    der={soles(c.pendiente)}
                  />
                ))}
                <FilaTotal izq="Total por cobrar" der={soles(e.deudores.reduce((t, c) => t + Number(c.pendiente), 0))} />
              </>
            ) : (
              <Fila izq="Todos los departamentos están al día" der="" tenue />
            )}
            <Text style={s.chico}>Al {fecha(hoyLima())}.</Text>
          </View>
        )}

        <Pie izq={`${e.nombre} · Estado de cuenta de ${mes(e.periodo.mes)}`} />
      </Page>
    </Document>
  );
}

export function pdfEstadoCuenta(e: EstadoCuentaDatos) {
  return renderToBuffer(<EstadoCuentaPdf e={e} />);
}
