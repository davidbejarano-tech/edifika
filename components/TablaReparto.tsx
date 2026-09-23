import { soles } from "@/lib/format";

type Fila = {
  departamento_id: string;
  numero: string;
  area_m2: number | null;
  alicuota: number | null;
  comun: number;
  m3: number;
  agua: number;
  total: number;
};

const pct = (x: number) => `${(x * 100).toFixed(2)} %`;

// Reparto de la cuota por departamento, con las columnas de la planilla del Product Owner.
// Los montos vienen de calcular_cuotas(): aquí solo se suman para mostrar los totales.
export function TablaReparto({ filas, areaComun, conAgua }: { filas: Fila[]; areaComun: number; conAgua: boolean }) {
  const sumaM3 = filas.reduce((s, f) => s + Number(f.m3), 0);
  const sumaArea = filas.reduce((s, f) => s + Number(f.area_m2 ?? 0), 0);
  const total = (k: "comun" | "agua" | "total") => filas.reduce((s, f) => s + Number(f[k]), 0);

  return (
    <div className="tbl">
      <table>
        <thead>
          <tr>
            <th>Depto</th>
            <th className="r">Área</th>
            {areaComun > 0 && <th className="r">Área asignada</th>}
            <th className="r">Alícuota</th>
            <th className="r">Cuota fija</th>
            {conAgua && (
              <>
                <th className="r">m³</th>
                <th className="r">% prorrateo</th>
                <th className="r">Cuota de agua</th>
              </>
            )}
            <th className="r">Cuota del mes</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const area = Number(f.area_m2 ?? 0);
            return (
              <tr key={f.departamento_id}>
                <td>{f.numero}</td>
                <td className="r">{f.area_m2 === null ? "—" : area.toLocaleString("en-US")}</td>
                {areaComun > 0 && <td className="r">{sumaArea ? (area + (area / sumaArea) * areaComun).toFixed(3) : "—"}</td>}
                <td className="r">{f.alicuota === null ? "—" : pct(Number(f.alicuota))}</td>
                <td className="r">{soles(f.comun)}</td>
                {conAgua && (
                  <>
                    <td className="r">{Number(f.m3).toLocaleString("en-US")}</td>
                    <td className="r">{sumaM3 ? pct(Number(f.m3) / sumaM3) : "—"}</td>
                    <td className="r">{soles(f.agua)}</td>
                  </>
                )}
                <td className="r font-semibold">{soles(f.total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td>Total</td>
            <td className="r">{sumaArea.toLocaleString("en-US")}</td>
            {areaComun > 0 && <td className="r">{(sumaArea + areaComun).toLocaleString("en-US")}</td>}
            <td className="r">{sumaArea ? "100.00 %" : "—"}</td>
            <td className="r">{soles(total("comun"))}</td>
            {conAgua && (
              <>
                <td className="r">{sumaM3.toLocaleString("en-US")}</td>
                <td className="r">{sumaM3 ? "100.00 %" : "—"}</td>
                <td className="r">{soles(total("agua"))}</td>
              </>
            )}
            <td className="r">{soles(total("total"))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
