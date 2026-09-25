import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { obtenerContexto } from "@/lib/contexto";

// Exportación de los datos del edificio a Excel (RN-29): departamentos, cargos, pagos y gastos.
// Solo el administrador titular; se lee con su sesión, así que la base aplica RLS.
export async function GET() {
  const { supabase, actual } = await obtenerContexto();
  if (actual?.nivel !== "titular") return new NextResponse("Solo el administrador titular exporta los datos del edificio", { status: 403 });
  const ed = actual.edificio_id;

  // PostgREST entrega hasta 1000 filas por consulta: se pide por páginas
  async function todo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
    const filas: T[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await consulta(desde, desde + 999);
      if (error) throw new Error(error.message);
      filas.push(...(data ?? []));
      if ((data ?? []).length < 1000) return filas;
    }
  }

  try {
    const [deps, ocup, cargos, pagos, gastos] = await Promise.all([
      todo((a, b) => supabase.from("v_departamentos").select("id, numero, piso, area_m2, alicuota").eq("edificio_id", ed).order("numero").range(a, b)),
      todo((a, b) =>
        supabase
          .from("ocupaciones")
          .select("departamento_id, tipo, desde, personas(nombre, documento, email, telefono), departamentos!inner(edificio_id)")
          .eq("departamentos.edificio_id", ed)
          .is("hasta", null)
          .range(a, b),
      ),
      todo((a, b) =>
        supabase
          .from("compromisos")
          .select("departamento_id, mes, tipo, concepto, monto, emitido_en, vence_en, estado")
          .eq("edificio_id", ed)
          .order("mes")
          .order("created_at")
          .range(a, b),
      ),
      todo((a, b) =>
        supabase
          .from("pagos")
          .select("departamento_id, monto, metodo, operacion, fecha_pago, estado, nota_rechazo, compromisos(concepto)")
          .eq("edificio_id", ed)
          .order("fecha_pago")
          .range(a, b),
      ),
      todo((a, b) =>
        supabase.from("gastos").select("fecha, tipo, categoria, descripcion, monto, periodos(mes)").eq("edificio_id", ed).order("fecha").range(a, b),
      ),
    ]);

    const numero = new Map(deps.map((d) => [d.id, d.numero]));
    type Ocup = { departamento_id: string; tipo: string; desde: string; personas: { nombre: string; documento: string | null; email: string | null; telefono: string | null } | null };
    const ocupantes = ocup as unknown as Ocup[];
    const persona = (dep: string, tipo: string) => ocupantes.find((o) => o.departamento_id === dep && o.tipo === tipo)?.personas;
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

    const libro = XLSX.utils.book_new();
    const hoja = (nombre: string, filas: Record<string, unknown>[]) =>
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas.length ? filas : [{ "Sin registros": "" }]), nombre);

    hoja(
      "Departamentos",
      deps.map((d) => {
        const p = persona(d.id!, "propietario");
        const i = persona(d.id!, "inquilino");
        return {
          Departamento: d.numero,
          Piso: d.piso,
          "Área m²": n(d.area_m2),
          "Alícuota %": d.alicuota === null ? null : Math.round(Number(d.alicuota) * 1e6) / 1e4,
          Propietario: p?.nombre ?? "",
          "Documento propietario": p?.documento ?? "",
          Inquilino: i?.nombre ?? "",
          "Correo del responsable": (i ?? p)?.email ?? "",
          "Teléfono del responsable": (i ?? p)?.telefono ?? "",
        };
      }),
    );
    hoja(
      "Cargos",
      cargos.map((c) => ({
        Departamento: numero.get(c.departamento_id) ?? "",
        Mes: c.mes.slice(0, 7),
        Tipo: c.tipo,
        Concepto: c.concepto,
        "Monto S/": n(c.monto),
        Emitido: c.emitido_en,
        Vence: c.vence_en,
        Estado: c.estado,
      })),
    );
    hoja(
      "Pagos",
      pagos.map((p) => ({
        Departamento: numero.get(p.departamento_id) ?? "",
        Fecha: p.fecha_pago,
        Concepto: (p.compromisos as unknown as { concepto: string } | null)?.concepto ?? "",
        "Monto S/": n(p.monto),
        Medio: p.metodo,
        Operación: p.operacion ?? "",
        Estado: p.estado,
        "Motivo de rechazo": p.nota_rechazo ?? "",
      })),
    );
    hoja(
      "Gastos",
      gastos.map((g) => ({
        Mes: (g.periodos as unknown as { mes: string } | null)?.mes.slice(0, 7) ?? "",
        Fecha: g.fecha,
        Tipo: g.tipo,
        Categoría: g.categoria,
        Descripción: g.descripcion,
        "Monto S/": n(g.monto),
      })),
    );

    const archivo = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
    return new NextResponse(new Uint8Array(archivo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="EDIFIKA-${actual.codigo}-${hoy}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "No se pudo exportar", { status: 500 });
  }
}
