import { Document, Image as Imagen, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { LogoPdf as LogoEdificio } from "../logo-edificio";
import { fecha, mes, soles } from "../format";
import { ESTADO_RECIBO, porcentaje, type DatosRecibo } from "../recibo";
import { C, Fila, FilaTotal, LogoPdf, Pie, s } from "./comunes";

const menos = (n: number) => `- ${soles(n)}`;
const Mes = (iso: string) => mes(iso).replace(/^./, (x) => x.toUpperCase());

// Recibo formal en A4: el mismo contenido que components/ReciboVista.tsx
function ReciboPdf({ d, logo }: { d: DatosRecibo; logo: LogoEdificio | null }) {
  const t = d.totales;
  const estado = ESTADO_RECIBO[d.estado];
  const meta: [string, string][] = [
    ["Departamento", `${d.departamento.numero}${d.departamento.piso !== null ? `, piso ${d.departamento.piso}` : ""}`],
    ["Periodo", Mes(d.mes)],
    ["Propietario", d.departamento.propietario ?? "-"],
    ["Inquilino", d.departamento.inquilino ?? "No aplica"],
    ["Área", d.departamento.area !== null ? `${Number(d.departamento.area).toLocaleString("en-US")} m²` : "-"],
    ["Alícuota", porcentaje(d.departamento.alicuota)],
  ];
  const pago = [d.edificio.cuenta_bancaria, d.edificio.yape_plin && `Yape o Plin: ${d.edificio.yape_plin}`].filter(Boolean).join(". ");

  return (
    <Document title={`Recibo ${d.numero} · ${d.edificio.nombre}`} author="EDIFIKA" language="es-PE">
      <Page size="A4" style={s.pagina}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: C.navy, paddingBottom: 10, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
            {logo ? <Imagen src={logo} style={{ height: 40, maxWidth: 110, objectFit: "contain" }} /> : <LogoPdf alto={30} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 15, color: C.navy, lineHeight: 1.2, marginBottom: 2 }}>{d.edificio.nombre}</Text>
              <Text style={s.tenue}>{d.edificio.direccion}</Text>
              <Text style={s.tenue}>Administración: {d.edificio.administrador ?? "-"}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>Recibo de mantenimiento</Text>
            <Text style={s.tenue}>N.° {d.numero}</Text>
            <Text style={s.tenue}>Emitido el {fecha(d.emitido)}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap" }}>
            {meta.map(([k, v]) => (
              <View key={k} style={{ width: "33.3%", marginBottom: 6 }}>
                <Text style={s.chico}>{k}</Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{v}</Text>
              </View>
            ))}
          </View>
          <Text
            style={{ borderWidth: 1.6, borderColor: estado.color, color: estado.color, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2, fontFamily: "Helvetica-Bold", fontSize: 11 }}
          >
            {estado.texto}
          </Text>
        </View>

        <Text style={s.h4}>Detalle del mes</Text>
        {d.cargos.length === 0 && <Fila izq="Sin cargos en este periodo" der="" tenue />}
        {d.cargos.map((c, i) =>
          c.tipo === "cuota" && c.comun !== null ? (
            <View key={i}>
              <Fila
                izq={c.base_mes ? `Gastos comunes de ${mes(c.base_mes)}` : "Cuota de mantenimiento"}
                sub={c.alicuota !== null ? `Alícuota ${porcentaje(c.alicuota)}` : undefined}
                der={soles(c.comun)}
              />
              {Number(c.agua) > 0 && (
                <Fila
                  izq="Consumo de agua"
                  sub={c.m3 !== null ? `${Number(c.m3).toLocaleString("en-US")} m³ según lectura` : undefined}
                  der={soles(c.agua)}
                />
              )}
              {c.estado === "pagado" && <Text style={[s.chico, { paddingVertical: 3 }]}>Cuota pagada</Text>}
            </View>
          ) : (
            <Fila key={i} izq={`${c.concepto}${c.estado === "pagado" ? " (pagado)" : ""}`} der={soles(c.monto)} />
          ),
        )}
        <FilaTotal izq={`Cargos de ${mes(d.mes)}`} der={soles(t.cargos)} />

        <View style={{ marginTop: 8 }}>
          {t.saldo_aplicado > 0 && <Fila izq="Saldo a favor aplicado" der={menos(t.saldo_aplicado)} />}
          {t.pagado > 0 && <Fila izq="Pagos aplicados" der={menos(t.pagado)} />}
          {t.en_revision > 0 && <Fila izq="Pagos en revisión (aún no validados)" der={soles(t.en_revision)} tenue />}
          <Fila
            izq={`Deuda de meses anteriores${t.anteriores > 0 ? ` (${t.anteriores} ${t.anteriores > 1 ? "conceptos" : "concepto"})` : ""}`}
            der={soles(t.anterior)}
          />
        </View>

        <View
          wrap={false}
          style={{ marginTop: 12, backgroundColor: C.suave, borderRadius: 6, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.tenue}>Total a pagar</Text>
            {t.total > 0 && t.vence && (
              <Text style={s.chico}>
                Vence el {fecha(t.vence)}
                {d.edificio.mora > 0 ? `. Después se aplica una mora de ${soles(d.edificio.mora)}.` : ""}
              </Text>
            )}
            {t.saldo_favor > 0 && <Text style={[s.chico, { color: C.ok }]}>Saldo a favor: {soles(t.saldo_favor)}, se aplica a las próximas cuotas</Text>}
          </View>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 20, color: C.navy }}>{soles(Math.max(0, t.total))}</Text>
        </View>

        {d.gastos.categorias.length > 0 && (
          <View wrap={false}>
            <Text style={s.h4}>Gastos del edificio en {mes(d.gastos.mes)}</Text>
            {d.gastos.categorias.map((g) => (
              <Fila key={g.categoria} izq={g.categoria} der={soles(g.monto)} />
            ))}
            <FilaTotal izq="Total de gastos" der={soles(d.gastos.total)} />
          </View>
        )}

        <Pie izq={`Paga a: ${pago || "consulta con la administración"}. Sube tu constancia en EDIFIKA.`} />
      </Page>
    </Document>
  );
}

export function pdfRecibo(d: DatosRecibo, logo: LogoEdificio | null = null) {
  return renderToBuffer(<ReciboPdf d={d} logo={logo} />);
}
