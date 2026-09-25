"use client";

import { useState, useTransition } from "react";
import { ReciboModal } from "@/components/ReciboModal";
import { enviarTodos, type ResultadoMasivo } from "@/lib/acciones-recibos";
import type { Database } from "@/lib/supabase/types";
import { fecha, mes, soles } from "@/lib/format";
import { ESTADO_RECIBO } from "@/lib/recibo";

type Fila = Database["public"]["Functions"]["recibos_del_mes"]["Returns"][number];
const CLASE: Record<string, string> = { pagado: "activo", vencido: "bad", por_pagar: "warn" };

export function TablaRecibos({ mesIso, recibos, administra }: { mesIso: string; recibos: Fila[]; administra: boolean }) {
  const [abierto, setAbierto] = useState<Fila | null>(null);
  const [resultado, setResultado] = useState<ResultadoMasivo | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enviados = recibos.filter((r) => r.enviado_en).length;
  const conCorreo = recibos.filter((r) => r.correo).length;

  function todos() {
    const sinCorreo = recibos.length - conCorreo;
    if (
      !confirm(
        `Se generarán ${recibos.length} recibos de ${mes(mesIso)} y se enviarán al correo de cada responsable.` +
          (sinCorreo ? ` ${sinCorreo} no tienen correo registrado: se generan, pero no se envían.` : ""),
      )
    )
      return;
    iniciar(async () => setResultado(await enviarTodos(mesIso)));
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">
          {enviados} de {recibos.length} enviados
        </span>
        <span className="flex-1" />
        {administra && (
          <button className="btn" onClick={todos} disabled={pendiente || recibos.length === 0}>
            {pendiente ? "Generando y enviando…" : "Generar y enviar todos"}
          </button>
        )}
      </div>

      {resultado && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${resultado.ok ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`} role="status">
          <p className="font-semibold">{resultado.mensaje}</p>
          {resultado.fallas.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {resultado.fallas.map((f) => (
                <li key={f.numero}>
                  Depto {f.numero}: {f.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="panel tbl">
        <table>
          <thead>
            <tr>
              <th>Depto</th>
              <th>Responsable</th>
              <th className="r">Total a pagar</th>
              <th>Estado</th>
              <th>Envío</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recibos.map((r) => (
              <tr key={r.departamento_id}>
                <td className="font-bold">{r.numero}</td>
                <td>
                  {r.responsable ?? "—"}
                  <span className="block text-xs text-muted">{r.correo ?? "Sin correo"}</span>
                </td>
                <td className="r">{soles(Math.max(0, Number(r.total)))}</td>
                <td>
                  <span className={`chip ${CLASE[r.estado] ?? "tag"}`}>{ESTADO_RECIBO[r.estado as keyof typeof ESTADO_RECIBO]?.texto ?? r.estado}</span>
                </td>
                <td>
                  {r.enviado_en ? (
                    <span className="chip tag">
                      {r.canal === "whatsapp" ? "WhatsApp" : "Correo"} · {fecha(r.enviado_en.slice(0, 10))}
                    </span>
                  ) : r.generado_en ? (
                    <span className="text-sm text-muted">Generado, sin enviar</span>
                  ) : (
                    <span className="text-sm text-muted">No enviado</span>
                  )}
                </td>
                <td className="r">
                  <button className="btn sm" onClick={() => setAbierto(r)}>
                    {administra ? "Generar y enviar recibo" : "Ver recibo"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReciboModal
        departamentoId={abierto?.departamento_id ?? null}
        mesIso={mesIso}
        numero={abierto?.numero ?? ""}
        administra={administra}
        onCerrar={() => setAbierto(null)}
      />
    </>
  );
}
