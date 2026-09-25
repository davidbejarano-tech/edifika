import { Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

// Piezas comunes de los PDF de EDIFIKA (react-pdf). Fuente Helvetica: no hay que descargar nada.
// Helvetica no tiene el signo menos tipográfico: en los PDF se usa el guion.
export const C = {
  navy: "#0E2A47",
  azul: "#1A7FD4",
  celeste: "#55A8E0",
  profundo: "#0B5A8A",
  tinta: "#1B2328",
  tenue: "#5B6970",
  linea: "#E1E6E4",
  suave: "#E1EEFB",
  ok: "#2E7D4F",
  mal: "#B23A30",
  aviso: "#8F5C0E",
};

export const s = StyleSheet.create({
  pagina: { padding: 40, fontFamily: "Helvetica", fontSize: 9.5, color: C.tinta, lineHeight: 1.35 },
  fila: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.6, borderBottomColor: C.linea, paddingVertical: 4 },
  filaTotal: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.4, borderTopColor: C.tinta, paddingVertical: 4, fontFamily: "Helvetica-Bold" },
  monto: { textAlign: "right" },
  tenue: { color: C.tenue },
  chico: { fontSize: 8, color: C.tenue },
  h4: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 14, marginBottom: 3 },
  pie: { marginTop: 18, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: "#C9D1CF", borderTopStyle: "dashed", flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.tenue },
});

export function LogoPdf({ alto = 22 }: { alto?: number }) {
  return (
    <Svg width={alto * 1.2} height={alto} viewBox="0 0 48 40">
      <Path d="M11 9.2 17 5.8V1.6L11 4.9Z" fill={C.profundo} />
      <Path d="M4 13.2 17 7.2v5L9.4 15.6v3.6l5-1.9v3.9l-5 1.9v4.4l7.6-2.6v11c-4.6.2-9 1.1-13 2.4Z" fill={C.navy} />
      <Path d="M19 1l8.2 3.7v31c-2.8-.6-5.5-.9-8.2-.9Z" fill={C.azul} />
      <Path d="M29.2 8.6 35.4 11.6v26c-2-.8-4-1.3-6.2-1.7Z" fill={C.celeste} />
      <Path d="M1 39.4c10.4-5.6 24.6-6.4 36.4-1.2-11.4-3.1-24.6-2.4-36.4 1.2Z" fill={C.navy} />
    </Svg>
  );
}

export function Fila({ izq, der, sub, tenue = false }: { izq: string; der: string; sub?: string; tenue?: boolean }) {
  return (
    <View style={s.fila} wrap={false}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={tenue ? s.tenue : undefined}>{izq}</Text>
        {sub && <Text style={s.chico}>{sub}</Text>}
      </View>
      <Text style={[s.monto, tenue ? s.tenue : {}]}>{der}</Text>
    </View>
  );
}

export function FilaTotal({ izq, der }: { izq: string; der: string }) {
  return (
    <View style={s.filaTotal} wrap={false}>
      <Text>{izq}</Text>
      <Text style={s.monto}>{der}</Text>
    </View>
  );
}

export function Pie({ izq }: { izq: string }) {
  return (
    <View style={s.pie} wrap={false}>
      <Text style={{ flex: 1, paddingRight: 12 }}>{izq}</Text>
      <Text>Generado con EDIFIKA</Text>
    </View>
  );
}
